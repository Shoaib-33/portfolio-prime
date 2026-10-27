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
export type Me = { user: null | { id: string; name: string; email: string; role: string; locale: string; investorType: string; country: string; companyName: string | null; verified: boolean; pro: boolean; twofaEnabled: boolean; twofaPassed: boolean; tier: 'free' | 'verified' | 'pro'; tierLabel: string; alertFrequency: string; staff: boolean; features: string[]; listingScope: 'all' | 'selected'; listings: number | null; accountManager: string | null }; kyc?: { status: string; risk?: string }; unread?: number };
export async function getMe(): Promise<Me> { const r = await api<Me>('/me'); return r.ok ? r.data : { user: null }; }
export async function getLang(): Promise<'nl' | 'en'> { const jar = await cookies(); return jar.get('pp_lang')?.value === 'nl' ? 'nl' : 'en'; }
