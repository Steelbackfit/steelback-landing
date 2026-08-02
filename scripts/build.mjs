// Copia a dist/ solo los ficheros que se sirven en producción.
// Whitelist deliberada: uploads/ contiene material interno (capturas de
// trabajo y la guía en PDF) que no debe acabar en un CDN público.
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ASSETS = [
  'index.html',
  'logo-bolt.svg',
  'uploads/SIMBOLO.svg',
  'uploads/logo_steelback_white.png',
  '_headers',
];

const OUT = 'dist';

await rm(OUT, { recursive: true, force: true });

for (const asset of ASSETS) {
  const dest = join(OUT, asset);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(asset, dest);
  console.log('  +', asset);
}

console.log(`\n${ASSETS.length} ficheros copiados a ${OUT}/`);
