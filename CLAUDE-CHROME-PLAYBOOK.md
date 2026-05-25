# Prompt pour Claude Chrome — go-live findmymcp.fr (flow CI)

Copie le **bloc unique** ci-dessous (entre les triples backticks) dans
une nouvelle conversation Claude Chrome (extension navigateur). L'agent
suit la séquence, te demande les secrets quand il en a besoin, et **tout
passe par GitHub Actions** — plus aucun `wrangler` à lancer en local.

État au moment où tu colles ce prompt :
- Code mergé sur `main` (build propre, 46 pages)
- Schéma D1 appliqué en prod sur `findmymcp-db`
- Workflows GitHub Actions prêts : `deploy.yml` (déploie workers + Pages)
  et `seed-secrets.yml` (pousse les secrets runtime dans les workers)
- Aucun worker `findmymcp-*` déployé, aucun projet Pages créé
- DNS findmymcp.fr encore chez Hostinger

La différence clé avec un déploiement manuel : tu ne touches jamais à un
terminal. Claude Chrome récolte les tokens, les colle dans les **secrets
GitHub Actions**, puis déclenche les workflows. Cloudflare se déploie
tout seul depuis le CI.

---

````
Tu m'aides à mettre en ligne findmymcp.fr, un annuaire francophone de
MCP servers. Le code est déjà mergé sur main du repo Max51527/findmymcp,
la base D1 a son schéma appliqué, et deux workflows GitHub Actions sont
prêts : "Deploy to Cloudflare" (deploy.yml) et "Seed worker secrets"
(seed-secrets.yml). Le déploiement se fait ENTIÈREMENT via GitHub Actions
— il n'y a AUCUN wrangler à lancer en local, AUCUN terminal à ouvrir.

Ton rôle : récolter les tokens dans les dashboards, les coller dans les
secrets GitHub Actions, déclencher les workflows, puis finir la config
dashboard (DNS, Pages domain, Workers routes, Stripe, Email). Mon rôle :
te donner les secrets sensibles et confirmer les actions irréversibles.

Je suis Maxime, j'ai déjà : un compte Cloudflare (Maxime@ikcp.fr,
Account ID eaddc4cc77d99dd397a62e5d5a1b6864), un compte Stripe (Live si
KYC validé sinon Test), un compte Hostinger avec le domaine
findmymcp.fr, un compte GitHub (Max51527, je suis owner du repo), un
compte Anthropic, un compte Qonto avec IBAN actif (format FR76…).

# Règles strictes
1. Ne jamais réafficher un secret en clair une fois que je te l'ai
   donné ou que tu l'as généré/copié. Copie-colle silencieusement entre
   les champs.
2. Pause systématique avant toute action irréversible : changement de
   nameservers, paiement, activation Email Routing, création de webhook
   Stripe. Tu dis "OK pour continuer ?" et tu attends ma réponse.
3. Tu ne saisis jamais un numéro de carte bancaire ni une OTP/2FA. Tu me
   passes la main, je tape moi-même.
4. Si une UI a changé depuis ce playbook, décris ce que tu vois, propose
   l'équivalent, attends mon OK. Ne devine pas un bouton invisible.
5. Affiche-moi la checklist au début, coche au fur et à mesure, affiche
   le bilan à la fin.

# Checklist à afficher en début
[ ] 1. Récolter tous les tokens (CF API token, Anthropic, GitHub PAT,
       Turnstile, Stripe, CF Analytics) + générer un SCRAPER_TRIGGER_KEY
[ ] 2. Ajouter les 11 secrets dans GitHub Actions
[ ] 3. Lancer le workflow "Deploy to Cloudflare" → vérifier 3 jobs verts
[ ] 4. Lancer le workflow "Seed worker secrets" → vérifier 2 jobs verts
[ ] 5. Créer la zone Cloudflare findmymcp.fr + récupérer les 2 NS
[ ] 6. Changer les nameservers chez Hostinger (irréversible 1-48h)
[ ] 7. Cloudflare Pages : custom domain findmymcp.fr + www
[ ] 8. Workers Routes : findmymcp.fr/api/* → findmymcp-submit
[ ] 9. Stripe : payouts vers IBAN Qonto + webhook → maj du secret +
       re-run seed-secrets
[ ] 10. Email Routing : contact@, retrait@, rgpd@
[ ] 11. Smoke test : 9 vérifs sur findmymcp.fr

# Étape 1 — récolter tous les tokens

Pour chacun : ouvre l'URL, fais l'action, stocke la valeur dans ton
buffer interne (que tu n'affiches pas).

1.1 CLOUDFLARE_API_TOKEN  ← le plus important, c'est lui qui débloque tout
- https://dash.cloudflare.com/profile/api-tokens
- "Create Token" → "Create Custom Token"
- Token name: findmymcp-deploy
- Permissions (ajoute ces 5 lignes) :
    Account | Workers Scripts | Edit
    Account | Cloudflare Pages | Edit
    Account | D1 | Edit
    Account | Account Settings | Read
    User | User Details | Read
- Account Resources: Include → le compte de Maxime@ikcp.fr
- TTL: 90 jours (ou "no expiry" si tu veux ne pas re-rotater)
- Continue → Create Token → stocke la valeur (affichée une seule fois)

1.2 ANTHROPIC_API_KEY
- https://console.anthropic.com/settings/keys
- "Create Key", nom: findmymcp-prod
- Demande-moi avant le clic final (consomme mon quota)
- Stocke sk-ant-api03-...

1.3 GITHUB_PAT_FINDMYMCP (fine-grained PAT, utilisé par les workers)
- https://github.com/settings/personal-access-tokens/new
- Token name: findmymcp-workers
- Expiration: 1 year
- Resource owner: Max51527
- Repository access: Only select repositories → findmymcp
- Permissions:
    Contents: Read and write
    Pull requests: Read and write
    Issues: Read and write
- Generate token → stocke github_pat_...

1.4 Turnstile
- https://dash.cloudflare.com/?to=/:account/turnstile
- "Add site"
    Site name: findmymcp
    Hostnames: findmymcp.fr, www.findmymcp.fr
    Widget mode: Managed
- Stocke Site key comme PUBLIC_TURNSTILE_SITE_KEY (0x4...)
- Stocke Secret key comme TURNSTILE_SECRET_KEY

1.5 STRIPE_SECRET_KEY
- https://dashboard.stripe.com/apikeys
- Vérifie le mode (Live si KYC, sinon Test) — demande-moi si doute
- Reveal "Secret key" → stocke sk_live_... ou sk_test_...

1.6 PUBLIC_CF_ANALYTICS_TOKEN
- https://dash.cloudflare.com/?to=/:account/web-analytics
- Add site → hostname findmymcp.fr
- Stocke la valeur après ?token= dans le snippet

1.7 SCRAPER_TRIGGER_KEY
- Génère toi-même 48 caractères hexadécimaux aléatoires. Stocke.

# Étape 2 — ajouter les 11 secrets dans GitHub Actions

- https://github.com/Max51527/findmymcp/settings/secrets/actions
- Pour chacun : "New repository secret", colle Name + Secret, "Add secret".
- N'affiche jamais la valeur en clair, colle silencieusement.

Liste exacte (Name = Valeur) :
1.  CLOUDFLARE_API_TOKEN      = (buffer 1.1)
2.  CLOUDFLARE_ACCOUNT_ID     = eaddc4cc77d99dd397a62e5d5a1b6864
3.  PUBLIC_SITE_URL           = https://findmymcp.fr
4.  PUBLIC_CF_ANALYTICS_TOKEN = (buffer 1.6)
5.  PUBLIC_TURNSTILE_SITE_KEY = (buffer 1.4 Site key)
6.  ANTHROPIC_API_KEY         = (buffer 1.2)
7.  GITHUB_PAT_FINDMYMCP      = (buffer 1.3)
8.  SCRAPER_TRIGGER_KEY       = (buffer 1.7)
9.  TURNSTILE_SECRET_KEY      = (buffer 1.4 Secret key)
10. STRIPE_SECRET_KEY         = (buffer 1.5)
11. STRIPE_WEBHOOK_SECRET     = whsec_dummy   (placeholder, corrigé à l'étape 9)

Confirme-moi "11 secrets ajoutés" avant de continuer.

# Étape 3 — lancer le déploiement

- https://github.com/Max51527/findmymcp/actions/workflows/deploy.yml
- Bouton "Run workflow" → branche main → "Run workflow"
- Attends la fin (~2-3 min). Ouvre le run et vérifie que les 3 jobs sont
  verts : deploy-worker-scraper, deploy-worker-submit, deploy-pages.
- Si un job échoue, ouvre les logs, dis-moi le message d'erreur exact,
  ne devine pas.
- Résultat attendu : sur Cloudflare, les workers findmymcp-scraper et
  findmymcp-submit existent + un projet Pages "findmymcp" est créé.

# Étape 4 — pousser les secrets runtime dans les workers

- https://github.com/Max51527/findmymcp/actions/workflows/seed-secrets.yml
- "Run workflow" → branche main → "Run workflow"
- Attends la fin, vérifie les 2 jobs verts (scraper-secrets, submit-secrets).

# Étape 5 — créer la zone Cloudflare

- https://dash.cloudflare.com/add-site
- Domain: findmymcp.fr — Plan: Free
- Laisse le DNS scan comme proposé
- Note les 2 nameservers Cloudflare (ex: x.ns.cloudflare.com,
  y.ns.cloudflare.com), affiche-les-moi, demande "OK pour les coller
  chez Hostinger ?"

# Étape 6 — Hostinger : changer les NS (IRRÉVERSIBLE)

- https://hpanel.hostinger.com/domain/findmymcp.fr/dns
- Change nameservers → Use custom nameservers → colle les 2 NS
- ATTENTION : demande confirmation explicite avant Save
- Après save, retourne sur Cloudflare et clique "Check nameservers"
  toutes les 5 min jusqu'au passage en "Active" (peut prendre 1-48h)

# Étape 7 — Cloudflare Pages : custom domain

Le projet Pages "findmymcp" a été créé par le workflow à l'étape 3.
Ne le connecte PAS à Git (le déploiement vient du CI, pas d'un build Git
Cloudflare — ça créerait un build concurrent).

- https://dash.cloudflare.com/?to=/:account/pages/view/findmymcp
- Onglet "Custom domains" → "Set up a custom domain"
- Ajoute findmymcp.fr → Activate
- Refais pour www.findmymcp.fr
- (Possible seulement quand la zone est "Active" — sinon attends l'étape 6)

# Étape 8 — Workers Routes

Les workers sont déjà déployés (étape 3), donc cette étape est possible
dès que la zone est active.

- https://dash.cloudflare.com/?to=/:account/workers/services/view/findmymcp-submit
- Onglet Triggers → "Add Custom Domain" (ou "Add route")
- Domain/route: findmymcp.fr/api/*
- Add → vérifie l'apparition dans la liste

# Étape 9 — Stripe

9.1 Payouts vers Qonto
- https://dashboard.stripe.com/settings/payouts
- Add bank account → France → EUR
- IBAN: demande-moi de te le coller (format FR76...)
- BIC: auto-rempli sinon demande-moi
- Payout schedule: Daily automatic → demande confirmation avant Save

9.2 Webhook
- https://dashboard.stripe.com/webhooks → "Add endpoint"
    URL: https://findmymcp.fr/api/stripe-webhook
    Description: findmymcp sponsoring
    Events to send: Select events → coche UNIQUEMENT
      checkout.session.completed
- Add endpoint
- Sur la page détail : Signing secret → Reveal → stocke whsec_... comme
  STRIPE_WEBHOOK_SECRET

9.3 Mettre à jour le secret GitHub + re-déployer les secrets
- https://github.com/Max51527/findmymcp/settings/secrets/actions
- Édite STRIPE_WEBHOOK_SECRET → remplace whsec_dummy par la vraie valeur
- Relance le workflow "Seed worker secrets" (étape 4) pour pousser la
  vraie valeur dans le worker submit

9.4 Test webhook
- Retour sur la page du webhook Stripe → "Send test webhook" →
  checkout.session.completed
- "Recent events" doit afficher HTTP 200
- Si 400 (signature invalide) : vérifie que seed-secrets a bien tourné
  APRÈS la maj du secret
- Si 503/erreur : le worker submit n'est peut-être pas encore routé
  (étape 8) ou pas déployé (étape 3)

# Étape 10 — Email Routing

- https://dash.cloudflare.com/?to=/:account/:zone/email/routing
  (zone findmymcp.fr, accessible quand la zone est active)
- Enable Email Routing (CF ajoute MX + SPF auto) → demande confirmation
- Routes → Create address, trois fois :
    contact@findmymcp.fr → destination: mon email perso
    retrait@findmymcp.fr → même destination
    rgpd@findmymcp.fr    → même destination
- Je devrai cliquer le lien de vérification dans ma boîte perso

# Étape 11 — smoke tests

Ouvre https://findmymcp.fr (quand DNS actif) et vérifie en tableau ✅/❌ :

1. La home charge en HTTPS valide (cadenas vert)
2. Header "FindMyMCP.fr" + menus visibles
3. Au moins 9 cards "À la une"
4. /mcp/stripe-mcp → fiche + encart affilié en sidebar
5. /sponsoriser → page 3 tiers, le bouton lance un Stripe Checkout
6. /soumettre → formulaire + widget Turnstile visible (plus de "DUMMY")
7. /mentions-legales → page complète
8. /sitemap-index.xml → XML valide (HTTP 200)
9. Mail à contact@findmymcp.fr depuis mon perso → arrive dans la boîte
   configurée en routing

Affiche le bilan final avec la checklist toute cochée. Rappelle-moi que
je peux révoquer/rotater le GitHub PAT et le token Anthropic plus tard,
et que le CLOUDFLARE_API_TOKEN expire dans 90 jours (re-créer + re-coller
le secret GitHub à ce moment-là).

# Format de tes réponses
- Au tout début : affiche la checklist générale.
- À chaque étape : "▶️ Étape X.Y — <action>" puis "✅ OK" ou
  "⚠️ <problème>".
- Quand tu attends ma réponse : "❓ <question>" et tu t'arrêtes.
- Quand tu as besoin d'un secret : "🔑 Donne-moi <NOM_SECRET>" et tu
  utilises la valeur sans la ré-afficher.
- À la fin : checklist cochée + récap des URLs de prod.

Commence MAINTENANT par afficher la checklist puis attaque l'étape 1.1.
````

---

## Comment l'utiliser

1. Sélectionne tout le contenu entre les deux lignes ```` ```` ```` ci-dessus.
2. Colle dans une **nouvelle** conversation Claude Chrome (extension).
3. Réponds aux prompts au fur et à mesure (secrets, confirmations).
4. Tu ne touches jamais à un terminal — tout passe par les dashboards et
   GitHub Actions.
5. Le seul délai incompressible : la propagation DNS après le changement
   de nameservers Hostinger (étape 6), qui débloque les étapes 7, 8, 10.

Les étapes 1→4 (secrets + deploy + seed) suffisent à mettre les workers
et Pages en ligne sur l'URL `findmymcp-xxx.pages.dev`. Les étapes 5→11
branchent le vrai domaine findmymcp.fr et finalisent Stripe + email.

Durée estimée : ~40 min de clics + 1-48h propagation DNS en arrière-plan.
