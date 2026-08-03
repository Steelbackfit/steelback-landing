-- Esquema de la base de datos D1 de la landing.
-- Instalación nueva:  npm run db:remote
-- Base ya existente:  ver migrations/ (schema.sql NO altera tablas existentes)

CREATE TABLE IF NOT EXISTS leads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL UNIQUE,
  nombre            TEXT,
  apellido          TEXT,
  edad              INTEGER,
  origen            TEXT    NOT NULL DEFAULT 'desconocido',
  fecha             TEXT    NOT NULL,
  user_agent        TEXT,
  ip_hash           TEXT,
  -- Posición en la lista de espera, asignada al darse de alta.
  posicion          INTEGER,
  -- Código propio para invitar. Único: es la clave del enlace de invitación.
  codigo_invitacion TEXT    UNIQUE,
  -- Código de quien le invitó, si vino por un enlace de invitación.
  referido_por      TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_fecha    ON leads (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_leads_referido ON leads (referido_por);

-- Ventana de rate limit. Guardamos el hash de la IP, nunca la IP en claro.
CREATE TABLE IF NOT EXISTS intentos (
  ip_hash TEXT NOT NULL,
  fecha   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intentos ON intentos (ip_hash, fecha);
