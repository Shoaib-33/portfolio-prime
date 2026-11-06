import { cache } from 'react';
import { cookies } from 'next/headers';
const API = (process.env.API_URL || 'http://127.0.0.1:4000') + '/api';

/** Server-side API call that forwards the visitor's session cookie. Never cached: every response depends on who is asking. */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const jar = await cookies();
  const cookie = jar.getAll().map(c => `${c.name}=${c.value}`).join('; ');
  try {
    const r = await fetch(API + path, { ...init, headers: { ...(init.headers || {}), cookie }, cache: 'no-store' });
    const text = await r.text(); let data: any = text; try { data = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 503, data: { message: 'The API is not running. Start it with: npm run dev:api' } as any }; }
}
/* Public, anonymous data (stats, track record, teasers, rates) changes rarely, so it is kept in memory briefly instead of being
   fetched on every page view. A stale copy is served while a fresh one loads in the background. Never use this for per-person data:
   no cookie is sent. (Next's own fetch cache does not apply here: the root layout is force-dynamic.) */
const memo = new Map<string, { at: number; val: { ok: boolean; status: number; data: any }; busy?: boolean }>();
export async function publicApi<T = any>(path: string, ttlMs = 60_000): Promise<{ ok: boolean; status: number; data: T }> {
  const load = async () => {
    try {
      const res = await fetch(API + path, { cache: 'no-store' }); const data = await res.json(); const val = { ok: res.ok, status: res.status, data };
      if (res.ok) memo.set(path, { at: Date.now(), val }); else { const h = memo.get(path); if (h) h.busy = false; }
      return val;
    } catch { const h = memo.get(path); if (h) h.busy = false; return { ok: false, status: 503, data: null as any }; }
  };
  const hit = memo.get(path); if (!hit) return load();
  const age = Date.now() - hit.at;
  if (age > 10 * ttlMs) return load();                                   // long idle: do not show very old data
  if (age > ttlMs && !hit.busy) { hit.busy = true; void load(); }        // refresh in the background
  return hit.val;
}
export type Me = { user: null | { id: string; name: string; email: string; role: string; locale: string; investorType: string; country: string; companyName: string | null; verified: boolean; pro: boolean; twofaEnabled: boolean; twofaPassed: boolean; tier: 'free' | 'verified' | 'pro'; tierLabel: string; alertFrequency: string; staff: boolean; features: string[]; listingScope: 'all' | 'selected'; listings: number | null; accountManager: string | null }; kyc?: { status: string; risk?: string }; unread?: number };
/** Who is asking. Visitors without a session need no API call; within one page render the answer is shared. */
export const getMe = cache(async (): Promise<Me> => { if (!(await cookies()).get('pp_session')) return { user: null } as Me; const r = await api<Me>('/me'); return r.ok ? r.data : { user: null }; });
/** Light (default) or dark, from the site-wide switch. */
export async function getTheme(): Promise<'light' | 'dark'> { const jar = await cookies(); return jar.get('pp_theme')?.value === 'dark' ? 'dark' : 'light'; }
export async function getLang(): Promise<'nl' | 'en'> { const jar = await cookies(); return jar.get('pp_lang')?.value === 'nl' ? 'nl' : 'en'; }
