import type { Backend } from './types';
import { LocalBackend } from './localBackend';
import { SupabaseBackend } from './supabaseBackend';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Cloud when Supabase is configured (and the user hasn't chosen "this browser only"), otherwise local. */
export const cloudConfigured = !!(url && key);

export function makeBackend(): Backend {
  let forceLocal = false;
  try { forceLocal = localStorage.getItem('eddy.mode') === 'local'; } catch { /* storage blocked */ }
  if (cloudConfigured && !forceLocal) return new SupabaseBackend(url!, key!);
  return new LocalBackend();
}
