/* Shared by the Cloudflare Pages Functions: is this request from a signed-in team member? */
export interface AuthEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export async function teamUser(req: Request, env: AuthEnv): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.length < 20 || !env.SUPABASE_URL) return null;
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
