import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Invite-only: only the public company pages and guides are listed. The offering itself is private and never indexed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl(); const now = new Date();
  return ['', '/invest-in-dutch-real-estate', '/de/immobilien-investment-niederlande'].map(p => ({ url: base + p, lastModified: now, changeFrequency: 'weekly' as const, priority: p ? 0.7 : 1 }));
}
