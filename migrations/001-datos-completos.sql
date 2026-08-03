-- Migración 001 — el formulario pasa de pedir solo el email a pedir
-- nombre, apellido y edad, y añade lista de espera con invitaciones.
--
-- schema.sql usa CREATE TABLE IF NOT EXISTS, así que NO toca una tabla que
-- ya existe. Sobre una base ya creada hay que aplicar esto:
--
--   npx wrangler d1 execute steelback-leads --local  --file migrations/001-datos-completos.sql
--   npx wrangler d1 execute steelback-leads --remote --file migrations/001-datos-completos.sql
--
-- Es segura de aplicar sobre una base vacía o con datos. NO es idempotente:
-- ejecutarla dos veces falla con "duplicate column name", lo cual es
-- inofensivo — significa que ya estaba aplicada.

ALTER TABLE leads ADD COLUMN nombre TEXT;
ALTER TABLE leads ADD COLUMN apellido TEXT;
ALTER TABLE leads ADD COLUMN edad INTEGER;
ALTER TABLE leads ADD COLUMN posicion INTEGER;
ALTER TABLE leads ADD COLUMN codigo_invitacion TEXT;
ALTER TABLE leads ADD COLUMN referido_por TEXT;

-- UNIQUE sobre el código: es la clave del enlace de invitación.
-- Se crea como índice porque SQLite no permite añadir una restricción
-- UNIQUE con ALTER TABLE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_codigo ON leads (codigo_invitacion);
CREATE INDEX        IF NOT EXISTS idx_leads_referido ON leads (referido_por);
