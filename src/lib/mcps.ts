import mcpsData from '../../data/mcps.json';
import categoriesData from '../../data/categories.json';
import affiliatesData from '../../data/affiliates.json';

export interface MCP {
  slug: string;
  nom: string;
  description_fr: string;
  categorie: string[];
  auteur: string;
  github_url: string;
  github_stars: number;
  langage: string;
  licence: string;
  compatible_avec: string[];
  installation_cli: string;
  config_exemple: string;
  cas_usage_fr: string[];
  tutoriels_fr: string[];
  tags: string[];
  date_ajout: string;
  derniere_maj: string;
  featured: boolean;
  sponsored: boolean;
  verified: boolean;
  rejected_orias: boolean;
}

export interface Category {
  slug: string;
  nom: string;
  description: string;
}

export interface Affiliate {
  partner: string;
  label: string;
  href: string;
}

const affiliates = affiliatesData as Record<string, Affiliate | string>;

export function getAffiliate(slug: string): Affiliate | null {
  const entry = affiliates[slug];
  if (!entry || typeof entry === 'string') return null;
  return entry;
}

export const allMCPs: MCP[] = (mcpsData as MCP[]).filter((m) => !m.rejected_orias);

export const allCategories: Category[] = categoriesData as Category[];

export function getMCPBySlug(slug: string): MCP | undefined {
  return allMCPs.find((m) => m.slug === slug);
}

export function getMCPsByCategory(slug: string): MCP[] {
  return allMCPs.filter((m) => m.categorie.includes(slug));
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return allCategories.find((c) => c.slug === slug);
}

export function getFeaturedMCPs(): MCP[] {
  return allMCPs.filter((m) => m.featured);
}

export function getSimilarMCPs(mcp: MCP, limit = 3): MCP[] {
  return allMCPs
    .filter((m) => m.slug !== mcp.slug)
    .filter((m) => m.categorie.some((c) => mcp.categorie.includes(c)))
    .sort((a, b) => b.github_stars - a.github_stars)
    .slice(0, limit);
}

export function getStats() {
  const total = allMCPs.length;
  const byLang: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  for (const m of allMCPs) {
    byLang[m.langage] = (byLang[m.langage] ?? 0) + 1;
    for (const c of m.categorie) byCat[c] = (byCat[c] ?? 0) + 1;
  }
  return { total, byLang, byCat };
}
