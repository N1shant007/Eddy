/*
 * Cloudflare Pages Function: the AI sound designer.
 *   GET  /api/ai   → { provider, model } when AI is set up (404 otherwise)
 *   POST /api/ai   { prompt } → { text }      (signed-in team members only)
 *
 * The API key lives only here, as a Cloudflare secret. Browsers never see it.
 * Settings (Cloudflare Pages → Settings → Variables and Secrets):
 *   AI_PROVIDER   anthropic | openai | gemini
 *   AI_API_KEY    the provider's API key (add it as a *secret*)
 *   AI_MODEL      optional; defaults below
 *   AI_DAILY_LIMIT optional; max requests per person per day (default 60)
 *   SUPABASE_URL, SUPABASE_ANON_KEY  (already set for the audio function)
 */
import { teamUser, type AuthEnv } from '../../server/auth';

interface Env extends AuthEnv {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_DAILY_LIMIT?: string;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-flash-latest',
};
const SYSTEM = 'You are the sound designer for an AI-voice podcast editor. Follow the house guidelines exactly. Reply with JSON only, no prose.';
const MAX_PROMPT = 400_000;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// per-person daily counter (best effort: per Cloudflare isolate, resets when the isolate is recycled)
const usage = new Map<string, { day: string; n: number }>();

async function callModel(env: Env, prompt: string): Promise<string> {
  const provider = (env.AI_PROVIDER || '').toLowerCase();
  const model = env.AI_MODEL || DEFAULT_MODEL[provider];
  const key = env.AI_API_KEY!;
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic error ${r.status}`);
    return (j.content || []).map((b: any) => b.text || '').join('');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `OpenAI error ${r.status}`);
    return j.choices?.[0]?.message?.content || '';
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Gemini error ${r.status}`);
    return (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  }
  throw new Error('AI is not set up: AI_PROVIDER must be anthropic, openai or gemini.');
}

export const onRequest = async ({ request: req, env }: { request: Request; env: Env }) => {
  const ready = !!(env.AI_API_KEY && DEFAULT_MODEL[(env.AI_PROVIDER || '').toLowerCase()]);
  if (req.method === 'GET') return ready ? json({ provider: env.AI_PROVIDER, model: env.AI_MODEL || DEFAULT_MODEL[env.AI_PROVIDER!.toLowerCase()] }) : json({ error: 'not configured' }, 404);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ready) return json({ error: 'AI is not set up for the team yet. Ask the admin to add AI_PROVIDER and AI_API_KEY in Cloudflare.' }, 503);
  const who = await teamUser(req, env);
  if (!who) return json({ error: 'Sign in with a team account' }, 401);

  const day = new Date().toISOString().slice(0, 10), limit = +(env.AI_DAILY_LIMIT || 60);
  const u = usage.get(who);
  const n = u && u.day === day ? u.n : 0;
  if (n >= limit) return json({ error: `Daily AI limit reached (${limit}). The rules engine still works.` }, 429);

  let body: { prompt?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const prompt = String(body.prompt || '');
  if (!prompt || prompt.length > MAX_PROMPT) return json({ error: 'The prompt is empty or too long.' }, 400);

  usage.set(who, { day, n: n + 1 });
  try {
    return json({ text: await callModel(env, prompt) });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 502);
  }
};
