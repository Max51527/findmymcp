# RUNBOOK — FindMyMCP

Documentation opérationnelle. Tout ce qu'il faut pour déployer, dépanner et maintenir.

---

## 1. Architecture

```
┌──────────────────┐     ┌────────────────────┐
│   Hostinger      │     │     GitHub         │
│   (registrar)    │     │  forgekit/         │
│   findmymcp.fr   │     │   findmymcp        │
└────────┬─────────┘     └──────┬─────────────┘
         │                      │ webhook deploy
         │ DNS                  │
         ▼                      ▼
┌─────────────────────────────────────────────┐
│              Cloudflare                     │
│                                             │
│  Pages "findmymcp" ◀── built from Astro    │
│         │                                   │
│         ├── routes /api/submit ─▶ Worker   │
│         │                         submit    │
│         └── (static everything else)        │
│                                             │
│  Worker scraper (cron lundi 04h UTC)        │
│       │                                     │
│       └─▶ D1 "findmymcp-db"                │
│           ├─ mcps                           │
│           ├─ submissions                    │
│           ├─ email_captures                 │
│           └─ audit_scraper                  │
│                                             │
│  KV "findmymcp-cache" (optionnel)           │
└─────────────────────────────────────────────┘
```

---

## 2. Premier déploiement (T1 fin)

Pré-requis : node 20+, wrangler installé (`npm i -g wrangler`).

```bash
# Auth Cloudflare
wrangler login

# Build site
npm install
npm run build

# Création D1
wrangler d1 create findmymcp-db
# → copier le database_id dans :
#   - workers/scraper/wrangler.toml
#   - workers/submit/wrangler.toml

# Schéma DB
wrangler d1 execute findmymcp-db --file workers/scraper/schema.sql --remote

# Création KV (optionnel)
wrangler kv:namespace create findmymcp-cache

# Pages project (via UI Cloudflare dashboard)
# Connect repo GitHub → forgekit/findmymcp
# Build command : npm run build
# Build output : dist
# Root directory : (empty)

# Déployer les workers
cd workers/scraper
npm install
wrangler secret put GITHUB_TOKEN          # github_pat_...
wrangler secret put ANTHROPIC_API_KEY     # sk-ant-...
wrangler deploy

cd ../submit
npm install
wrangler secret put GITHUB_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY  # 0x4AAA...
wrangler deploy

# Configurer la Pages route /api/* → worker submit
# Cloudflare Dashboard → Pages → findmymcp → Functions → routes
```

---

## 3. DNS Cloudflare

1. Cloudflare Dashboard → Add site → `findmymcp.fr` → plan Free
2. Hostinger → Domaines → `findmymcp.fr` → DNS / Nameservers → remplace par les 2 nameservers Cloudflare
3. Wait 5-30min propagation
4. Cloudflare → DNS → activer **proxy orange** sur `findmymcp.fr` et `www`
5. Cloudflare → Pages → ajouter custom domain `findmymcp.fr`
6. SSL/TLS → Full (strict)

---

## 4. Email pro `contact@findmymcp.fr`

Cloudflare Email Routing (gratuit) :
1. Dashboard CF → Email Routing → enable
2. Add destination address : ton Gmail/ProtonMail dédié business
3. Add custom address : `contact@findmymcp.fr` → forward → Gmail
4. Idem `retrait@findmymcp.fr`, `rgpd@findmymcp.fr`

---

## 5. Ajouter un MCP manuellement

```bash
# 1. Édite data/mcps.json (ajoute une entrée selon SCHEMA.md)
# 2. Test local
npm run dev
# Ouvre http://localhost:4321/mcp/<slug>
# 3. Commit + push
git add data/mcps.json
git commit -m "feat(mcp): add <nom>"
git push
# 4. Cloudflare Pages redéploie automatiquement (~1min)
```

---

## 6. Surveiller le scraper hebdo

Lundi 04h UTC, vérifier :

```bash
# Logs en direct
cd workers/scraper
wrangler tail

# Audit DB
wrangler d1 execute findmymcp-db --remote \
  --command "SELECT status, COUNT(*) FROM audit_scraper WHERE ts > datetime('now', '-7 days') GROUP BY status"
```

---

## 7. Procédures d'urgence

### Site down

1. Status Cloudflare : https://www.cloudflarestatus.com/
2. Pages dashboard : last deploy → green ?
3. Rollback : Cloudflare Pages → Deployments → click ancien deploy → "Rollback"

### Données D1 corrompues

```bash
# Backup avant intervention
wrangler d1 export findmymcp-db --remote --output backup.sql

# Si besoin de tout restaurer depuis git
wrangler d1 execute findmymcp-db --remote --file workers/scraper/schema.sql
# Puis re-seed depuis data/mcps.json (script à écrire)
```

### Token GitHub compromis

1. https://github.com/settings/tokens → revoke immédiat
2. Génère nouveau token (mêmes scopes)
3. `cd workers/scraper && wrangler secret put GITHUB_TOKEN`
4. Idem `workers/submit`
5. Audit dernières issues du repo (rien de bizarre ?)

### Spam soumissions

1. Vérifier Turnstile actif (`/soumettre` doit afficher captcha)
2. Augmenter rate limit dans `workers/submit/src/index.ts` (5 → 2 par heure)
3. Bannir IP via Cloudflare → Security → WAF rules

---

## 8. KPI à surveiller (mensuel)

| Métrique | Source | Cible M3 | Cible M6 |
|----------|--------|----------|----------|
| Visiteurs uniques | CF Web Analytics | 800 | 4 000 |
| MCPs indexés | D1 `mcps` count | 200 | 400 |
| Backlinks | ahrefs free / Bing Webmaster | 30 | 80 |
| Position moy. SEO | Google Search Console | 30 | 20 |
| Soumissions valides | D1 `submissions` | 5/mois | 15/mois |
| Revenus | manuel | 30€ | 280€ |

---

## 9. Backlog Phase 2 (post-MVP)

- API publique en lecture (gratuit pour devs) : `/api/v1/mcps?cat=...`
- Newsletter mensuelle activée (Buttondown M3)
- Discord communautaire (M9)
- Annuaire pour autres LLM (Mistral, OpenAI Apps SDK, ...)
- Mode payant "Pro" : alertes nouveaux MCP, dashboard perso
- OG images générées dynamiquement (Worker Cloudflare + Satori)
- Page `/comparaison/[a]-vs-[b]` auto-générée
- Page `/tutoriel/[slug]` (manuel, 1/sem)
