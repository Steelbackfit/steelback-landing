// Genera dist/ a partir del repo.
//
// Dos cosas, en este orden:
//   1. Copia una whitelist explícita de ficheros.
//   2. Copia las fotos de uploads/transformaciones/ e inyecta sus tarjetas
//      en index.html, sustituyendo el marcador <!--TRANSFORMACIONES-->.
//
// La landing vive en la raíz (dist/index.html). _headers y _redirects tienen
// que quedar también en la raíz de dist/: Pages solo los lee ahí.
//
// La whitelist es deliberada: uploads/ guarda material interno de diseño
// (capturas y un PDF de 4,5 MB) que no debe acabar en un CDN público, y
// .gitignore no filtra lo que sube wrangler. La ÚNICA subcarpeta de uploads/
// que se publica es transformaciones/, y se hace explícitamente aquí abajo.
import { mkdir, copyFile, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';

const OUT = 'dist';
const FOTOS_DIR = 'uploads/transformaciones';
const FOTOS_DEST = 'assets/transformaciones';
const EXT_FOTO = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const AVISO_PESO = 300 * 1024;

// origen -> destino dentro de dist/
const ASSETS = [
  ['logo-bolt.svg', 'assets/logo-bolt.svg'],
  ['uploads/SIMBOLO.svg', 'assets/SIMBOLO.svg'],
  ['uploads/logo_steelback_white.png', 'assets/logo_steelback_white.png'],
  ['_headers', '_headers'],
  ['_redirects', '_redirects'],
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const [origen, destino] of ASSETS) {
  const ruta = join(OUT, destino);
  await mkdir(dirname(ruta), { recursive: true });
  await copyFile(origen, ruta);
  console.log('  +', destino);
}

// ── Transformaciones ─────────────────────────────────────────────────────
const fotos = await listarFotos();
for (const f of fotos) {
  const ruta = join(OUT, FOTOS_DEST, f.fichero);
  await mkdir(dirname(ruta), { recursive: true });
  await copyFile(join(FOTOS_DIR, f.fichero), ruta);
  const kb = Math.round(f.bytes / 1024);
  const aviso = f.bytes > AVISO_PESO ? '  ⚠ pesa más de 300 KB' : '';
  console.log(`  + ${FOTOS_DEST}/${f.fichero}  (${kb} KB, "${f.etiqueta}")${aviso}`);
}

const html = (await readFile('index.html', 'utf8'))
  .replace('<!--TRANSFORMACIONES-->', tarjetas(fotos));
await writeFile(join(OUT, 'index.html'), html);
console.log('  + index.html');

// La landing se indexa; los endpoints no.
await writeFile(
  join(OUT, 'robots.txt'),
  ['User-agent: *', 'Allow: /', 'Disallow: /api/', ''].join('\n')
);
console.log('  + robots.txt');

console.log(
  `\n${ASSETS.length + fotos.length + 2} ficheros generados en ${OUT}/` +
  (fotos.length ? ` (${fotos.length} transformaciones)` : ' (sin fotos: se usan marcadores)')
);

// ── Utilidades ───────────────────────────────────────────────────────────

async function listarFotos() {
  let entradas;
  try {
    entradas = await readdir(FOTOS_DIR);
  } catch {
    return []; // la carpeta puede no existir en un clon nuevo
  }

  const fotos = [];
  for (const fichero of entradas.sort()) {
    if (!EXT_FOTO.has(extname(fichero).toLowerCase())) continue;
    const { size } = await stat(join(FOTOS_DIR, fichero));
    fotos.push({ fichero, bytes: size, etiqueta: etiquetaDe(fichero) });
  }
  return fotos;
}

/** `01_marcos_28_6.jpg` -> `Marcos, 28 — 6 meses` */
function etiquetaDe(fichero) {
  const sinExt = basename(fichero, extname(fichero)).replace(/^\d+[_-]/, '');
  const m = sinExt.match(/^([a-zà-ÿ0-9-]+)_(\d{1,3})_(\d{1,3})$/i);
  if (!m) return capitaliza(sinExt.replace(/[_-]+/g, ' '));

  const [, nombre, edad, meses] = m;
  return `${capitaliza(nombre.replace(/-/g, ' '))}, ${edad} — ${meses} ${meses === '1' ? 'mes' : 'meses'}`;
}

const capitaliza = s => s.replace(/(^|\s)(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());

const escapa = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Genera las tarjetas. Sin fotos, devuelve 6 marcadores como en el diseño. */
function tarjetas(fotos) {
  if (!fotos.length) {
    return Array.from({ length: 6 }, () => `
        <article class="tcard">
          <div class="tcard-ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.4"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/><path d="M4 17.5 L9.5 12 L14 16 L17 13.5 L20 16.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>foto antes / después</span>
          </div>
          <p class="tcard-label">Próximamente</p>
        </article>`).join('');
  }

  return fotos.map(f => `
        <article class="tcard">
          <img class="tcard-img" src="/${FOTOS_DEST}/${encodeURIComponent(f.fichero)}"
               alt="Transformación de ${escapa(f.etiqueta)}" width="316" height="400" loading="lazy" decoding="async">
          <p class="tcard-label">${escapa(f.etiqueta)}</p>
        </article>`).join('');
}
