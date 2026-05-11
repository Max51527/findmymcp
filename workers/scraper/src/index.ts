import Anthropic from '@anthropic-ai/sdk';
import { MCP_DESCRIBER_PROMPT, ORIAS_GUARD_PROMPT } from './prompts';

interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  SCRAPER_TRIGGER_KEY: string;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  license: { spdx_id: string } | null;
  updated_at: string;
  topics: string[];
}

interface MCPEntry {
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

const REPO = 'Max51527/findmymcp';
const TOPICS = ['mcp-server', 'anthropic-mcp', 'claude-skill'];
const MAX_PER_RUN = 80;
const MIN_STARS = 5;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([runScraper(env), pruneOldSubmissions(env)]));
  },
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === '/run') {
      const provided = req.headers.get('x-trigger-key') ?? '';
      if (!env.SCRAPER_TRIGGER_KEY || !timingSafeEqual(provided, env.SCRAPER_TRIGGER_KEY)) {
        return new Response('Unauthorized', { status: 401 });
      }
      const result = await runScraper(env);
      return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('findmymcp-scraper', { status: 200 });
  },
};

async function pruneOldSubmissions(env: Env) {
  // RGPD : la politique de confidentialité promet la suppression des emails de
  // soumission 6 mois après décision.
  await env.DB.prepare(
    "UPDATE submissions SET email = '' WHERE email != '' AND created_at < datetime('now', '-180 days')",
  ).run().catch(() => null);
}

async function runScraper(env: Env) {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const seen = new Set<string>();
  const existing = await fetchCurrentMcps(env.GITHUB_TOKEN);
  const knownUrls = new Set(existing.map((m) => m.github_url));
  const candidates: MCPEntry[] = [];
  let processed = 0, rejected = 0;

  for (const topic of TOPICS) {
    if (processed >= MAX_PER_RUN) break;
    const repos = await searchGitHubByTopic(env.GITHUB_TOKEN, topic);
    for (const repo of repos) {
      if (processed >= MAX_PER_RUN) break;
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      processed++;

      if (knownUrls.has(repo.html_url)) continue;
      if (repo.stargazers_count < MIN_STARS) continue;

      const readme = await fetchReadme(env.GITHUB_TOKEN, repo.full_name);

      const oriasCheck = await classifyORIAS(anthropic, repo.description ?? readme.slice(0, 2000));
      if (oriasCheck === 'OUI') {
        await logAudit(env, repo.full_name, 'REJECTED_ORIAS');
        rejected++;
        continue;
      }

      const meta = await describe(anthropic, repo, readme);
      if (meta.rejected_orias || !meta.description_fr) {
        await logAudit(env, repo.full_name, 'REJECTED_DESCRIBER');
        rejected++;
        continue;
      }

      const slug = slugify(repo.full_name.split('/').pop() ?? repo.full_name);
      if (existing.some((m) => m.slug === slug)) continue;

      const today = todayISO();
      candidates.push({
        slug,
        nom: repo.full_name.split('/').pop() ?? repo.full_name,
        description_fr: meta.description_fr,
        categorie: meta.categorie,
        auteur: repo.full_name.split('/')[0]!,
        github_url: repo.html_url,
        github_stars: repo.stargazers_count,
        langage: repo.language ?? 'unknown',
        licence: repo.license?.spdx_id ?? 'unknown',
        compatible_avec: meta.compatible_avec,
        installation_cli: meta.installation_cli,
        config_exemple: meta.config_exemple,
        cas_usage_fr: meta.cas_usage_fr,
        tutoriels_fr: [],
        tags: repo.topics,
        date_ajout: today,
        derniere_maj: today,
        featured: false,
        sponsored: false,
        verified: false,
        rejected_orias: false,
      });
      await logAudit(env, repo.full_name, 'CANDIDATE');
    }
  }

  let prUrl: string | null = null;
  if (candidates.length > 0) {
    prUrl = await openPullRequest(env.GITHUB_TOKEN, existing, candidates);
  }

  const summary = { processed, candidates: candidates.length, rejected, pr: prUrl };
  console.log('scraper done', summary);
  return summary;
}

async function fetchCurrentMcps(token: string): Promise<MCPEntry[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/data/mcps.json?ref=main`, {
    headers: ghHeaders(token, 'application/vnd.github.raw'),
  });
  if (!res.ok) throw new Error(`fetch mcps.json failed: ${res.status}`);
  const text = await res.text();
  return JSON.parse(text) as MCPEntry[];
}

async function openPullRequest(token: string, existing: MCPEntry[], newOnes: MCPEntry[]): Promise<string | null> {
  // 1. resolve main HEAD sha
  const mainRef = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/main`, {
    headers: ghHeaders(token),
  }).then((r) => r.json<{ object: { sha: string } }>());
  const mainSha = mainRef.object.sha;

  // 2. create branch (or reuse if exists)
  const branch = `scraper/weekly-${todayISO()}`;
  const createBranchRes = await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
  });
  if (!createBranchRes.ok && createBranchRes.status !== 422) {
    console.error('branch create failed', await createBranchRes.text());
    return null;
  }

  // 3. fetch file sha on the branch
  const fileMetaRes = await fetch(`https://api.github.com/repos/${REPO}/contents/data/mcps.json?ref=${branch}`, {
    headers: ghHeaders(token),
  });
  const fileMeta = await fileMetaRes.json<{ sha: string }>();

  // 4. PUT updated mcps.json
  const merged = [...existing, ...newOnes];
  const updatedJson = JSON.stringify(merged, null, 2) + '\n';
  const b64 = btoa(unescape(encodeURIComponent(updatedJson)));
  const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/data/mcps.json`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `chore(scraper): propose ${newOnes.length} new MCPs (${todayISO()})`,
      content: b64,
      sha: fileMeta.sha,
      branch,
    }),
  });
  if (!putRes.ok) {
    console.error('put failed', await putRes.text());
    return null;
  }

  // 5. open PR
  const body = [
    `Scraper hebdo — ${newOnes.length} MCPs candidats à valider.`,
    '',
    '| Slug | Auteur | Stars | Catégorie |',
    '|------|--------|-------|-----------|',
    ...newOnes.map((m) => `| \`${m.slug}\` | ${m.auteur} | ${m.github_stars} | ${m.categorie.join(', ')} |`),
    '',
    'Revoir chaque fiche puis merge si OK. La cloison ORIAS est appliquée côté scraper.',
  ].join('\n');

  const prRes = await fetch(`https://api.github.com/repos/${REPO}/pulls`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `[scraper] ${newOnes.length} nouveaux MCPs — semaine du ${todayISO()}`,
      head: branch,
      base: 'main',
      body,
      draft: true,
    }),
  });
  if (!prRes.ok) {
    console.error('pr create failed', await prRes.text());
    return null;
  }
  const pr = await prRes.json<{ html_url: string }>();
  return pr.html_url;
}

function ghHeaders(token: string, accept = 'application/vnd.github+json') {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': accept,
    'User-Agent': 'findmymcp-scraper/0.2',
  };
}

async function searchGitHubByTopic(token: string, topic: string): Promise<GitHubRepo[]> {
  const url = `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&per_page=50`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`github search failed: ${res.status}`);
  const data = await res.json<{ items: GitHubRepo[] }>();
  return data.items ?? [];
}

async function fetchReadme(token: string, fullName: string): Promise<string> {
  const url = `https://api.github.com/repos/${fullName}/readme`;
  const res = await fetch(url, { headers: ghHeaders(token, 'application/vnd.github.raw') });
  if (!res.ok) return '';
  return await res.text();
}

async function classifyORIAS(anthropic: Anthropic, content: string): Promise<'OUI' | 'NON'> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5,
    system: ORIAS_GUARD_PROMPT,
    messages: [{ role: 'user', content }],
  });
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim().toUpperCase() : 'NON';
  return text.startsWith('OUI') ? 'OUI' : 'NON';
}

interface DescribeResult {
  description_fr: string;
  categorie: string[];
  compatible_avec: string[];
  cas_usage_fr: string[];
  installation_cli: string;
  config_exemple: string;
  rejected_orias: boolean;
}

async function describe(anthropic: Anthropic, repo: GitHubRepo, readme: string): Promise<DescribeResult> {
  const prompt = `REPO: ${repo.full_name}\nDESCRIPTION: ${repo.description ?? '(none)'}\nLANGUAGE: ${repo.language ?? 'unknown'}\nSTARS: ${repo.stargazers_count}\n\nREADME:\n${readme.slice(0, 6000)}`;
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: MCP_DESCRIBER_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      description_fr: String(json.description_fr ?? '').slice(0, 200),
      categorie: Array.isArray(json.categorie) ? json.categorie : ['misc'],
      compatible_avec: Array.isArray(json.compatible_avec) ? json.compatible_avec : [],
      cas_usage_fr: Array.isArray(json.cas_usage_fr) ? json.cas_usage_fr.map((s: unknown) => String(s).slice(0, 80)) : [],
      installation_cli: String(json.installation_cli ?? ''),
      config_exemple: String(json.config_exemple ?? ''),
      rejected_orias: Boolean(json.rejected_orias),
    };
  } catch {
    return { description_fr: '', categorie: ['misc'], compatible_avec: [], cas_usage_fr: [], installation_cli: '', config_exemple: '', rejected_orias: false };
  }
}

async function logAudit(env: Env, repo: string, status: string) {
  await env.DB.prepare('INSERT INTO audit_scraper (repo, status, ts) VALUES (?, ?, ?)').bind(repo, status, new Date().toISOString()).run().catch(() => null);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
