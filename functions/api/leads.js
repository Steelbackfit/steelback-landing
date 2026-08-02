/**
 * GET /api/leads — consulta de altas. Protegido por token.
 *
 * Uso:
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://steelback.com/api/leads
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://steelback.com/api/leads?formato=csv" -o leads.csv
 *
 * Variables de entorno:
 *   ADMIN_TOKEN   secreto, obligatorio. Sin él el endpoint responde 503:
 *                 falla cerrado, nunca expone datos por estar mal configurado.
 */

import { comparaSegura, aCsv } from '../../lib/validation.mjs';

const LIMITE_MAX = 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Que ningún intermediario ni buscador guarde esto
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

export async function onRequestGet({ request, env }) {
  // Falla cerrado: sin token configurado no se sirven datos.
  if (!env.ADMIN_TOKEN) {
    console.error('Falta ADMIN_TOKEN: /api/leads deshabilitado');
    return json({ error: 'Servicio no disponible.' }, 503);
  }
  if (!env.DB) return json({ error: 'Servicio no disponible.' }, 503);

  const cabecera = request.headers.get('Authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  if (!comparaSegura(token, env.ADMIN_TOKEN)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
        'Cache-Control': 'no-store',
      },
    });
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get('formato') === 'csv' ? 'csv' : 'json';
  const limite = Math.min(
    Math.max(parseInt(url.searchParams.get('limite') || '200', 10) || 200, 1),
    LIMITE_MAX
  );

  const { results } = await env.DB.prepare(
    `SELECT email, origen, fecha, user_agent
     FROM leads ORDER BY fecha DESC LIMIT ?`
  ).bind(limite).all();

  const { results: total } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM leads'
  ).all();

  if (formato === 'csv') {
    return new Response(aCsv(results), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="leads-steelback.csv"',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  return json({ total: total?.[0]?.n ?? 0, mostrados: results.length, leads: results });
}

export const onRequest = ({ request }) =>
  json({ error: `Método ${request.method} no permitido.` }, 405);
