# Prompt pour Claude Chrome — go-live findmymcp.fr

Copie le **bloc unique** ci-dessous (entre les triples backticks) dans
une nouvelle conversation Claude Chrome (extension navigateur). L'agent
suit la séquence, te demande les secrets quand il en a besoin, et te
restitue le bloc bash à exécuter chez toi pour `wrangler`.

État au moment où tu colles ce prompt :
- Code mergé sur main (PR#1 closed)
- Schéma D1 appliqué en prod sur `findmymcp-db`
- Aucun worker `findmymcp-*` déployé
- Aucun projet Pages créé
- DNS findmymcp.fr encore chez Hostinger

---

````
Tu m'aides à mettre en ligne findmymcp.fr, un annuaire francophone de
MCP servers. Le code est déjà mergé sur main du repo
Max51527/findmymcp et la base D1 a son schéma appliqué. Il ne reste que
des actions dashboard que tu vas exécuter dans le navigateur, dans
l'ordre. Mon rôle : te donner les secrets et confirmer les actions
irréversibles. Je suis Maxime, j'ai déjà : un compte Cloudflare
(Maxime@ikcp.fr), un compte Stripe (mode Live si KYC validé sinon
Test), un compte Hostinger avec le domaine findmymcp.fr, un compte
GitHub (Max51527), un compte Anthropic, un compte Qonto avec IBAN
actif (format FR76…).

# Règles strictes
1. Ne jamais réafficher un secret en clair une fois que je te l'ai
   donné. Quand tu dois le passer à un autre champ, copie-colle
   silencieusement.
2. Pause systématique avant toute action irréversible : paiement,
   changement de nameservers, publication d'un projet Pages,
   activation Email Routing, création de webhook Stripe. Tu dis "OK
   pour continuer ?" et tu attends ma réponse.
3. Tu ne saisis jamais un numéro de carte bancaire ni une OTP. Tu me
   passes la main, je tape moi-même.
4. Si une UI a changé depuis ce playbook, décris ce que tu vois,
   propose l'équivalent, attends mon OK. Ne devine pas un bouton
   invisible.
5. Affiche-moi la checklist au début, coche au fur et à mesure,
   affiche le bilan à la fin.

# Checklist à afficher en début
[ ] 1. Collecter 5 tokens (Anthropic, GitHub PAT, Turnstile,
       Stripe, CF Analytics) + un SCRAPER_TRIGGER_KEY que tu génères
[ ] 2. Créer la zone Cloudflare findmymcp.fr + récupérer les 2 NS
[ ] 3. Changer les nameservers chez Hostinger (irréversible 1-48h)
[ ] 4. Cloudflare Pages : connecter le repo + custom domain
[ ] 5. Workers Routes : findmymcp.fr/api/* -> findmymcp-submit
[ ] 6. Stripe : payouts vers IBAN Qonto + webhook
[ ] 7. Email Routing : contact@, retrait@, rgpd@
[ ] 8. Me restituer le bloc bash final pour `wrangler` (et révoquer
       les tokens jetables ensuite)
[ ] 9. Smoke test : 9 vérifs sur findmymcp.fr

# Étape 1 — collecter les 5 tokens

Pour chacun : ouvre l'URL, fais l'action, stocke la valeur dans ton
buffer interne (que tu n'affiches pas). Génère aussi un SCRAPER_TRIGGER_KEY
= 48 caractères hex aléatoires.

1.1 ANTHROPIC_API_KEY
- https://console.anthropic.com/settings/keys
- "Create Key", nom: findmymcp-prod
- Demande-moi avant le clic final (consomme mon quota)
- Stocke sk-ant-api03-...

1.2 GITHUB_TOKEN (fine-grained PAT)
- https://github.com/settings/personal-access-tokens/new
- Token name: findmymcp-workers
- Expiration: 1 year
- Resource owner: Max51527
- Repository access: Only select repositories -> findmymcp
- Permissions:
    Contents: Read and write
    Pull requests: Read and write
    Issues: Read and write
- Stocke github_pat_...

1.3 Turnstile
- https://dash.cloudflare.com/?to=/:account/turnstile
- "Add site"
    Site name: findmymcp
    Hostnames: findmymcp.fr, www.findmymcp.fr
    Widget mode: Managed
- Stocke Site key comme PUBLIC_TURNSTILE_SITE_KEY (0x4...)
- Stocke Secret key comme TURNSTILE_SECRET_KEY

1.4 STRIPE_SECRET_KEY
- https://dashboard.stripe.com/apikeys
- Vérifie le mode (Live si KYC, sinon Test) -- demande-moi si doute
- Reveal "Secret key" -> stocke sk_live_... ou sk_test_...

1.5 PUBLIC_CF_ANALYTICS_TOKEN
- https://dash.cloudflare.com/?to=/:account/web-analytics
- Add site -> hostname findmymcp.fr
- Stocke la valeur après ?token= dans le snippet

# Étape 2 — créer la zone Cloudflare

- https://dash.cloudflare.com/add-site
- Domain: findmymcp.fr
- Plan: Free
- Laisse les DNS scan comme proposés
- Note les 2 nameservers Cloudflare affichés (ex: x.ns.cloudflare.com,
  y.ns.cloudflare.com)
- Affiche-les-moi et demande "OK pour les coller chez Hostinger ?"

# Étape 3 — Hostinger : changer les NS (IRREVERSIBLE)

- https://hpanel.hostinger.com/domain/findmymcp.fr/dns
- Change nameservers -> Use custom nameservers
- Coller les 2 NS
- ATTENTION : demande confirmation explicite avant Save
- Après save, retourne sur Cloudflare et clique "Check nameservers"
  toutes les 5 min jusqu'à passage en "Active"

# Étape 4 — Cloudflare Pages

Peut être fait en parallèle de la propagation DNS.

- https://dash.cloudflare.com/?to=/:account/pages
- Create a project -> Connect to Git -> GitHub
- Si pas autorisé, autorise scope = seulement Max51527/findmymcp
- Repository: findmymcp
- Project name: findmymcp
- Production branch: main
- Framework preset: Astro
- Build command: npm run build
- Build output: dist
- Root directory: (vide)
- Environment variables (Production):
    PUBLIC_SITE_URL = https://findmymcp.fr
    PUBLIC_CF_ANALYTICS_TOKEN = (depuis ton buffer)
    PUBLIC_TURNSTILE_SITE_KEY = (depuis ton buffer)
- Save and Deploy
- Attends le premier build vert (~2 min)
- Note l'URL findmymcp-xxx.pages.dev et affiche-la-moi

4.1 Custom domain (à faire quand zone Cloudflare active)
- Onglet "Custom domains" du projet
- Set up a custom domain -> findmymcp.fr -> Activate
- Refais pour www.findmymcp.fr

# Étape 5 — Workers Routes

ATTENTION: cette étape suppose que j'ai déjà fait `wrangler deploy`
sur les 2 workers depuis mon terminal local. Si je n'ai pas dit
"workers deployed", attends.

- https://dash.cloudflare.com/?to=/:account/workers/services/view/findmymcp-submit
- Onglet Triggers -> Add Custom Domain
- Domain: findmymcp.fr/api/*
- Add
- Vérifie l'apparition dans la liste

# Étape 6 — Stripe

6.1 Payouts vers Qonto
- https://dashboard.stripe.com/settings/payouts
- Add bank account -> France -> EUR
- IBAN: demande-moi de te le coller (format FR76...)
- BIC: auto-rempli sinon demande
- Payout schedule: Daily automatic -> Save
- Demande confirmation avant Save

6.2 Webhook
- https://dashboard.stripe.com/webhooks
- Add endpoint
    URL: https://findmymcp.fr/api/stripe-webhook
    Description: findmymcp sponsoring
    Events to send: Select events -> coche UNIQUEMENT
      checkout.session.completed
- Add endpoint
- Sur la page détail: Signing secret -> Reveal -> stocke
  whsec_... comme STRIPE_WEBHOOK_SECRET
- IMPORTANT: ce secret va dans le bloc bash final pour Maxime

6.3 Test webhook
- Sur la même page: Send test webhook -> checkout.session.completed
- Le statut "Recent events" doit afficher HTTP 200
- Si 503: Maxime n'a pas encore poussé STRIPE_WEBHOOK_SECRET
- Si 400: signature invalide, refais ou demande à Maxime

# Étape 7 — Email Routing

- https://dash.cloudflare.com/?to=/:account/:zone/email/routing
  (zone findmymcp.fr, accessible quand zone active)
- Enable Email Routing (CF ajoute MX + SPF auto)
- Demande-moi confirmation avant Enable
- Routes -> Create address, trois fois:
    contact@findmymcp.fr -> destination: mon email perso
    retrait@findmymcp.fr -> même destination
    rgpd@findmymcp.fr -> même destination
- Je devrai cliquer le lien de vérification dans ma boîte perso

# Étape 8 — bloc bash final à me restituer

Affiche-moi exactement ceci, en remplaçant <VALEUR> par le contenu de
ton buffer (sans entourer de guillemets en trop):

```
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

Et préviens-moi qu'après usage je dois révoquer le GitHub PAT et le
token Anthropic si je veux les rotater.

# Étape 9 — smoke tests

Ouvre https://findmymcp.fr et vérifie sous forme de tableau ✅/❌:

1. La home charge avec HTTPS valide (cadenas vert)
2. Header affiche "FindMyMCP.fr" et menus visibles
3. Au moins 9 cards "A la une"
4. /mcp/stripe-mcp -> fiche + encart "Tester Stripe" en sidebar
5. /sponsoriser -> page 3 tiers
6. /soumettre -> formulaire + widget Turnstile visible
7. /mentions-legales -> page complète
8. /sitemap-index.xml -> XML valide (HTTP 200)
9. Envoyer un mail à contact@findmymcp.fr depuis ton perso -> doit
   arriver dans la boîte que j'ai configurée en routing

Affiche le bilan final avec la checklist toute cochée.

# Format de tes réponses
- Au tout début: affiche la checklist générale.
- À chaque étape: "▶️ Étape X.Y — <action>" puis "✅ OK" ou
  "⚠️ <problème>".
- Quand tu attends ma réponse: "❓ <question>" et tu t'arrêtes.
- Quand tu as besoin d'un secret: "🔑 Donne-moi <NOM_SECRET>" et tu
  utilises la valeur sans la ré-afficher.
- À la fin: checklist cochée + bloc bash de l'étape 8.

Commence MAINTENANT par afficher la checklist puis attaque l'étape 1.1.
````

---

## Comment l'utiliser

1. Sélectionne tout le contenu entre les deux lignes `````` ci-dessus
2. Colle dans une **nouvelle** conversation Claude Chrome
3. Réponds aux prompts au fur et à mesure
4. À l'étape 5, Claude Chrome te dira "workers deployed?" — c'est à ce
   moment que tu vas dans ton terminal local et exécutes :

```bash
git pull origin main
cd workers/scraper && npm ci && wrangler deploy
cd ../submit       && npm ci && wrangler deploy
```

5. Reviens dans Claude Chrome, dis "workers deployed", il enchaîne.
6. À l'étape 8, il te file le bloc bash avec les secrets remplis — tu
   le colles dans ton terminal pour les `wrangler secret put`.

Durée estimée : 45 min de tes clics + 1h propagation DNS en arrière-plan.
