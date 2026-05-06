-- D1 schema for findmymcp-db
-- Apply with: wrangler d1 execute findmymcp-db --file workers/scraper/schema.sql

CREATE TABLE IF NOT EXISTS mcps (
  slug TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  description_fr TEXT NOT NULL,
  categorie TEXT NOT NULL,            -- JSON array
  auteur TEXT NOT NULL,
  github_url TEXT NOT NULL UNIQUE,
  github_stars INTEGER DEFAULT 0,
  langage TEXT,
  licence TEXT,
  compatible_avec TEXT NOT NULL,      -- JSON array
  installation_cli TEXT,
  config_exemple TEXT,
  cas_usage_fr TEXT,                  -- JSON array
  tutoriels_fr TEXT,                  -- JSON array
  tags TEXT,                          -- JSON array
  date_ajout TEXT NOT NULL,           -- ISO YYYY-MM-DD
  derniere_maj TEXT NOT NULL,
  featured INTEGER DEFAULT 0,
  sponsored INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  rejected_orias INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mcps_categorie ON mcps(categorie);
CREATE INDEX IF NOT EXISTS idx_mcps_featured ON mcps(featured);
CREATE INDEX IF NOT EXISTS idx_mcps_date ON mcps(date_ajout DESC);

CREATE TABLE IF NOT EXISTS audit_scraper (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  status TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  github_url TEXT NOT NULL,
  description_courte TEXT NOT NULL,
  categorie TEXT NOT NULL,
  email TEXT NOT NULL,
  ip_hash TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT,
  confirmed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);
