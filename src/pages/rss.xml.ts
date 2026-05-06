import rss from '@astrojs/rss';
import { allMCPs } from '../lib/mcps';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const items = [...allMCPs]
    .sort((a, b) => b.date_ajout.localeCompare(a.date_ajout))
    .slice(0, 50)
    .map((mcp) => ({
      title: `${mcp.nom} (${mcp.langage}, ${mcp.licence})`,
      pubDate: new Date(mcp.date_ajout),
      description: mcp.description_fr,
      link: `/mcp/${mcp.slug}`,
      categories: mcp.categorie,
    }));

  return rss({
    title: 'FindMyMCP — Derniers MCP servers indexés',
    description: 'Annuaire francophone des MCP servers. Flux des derniers ajouts.',
    site: context.site ?? 'https://findmymcp.fr',
    items,
    customData: '<language>fr-FR</language>',
  });
}
