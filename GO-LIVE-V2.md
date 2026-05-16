# Go-live findmymcp.fr — version CI-driven (recommandée)

Au lieu de faire `wrangler deploy` depuis ton terminal local, **tout passe par GitHub Actions** : tu pousses les secrets une fois dans le repo, et chaque push sur `main` redéploie automatiquement workers + Pages.

Hostinger DNS + dashboard Cloudflare zone reste manuel (incompressible).

---

## 1. Créer le Cloudflare API token (1 min)

`https://dash.cloudflare.com/profile/api-tokens` → "Create Token" → "Create Custom Token".

Permissions :
| Type | Permission | Niveau |
|---|---|---|
| Account | Workers Scripts | Edit |
| Account | Cloudflare Pages | Edit |
| Account | D1 | Edit |
| Account | Account Settings | Read |
| User | User Details | Read |

Account Resources : `Maxime@ikcp.fr's Account`. TTL : 30 jours. Copier.

Récupérer aussi ton **Account ID** : visible dans la sidebar du dashboard Cloudflare (`eaddc4cc77d99dd397a62e5d5a1b6864`).

---

## 2. Ajouter les secrets GitHub (5 min)

`https://github.com/Max51527/findmymcp/settings/secrets/actions` → "New repository secret" :

**Indispensables pour le deploy :**
- `CLOUDFLARE_API_TOKEN` (étape 1)
- `CLOUDFLARE_ACCOUNT_ID` = `eaddc4cc77d99dd397a62e5d5a1b6864`
- `PUBLIC_SITE_URL` = `https://findmymcp.fr`

**Pour les workers à pleine fonctionnalité :**
- `ANTHROPIC_API_KEY` (console.anthropic.com/settings/keys)
- `GITHUB_PAT_FINDMYMCP` (github.com/settings/personal-access-tokens/new — repo findmymcp, Contents+PRs+Issues R/W)
- `SCRAPER_TRIGGER_KEY` (génère : `openssl rand -hex 24`)
- `STRIPE_SECRET_KEY` (dashboard.stripe.com/apikeys, sk_test_ pour démarrer)
- `STRIPE_WEBHOOK_SECRET` (pour l'instant `whsec_dummy`, on rectifie après création du webhook)

**Pour la home + soumission (build-time + Turnstile widget) :**
- `TURNSTILE_SITE_KEY` (dash CF → Turnstile → Add site)
- `TURNSTILE_SECRET_KEY` (idem)
- `PUBLIC_TURNSTILE_SITE_KEY` = même valeur que TURNSTILE_SITE_KEY (re-déclaré car utilisé en front)
- `PUBLIC_CF_ANALYTICS_TOKEN` (dash CF → Web Analytics → Add site)

---

## 3. Premier déploiement (auto)

Dès que les 3 secrets indispensables sont en place, **le prochain push sur main déclenche le déploiement**. Pour forcer maintenant :

```bash
# Depuis ton terminal local OU via le bouton "Run workflow"
gh workflow run deploy.yml --ref main
```

OU : ouvre `https://github.com/Max51527/findmymcp/actions/workflows/deploy.yml` → "Run workflow".

Ça déploie :
- `findmymcp-scraper`
- `findmymcp-submit`
- Pages project `findmymcp` (sera créé à la volée si inexistant)

---

## 4. Pousser les secrets runtime aux workers (1 fois)

`https://github.com/Max51527/findmymcp/actions/workflows/seed-secrets.yml` → "Run workflow".

Ce workflow pipe les secrets GitHub vers les workers déployés via `wrangler secret put`. À relancer après chaque rotation de secret.

---

## 5. Cloudflare : zone DNS + Pages custom domain (10 min, dashboard)

5.1 — Zone DNS (`https://dash.cloudflare.com/add-site`)
- Domain : `findmymcp.fr`, plan Free
- Note les 2 nameservers

5.2 — Hostinger → coller les NS Cloudflare (`https://hpanel.hostinger.com/domain/findmymcp.fr/dns`)
- Propagation 5 min - 1h

5.3 — Pages custom domain
- `https://dash.cloudflare.com/?to=/:account/pages/view/findmymcp` → Custom domains
- Add : `findmymcp.fr` et `www.findmymcp.fr`

5.4 — Workers Routes (`/api/*` → `findmymcp-submit`)
- `https://dash.cloudflare.com/?to=/:account/workers/services/view/findmymcp-submit`
- Triggers → Add Custom Domain → `findmymcp.fr/api/*`

5.5 — Email Routing
- `https://dash.cloudflare.com/?to=/:account/:zone/email/routing`
- Enable, puis 3 addresses (contact@, retrait@, rgpd@) vers ton email perso

---

## 6. Stripe : payouts Qonto + webhook (5 min, dashboard)

6.1 — `https://dashboard.stripe.com/settings/payouts` → Add bank account → IBAN Qonto FR76…

6.2 — `https://dashboard.stripe.com/webhooks` → Add endpoint
- URL : `https://findmymcp.fr/api/stripe-webhook`
- Event : `checkout.session.completed`
- Copier `whsec_...`

6.3 — Actualiser le secret GitHub `STRIPE_WEBHOOK_SECRET` avec la vraie valeur

6.4 — Re-run `seed-secrets.yml` pour pousser la mise à jour

---

## 7. Smoke tests

- `https://findmymcp.fr` charge en HTTPS
- `/sponsoriser` → Stripe Checkout test (carte 4242 4242 4242 4242 / 12/34 / 123) → row dans `sponsorships` (vérif via Cloudflare D1 MCP)
- Stripe dashboard "Send test webhook" → HTTP 200
- Trigger manuel scraper : `curl -X POST https://findmymcp-scraper.<account>.workers.dev/run -H "x-trigger-key: $SCRAPER_TRIGGER_KEY"` → PR draft créée

---

## Ce qui est désormais automatique

| Push sur main | → | Auto-deploy workers + Pages |
| Lundi 04h UTC | → | Scraper ouvre PR draft hebdo |
| Stripe payment | → | PR auto `sponsored: true` |
| Label `scraper-trusted` + ready | → | Auto-merge PR scraper |

Tu n'interviens que pour reviewer/merger les PRs et pour les rotations de tokens.
