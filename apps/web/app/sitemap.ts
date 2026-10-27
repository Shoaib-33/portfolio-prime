import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { siteUrl, SEO_CITIES, SEO_TYPES, citySlug } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Static pages, SEO city and city+type pages, and every public listing. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl(); const now = new Date();
  const listings: any[] = ((await api('/listings')).data || []).filter((l: any) => !l.locked);
  const pages = ['', '/listings', '/finder', '/membership', '/sell', '/beleggingspanden', '/institutional', '/analyst', '/market-report', '/invest-in-dutch-real-estate', '/de/immobilien-investment-niederlande'].map(p => ({ url: base + p, lastModified: now, changeFrequency: 'daily' as const, priority: p ? 0.7 : 1 }));
  const cities = Object.keys(SEO_CITIES).map(k => ({ url: `${base}/beleggingspanden/${k}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.8 }));
  const combos = new Set(listings.map(l => { const t = Object.keys(SEO_TYPES).find(k => SEO_TYPES[k].category === l.category); return t ? `${citySlug(l.city)}/${t}` : null; }).filter(Boolean));
  const cityTypes = [...combos].map(c => ({ url: `${base}/beleggingspanden/${c}`, lastModified: now, changeFrequency: 'daily' as const, priority: 0.7 }));
  const detail = listings.map(l => ({ url: `${base}/listings/${l.slug}`, lastModified: l.publishedAt ? new Date(l.publishedAt) : now, changeFrequency: 'weekly' as const, priority: 0.9, images: [`${base}/img/${l.image}.jpg`] }));
  return [...pages, ...cities, ...cityTypes, ...detail];
}
