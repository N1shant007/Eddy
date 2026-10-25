/*
 * Cloudflare Pages Function: audio storage on R2, addressed by SHA-256.
 *   GET/HEAD /api/audio/<sha256>   download (any signed-in team member)
 *   PUT      /api/audio/<sha256>   upload; the server re-hashes the bytes and refuses a mismatch
 *
 * Bindings (Cloudflare Pages -> Settings -> Functions):
 *   AUDIO          R2 bucket binding
 *   SUPABASE_URL   e.g. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY
 */

interface Env {
  AUDIO: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

type R2Bucket = {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; size: number } | null>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

const MAX_BYTES = 95 * 1024 * 1024;

async function teamUser(req: Request, env: Env): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.length < 20) return null;
  // Ask Supabase who this token belongs to (works with any JWT signing setup)
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY } });
  if (!u.ok) return null;
  const user = (await u.json()) as { email?: string };
  // ...and whether they are on the team (is_team() runs with the user's token)
  const t = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_team`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!t.ok || (await t.json()) !== true) return null;
  return user.email || 'member';
}

export const onRequest = async (ctx: { request: Request; env: Env; params: { hash: string } }) => {
  const { request: req, env, params } = ctx;
  const hash = String(params.hash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return new Response('Bad id', { status: 400 });
  if (!(await teamUser(req, env))) return new Response('Sign in with a team account', { status: 401 });
  const key = `audio/${hash}`;

  if (req.method === 'HEAD') {
    const h = await env.AUDIO.head(key);
    return new Response(null, { status: h ? 200 : 404 });
  }
  if (req.method === 'GET') {
    const obj = await env.AUDIO.get(key);
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  }
  if (req.method === 'PUT') {
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) return new Response('File too large (max 95 MB)', { status: 413 });
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response('File too large (max 95 MB)', { status: 413 });
    const d = await crypto.subtle.digest('SHA-256', buf);
    const got = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (got !== hash) return new Response('Checksum mismatch', { status: 400 });
    if (!(await env.AUDIO.head(key))) {
      await env.AUDIO.put(key, buf, { httpMetadata: { contentType: req.headers.get('Content-Type') || 'application/octet-stream' } });
    }
    return new Response('ok', { status: 201 });
  }
  return new Response('Method not allowed', { status: 405 });
};
