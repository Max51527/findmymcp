# Go-live findmymcp.fr — checklist

Tout ce qu'il reste à faire avant que le site soit accessible publiquement
sur `https://findmymcp.fr`. Le code est terminé ; il ne reste que des
actions nécessitant un **navigateur, un dashboard, ou tes credentials**.

Les sections marquées **[CHROME]** sont taillées pour être exécutées par
Claude Chrome / un humain dans un navigateur. Les sections **[CLI]** se
font dans un terminal sur ta machine.

---

## 1. Comptes à créer/vérifier  [CHROME]

| Service | URL | Pourquoi | Coût |
|---|---|---|---|
| Cloudflare | dash.cloudflare.com | Pages + Workers + DNS + D1 | gratuit |
| Stripe | dashboard.stripe.com | Encaissement sponsoring | 1,5 % + 0,25 € par paiement |
| Anthropic Console | console.anthropic.com | API key pour Haiku (ORIAS + scraper) | pay-as-you-go |
| Hostinger | hpanel.hostinger.com | Tu y as déjà findmymcp.fr | déjà payé |
| Qonto | app.qonto.com | Réception virements Stripe | déjà actif chez toi |

Vérifier que **Stripe est en mode "Live"** (pas Test) et activé pour ton
pays (KYC validé).

---

## 2. Récupérer les clés/tokens  [CHROME]

Pour chacune, ouvre l'URL, copie la valeur, colle-la dans un coffre
temporaire (Bitwarden / 1Password / fichier `.secrets.local` non commité).

### 2.1 Anthropic
- `console.anthropic.com/settings/keys` → "Create Key" → nom `findmymcp-prod`
- Copier : `ANTHROPIC_API_KEY` = `sk-ant-api03-...`

### 2.2 GitHub (PAT fine-grained)
- `github.com/settings/personal-access-tokens/new`
- Resource owner : `Max51527`
- Repository : `findmymcp` (seulement celui-ci)
- Permissions :
  - **Contents** : Read and write
  - **Pull requests** : Read and write
  - **Issues** : Read and write
- Expiration : 1 an
- Copier : `GITHUB_TOKEN` = `github_pat_...`

### 2.3 Stripe
- `dashboard.stripe.com/apikeys` → Reveal "Secret key"
- Copier : `STRIPE_SECRET_KEY` = `sk_live_...`
- `dashboard.stripe.com/settings/payouts` → Add bank account
  - IBAN Qonto FR76… (BIC affiché dans ton Qonto)
  - Schedule : "Daily automatic" ou "Weekly"

### 2.4 Cloudflare Turnstile
- `dash.cloudflare.com/?to=/:account/turnstile` → Add site
- Domain : `findmymcp.fr`
- Mode : Managed
- Copier : `PUBLIC_TURNSTILE_SITE_KEY` (commence par `0x4`) + `TURNSTILE_SECRET_KEY`

### 2.5 Cloudflare Web Analytics
- `dash.cloudflare.com/?to=/:account/web-analytics` → Add site
- Hostname : `findmymcp.fr`
- Copier : `PUBLIC_CF_ANALYTICS_TOKEN` (le `?token=xxx` du snippet)

### 2.6 Secrets internes (générés localement)
```bash
echo "SCRAPER_TRIGGER_KEY=$(openssl rand -hex 24)"
```

---

## 3. Cloudflare : créer la zone DNS  [CHROME]

1. `dash.cloudflare.com` → Add a Site → `findmymcp.fr`
2. Plan : **Free**
3. Cloudflare scanne les DNS → tu peux laisser vide pour l'instant
4. Cloudflare te donne 2 nameservers (ex : `mark.ns.cloudflare.com`,
   `tina.ns.cloudflare.com`) — **note-les**

### 3.1 Changer les nameservers chez Hostinger  [CHROME]
- `hpanel.hostinger.com` → Domains → findmymcp.fr → Nameservers
- "Change nameservers" → "Use custom nameservers"
- Coller les 2 ns Cloudflare
- Propagation : 1-48h (souvent < 1h)

### 3.2 Vérifier l'activation
- Cloudflare envoie un email quand actif
- Ou : `dig findmymcp.fr NS +short`

---

## 4. Déploiement workers + D1  [CLI]

Sur ta machine, dans le repo :

```bash
# 4.1 Installer wrangler
npm i -g wrangler

# 4.2 Login (ouvre un navigateur pour OAuth Cloudflare)
wrangler login

# 4.3 Vérifier
wrangler whoami
```

Puis appliquer le schema D1 + déployer les workers :

```bash
# 4.4 D1 schema (idempotent, peut être rejoué)
cd workers/scraper
wrangler d1 execute findmymcp-db --remote --file schema.sql

# 4.5 Secrets scraper
wrangler secret put GITHUB_TOKEN        # paste from §2.2
wrangler secret put ANTHROPIC_API_KEY   # paste from §2.1
wrangler secret put SCRAPER_TRIGGER_KEY # paste from §2.6
wrangler deploy

# 4.6 Secrets submit (sponsoring + soumission)
cd ../submit
wrangler secret put GITHUB_TOKEN
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY # paste from §2.4
wrangler secret put STRIPE_SECRET_KEY    # paste from §2.3
# STRIPE_WEBHOOK_SECRET — voir §6, on l'a après avoir créé le webhook
wrangler deploy
```

---

## 5. Cloudflare Pages : connecter le repo  [CHROME]

1. `dash.cloudflare.com/?to=/:account/pages` → "Create a project"
2. "Connect to Git" → GitHub → autoriser → choisir `Max51527/findmymcp`
3. Production branch : `main`
4. Build settings :
   - Framework preset : **Astro**
   - Build command : `npm run build`
   - Build output : `dist`
   - Root directory : `/`
5. Environment variables (Production) :
   - `PUBLIC_SITE_URL` = `https://findmymcp.fr`
   - `PUBLIC_CF_ANALYTICS_TOKEN` = (de §2.5)
   - `PUBLIC_TURNSTILE_SITE_KEY` = (de §2.4)
6. "Save and Deploy"

### 5.1 Custom domain  [CHROME]
- Onglet "Custom domains" du projet Pages → "Set up a custom domain"
- Saisir : `findmymcp.fr` puis aussi `www.findmymcp.fr` (auto-redirect)
- Cloudflare ajoute automatiquement les CNAME

### 5.2 Router /api/* vers le worker  [CHROME]
- `dash.cloudflare.com/?to=/:account/workers/services/view/findmymcp-submit`
- Onglet "Triggers" → "Add Custom Domain" → `findmymcp.fr/api/*`
- (Workers Routes ont la priorité sur Pages pour le même path)

---

## 6. Webhook Stripe  [CHROME]

À faire **après** que Pages soit live et que `/api/stripe-webhook` réponde.

1. `dashboard.stripe.com/webhooks` → "Add endpoint"
2. URL : `https://findmymcp.fr/api/stripe-webhook`
3. Events to send : `checkout.session.completed`
4. Add → révèle "Signing secret" `whsec_...`
5. Retour CLI :
   ```bash
   cd workers/submit
   wrangler secret put STRIPE_WEBHOOK_SECRET   # paste whsec_...
   wrangler deploy
   ```
6. Tester depuis Stripe dashboard : bouton "Send test webhook"
   `checkout.session.completed`. Vérifier en D1 :
   ```bash
   wrangler d1 execute findmymcp-db --remote \
     --command "SELECT * FROM sponsorships ORDER BY id DESC LIMIT 1"
   ```

---

## 7. Email Routing (contact@, retrait@, rgpd@)  [CHROME]

Obligatoire pour LCEN + RGPD (les adresses sont citées sur les pages
légales).

1. `dash.cloudflare.com/?to=/:account/:zone/email/routing` (sur la zone findmymcp.fr)
2. "Enable Email Routing" → CF ajoute automatiquement les MX + SPF
3. Custom address :
   - `contact@findmymcp.fr` → forward vers `<ton-email-perso>`
   - `retrait@findmymcp.fr` → forward
   - `rgpd@findmymcp.fr` → forward
4. Vérifier l'email de destination (clic sur le lien reçu)

---

## 8. Compléter les mentions légales  [CODE — à faire après création micro-entreprise]

Quand tu as ton SIREN INSEE :

```diff
- Auto-entrepreneur — SIREN à compléter
+ Auto-entrepreneur — SIREN 123 456 789
```

Fichier : `src/pages/mentions-legales.astro`

---

## 9. Affiliés réels  [CHROME + CODE]

Une fois inscrit aux programmes :

### 9.1 Notion Partner Program
- `notion.so/affiliates` → Apply
- Une fois accepté : tu reçois un lien `notion.so/?aff=XXXX`
- Remplace dans `data/affiliates.json` la clé `notion-mcp.href`

### 9.2 Atlassian Partner
- `partner.atlassian.com` → Solution Partner Program
- Lien type `atlassian.com/?affiliate=XXX`
- Remplace `atlassian-mcp.href`

### 9.3 Les autres (Stripe, Supabase, Cloudflare, Linear, Sentry)
- Pas de programme affilié public à ce jour (mai 2026)
- Garde les UTM placeholders : permet de mesurer les clics, base de
  négociation pour un deal direct plus tard

---

## 10. Smoke tests post-deploy  [CHROME]

Une fois tout en place, vérifier dans le navigateur :

- [ ] `https://findmymcp.fr` charge avec HTTPS valide
- [ ] Header + footer s'affichent
- [ ] La home liste au moins 9 MCPs "À la une"
- [ ] `/mcp/stripe-mcp` montre la fiche + l'encart affilié Stripe
- [ ] `/sponsoriser` → cliquer "Featured 1 mois" + remplir → redirige
      sur `checkout.stripe.com` (en test mode, utiliser carte
      4242 4242 4242 4242 / 12/34 / 123)
- [ ] Le paiement test trigger l'insertion dans `sponsorships` (D1)
- [ ] `/soumettre` → soumission valide crée une issue GitHub + une row
      `submissions`
- [ ] Inscription newsletter sur home → row dans `email_captures`
- [ ] `contact@findmymcp.fr` arrive bien dans ta boîte
- [ ] `/sitemap-index.xml` répond 200
- [ ] `/robots.txt` répond 200
- [ ] Lighthouse mobile : score Performance > 90, A11y > 90

---

## Récap dépendances

```
DNS Cloudflare actif
    ↓
Pages déployé + custom domain
    ↓
Workers déployés + Workers Routes /api/*
    ↓
Stripe webhook créé (URL doit répondre 200)
    ↓
WHSEC poussé en secret + redeploy
    ↓
Email Routing configuré
    ↓
SIREN renseigné dans /mentions-legales
    ↓
GO-LIVE
```

ETA réaliste si tu attaques d'un coup : **2-3h** (DNS prend le plus de
temps en propagation, mais on peut tout préparer en parallèle).
