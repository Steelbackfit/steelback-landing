/**
 * POST /api/subscribe — alta en la lista de espera.
 *
 * Guarda nombre, apellido, edad y email en D1, asigna posición en la cola y
 * un código de invitación propio, y registra quién invitó a quién.
 *
 * Binding (Pages → Settings → Functions → D1 database bindings):
 *   DB               base de datos D1
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
  baseCodigo,
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

  const { nombre, apellido, edad, email, origen, referido } = res.alta;
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
    const lim = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM intentos WHERE ip_hash = ? AND fecha > ?'
    ).bind(ipHash, desde).first();

    if ((lim?.n ?? 0) >= RATE_LIMIT) {
      return json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
    }

    await env.DB.prepare('INSERT INTO intentos (ip_hash, fecha) VALUES (?, ?)')
      .bind(ipHash, ahora.toISOString()).run();

    // ¿Ya estaba apuntado? Entonces conserva su posición y su código: apuntarse
    // dos veces no debe hacerte perder el sitio en la cola.
    const previo = await env.DB.prepare(
      'SELECT posicion, codigo_invitacion FROM leads WHERE email = ?'
    ).bind(email).first();

    if (previo) {
      await env.DB.prepare(
        `UPDATE leads SET nombre = ?, apellido = ?, edad = ?, origen = ?, user_agent = ?
         WHERE email = ?`
      ).bind(nombre, apellido, edad, origen, ua, email).run();

      return json({
        ok: true,
        yaApuntado: true,
        posicion: previo.posicion,
        codigo: previo.codigo_invitacion,
        invitados: await contarInvitados(env.DB, previo.codigo_invitacion),
      });
    }

    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first();
    const posicion = (total?.n ?? 0) + 1;
    const codigo = await codigoLibre(env.DB, baseCodigo(nombre, apellido, email));

    await env.DB.prepare(
      `INSERT INTO leads
         (email, nombre, apellido, edad, origen, fecha, user_agent, ip_hash,
          posicion, codigo_invitacion, referido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      email, nombre, apellido, edad, origen, ahora.toISOString(), ua, ipHash,
      posicion, codigo, referido
    ).run();

    // Limpieza oportunista de la ventana de rate limit
    await env.DB.prepare('DELETE FROM intentos WHERE fecha < ?').bind(desde).run();

    // El alta ya está persistida: un fallo del email no debe romper la respuesta.
    if (env.RESEND_API_KEY) {
      try {
        await notificar({ nombre, apellido, edad, email, origen, posicion, referido }, env);
      } catch (err) {
        console.error('Fallo al notificar el alta', email, err);
      }
    }

    return json({ ok: true, posicion, codigo, invitados: 0 });
  } catch (err) {
    console.error('Fallo al guardar el alta', email, err);
    return json({ error: 'No hemos podido apuntarte. Inténtalo en un momento.' }, 500);
  }
}

/** Cuántas personas se han apuntado con el código de alguien. */
async function contarInvitados(db, codigo) {
  if (!codigo) return 0;
  const r = await db.prepare('SELECT COUNT(*) AS n FROM leads WHERE referido_por = ?')
    .bind(codigo).first();
  return r?.n ?? 0;
}

/**
 * Busca un código libre a partir de la base. Dos "Marcos Ruiz" distintos
 * generan la misma base, así que hay que desempatar o el INSERT falla por
 * la restricción UNIQUE.
 */
async function codigoLibre(db, base) {
  for (let i = 0; i < 12; i++) {
    const cand = i === 0 ? base : `${base}-${i + 1}`;
    const existe = await db.prepare(
      'SELECT 1 AS x FROM leads WHERE codigo_invitacion = ?'
    ).bind(cand).first();
    if (!existe) return cand;
  }
  // Salida de emergencia: sufijo aleatorio. Preferible a fallar el alta.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
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

async function notificar({ nombre, apellido, edad, email, origen, posicion, referido }, env) {
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
      subject: `Nueva alta #${posicion}: ${nombre} ${apellido}`,
      text: [
        `Nombre:   ${nombre} ${apellido}`,
        `Edad:     ${edad}`,
        `Email:    ${email}`,
        `Posición: #${posicion}`,
        `Origen:   ${origen}`,
        `Invitado por: ${referido || '—'}`,
      ].join('\n'),
    }),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${await r.text()}`);
}

// Sin este catch-all, un GET a /api/subscribe no da 405: cae al handler de
// assets estáticos y devuelve la landing con 200. Los handlers por método
// tienen prioridad, así que POST sigue yendo a onRequestPost.
export const onRequest = ({ request }) =>
  json({ error: `Método ${request.method} no permitido.` }, 405);
