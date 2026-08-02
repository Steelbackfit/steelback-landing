/**
 * Puesta en marcha completa en Cloudflare, en un solo comando.
 *
 *   npx wrangler login      (una vez, abre el navegador)
 *   npm run setup
 *
 * Hace, en orden y de forma idempotente:
 *   1. Comprueba que hay sesión de Cloudflare.
 *   2. Crea la base de datos D1 si no existe y escribe su id en wrangler.toml.
 *   3. Aplica schema.sql sobre la D1 real.
 *   4. Crea el proyecto de Pages si no existe.
 *   5. Genera IP_SALT y ADMIN_TOKEN y los sube como secretos.
 *   6. Compila (con los tests) y despliega.
 *
 * Lo único que NO puede hacer es conectar Pages con GitHub: esa autorización
 * es OAuth contra tu cuenta de GitHub y hay que darla desde el panel.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const PROYECTO = 'steelback-landing';
const BD = 'steelback-leads';
// Dominio a conectar. Solo funciona si el dominio ya está dado de alta en
// Cloudflare (nameservers apuntando ahí). Ponlo a '' para saltarse el paso.
const DOMINIO = process.env.CF_DOMINIO ?? 'steelbackfit.com';

const paso = n => console.log(`\n\x1b[1m── ${n}\x1b[0m`);
const ok = m => console.log(`   \x1b[32m✓\x1b[0m ${m}`);
const aviso = m => console.log(`   \x1b[33m!\x1b[0m ${m}`);

function wrangler(args, { silencioso = false } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: silencioso ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });
}

function intenta(args) {
  try {
    return { ok: true, salida: wrangler(args, { silencioso: true }) };
  } catch (e) {
    return { ok: false, salida: (e.stdout || '') + (e.stderr || '') };
  }
}

// ── 1. Sesión ────────────────────────────────────────────────────────────
paso('1/6  Comprobando la sesión de Cloudflare');
const quien = intenta(['whoami']);
if (!quien.ok || /not authenticated/i.test(quien.salida)) {
  console.error('\n\x1b[31mNo hay sesión de Cloudflare.\x1b[0m Ejecuta primero:\n');
  console.error('   npx wrangler login\n');
  process.exit(1);
}
ok('sesión activa');

// ── 2. Base de datos ─────────────────────────────────────────────────────
paso(`2/6  Base de datos D1 "${BD}"`);
let toml = readFileSync('wrangler.toml', 'utf8');
let idBd = toml.match(/database_id\s*=\s*"([^"]+)"/)?.[1];

if (!idBd || idBd === 'PON_AQUI_EL_ID_DE_TU_D1') {
  const lista = intenta(['d1', 'list', '--json']);
  let existente = null;
  try {
    existente = JSON.parse(lista.salida.replace(/^[^[{]*/, ''))
      .find(d => d.name === BD)?.uuid;
  } catch { /* la lista puede venir vacía o con adornos */ }

  if (existente) {
    idBd = existente;
    ok(`ya existía (${idBd})`);
  } else {
    const creada = intenta(['d1', 'create', BD]);
    idBd = creada.salida.match(/database_id\s*=\s*"([^"]+)"/)?.[1]
        || creada.salida.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1];
    if (!idBd) {
      console.error('\n\x1b[31mNo he podido leer el database_id.\x1b[0m Salida:\n', creada.salida);
      process.exit(1);
    }
    ok(`creada (${idBd})`);
  }
  toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${idBd}"`);
  writeFileSync('wrangler.toml', toml);
  ok('wrangler.toml actualizado — acuérdate de commitearlo');
} else {
  ok(`ya configurada (${idBd})`);
}

// ── 3. Esquema ───────────────────────────────────────────────────────────
paso('3/6  Aplicando schema.sql');
const esquema = intenta(['d1', 'execute', BD, '--remote', '--file', 'schema.sql', '-y']);
if (esquema.ok) ok('tablas creadas (CREATE TABLE IF NOT EXISTS, se puede repetir)');
else { console.error(esquema.salida); process.exit(1); }

// ── 4. Proyecto de Pages ─────────────────────────────────────────────────
paso(`4/6  Proyecto de Pages "${PROYECTO}"`);
const proyectos = intenta(['pages', 'project', 'list']);
if (proyectos.salida.includes(PROYECTO)) {
  ok('ya existe');
} else {
  const creado = intenta(['pages', 'project', 'create', PROYECTO, '--production-branch', 'main']);
  if (creado.ok) ok('creado');
  else { console.error(creado.salida); process.exit(1); }
}

// ── 5. Secretos ──────────────────────────────────────────────────────────
paso('5/6  Secretos');
const token = randomBytes(32).toString('hex');
const sal = randomBytes(32).toString('hex');

function ponSecreto(nombre, valor) {
  try {
    execFileSync('npx', ['wrangler', 'pages', 'secret', 'put', nombre, '--project-name', PROYECTO], {
      input: valor + '\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    return true;
  } catch (e) {
    console.error(`   fallo al poner ${nombre}:`, (e.stderr || e.stdout || '').slice(0, 300));
    return false;
  }
}

const secretosOk = ponSecreto('IP_SALT', sal) && ponSecreto('ADMIN_TOKEN', token);
if (secretosOk) {
  ok('IP_SALT y ADMIN_TOKEN subidos');
  aviso('Sobrescriben los que hubiera. Guarda el ADMIN_TOKEN de abajo: no se vuelve a mostrar.');
} else {
  aviso('Ponlos a mano en Pages → Settings → Variables and Secrets.');
}

// ── 6. Despliegue ────────────────────────────────────────────────────────
paso('6/6  Compilando y desplegando');
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
const despliegue = intenta(['pages', 'deploy', 'dist', '--project-name', PROYECTO, '--branch', 'main']);
console.log(despliegue.salida.split('\n').filter(l => l.trim()).slice(-6).join('\n'));

const url = despliegue.salida.match(/https:\/\/[^\s]+\.pages\.dev/)?.[0]
  || `https://${PROYECTO}.pages.dev`;

// ── Dominio propio (opcional) ────────────────────────────────────────────
if (DOMINIO) {
  paso(`Extra  Conectando ${DOMINIO}`);
  const dom = intenta(['pages', 'domain', 'add', DOMINIO, '--project-name', PROYECTO]);
  if (dom.ok) {
    ok(`${DOMINIO} añadido — el SSL tarda unos minutos`);
  } else if (/already|exists/i.test(dom.salida)) {
    ok('ya estaba conectado');
  } else {
    aviso(`no se ha podido conectar ${DOMINIO}.`);
    aviso('Lo normal es que el dominio aún no esté en Cloudflare: hay que');
    aviso('añadirlo en "Add a site" y mover sus nameservers desde IONOS.');
    aviso('Mientras tanto la landing funciona en la URL de pages.dev.');
  }
}

console.log(`
\x1b[1m─────────────────────────────────────────────\x1b[0m
 Landing:   ${url}/landing
 Leads:     curl -H "Authorization: Bearer ${token}" ${url}/api/leads
 CSV:       curl -H "Authorization: Bearer ${token}" "${url}/api/leads?formato=csv" -o leads.csv

 ADMIN_TOKEN: ${token}
 \x1b[33mGuárdalo ahora. No se vuelve a mostrar.\x1b[0m

 Queda un paso manual, que es OAuth contra tu cuenta de GitHub:
   Cloudflare → Workers & Pages → ${PROYECTO} → Settings → Builds
   → Connect to Git → Steelbackfit/steelback-landing
   Build command: npm run build     Output directory: dist
   Desde ahí, cada push a main despliega solo.
\x1b[1m─────────────────────────────────────────────\x1b[0m`);
