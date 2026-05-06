# findmymcp-scraper (Worker Cloudflare)

Cron hebdomadaire qui découvre, classe et publie les nouveaux MCP servers.

## Cron

`0 4 * * 1` — chaque lundi à 04h00 UTC.

## Pipeline

```
GitHub topics ──▶ search API ──▶ check existant DB
                                       │
                                       ├─ existant : update stars, skip
                                       │
                                       └─ nouveau ──▶ fetch README
                                                          │
                                                          ▼
                                                  ORIAS guard (Haiku)
                                                          │
                                                  ┌───────┴───────┐
                                                 "OUI"          "NON"
                                                  │              │
                                              REJECTED      MCP_DESCRIBER (Haiku)
                                                                 │
                                                                 ▼
                                                          INSERT D1 mcps
                                                          + INSERT audit_scraper
```

## Topics scrapés

- `mcp-server`
- `anthropic-mcp`
- `claude-skill`

Limite : `MAX_PER_RUN = 100` repos / exécution.

## Setup

```bash
cd workers/scraper
npm install

# 1. Créer la D1 (depuis racine projet)
wrangler d1 create findmymcp-db
# → copier l'ID retourné dans wrangler.toml

# 2. Appliquer le schéma
wrangler d1 execute findmymcp-db --file workers/scraper/schema.sql

# 3. Secrets
wrangler secret put GITHUB_TOKEN          # ghp_... ou github_pat_...
wrangler secret put ANTHROPIC_API_KEY     # sk-ant-...

# 4. Deploy
wrangler deploy
```

## Test manuel

Trigger via HTTP (clé = derniers 8 chars du GITHUB_TOKEN) :

```bash
curl -X POST https://findmymcp-scraper.<sub>.workers.dev/run \
  -H "x-trigger-key: <last-8-chars-of-token>"
```

## Coût estimé

- ~50 repos nouveaux / semaine après bootstrap
- ~2 appels Haiku / repo (ORIAS + describer)
- Coût Anthropic : ~0.005€ / repo → **~0.25€ / semaine**

## Logs

```bash
wrangler tail
```

Et table `audit_scraper` en D1 :

```bash
wrangler d1 execute findmymcp-db --command "SELECT * FROM audit_scraper ORDER BY id DESC LIMIT 50"
```
