import type { MetadataRoute } from 'next';
import { siteUrl, indexable } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** The demo stays out of search engines; set PP_INDEX=1 on the production site to open it up. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return { rules: indexable() ? [{ userAgent: '*', allow: '/', disallow: ['/admin', '/account', '/api/'] }] : [{ userAgent: '*', disallow: '/' }], sitemap: `${base}/sitemap.xml` };
}
