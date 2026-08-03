/**
 * Lógica pura de validación y normalización, sin dependencias del runtime.
 * Vive fuera de functions/ para poder probarla con `node --test` sin
 * levantar un Worker.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_EMAIL = 254;
export const MAX_NOMBRE = 60;
export const EDAD_MIN = 16;
export const EDAD_MAX = 90;
export const MAX_BODY = 2048;
export const RATE_LIMIT = 5; // altas por IP y ventana
export const RATE_WINDOW_MIN = 60; // minutos
export const ORIGENES = ['hero', 'cta', 'lista'];

/** Recorta espacios y colapsa los internos. */
const limpia = v => String(v ?? '').trim().replace(/\s+/g, ' ');

/**
 * Normaliza y valida el alta recibida.
 * @returns {{ok:true, alta:object} | {ok:false, status:number, error:string, bot?:boolean}}
 */
export function validarAlta(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, status: 400, error: 'Cuerpo no válido.' };
  }

  // Honeypot: relleno ⇒ bot. Quien llama debe responder 200 igualmente,
  // para no confirmarle al bot que ha sido detectado.
  if (typeof data.empresa === 'string' && data.empresa.trim() !== '') {
    return { ok: false, status: 200, error: null, bot: true };
  }

  const nombre = limpia(data.nombre);
  if (!nombre) return { ok: false, status: 400, error: 'Escribe tu nombre.' };
  if (nombre.length > MAX_NOMBRE) {
    return { ok: false, status: 400, error: 'El nombre es demasiado largo.' };
  }

  const apellido = limpia(data.apellido);
  if (!apellido) return { ok: false, status: 400, error: 'Escribe tu apellido.' };
  if (apellido.length > MAX_NOMBRE) {
    return { ok: false, status: 400, error: 'El apellido es demasiado largo.' };
  }

  // Number() en vez de parseInt: "28abc" debe ser inválido, no 28.
  const edad = Number(String(data.edad ?? '').trim());
  if (!Number.isInteger(edad) || edad < EDAD_MIN || edad > EDAD_MAX) {
    return { ok: false, status: 400, error: `Indica una edad entre ${EDAD_MIN} y ${EDAD_MAX}.` };
  }

  const email = String(data.email ?? '').trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: 'Revisa tu dirección de email.' };
  }

  const origen = ORIGENES.includes(data.origen) ? data.origen : 'desconocido';
  const referido = normalizaCodigo(data.ref);

  return { ok: true, alta: { nombre, apellido, edad, email, origen, referido } };
}

/**
 * Códigos de invitación: minúsculas, dígitos y guiones, máximo 24.
 * Devuelve null si no queda nada utilizable, para no guardar basura.
 */
export function normalizaCodigo(v) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return s || null;
}

/**
 * Base del código de invitación a partir del nombre. Sin acentos ni eñes,
 * para que el enlace sea legible y se pueda dictar por teléfono.
 */
export function baseCodigo(nombre, apellido, email) {
  const sinAcentos = s => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  const base = (sinAcentos(nombre) + sinAcentos(apellido)).slice(0, 16)
    || sinAcentos(String(email ?? '').split('@')[0]).slice(0, 16);
  return base || 'invitado';
}

/**
 * SHA-256 en hex. Usa WebCrypto, disponible en Workers y en Node ≥ 18.
 */
export async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Identificador de IP para el rate limit. Guardamos un hash con sal en vez
 * de la IP en claro: sirve igual para limitar y evita almacenar un dato
 * personal innecesario (RGPD).
 */
export async function huellaIp(ip, sal) {
  return sha256(`${sal}:${ip}`);
}

/**
 * Comparación en tiempo constante, para que un atacante no pueda deducir
 * el token byte a byte midiendo el tiempo de respuesta.
 */
export function comparaSegura(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** Escapa un valor para CSV (separador coma, comillas dobles). */
export function csvCampo(valor) {
  const s = String(valor ?? '');
  // El prefijo evita la inyección de fórmulas al abrir el CSV en Excel:
  // un valor que empiece por = o + se ejecutaría como fórmula.
  const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export const CAMPOS_CSV = [
  'posicion', 'nombre', 'apellido', 'edad', 'email',
  'origen', 'codigo_invitacion', 'referido_por', 'invitados', 'fecha',
];

export function aCsv(filas) {
  const lineas = [CAMPOS_CSV.join(',')];
  for (const f of filas) {
    lineas.push(CAMPOS_CSV.map(c => csvCampo(f[c])).join(','));
  }
  return lineas.join('\r\n');
}
