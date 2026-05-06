# Contribuer à FindMyMCP

Merci de l'intérêt ! Voici comment contribuer.

## Soumettre un nouveau MCP

**Voie simple (recommandée)** : utilise le formulaire sur https://findmymcp.fr/soumettre

**Voie technique (Pull Request)** :

1. Fork ce repo
2. Ajoute une entrée dans `data/mcps.json` selon le schéma ci-dessous
3. Ouvre une PR avec titre `[NEW MCP] <nom>`

### Schéma d'entrée

```json
{
  "slug": "kebab-case-unique",
  "nom": "Nom officiel du MCP",
  "description_fr": "Phrase de 1-2 lignes max, claire, technique mais accessible.",
  "categorie": ["productivity"],
  "auteur": "auteur ou org",
  "github_url": "https://github.com/owner/repo",
  "github_stars": 0,
  "langage": "TypeScript",
  "licence": "MIT",
  "compatible_avec": ["Claude Desktop", "Claude Code"],
  "installation_cli": "npx -y @org/mcp-server",
  "config_exemple": "...",
  "cas_usage_fr": [
    "Verbe + complément métier (max 80 chars)"
  ],
  "tutoriels_fr": [],
  "tags": ["tag1", "tag2"],
  "date_ajout": "YYYY-MM-DD",
  "derniere_maj": "YYYY-MM-DD",
  "featured": false,
  "sponsored": false,
  "verified": false,
  "rejected_orias": false
}
```

## Critères d'acceptation

✅ Le MCP doit :
- Être un **vrai** MCP server compatible avec le protocole Anthropic
- Avoir un repo GitHub public accessible
- Avoir une licence open-source claire

❌ Le MCP est **rejeté** si :
- Conseil patrimonial / financier / fiscal personnalisé / trading crypto (cloison ORIAS)
- Repo privé
- Code copié sans licence
- Demande explicite de retrait par l'auteur

## Demande de retrait

Auteur d'un MCP listé ? Demande retrait : **retrait@findmymcp.fr** ou ouvre une issue `[REMOVAL]`.
Suppression sous 7 jours.

## Style de contenu

- Français pour le corps de texte
- Anglais OK pour termes techniques (MCP, server, schema, endpoint, ...)
- Pas de hype ("révolutionnaire", "ultime", ...)
- Pas de promesse chiffrée garantie ("gain X%")
- Concret, factuel, "j'ai testé", "pratique pour"

## Code

- Astro 5 + TypeScript strict
- Tailwind utility-first
- `npm run check` doit passer
- Lighthouse Performance/SEO ≥ 95

## Code de conduite

Bienveillance, respect, pas d'attaque personnelle. Sinon → ban.
