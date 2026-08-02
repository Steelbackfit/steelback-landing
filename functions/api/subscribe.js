/**
 * POST /api/subscribe — Cloudflare Pages Function
 *
 * Recoge los emails de la landing, los guarda y avisa a info@steelbackfit.com.
 *
 * Variables de entorno (Pages → Settings → Environment variables):
 *   RESEND_API_KEY   secreto, obligatorio para el aviso por email
 *   NOTIFY_TO        destino del aviso (por defecto info@steelbackfit.com)
 *   NOTIFY_FROM      remitente verificado en Resend (p. ej. web@steelbackfit.com)
 *
 * Binding opcional (Pages → Settings → Functions → KV namespace bindings):
 *   LEADS            KV donde se persiste cada alta
 *
 * El alta se guarda en KV ANTES de intentar el email: si el proveedor falla,
 * el lead no se pierde y la persona no ve un error por algo ajeno a ella.
 */

const NOTIFY_TO_DEFAULT = 'info@steelbackfit.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 2048;
const RATE_LIMIT = 5; // altas por IP y ventana
const RATE_WINDOW = 3600; // segundos

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  // 1. Cuerpo acotado: no queremos parsear payloads arbitrariamente grandes
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Petición demasiado grande.' }, 413);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  // 2. Honeypot: si viene relleno es un bot. Devolvemos 200 a propósito
  //    para no darle señal de que ha sido detectado.
  if (data.empresa) return json({ ok: true });

  // 3. Validación
  const email = String(data.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'Email no válido.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
  const origen = ['hero', 'cta'].includes(data.origen) ? data.origen : 'desconocido';

  // 4. Rate limit por IP (solo si hay KV; sin binding se omite)
  if (env.LEADS) {
    const key = `rl:${ip}`;
    const hits = Number((await env.LEADS.get(key)) || 0);
    if (hits >= RATE_LIMIT) {
      return json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, 429);
    }
    await env.LEADS.put(key, String(hits + 1), { expirationTtl: RATE_WINDOW });
  }

  // 5. Persistir el alta antes de notificar
  const alta = { email, origen, ip, fecha: new Date().toISOString() };
  if (env.LEADS) {
    await env.LEADS.put(`lead:${email}`, JSON.stringify(alta));
  }

  // 6. Avisar. Si falla, lo registramos pero NO rompemos la respuesta:
  //    el lead ya está guardado y el fallo es nuestro, no de quien se apunta.
  try {
    await notificar(alta, env);
  } catch (err) {
    console.error('Fallo al notificar el alta', email, err);
    if (!env.LEADS) {
      // Sin KV y sin email no queda rastro: ahí sí hay que devolver error.
      return json({ error: 'No hemos podido apuntarte. Inténtalo en un momento.' }, 502);
    }
  }

  return json({ ok: true });
}

async function notificar({ email, origen, fecha }, env) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY sin configurar');

  const res = await fetch('https://api.resend.com/emails', {
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
      text: [
        'Alguien se ha apuntado al acceso anticipado.',
        '',
        `Email:  ${email}`,
        `Origen: formulario ${origen}`,
        `Fecha:  ${fecha}`,
      ].join('\n'),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
  }
}
// Catch-all necesario: sin él, un GET a /api/subscribe NO da 405 — cae al
// handler de assets estáticos y devuelve index.html con 200. Los handlers
// por método tienen prioridad, así que POST sigue yendo a onRequestPost.
export const onRequest = ({ request }) =>
  json({ error: `Método ${request.method} no permitido.` }, 405);
