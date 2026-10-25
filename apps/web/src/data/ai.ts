import { useApp } from '../state/app';
import { SupabaseBackend } from './supabaseBackend';
import { hostCap } from './host';

/* The team AI runs in the /api/ai function (key kept on the server). */

let status: Promise<{ provider: string; model: string } | null> | null = null;

/** which AI the team has set up, or null (local mode, or no key configured) */
export function teamAI() {
  return (status ??= (async () => {
    // hosted on claude.ai: Claude answers through the viewer's own account
    if (await hostCap('sample')) return { provider: 'claude.ai', model: 'your Claude account' };
    const be = useApp.getState().be;
    if (!(be instanceof SupabaseBackend)) return null;
    return fetch('/api/ai').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  })());
}

export async function askTeamAI(prompt: string): Promise<string> {
  const sample = await hostCap<any>('sample');
  if (sample) {
    try { return (await sample(prompt, { modelTier: 'default' })).text || ''; }
    catch (e: any) { throw new Error(e?.code === 'not_granted' ? 'Claude access was declined for this page. Allow it in the page permissions, or use Rules.' : e?.code === 'rate_limited' ? 'Claude is busy. Wait a moment and try again.' : e?.message || 'Claude could not finish.'); }
  }
  const be = useApp.getState().be;
  if (!(be instanceof SupabaseBackend)) throw new Error('The team AI needs the team cloud. Use “Copy-paste with Claude” instead.');
  const { data } = await be.sb.auth.getSession();
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify({ prompt }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `AI request failed (${r.status})`);
  return j.text || '';
}

export const PROVIDER_NAME: Record<string, string> = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', 'claude.ai': 'Claude' };
