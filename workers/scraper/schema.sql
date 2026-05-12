-- D1 schema for findmymcp-db
-- Apply with: wrangler d1 execute findmymcp-db --file workers/scraper/schema.sql
--
-- Source of truth for MCPs = data/mcps.json (git). The scraper proposes new
-- entries via Pull Request, not by writing rows here. D1 only stores audit
-- + community submissions.

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

CREATE TABLE IF NOT EXISTS sponsorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT NOT NULL UNIQUE,
  mcp_slug TEXT NOT NULL,
  tier TEXT NOT NULL,
  months INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'paid',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sponsorships_slug ON sponsorships(mcp_slug);
