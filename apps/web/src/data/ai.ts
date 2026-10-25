import { useApp } from '../state/app';
import { SupabaseBackend } from './supabaseBackend';

/* The team AI runs in the /api/ai function (key kept on the server). */

let status: Promise<{ provider: string; model: string } | null> | null = null;

/** which AI the team has set up, or null (local mode, or no key configured) */
export function teamAI() {
  const be = useApp.getState().be;
  if (!(be instanceof SupabaseBackend)) return Promise.resolve(null);
  return (status ??= fetch('/api/ai').then((r) => (r.ok ? r.json() : null)).catch(() => null));
}

export async function askTeamAI(prompt: string): Promise<string> {
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

export const PROVIDER_NAME: Record<string, string> = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };
