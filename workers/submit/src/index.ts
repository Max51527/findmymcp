interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
  ANTHROPIC_API_KEY: string;
}

interface SubmitPayload {
  nom: string;
  github_url: string;
  description_courte: string;
  categorie: string;
  email: string;
  rgpd: boolean | string;
  'cf-turnstile-response'?: string;
}

const REPO = 'forgekit/findmymcp';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST' || !url.pathname.endsWith('/api/submit')) {
      return new Response('Not found', { status: 404 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipHash = await sha256(ip);

    let payload: SubmitPayload;
    try {
      payload = await req.json();
    } catch {
      return text('Invalid JSON', 400);
    }

    if (!payload.nom || !payload.github_url || !payload.description_courte || !payload.categorie || !payload.email) {
      return text('Champs manquants', 400);
    }

    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(payload.github_url)) {
      return text('URL GitHub invalide', 400);
    }

    if (payload.description_courte.length > 200 || payload.nom.length > 100) {
      return text('Description ou nom trop long', 400);
    }

    if (!payload.rgpd) return text('Consentement RGPD manquant', 400);

    const turnstile = payload['cf-turnstile-response'];
    if (turnstile) {
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstile, ip);
      if (!ok) return text('Captcha échoué', 400);
    }

    const recent = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM submissions WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')",
    ).bind(ipHash).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 5) {
      return text('Trop de soumissions, réessayez plus tard', 429);
    }

    const ghHead = await fetch(payload.github_url, { method: 'HEAD' });
    if (!ghHead.ok) return text('Repo GitHub introuvable', 400);

    const orias = await classifyORIAS(env.ANTHROPIC_API_KEY, payload.description_courte);
    if (orias === 'OUI') {
      await env.DB.prepare(
        "INSERT INTO submissions (nom, github_url, description_courte, categorie, email, ip_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'rejected_orias', ?)",
      ).bind(payload.nom, payload.github_url, payload.description_courte, payload.categorie, payload.email, ipHash, new Date().toISOString()).run();
      return text('Cette catégorie de MCP est hors périmètre éditorial.', 400);
    }

    await env.DB.prepare(
      "INSERT INTO submissions (nom, github_url, description_courte, categorie, email, ip_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    ).bind(payload.nom, payload.github_url, payload.description_courte, payload.categorie, payload.email, ipHash, new Date().toISOString()).run();

    const issueOK = await createIssue(env.GITHUB_TOKEN, payload);
    if (!issueOK) return text('Impossible de créer l’issue GitHub', 500);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

function text(msg: string, status: number) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain' } });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`,
  });
  const data = await res.json<{ success: boolean }>();
  return Boolean(data.success);
}

async function classifyORIAS(apiKey: string, content: string): Promise<'OUI' | 'NON'> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      system: `Tu réponds STRICTEMENT par "OUI" ou "NON". Question : "Ce MCP fournit-il un service de conseil financier, gestion de patrimoine, trading, crypto, ou fiscalité personnalisée ?" Critères OUI : recommandations de placements, suivi de portefeuille avec advice, trading auto crypto/bourse, conseil fiscal personnalisé, gestion patrimoniale. Critères NON : lecture données financières (compta, ERP), notes de frais, factures, calcul TVA, banking pour reconciliation. Réponds UNIQUEMENT "OUI" ou "NON".`,
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await res.json<{ content: { text: string }[] }>();
  const txt = data.content?.[0]?.text?.trim().toUpperCase() ?? 'NON';
  return txt.startsWith('OUI') ? 'OUI' : 'NON';
}

async function createIssue(token: string, p: SubmitPayload): Promise<boolean> {
  const body = `**Nom** : ${p.nom}
**URL GitHub** : ${p.github_url}
**Catégorie proposée** : ${p.categorie}
**Description (FR)** :

> ${p.description_courte.replace(/\n/g, '\n> ')}

---
*Soumission communautaire — email du contributeur stocké en D1 (pas affiché).*
*Le scraper enrichira la fiche automatiquement avant validation manuelle.*`;

  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'findmymcp-submit/0.1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `[NEW MCP] ${p.nom}`,
      body,
      labels: ['mcp-submission', 'pending-review'],
    }),
  });
  return res.ok;
}
