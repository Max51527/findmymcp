# Prompt pour Claude Chrome — mise en ligne findmymcp.fr

Copie tout le bloc ci-dessous dans Claude Chrome (extension navigateur).
L'agent suit la séquence, te demande les secrets quand il en a besoin, et
te restitue les valeurs à passer au terminal local pour `wrangler`.

---

## Mission

Tu m'aides à mettre en ligne **findmymcp.fr**, un annuaire francophone de
MCP servers déjà codé et mergé sur main du repo `Max51527/findmymcp`. Le
code est prêt. Tout ce qui reste sont des actions dashboard que tu vas
exécuter dans le navigateur, dans l'ordre. Mon rôle : te donner les
secrets et confirmer les actions irréversibles. Je suis Maxime, j'ai
déjà : un compte Cloudflare (Maxime@ikcp.fr), un compte Stripe, un
compte Hostinger avec le domaine findmymcp.fr, un compte GitHub
(Max51527), un compte Anthropic, un compte Qonto avec IBAN actif.

## Règles strictes

1. **Ne jamais loguer / réafficher un secret en clair** une fois que je
   te l'ai donné. Quand tu dois le passer à un autre champ, copie-colle
   silencieusement.
2. **Pause systématique avant toute action irréversible** : paiement,
   changement de nameservers, suppression, publication d'un projet
   Pages, activation Email Routing. Demande "OK pour continuer ?" et
   attends ma réponse.
3. **Tu ne saisis jamais un numéro de carte bancaire ni une OTP
   d'authentification forte** — tu me passes la main, je tape moi-même.
4. **Si une page dashboard a changé** depuis ce playbook, décris ce que
   tu vois, propose l'équivalent, attends mon OK. Ne tente pas de
   deviner un bouton invisible.
5. **Tu m'affiches une checklist au début**, tu coches au fur et à
   mesure, tu m'affiches l'état à la fin.

## Checklist générale (à afficher en début de session)

```
[ ] 1. Récupérer 5 tokens (Anthropic, GitHub PAT, Turnstile, Stripe, CF Analytics)
[ ] 2. Créer la zone Cloudflare findmymcp.fr + noter les 2 NS
[ ] 3. Changer les nameservers chez Hostinger
[ ] 4. Pages : connecter le repo + custom domain
[ ] 5. Workers Routes : findmymcp.fr/api/* → findmymcp-submit
[ ] 6. Stripe : webhook + IBAN Qonto en payout
[ ] 7. Email Routing : contact@, retrait@, rgpd@
[ ] 8. Restituer à Maxime les valeurs à `wrangler secret put`
[ ] 9. Smoke test : ouvrir findmymcp.fr et vérifier 6 pages
```

---

## Étape 1 — récolter les 5 tokens

Pour chacun : ouvre l'URL, fais l'action, copie la valeur dans un
**buffer interne** (que tu n'affiches pas), passe à la suivante.

### 1.1 Anthropic API key
- URL : `https://console.anthropic.com/settings/keys`
- Clique "Create Key", nom : `findmymcp-prod`
- Copie la valeur `sk-ant-api03-...` dans ton buffer comme
  `ANTHROPIC_API_KEY`.
- ⚠️ Demande-moi avant de cliquer "Create" (consommera mon quota).

### 1.2 GitHub PAT fine-grained
- URL : `https://github.com/settings/personal-access-tokens/new`
- Token name : `findmymcp-workers`
- Expiration : 1 year
- Resource owner : `Max51527`
- Repository access : "Only select repositories" → `findmymcp`
- Repository permissions :
  - **Contents** : Read and write
  - **Pull requests** : Read and write
  - **Issues** : Read and write
- "Generate token" → copie `github_pat_...` comme `GITHUB_TOKEN`

### 1.3 Cloudflare Turnstile
- URL : `https://dash.cloudflare.com/?to=/:account/turnstile`
- "Add site" :
  - Site name : `findmymcp`
  - Hostnames : `findmymcp.fr`, `www.findmymcp.fr`
  - Widget mode : **Managed**
  - Pre-clearance : non
- Copie `Site key` (`0x4...`) comme `PUBLIC_TURNSTILE_SITE_KEY`
- Copie `Secret key` comme `TURNSTILE_SECRET_KEY`

### 1.4 Stripe secret key
- URL : `https://dashboard.stripe.com/apikeys`
- ⚠️ Vérifie qu'on est en mode **Live** (toggle haut-droit, pas Test).
  Si KYC pas encore validé, demande-moi de basculer en Test pour le
  premier déploiement.
- "Reveal live key" → copie `sk_live_...` comme `STRIPE_SECRET_KEY`
- Ne touche pas aux **Publishable key** (pas utilisée par ce projet).

### 1.5 Cloudflare Web Analytics
- URL : `https://dash.cloudflare.com/?to=/:account/web-analytics`
- "Add site" → hostname `findmymcp.fr`
- Copie le token (chaîne après `?token=` dans le snippet) comme
  `PUBLIC_CF_ANALYTICS_TOKEN`

### 1.6 Bonus secret généré
- Le worker scraper a besoin d'un `SCRAPER_TRIGGER_KEY` aléatoire.
  Génère-le toi-même : 48 caractères hex aléatoires. Stocke en buffer.

---

## Étape 2 — créer la zone DNS Cloudflare

- URL : `https://dash.cloudflare.com/add-site`
- Domain : `findmymcp.fr`
- Plan : **Free**
- Cloudflare scanne les DNS existants — laisse tel quel, on configurera
  les MX via Email Routing plus tard
- Note les **2 nameservers Cloudflare** affichés (ex :
  `mark.ns.cloudflare.com`, `tina.ns.cloudflare.com`)
- ⚠️ **Pause ici** : affiche-moi les 2 NS, demande "OK pour les coller
  chez Hostinger ?"

---

## Étape 3 — Hostinger : changer les NS  ⚠️ irréversible (1-48h propagation)

- URL : `https://hpanel.hostinger.com/domain/findmymcp.fr/dns`
- "Change nameservers" → "Use custom nameservers"
- Coller les 2 NS Cloudflare reçus à l'étape 2
- Save
- ⚠️ Demande-moi confirmation **avant Save**.

Après save : retourne dashboard Cloudflare et clique "Check
nameservers" toutes les 5 min. Affiche-moi l'état quand passe à
"Active".

---

## Étape 4 — Cloudflare Pages : connecter le repo

(Tu peux faire ça pendant que les NS propagent — pas besoin que la zone
soit active.)

- URL : `https://dash.cloudflare.com/?to=/:account/pages`
- "Create a project" → "Connect to Git" → GitHub
- Autorise l'app Cloudflare Pages si pas déjà fait, scope : seulement
  `Max51527/findmymcp`
- Repository : `findmymcp`
- Build settings :
  - Project name : `findmymcp`
  - Production branch : `main`
  - Framework preset : **Astro** (auto-détecté)
  - Build command : `npm run build`
  - Build output directory : `dist`
  - Root directory : (vide)
- **Environment variables** (Production) :
  - `PUBLIC_SITE_URL` = `https://findmymcp.fr`
  - `PUBLIC_CF_ANALYTICS_TOKEN` = (depuis ton buffer)
  - `PUBLIC_TURNSTILE_SITE_KEY` = (depuis ton buffer)
- "Save and Deploy"
- Attends que le premier build passe au vert (~2 min)
- Note l'URL `findmymcp-xxx.pages.dev` → affiche-la-moi

### 4.1 Custom domain (après que la zone Cloudflare soit active)

- Onglet "Custom domains" du projet Pages
- "Set up a custom domain" → `findmymcp.fr` → Continue → Activate
- Refais pour `www.findmymcp.fr` (Cloudflare ajoutera le CNAME)

---

## Étape 5 — Workers Routes

⚠️ Cette étape suppose que Maxime a déjà fait `wrangler deploy` sur les
2 workers depuis son terminal. Si ce n'est pas fait, demande-le-lui
avant de continuer.

- URL : `https://dash.cloudflare.com/?to=/:account/workers/services/view/findmymcp-submit`
- Onglet "Triggers" → "Add Custom Domain"
- Domaine : `findmymcp.fr/api/*` → Add
- Vérifie qu'apparaît dans la liste

---

## Étape 6 — Stripe : webhook + payouts Qonto

### 6.1 Payouts Qonto
- URL : `https://dashboard.stripe.com/settings/payouts`
- "Add bank account" → France → EUR
- IBAN Qonto : demande-moi de te le coller (format FR76...)
- BIC : auto-rempli généralement, sinon je te le donne
- Payout schedule : "Daily automatic" → Save

### 6.2 Webhook
- URL : `https://dashboard.stripe.com/webhooks`
- "Add endpoint"
- Endpoint URL : `https://findmymcp.fr/api/stripe-webhook`
- Description : "findmymcp sponsoring"
- Events to send → "Select events" → coche uniquement
  `checkout.session.completed`
- "Add endpoint"
- Sur la page de détail du webhook, "Signing secret" → "Reveal" → copie
  `whsec_...` comme `STRIPE_WEBHOOK_SECRET`
- ⚠️ Ce secret doit être collé chez Maxime via
  `wrangler secret put STRIPE_WEBHOOK_SECRET`. Affiche-le-moi UNE FOIS
  pour que je le copie, puis efface-le de ton buffer.

### 6.3 Test du webhook
- Toujours sur la page du webhook, bouton "Send test webhook"
- Event : `checkout.session.completed` → "Send test"
- Doit retourner **HTTP 200** dans la liste "Recent events"
  - Si 503 : Maxime n'a pas encore poussé `STRIPE_WEBHOOK_SECRET`
  - Si 400 : signature invalide, vérifier le secret

---

## Étape 7 — Email Routing

- URL : `https://dash.cloudflare.com/?to=/:account/:zone/email/routing`
  (zone findmymcp.fr — accessible une fois la zone active)
- "Enable Email Routing" → Cloudflare ajoute automatiquement les
  enregistrements MX + SPF
- "Routes" → "Create address" trois fois :
  - `contact@findmymcp.fr` → destination : email perso de Maxime
  - `retrait@findmymcp.fr` → même destination
  - `rgpd@findmymcp.fr` → même destination
- Maxime devra cliquer le lien de vérification reçu sur son email perso.

---

## Étape 8 — restituer à Maxime les secrets terminal

Affiche-lui un **bloc unique** qu'il peut exécuter dans son terminal :

```bash
cd workers/scraper
echo "<GITHUB_TOKEN>"          | wrangler secret put GITHUB_TOKEN
echo "<ANTHROPIC_API_KEY>"     | wrangler secret put ANTHROPIC_API_KEY
echo "<SCRAPER_TRIGGER_KEY>"   | wrangler secret put SCRAPER_TRIGGER_KEY
wrangler deploy

cd ../submit
echo "<GITHUB_TOKEN>"           | wrangler secret put GITHUB_TOKEN
echo "<ANTHROPIC_API_KEY>"      | wrangler secret put ANTHROPIC_API_KEY
echo "<TURNSTILE_SECRET_KEY>"   | wrangler secret put TURNSTILE_SECRET_KEY
echo "<STRIPE_SECRET_KEY>"      | wrangler secret put STRIPE_SECRET_KEY
echo "<STRIPE_WEBHOOK_SECRET>"  | wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler deploy
```

⚠️ Préviens-le : **après usage, révoquer le PAT GitHub + rotater le
token Cloudflare API utilisé** s'il en a créé un pour wrangler.

---

## Étape 9 — smoke tests final

Ouvre `https://findmymcp.fr` et vérifie :

1. La home charge avec HTTPS valide (cadenas vert)
2. Le header affiche "FindMyMCP.fr"
3. Au moins 9 cards "À la une" visibles
4. Clic sur la card "Stripe Agent Toolkit" → fiche complète + encart
   "Tester Stripe" en sidebar
5. `/sponsoriser` → page 3 tiers, formulaire visible
6. `/soumettre` → formulaire visible avec captcha Turnstile
7. `/mentions-legales` → page complète
8. `/sitemap-index.xml` → XML valide
9. Envoie un email à `contact@findmymcp.fr` depuis ton perso → arrive
   dans la boîte de Maxime

Affiche le résultat de chaque test sous forme de tableau ✅/❌.

---

## Format de réponse attendu

- Au début : affiche la checklist générale.
- À chaque étape : "▶️ Étape X.Y — <action>" puis le résultat
  "✅ OK" ou "⚠️ <problème>".
- Quand tu attends une réponse de Maxime : "❓ <question>" et attends.
- Quand tu as besoin d'un secret : "🔑 Donne-moi <NOM_SECRET>" et tu
  l'utilises sans le ré-afficher.
- À la fin : checklist générale avec ✅ partout, et le bloc bash de
  l'étape 8 pour Maxime.

---

Commence par afficher la checklist puis attaque l'étape 1.1.
