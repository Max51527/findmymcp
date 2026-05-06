# Schéma `data/mcps.json`

Source de vérité de l'annuaire. Versionnée Git.

## Champs

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `slug` | string kebab-case | ✅ | Identifiant URL unique. Ex: `notion-mcp`. |
| `nom` | string | ✅ | Nom officiel du MCP (anglais OK). |
| `description_fr` | string ≤ 200 chars | ✅ | Phrase de 1-2 lignes en français, claire, anti-hype. |
| `categorie` | array | ✅ | 1 à 3 slugs depuis `categories.json`. |
| `auteur` | string | ✅ | Auteur ou organisation (ex: `modelcontextprotocol`, `github`). |
| `github_url` | URL | ✅ | URL repo GitHub. |
| `github_stars` | number | ✅ | Mis à jour par scraper hebdo. |
| `langage` | string | ✅ | TypeScript, Python, Go, Rust, ... |
| `licence` | string | ✅ | MIT, Apache-2.0, GPL-3.0, ... |
| `compatible_avec` | array | ✅ | Liste de clients : "Claude Desktop", "Claude Code", "Cursor", "Cline", ... |
| `installation_cli` | string | ✅ | Commande shell prête à coller. |
| `config_exemple` | string | ✅ | JSON config exemple (échappé). |
| `cas_usage_fr` | array de strings ≤ 80 chars | ✅ | 3-5 cas concrets, verbe + complément. |
| `tutoriels_fr` | array | ❌ | Liens vers tutos FR (vide par défaut). |
| `tags` | array | ✅ | Tags libres pour recherche. |
| `date_ajout` | YYYY-MM-DD | ✅ | Date d'entrée dans l'annuaire. |
| `derniere_maj` | YYYY-MM-DD | ✅ | Dernière mise à jour de la fiche. |
| `featured` | boolean | ✅ | Mis en avant en page d'accueil. |
| `sponsored` | boolean | ✅ | Sponsorisé (badge + placement haut). |
| `verified` | boolean | ✅ | Validé manuellement. |
| `rejected_orias` | boolean | ✅ | Si `true`, exclu de l'index public (cloison ORIAS). |

## Règles

- **Cloison ORIAS** : tout MCP qui touche au conseil patrimonial, gestion d'investissement, trading crypto, fiscalité personnalisée → `rejected_orias: true` + non publié.
- **Description anti-hype** : pas de "révolutionnaire", "ultime", "indispensable". Préférer "permet de", "facilite", "automatise".
- **Cas d'usage concrets** : verbe + complément métier. Exemple OK : "Créer une page Notion depuis un brief". Exemple PAS OK : "Booster votre productivité".
- **Slug stable** : ne change jamais après publication (sinon 301 obligatoire).
