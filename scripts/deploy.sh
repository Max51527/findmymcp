#!/usr/bin/env bash
# Déploie findmymcp sur Cloudflare. À lancer une seule fois après `wrangler login`.
# Usage: bash scripts/deploy.sh [--skip-d1-schema] [--skip-workers]
#
# Pré-requis :
#   - wrangler installé (`npm i -g wrangler`)
#   - `wrangler login` exécuté
#   - secrets prêts : voir scripts/secrets.example.env

set -euo pipefail

SKIP_SCHEMA=false
SKIP_WORKERS=false
for arg in "$@"; do
  case "$arg" in
    --skip-d1-schema) SKIP_SCHEMA=true ;;
    --skip-workers)   SKIP_WORKERS=true ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

echo "==> 1. Build Astro site"
npm ci
npm run build

if [[ "$SKIP_SCHEMA" == false ]]; then
  echo "==> 2. Apply D1 schema (idempotent IF NOT EXISTS)"
  npx wrangler d1 execute findmymcp-db --file workers/scraper/schema.sql --remote
fi

if [[ "$SKIP_WORKERS" == false ]]; then
  echo "==> 3. Deploy scraper worker"
  ( cd workers/scraper && npm ci && npx wrangler deploy )

  echo "==> 4. Deploy submit worker"
  ( cd workers/submit && npm ci && npx wrangler deploy )
fi

echo
echo "==> Done. Checklist post-deploy :"
echo "  [ ] Cloudflare Pages : connecter Max51527/findmymcp, build = 'npm run build', output = 'dist'"
echo "  [ ] Pages env vars : PUBLIC_CF_ANALYTICS_TOKEN, PUBLIC_TURNSTILE_SITE_KEY"
echo "  [ ] Pages Functions routes : /api/* -> findmymcp-submit"
echo "  [ ] DNS : CNAME findmymcp.fr -> <pages-project>.pages.dev (proxied)"
echo "  [ ] SSL/TLS = Full (strict)"
echo "  [ ] Email Routing : contact@, retrait@, rgpd@findmymcp.fr"
