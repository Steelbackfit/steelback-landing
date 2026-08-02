-- Esquema de la base de datos D1 de la landing.
-- Aplicar con:  npx wrangler d1 execute steelback-leads --file schema.sql --remote

CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  origen     TEXT    NOT NULL DEFAULT 'desconocido',
  fecha      TEXT    NOT NULL,
  user_agent TEXT,
  ip_hash    TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_fecha ON leads (fecha DESC);

-- Ventana de rate limit. Guardamos el hash de la IP, nunca la IP en claro.
CREATE TABLE IF NOT EXISTS intentos (
  ip_hash TEXT NOT NULL,
  fecha   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intentos ON intentos (ip_hash, fecha);
