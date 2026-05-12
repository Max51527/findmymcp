interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PUBLIC_SITE_URL: string;
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

interface SponsorPayload {
  tier: 'featured-1m' | 'featured-3m' | 'featured-12m';
  mcp_slug: string;
  email: string;
}

const REPO = 'Max51527/findmymcp';

const SPONSOR_TIERS: Record<SponsorPayload['tier'], { label: string; amount_eur: number; months: number }> = {
  'featured-1m': { label: 'Featured 1 mois', amount_eur: 99, months: 1 },
  'featured-3m': { label: 'Featured 3 mois', amount_eur: 249, months: 3 },
  'featured-12m': { label: 'Featured 12 mois', amount_eur: 799, months: 12 },
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname.endsWith('/api/submit')) {
      return handleSubmit(req, env);
    }
    if (req.method === 'POST' && url.pathname.endsWith('/api/sponsor-checkout')) {
      return handleSponsorCheckout(req, env);
    }
    if (req.method === 'POST' && url.pathname.endsWith('/api/stripe-webhook')) {
      return handleStripeWebhook(req, env);
    }
    return new Response('Not found', { status: 404 });
  },
};

async function handleSubmit(req: Request, env: Env): Promise<Response> {
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
}

async function handleSponsorCheckout(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return text('Stripe non configuré', 503);

  let payload: SponsorPayload;
  try {
    payload = await req.json();
  } catch {
    return text('Invalid JSON', 400);
  }

  const tier = SPONSOR_TIERS[payload.tier];
  if (!tier) return text('Tier inconnu', 400);
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return text('Email invalide', 400);
  }
  const slug = (payload.mcp_slug || '').slice(0, 80);
  if (!/^[a-z0-9-]+$/.test(slug)) return text('Slug MCP invalide', 400);

  const siteUrl = env.PUBLIC_SITE_URL || 'https://findmymcp.fr';
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('payment_method_types[0]', 'card');
  body.set('line_items[0][price_data][currency]', 'eur');
  body.set('line_items[0][price_data][unit_amount]', String(tier.amount_eur * 100));
  body.set('line_items[0][price_data][product_data][name]', `findmymcp — ${tier.label}`);
  body.set('line_items[0][price_data][product_data][description]', `MCP mis en avant pour ${tier.months} mois : ${slug}`);
  body.set('line_items[0][quantity]', '1');
  body.set('customer_email', payload.email);
  body.set('success_url', `${siteUrl}/sponsoriser/merci?session_id={CHECKOUT_SESSION_ID}`);
  body.set('cancel_url', `${siteUrl}/sponsoriser`);
  body.set('metadata[mcp_slug]', slug);
  body.set('metadata[tier]', payload.tier);
  body.set('metadata[months]', String(tier.months));
  body.set('automatic_tax[enabled]', 'false');
  body.set('billing_address_collection', 'required');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    console.error('stripe checkout failed', await res.text());
    return text('Stripe checkout failed', 502);
  }
  const session = await res.json<{ id: string; url: string }>();
  return new Response(JSON.stringify({ url: session.url }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return text('webhook secret missing', 503);
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();
  const verified = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return text('signature invalide', 400);

  const event = JSON.parse(raw) as {
    type: string;
    data: { object: { id: string; customer_email?: string; amount_total?: number; metadata?: Record<string, string> } };
  };

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const meta = s.metadata ?? {};
    await env.DB.prepare(
      'INSERT INTO sponsorships (stripe_session_id, mcp_slug, tier, months, amount_cents, email, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      s.id,
      meta.mcp_slug ?? '',
      meta.tier ?? '',
      Number(meta.months ?? '0'),
      s.amount_total ?? 0,
      s.customer_email ?? '',
      'paid',
      new Date().toISOString(),
    ).run().catch((e) => console.error('d1 insert failed', e));
  }
  return new Response('ok', { status: 200 });
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  // Stripe-Signature: t=1492774577,v1=hash,v1=hash...
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  // Replay window 5 min
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > 300) return false;

  const signedPayload = `${t}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
