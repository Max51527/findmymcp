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
  sponsored_tier?: string;
  sponsored_until?: string;
  sponsored_paid_on?: string;
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

// Sponsorships are time-bound (sold per month on /sponsoriser). The flag in
// data/mcps.json stays as the payment webhook wrote it; the *effective* status
// is resolved at build time so expired sponsorships drop badge + priority
// without manual edits (deploy.yml rebuilds weekly).
const buildDate = new Date().toISOString().slice(0, 10);

function withEffectiveSponsorship(m: MCP): MCP {
  const active = m.sponsored && (!m.sponsored_until || m.sponsored_until >= buildDate);
  return active === m.sponsored ? m : { ...m, sponsored: active };
}

export const allMCPs: MCP[] = (mcpsData as MCP[])
  .filter((m) => !m.rejected_orias)
  .map(withEffectiveSponsorship);

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

// "À la une" = active sponsors whose tier includes the home placement
// (featured-3m / featured-12m, as sold on /sponsoriser) first, then editorial
// picks. Capped so the paid placement stays visible above the fold.
const HOME_SPONSOR_TIERS = new Set(['featured-3m', 'featured-12m']);
const HOME_FEATURED_CAP = 8;

export function getFeaturedMCPs(): MCP[] {
  const sponsors = allMCPs.filter(
    (m) => m.sponsored && m.sponsored_tier && HOME_SPONSOR_TIERS.has(m.sponsored_tier),
  );
  const seen = new Set(sponsors.map((m) => m.slug));
  const editorial = allMCPs
    .filter((m) => m.featured && !seen.has(m.slug))
    .sort((a, b) => b.github_stars - a.github_stars);
  return [...sponsors, ...editorial].slice(0, HOME_FEATURED_CAP);
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
