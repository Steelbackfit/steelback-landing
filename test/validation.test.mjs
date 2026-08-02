import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarAlta,
  comparaSegura,
  csvCampo,
  aCsv,
  huellaIp,
  MAX_EMAIL,
} from '../lib/validation.mjs';

test('acepta un email válido y normaliza a minúsculas', () => {
  const r = validarAlta({ email: '  Info@SteelbackFit.COM ', origen: 'hero' });
  assert.equal(r.ok, true);
  assert.equal(r.alta.email, 'info@steelbackfit.com');
  assert.equal(r.alta.origen, 'hero');
});

test('rechaza emails inválidos', () => {
  for (const email of ['', '   ', 'sinarroba', 'a@b', '@b.com', 'a@.com', 'a b@c.com']) {
    const r = validarAlta({ email });
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(email)}`);
    assert.equal(r.status, 400);
  }
});

test('rechaza emails por encima del límite de longitud', () => {
  const largo = 'a'.repeat(MAX_EMAIL) + '@test.com';
  assert.equal(validarAlta({ email: largo }).ok, false);
});

test('el honeypot marca bot y pide responder 200', () => {
  const r = validarAlta({ email: 'real@test.com', empresa: 'Acme' });
  assert.equal(r.ok, false);
  assert.equal(r.bot, true);
  assert.equal(r.status, 200, 'no debe delatar la detección al bot');
});

test('un honeypot vacío o con espacios no marca bot', () => {
  assert.equal(validarAlta({ email: 'a@b.com', empresa: '' }).ok, true);
  assert.equal(validarAlta({ email: 'a@b.com', empresa: '   ' }).ok, true);
});

test('un origen desconocido no se propaga tal cual', () => {
  assert.equal(validarAlta({ email: 'a@b.com', origen: 'inyectado' }).alta.origen, 'desconocido');
  assert.equal(validarAlta({ email: 'a@b.com', origen: 'cta' }).alta.origen, 'cta');
});

test('rechaza cuerpos que no son objeto', () => {
  for (const body of [null, 'texto', 42, ['a']]) {
    assert.equal(validarAlta(body).ok, false);
  }
});

test('comparaSegura distingue valores y tolera tipos raros', () => {
  assert.equal(comparaSegura('token-secreto', 'token-secreto'), true);
  assert.equal(comparaSegura('token-secreto', 'token-secretX'), false);
  assert.equal(comparaSegura('corto', 'mucho-mas-largo'), false);
  assert.equal(comparaSegura(undefined, 'x'), false);
  assert.equal(comparaSegura('', ''), true);
});

test('csvCampo neutraliza la inyección de fórmulas', () => {
  // Un email que empieza por = se ejecutaría como fórmula al abrir en Excel
  assert.equal(csvCampo('=1+1'), `"'=1+1"`);
  assert.equal(csvCampo('+34600'), `"'+34600"`);
  assert.equal(csvCampo('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCampo('normal@test.com'), '"normal@test.com"');
});

test('csvCampo escapa las comillas dobles', () => {
  assert.equal(csvCampo('di "hola"'), '"di ""hola"""');
});

test('aCsv genera cabecera y una fila por lead', () => {
  const csv = aCsv([
    { email: 'a@b.com', origen: 'hero', fecha: '2026-01-01T00:00:00.000Z', user_agent: 'UA' },
  ]);
  const lineas = csv.split('\r\n');
  assert.equal(lineas[0], 'email,origen,fecha,user_agent');
  assert.equal(lineas[1], '"a@b.com","hero","2026-01-01T00:00:00.000Z","UA"');
});

test('huellaIp es estable, depende de la sal y no contiene la IP', async () => {
  const a = await huellaIp('1.2.3.4', 'sal-1');
  const b = await huellaIp('1.2.3.4', 'sal-1');
  const c = await huellaIp('1.2.3.4', 'sal-2');
  const d = await huellaIp('9.9.9.9', 'sal-1');
  assert.equal(a, b, 'misma IP y sal ⇒ mismo hash');
  assert.notEqual(a, c, 'distinta sal ⇒ distinto hash');
  assert.notEqual(a, d, 'distinta IP ⇒ distinto hash');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('1.2.3.4'), 'el hash no debe contener la IP');
});
