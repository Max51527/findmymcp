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

const TOPICS = ['mcp-server', 'anthropic-mcp', 'claude-skill'];
const MAX_PER_RUN = 100;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScraper(env));
  },
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === '/run') {
      const provided = req.headers.get('x-trigger-key') ?? '';
      if (!env.SCRAPER_TRIGGER_KEY || !timingSafeEqual(provided, env.SCRAPER_TRIGGER_KEY)) {
        return new Response('Unauthorized', { status: 401 });
      }
      await runScraper(env);
      return new Response('OK', { status: 200 });
    }
    return new Response('findmymcp-scraper', { status: 200 });
  },
};

async function runScraper(env: Env) {
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const seen = new Set<string>();
  let processed = 0, accepted = 0, rejected = 0;

  for (const topic of TOPICS) {
    if (processed >= MAX_PER_RUN) break;
    const repos = await searchGitHubByTopic(env.GITHUB_TOKEN, topic);
    for (const repo of repos) {
      if (processed >= MAX_PER_RUN) break;
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      processed++;

      const exists = await env.DB.prepare(
        'SELECT slug FROM mcps WHERE github_url = ?',
      ).bind(repo.html_url).first();

      if (exists) {
        await env.DB.prepare(
          'UPDATE mcps SET github_stars = ?, derniere_maj = ? WHERE github_url = ?',
        ).bind(repo.stargazers_count, todayISO(), repo.html_url).run();
        continue;
      }

      const readme = await fetchReadme(env.GITHUB_TOKEN, repo.full_name);

      const oriasCheck = await classifyORIAS(anthropic, repo.description ?? readme.slice(0, 2000));
      if (oriasCheck === 'OUI') {
        await logAudit(env, repo.full_name, 'REJECTED_ORIAS');
        rejected++;
        continue;
      }

      const meta = await describe(anthropic, repo, readme);
      if (meta.rejected_orias) {
        await logAudit(env, repo.full_name, 'REJECTED_ORIAS_DESCRIBER');
        rejected++;
        continue;
      }

      await env.DB.prepare(`
        INSERT INTO mcps (slug, nom, description_fr, categorie, auteur, github_url, github_stars, langage, licence, compatible_avec, installation_cli, config_exemple, cas_usage_fr, tutoriels_fr, tags, date_ajout, derniere_maj, featured, sponsored, verified, rejected_orias)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
      `).bind(
        slugify(repo.full_name),
        repo.full_name.split('/').pop(),
        meta.description_fr,
        JSON.stringify(meta.categorie),
        repo.full_name.split('/')[0],
        repo.html_url,
        repo.stargazers_count,
        repo.language ?? 'unknown',
        repo.license?.spdx_id ?? 'unknown',
        JSON.stringify(meta.compatible_avec),
        meta.installation_cli,
        meta.config_exemple,
        JSON.stringify(meta.cas_usage_fr),
        '[]',
        JSON.stringify(repo.topics),
        todayISO(),
        todayISO(),
      ).run();

      accepted++;
      await logAudit(env, repo.full_name, 'ACCEPTED');
    }
  }

  console.log(`scraper done: ${processed} processed, ${accepted} accepted, ${rejected} rejected`);
}

async function searchGitHubByTopic(token: string, topic: string): Promise<GitHubRepo[]> {
  const url = `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&per_page=50`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'findmymcp-scraper/0.1',
    },
  });
  if (!res.ok) throw new Error(`github search failed: ${res.status}`);
  const data = await res.json<{ items: GitHubRepo[] }>();
  return data.items ?? [];
}

async function fetchReadme(token: string, fullName: string): Promise<string> {
  const url = `https://api.github.com/repos/${fullName}/readme`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.raw',
      'User-Agent': 'findmymcp-scraper/0.1',
    },
  });
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
