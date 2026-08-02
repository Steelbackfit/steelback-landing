/**
 * POST /api/subscribe — Cloudflare Pages Function
 *
 * Guarda el alta en la base de datos D1 y, si hay proveedor configurado,
 * avisa por email.
 *
 * Binding (Pages → Settings → Functions → D1 database bindings):
 *   DB               base de datos D1 `steelback-leads`
 *
 * Variables de entorno:
 *   IP_SALT            secreto. Sal para hashear la IP. Obligatoria.
 *   TURNSTILE_SECRET   secreto, opcional. Si está, se verifica el captcha.
 *   RESEND_API_KEY     secreto, opcional. Si está, se avisa por email.
 *   NOTIFY_TO          opcional, por defecto info@steelbackfit.com
 *   NOTIFY_FROM        opcional, remitente verificado en Resend
 */

import {
  validarAlta,
  huellaIp,
  MAX_BODY,
  RATE_LIMIT,
  RATE_WINDOW_MIN,
} from '../../lib/validation.mjs';

const NOTIFY_TO_DEFAULT = 'info@steelbackfit.com';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Las Functions no heredan las reglas de _headers, hay que ponerlo aquí
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    console.error('Falta el binding D1 "DB"');
    return json({ error: 'Servicio no disponible.' }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Petición demasiado grande.' }, 413);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const res = validarAlta(data);
  // Bot detectado por honeypot: 200 sin guardar nada.
  if (!res.ok && res.bot) return json({ ok: true });
  if (!res.ok) return json({ error: res.error }, res.status);

  const { email, origen } = res.alta;
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 255);

  // Turnstile: solo si está configurado, para no romper si aún no lo has puesto
  if (env.TURNSTILE_SECRET) {
    const okCaptcha = await verificarTurnstile(data.captcha, ip, env.TURNSTILE_SECRET);
    if (!okCaptcha) return json({ error: 'Verificación anti-bot fallida.' }, 403);
  }

  if (!env.IP_SALT) {
    console.error('Falta IP_SALT');
    return json({ error: 'Servicio no disponible.' }, 503);
  }
  const ipHash = await huellaIp(ip, env.IP_SALT);
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - RATE_WINDOW_MIN * 60_000).toISOString();

  try {
    // Rate limit por IP dentro de la ventana
    const { results: conteo } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM intentos WHERE ip_hash = ? AND fecha > ?'
    ).bind(ipHash, desde).all();

    if ((conteo?.[0]?.n ?? 0) >= RATE_LIMIT) {
      return json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
    }

    await env.DB.batch([
      env.DB.prepare('INSERT INTO intentos (ip_hash, fecha) VALUES (?, ?)')
        .bind(ipHash, ahora.toISOString()),
      // ON CONFLICT: apuntarse dos veces no es un error para quien lo hace,
      // solo refrescamos el origen y no duplicamos la fila.
      env.DB.prepare(
        `INSERT INTO leads (email, origen, fecha, user_agent, ip_hash)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET origen = excluded.origen`
      ).bind(email, origen, ahora.toISOString(), ua, ipHash),
      // Limpieza oportunista de la ventana de rate limit
      env.DB.prepare('DELETE FROM intentos WHERE fecha < ?').bind(desde),
    ]);
  } catch (err) {
    console.error('Fallo al guardar el alta', email, err);
    return json({ error: 'No hemos podido apuntarte. Inténtalo en un momento.' }, 500);
  }

  // El alta ya está persistida: un fallo del email no debe romper la respuesta.
  if (env.RESEND_API_KEY) {
    try {
      await notificar({ email, origen, fecha: ahora.toISOString() }, env);
    } catch (err) {
      console.error('Fallo al notificar el alta', email, err);
    }
  }

  return json({ ok: true });
}

async function verificarTurnstile(token, ip, secret) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

async function notificar({ email, origen, fecha }, env) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || 'Steelback <web@steelbackfit.com>',
      to: [env.NOTIFY_TO || NOTIFY_TO_DEFAULT],
      reply_to: email,
      subject: `Nueva alta en la landing: ${email}`,
      text: `Email:  ${email}\nOrigen: formulario ${origen}\nFecha:  ${fecha}`,
    }),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${await r.text()}`);
}

// Sin este catch-all, un GET a /api/subscribe no da 405: cae al handler de
// assets estáticos y devuelve la landing con 200. Los handlers por método
// tienen prioridad, así que POST sigue yendo a onRequestPost.
export const onRequest = ({ request }) =>
  json({ error: `Método ${request.method} no permitido.` }, 405);
