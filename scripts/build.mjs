// Copia a dist/ solo los ficheros que se sirven en producción.
//
// La landing se publica en /landing. El HTML va a dist/landing.html, NO a
// dist/landing/index.html: con index.html dentro de una carpeta, Pages
// normaliza /landing → /landing/ con un 308, y cualquier regla que intente
// devolver la barra final crea un bucle de redirecciones. Como landing.html
// se sirve en /landing con 200 directo, no hay redirección que arreglar.
//
// _headers y _redirects tienen que quedar en la RAÍZ de dist/: Pages solo
// los lee ahí.
//
// Whitelist deliberada: uploads/ contiene material interno de diseño
// (capturas de trabajo y la guía en PDF, 5,5 MB) que no debe acabar en un
// CDN público. Si añades un asset nuevo, súmalo a ASSETS.
import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = 'dist';

// origen -> destino dentro de dist/
const ASSETS = [
  ['index.html', 'landing.html'],
  ['logo-bolt.svg', 'assets/logo-bolt.svg'],
  ['uploads/SIMBOLO.svg', 'assets/SIMBOLO.svg'],
  ['uploads/logo_steelback_white.png', 'assets/logo_steelback_white.png'],
  ['_headers', '_headers'],
  ['_redirects', '_redirects'],
];

await rm(OUT, { recursive: true, force: true });

for (const [origen, destino] of ASSETS) {
  const ruta = join(OUT, destino);
  await mkdir(dirname(ruta), { recursive: true });
  await copyFile(origen, ruta);
  console.log('  +', destino);
}

// La landing sí se indexa; los endpoints no.
await writeFile(
  join(OUT, 'robots.txt'),
  ['User-agent: *', 'Allow: /landing', 'Disallow: /api/', ''].join('\n')
);
console.log('  +', 'robots.txt');

console.log(`\n${ASSETS.length + 1} ficheros generados en ${OUT}/`);
