# FindMyMCP

Annuaire francophone des **MCP servers** (Model Context Protocol) pour Claude et autres LLM compatibles.

🌐 [findmymcp.fr](https://findmymcp.fr)

---

## Stack

- **Astro 5** + Tailwind CSS — site statique généré
- **Cloudflare Pages** — hosting CDN edge
- **Cloudflare Workers** — scraper hebdo + API submission
- **Cloudflare D1** — base de données mirror
- **Cloudflare KV** — cache
- **Pagefind** — recherche statique côté client
- **Alpine.js** — filtres interactifs

## Architecture

```
findmymcp/
├── src/
│   ├── components/      Composants Astro réutilisables
│   ├── layouts/         Layouts pages
│   ├── pages/           Routes (index, annuaire, mcp/[slug], ...)
│   └── styles/          CSS global
├── data/
│   ├── mcps.json        Source de vérité — annuaire des MCPs
│   ├── categories.json  Liste catégories
│   └── affiliates.json  Liens affiliés
├── workers/
│   └── scraper/         Worker cron GitHub scraper
├── public/              Assets statiques
└── astro.config.mjs
```

## Développement local

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # build statique → dist/
npm run preview      # preview build
```

## Ajouter un MCP manuellement

1. Édite `data/mcps.json`
2. Ajoute une entrée selon le schéma (voir `data/SCHEMA.md`)
3. `npm run dev` — vérifie que la fiche se génère bien sur `/mcp/<slug>`
4. Commit + push — Cloudflare Pages redéploie automatiquement

## Scraper hebdomadaire

Cron `0 4 * * 1` (lundi 4h UTC) :
1. Query GitHub topics : `mcp-server`, `claude-skill`, `anthropic-mcp`
2. Pour chaque repo, génère description FR via Claude Haiku
3. Vérifie cloison ORIAS (rejet auto MCP financiers)
4. Crée Pull Request automatique sur ce repo

Voir [`workers/scraper/README.md`](workers/scraper/README.md).

## Soumettre un MCP (communauté)

Formulaire public : `/soumettre`
→ crée une issue GitHub via Worker `/api/submit`
→ Maxime review et merge

## Indépendance

Site indépendant, **non affilié** à Anthropic.
"Claude" et "MCP / Model Context Protocol" sont des marques/standards d'Anthropic PBC.

## Licence

- Code : [MIT](LICENSE)
- Données (`data/mcps.json` et dérivés) : [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
