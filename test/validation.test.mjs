import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarAlta,
  comparaSegura,
  csvCampo,
  aCsv,
  huellaIp,
  baseCodigo,
  normalizaCodigo,
  MAX_EMAIL,
  MAX_NOMBRE,
} from '../lib/validation.mjs';

const alta = (extra = {}) => ({
  nombre: 'Marcos', apellido: 'Ruiz', edad: '28',
  email: 'marcos@test.com', origen: 'lista', ...extra,
});

test('acepta un alta completa y la normaliza', () => {
  const r = validarAlta(alta({ email: '  Marcos@Test.COM ', nombre: '  Marcos  ' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.alta, {
    nombre: 'Marcos', apellido: 'Ruiz', edad: 28,
    email: 'marcos@test.com', origen: 'lista', referido: null,
  });
});

test('la edad se guarda como número, no como texto', () => {
  const r = validarAlta(alta({ edad: '31' }));
  assert.strictEqual(r.alta.edad, 31);
});

test('exige nombre y apellido', () => {
  assert.equal(validarAlta(alta({ nombre: '' })).ok, false);
  assert.equal(validarAlta(alta({ nombre: '   ' })).ok, false);
  assert.equal(validarAlta(alta({ apellido: '' })).ok, false);
  assert.match(validarAlta(alta({ nombre: '' })).error, /nombre/i);
  assert.match(validarAlta(alta({ apellido: '' })).error, /apellido/i);
});

test('rechaza nombres desproporcionados', () => {
  assert.equal(validarAlta(alta({ nombre: 'a'.repeat(MAX_NOMBRE + 1) })).ok, false);
  assert.equal(validarAlta(alta({ nombre: 'a'.repeat(MAX_NOMBRE) })).ok, true);
});

test('colapsa los espacios internos del nombre', () => {
  assert.equal(validarAlta(alta({ nombre: 'Juan   Carlos' })).alta.nombre, 'Juan Carlos');
});

test('rechaza edades fuera de rango o no numéricas', () => {
  for (const edad of ['', '15', '91', '0', '-5', 'abc', '28abc', '28.5', null]) {
    assert.equal(validarAlta(alta({ edad })).ok, false, `debería rechazar ${JSON.stringify(edad)}`);
  }
  for (const edad of ['16', '90', 42]) {
    assert.equal(validarAlta(alta({ edad })).ok, true, `debería aceptar ${JSON.stringify(edad)}`);
  }
});

test('rechaza emails inválidos', () => {
  for (const email of ['', 'sinarroba', 'a@b', '@b.com', 'a@.com', 'a b@c.com']) {
    assert.equal(validarAlta(alta({ email })).ok, false, `debería rechazar ${JSON.stringify(email)}`);
  }
  assert.equal(validarAlta(alta({ email: 'a'.repeat(MAX_EMAIL) + '@t.com' })).ok, false);
});

test('el honeypot marca bot y pide responder 200', () => {
  const r = validarAlta(alta({ empresa: 'Acme' }));
  assert.equal(r.ok, false);
  assert.equal(r.bot, true);
  assert.equal(r.status, 200, 'no debe delatar la detección al bot');
});

test('un honeypot vacío o con espacios no marca bot', () => {
  assert.equal(validarAlta(alta({ empresa: '' })).ok, true);
  assert.equal(validarAlta(alta({ empresa: '   ' })).ok, true);
});

test('un origen desconocido no se propaga tal cual', () => {
  assert.equal(validarAlta(alta({ origen: 'inyectado' })).alta.origen, 'desconocido');
  assert.equal(validarAlta(alta({ origen: 'lista' })).alta.origen, 'lista');
});

test('rechaza cuerpos que no son objeto', () => {
  for (const body of [null, 'texto', 42, ['a']]) {
    assert.equal(validarAlta(body).ok, false);
  }
});

test('baseCodigo quita acentos y eñes', () => {
  // Si el encoding del fichero se corrompe, este test lo caza
  assert.equal(baseCodigo('Ángel', 'Muñoz', 'x@y.com'), 'angelmunoz');
  assert.equal(baseCodigo('José', 'Ibáñez', 'x@y.com'), 'joseibanez');
  assert.equal(baseCodigo('', '', 'hector.serna@x.com'), 'hectorserna');
  assert.equal(baseCodigo('', '', ''), 'invitado');
});

test('baseCodigo acota la longitud', () => {
  assert.ok(baseCodigo('a'.repeat(40), 'b'.repeat(40), '').length <= 16);
});

test('normalizaCodigo limpia el código de referido', () => {
  assert.equal(normalizaCodigo('Marcos-Ruiz'), 'marcos-ruiz');
  assert.equal(normalizaCodigo('<script>'), 'script');
  assert.equal(normalizaCodigo('  '), null);
  assert.equal(normalizaCodigo(undefined), null);
  assert.ok(normalizaCodigo('x'.repeat(50)).length <= 24);
});

test('el referido llega normalizado al alta', () => {
  assert.equal(validarAlta(alta({ ref: 'MARCOS-ruiz!!' })).alta.referido, 'marcos-ruiz');
  assert.equal(validarAlta(alta()).alta.referido, null);
});

test('comparaSegura distingue valores y tolera tipos raros', () => {
  assert.equal(comparaSegura('token-secreto', 'token-secreto'), true);
  assert.equal(comparaSegura('token-secreto', 'token-secretX'), false);
  assert.equal(comparaSegura('corto', 'mucho-mas-largo'), false);
  assert.equal(comparaSegura(undefined, 'x'), false);
  assert.equal(comparaSegura('', ''), true);
});

test('csvCampo neutraliza la inyección de fórmulas', () => {
  assert.equal(csvCampo('=1+1'), `"'=1+1"`);
  assert.equal(csvCampo('+34600'), `"'+34600"`);
  assert.equal(csvCampo('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCampo('normal@test.com'), '"normal@test.com"');
});

test('csvCampo escapa las comillas dobles', () => {
  assert.equal(csvCampo('di "hola"'), '"di ""hola"""');
});

test('aCsv incluye todos los campos del alta', () => {
  const csv = aCsv([{
    posicion: 7, nombre: 'Marcos', apellido: 'Ruiz', edad: 28,
    email: 'a@b.com', origen: 'lista', codigo_invitacion: 'marcosruiz',
    referido_por: null, invitados: 2, fecha: '2026-01-01T00:00:00.000Z',
  }]);
  const [cab, fila] = csv.split('\r\n');
  assert.equal(cab, 'posicion,nombre,apellido,edad,email,origen,codigo_invitacion,referido_por,invitados,fecha');
  assert.ok(fila.includes('"Marcos"'));
  assert.ok(fila.includes('"28"'));
  assert.ok(fila.includes('"marcosruiz"'));
});

test('huellaIp es estable, depende de la sal y no contiene la IP', async () => {
  const a = await huellaIp('1.2.3.4', 'sal-1');
  const b = await huellaIp('1.2.3.4', 'sal-1');
  const c = await huellaIp('1.2.3.4', 'sal-2');
  const d = await huellaIp('9.9.9.9', 'sal-1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('1.2.3.4'));
});
