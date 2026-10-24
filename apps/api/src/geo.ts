/* Place lookup for radius search: our own city table first, then PDOK Locatieserver (free, open, no key) for
   postcodes and other places. Results are cached in memory; a failed lookup never breaks the search. */
import { CITY_GEO } from './domain';

export type Place = { name: string; lat: number; lng: number; source: 'city table' | 'PDOK Locatieserver' };
const cache = new Map<string, Place | null>();

export async function resolvePlace(q: string): Promise<Place | null> {
  const key = String(q || '').trim().toLowerCase(); if (!key || key.length > 60) return null;
  if (cache.has(key)) return cache.get(key)!;
  const city = Object.keys(CITY_GEO).find(c => c.toLowerCase() === key);
  let out: Place | null = city ? { name: city, lat: CITY_GEO[city].lat, lng: CITY_GEO[city].lng, source: 'city table' } : null;
  if (!out && process.env.PP_OFFLINE !== '1') {
    try {
      const url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fl=weergavenaam,centroide_ll&fq=type:(postcode OR woonplaats OR gemeente)&q=' + encodeURIComponent(key);
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const d: any = await r.json(); const doc = d?.response?.docs?.[0];
      const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc?.centroide_ll || '');
      if (m) out = { name: doc.weergavenaam, lng: +m[1], lat: +m[2], source: 'PDOK Locatieserver' };
    } catch { /* offline or PDOK unavailable: treat as unknown place */ }
  }
  cache.set(key, out); return out;
}
