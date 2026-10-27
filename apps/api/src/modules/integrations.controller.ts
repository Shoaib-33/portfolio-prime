/* CRM integration. The company CRM is the source of truth for the properties it buys; it pushes each listing here with an API key.
   POST /api/integrations/crm/listings upserts by the CRM's own id (externalId); DELETE withdraws. Admins and developers manage keys. */
import { Controller, Get, Post, Delete, Param, Body, Req, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { eq, desc, and, isNull, sql, inArray } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireStaff, audit, logRule } from '../common';
import { CITY_GEO, DEAL_TYPES, LISTING_STATUSES, SUPER_ROLES } from '../domain';
import { parse } from './public.controller';
import { runMatching, priceChanged } from './listings.service';
import { setListings } from './access.controller';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const IMAGES = ['p1', 'p2', 'p3', 'p4', 'r1', 'r2', 'r3'];
const LIVE = ['available', 'coming_soon', 'under_offer'];

export const CRM_LISTING = z.object({
  externalId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(3).max(120), nameNl: z.string().trim().max(120).optional(),
  description: z.string().max(8000).default(''), descriptionNl: z.string().max(8000).optional(), highlights: z.array(z.string().max(160)).max(12).default([]),
  status: z.enum(LISTING_STATUSES as [string, ...string[]]).default('available'), dealType: z.enum(DEAL_TYPES as [string, ...string[]]).default('direct'),
  askingPrice: z.coerce.number().int().min(10000).max(2e9), priceOnRequest: z.boolean().default(false),
  grossRentAnnual: z.coerce.number().int().min(0).max(5e8).default(0), operatingCostsAnnual: z.coerce.number().int().min(0).max(5e8).nullable().optional(), occupancy: z.coerce.number().int().min(0).max(100).nullable().optional(),
  featured: z.boolean().default(false),
  property: z.object({
    address: z.string().trim().min(3).max(200), postcode: z.string().trim().max(20), city: z.string().trim().min(2).max(80), district: z.string().max(80).optional(),
    lat: z.coerce.number().min(50).max(54).optional(), lng: z.coerce.number().min(3).max(8).optional(),
    areaM2: z.coerce.number().int().min(1).max(2e6), plotM2: z.coerce.number().int().min(0).max(1e7).optional(), buildYear: z.coerce.number().int().min(1200).max(2100),
    category: z.enum(['portfolios', 'buildings', 'homes']), propertyType: z.string().trim().min(2).max(80), propertyTypeNl: z.string().max(80).optional(),
    tenure: z.string().max(160).default('Freehold (eigen grond)'), energyLabel: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).default('C'),
    wozValue: z.coerce.number().int().min(0).max(2e9).optional(), image: z.string().max(500).optional(),
  }),
  units: z.array(z.object({ ref: z.string().max(20), areaM2: z.coerce.number().int().min(1).max(20000), rentMonthly: z.coerce.number().int().min(0).max(1e6).default(0), rentType: z.enum(['social', 'mid', 'free']).default('free'), energyLabel: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).optional(), occupancy: z.enum(['let', 'vacant']).default('let') })).max(5000).optional(),
  /** Optional: emails of invited people who should see this listing straight away. */
  shareWith: z.array(z.string().trim().toLowerCase().email()).max(200).optional(),
});
export type CrmListing = z.infer<typeof CRM_LISTING>;

/** Insert or update one listing from the CRM. Publishing runs buy-box matching for the people who can see it. */
export async function crmUpsert(db: DB, b: CrmListing, actor: string) {
  const geo = CITY_GEO[b.property.city]; const pr = b.property;
  const image = pr.image && (IMAGES.includes(pr.image) || /^https:\/\//.test(pr.image)) ? pr.image : pr.category === 'homes' ? 'r1' : pr.category === 'portfolios' ? 'p1' : 'p2';
  const prop = { address: pr.address, postcode: pr.postcode, city: pr.city, district: pr.district || null, lat: pr.lat ?? geo?.lat ?? null, lng: pr.lng ?? geo?.lng ?? null, plotM2: pr.plotM2 ?? null, areaM2: pr.areaM2, buildYear: pr.buildYear,
    category: pr.category, propertyType: pr.propertyType, propertyTypeNl: pr.propertyTypeNl || null, tenure: pr.tenure, energyLabel: pr.energyLabel, wozValue: pr.wozValue ?? null, wozYear: pr.wozValue ? new Date().getFullYear() : null, image };
  const live = LIVE.includes(b.status);
  const fields = { name: b.name, nameNl: b.nameNl || null, description: b.description || 'Details follow from our acquisition team.', descriptionNl: b.descriptionNl || null, highlights: b.highlights, status: b.status, dealType: b.dealType,
    priceOnRequest: b.priceOnRequest, grossRentAnnual: b.grossRentAnnual, operatingCostsAnnual: b.operatingCostsAnnual ?? (b.grossRentAnnual ? Math.round(b.grossRentAnnual * 0.22) : null), occupancy: b.occupancy ?? null, featured: b.featured, syncedAt: new Date() };
  const old = (await db.select().from(S.listings).where(eq(S.listings.externalId, b.externalId)))[0];
  let id: string, slug: string, created = false;
  if (old) {
    await db.update(S.properties).set(prop).where(eq(S.properties.id, old.propertyId));
    await db.update(S.listings).set({ ...fields, askingPrice: b.askingPrice, ...(b.askingPrice !== old.askingPrice ? { previousPrice: old.askingPrice } : {}), ...(live && !old.publishedAt ? { publishedAt: new Date() } : {}) }).where(eq(S.listings.id, old.id));
    id = old.id; slug = old.slug;
  } else {
    const [p] = await db.insert(S.properties).values(prop).returning();
    slug = b.name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) + '-' + b.externalId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-6);
    if ((await db.select().from(S.listings).where(eq(S.listings.slug, slug)))[0]) slug += '-' + randomBytes(2).toString('hex');
    const [l] = await db.insert(S.listings).values({ ...fields, propertyId: p.id, slug, askingPrice: b.askingPrice, source: 'crm', externalId: b.externalId, publishedAt: live ? new Date() : null, proEarlyAccessUntil: b.dealType === 'off_market' ? new Date(Date.now() + 48 * 36e5) : null }).returning();
    id = l.id; created = true;
  }
  const propertyId = old?.propertyId || (await db.select().from(S.listings).where(eq(S.listings.id, id)))[0].propertyId;
  if (b.units) { await db.delete(S.units).where(eq(S.units.propertyId, propertyId)); if (b.units.length) await db.insert(S.units).values(b.units.map(u => ({ propertyId, ref: u.ref, areaM2: u.areaM2, rentMonthly: u.rentMonthly, rentType: u.rentType, energyLabel: u.energyLabel || pr.energyLabel, occupancy: u.occupancy }))); }
  let shared = 0;
  if (b.shareWith?.length) {
    const people = await db.select().from(S.users).where(inArray(S.users.email, b.shareWith));
    for (const u of people) { const cur = (await db.select().from(S.listingAccess).where(eq(S.listingAccess.userId, u.id))).map(r => r.listingId); if (!cur.includes(id)) { await setListings(db, u.id, [...cur, id], null); shared++; } }
  }
  let matched = 0;
  if (live && (created || !old?.publishedAt)) matched = await runMatching(db, id, 'publish');
  else if (old && b.askingPrice !== old.askingPrice) await priceChanged(db, id, old.askingPrice, b.askingPrice);
  await logRule(db, 'crm', `${created ? 'Created' : 'Updated'} ${b.name} (CRM ${b.externalId}) · ${b.status}${shared ? ` · shared with ${shared}` : ''}${matched ? ` · ${matched} matched` : ''} · ${actor}`);
  return { id, slug, created, status: b.status, shared, matched };
}

export const SAMPLE_CRM_LISTING = (n = Date.now().toString(36).slice(-5).toUpperCase()): CrmListing => CRM_LISTING.parse({
  externalId: `CRM-${n}`, name: `Kralingen apartments ${n}`, description: 'Pre-war apartment building near the Kralingse Plas, bought by our acquisition team this month. Fully let, mostly mid-rent, with a recent roof and façade renovation.',
  highlights: ['Fully let · 14 apartments', 'Roof and façade renovated 2024', 'Walking distance to the Kralingse Plas'], status: 'available', dealType: 'direct', askingPrice: 3950000, grossRentAnnual: 228000, occupancy: 100,
  property: { address: 'Sample Oudedijk 140', postcode: '3061 AN', city: 'Rotterdam', district: 'Kralingen', areaM2: 1080, buildYear: 1931, category: 'buildings', propertyType: 'Apartment building', energyLabel: 'C', wozValue: 3810000, image: 'p3' },
  units: Array.from({ length: 14 }, (_, i) => ({ ref: String(i + 1).padStart(2, '0'), areaM2: 77, rentMonthly: 1357, rentType: i < 3 ? 'social' : i < 11 ? 'mid' : 'free' })),
});

@Controller()
export class IntegrationsController {
  constructor(@Inject('DB') private db: DB) {}
  /** API key from `x-api-key` or `Authorization: Bearer`. Keys are stored hashed; PP_CRM_API_KEY works as a bootstrap key. */
  private async key(req: R) {
    const raw = String(req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '').trim();
    if (!raw) throw new UnauthorizedException('Send the API key in the x-api-key header.');
    if (process.env.PP_CRM_API_KEY && raw === process.env.PP_CRM_API_KEY) return 'env key';
    const k = (await this.db.select().from(S.apiKeys).where(and(eq(S.apiKeys.keyHash, sha(raw)), isNull(S.apiKeys.revokedAt))))[0];
    if (!k) throw new UnauthorizedException('This API key is not valid or was revoked.');
    await this.db.update(S.apiKeys).set({ lastUsedAt: new Date() }).where(eq(S.apiKeys.id, k.id)); return `key ${k.prefix}… (${k.name})`;
  }
  @Get('integrations/crm/ping') async ping(@Req() req: R) { return { ok: true, key: await this.key(req), time: new Date() }; }
  @Post('integrations/crm/listings') async upsert(@Req() req: R, @Body() body: unknown) {
    const who = await this.key(req); const items = Array.isArray(body) ? body : [body];
    if (items.length > 200) throw new UnauthorizedException('Send at most 200 listings per request.');
    const out = []; for (const x of items) out.push(await crmUpsert(this.db, parse(CRM_LISTING, x), who));
    await this.db.insert(S.auditEvents).values({ actorLabel: `CRM integration · ${who}`, action: 'crm_sync', objectType: 'listing', objectId: null, meta: { count: out.length, created: out.filter(o => o.created).length } });
    return Array.isArray(body) ? { results: out } : out[0];
  }
  @Delete('integrations/crm/listings/:externalId') async withdraw(@Req() req: R, @Param('externalId') ext: string) {
    const who = await this.key(req); const l = (await this.db.select().from(S.listings).where(eq(S.listings.externalId, ext)))[0]; if (!l) throw new NotFoundException('No listing with this CRM id.');
    await this.db.update(S.listings).set({ status: 'withdrawn', syncedAt: new Date() }).where(eq(S.listings.id, l.id));
    await logRule(this.db, 'crm', `Withdrawn ${l.name} (CRM ${ext}) · ${who}`); return { ok: true, slug: l.slug, status: 'withdrawn' };
  }

  /* ---------- Admin / developer console ---------- */
  @Get('admin/integrations') async console(@Req() req: R) {
    requireStaff(req, SUPER_ROLES);
    const keys = await this.db.select().from(S.apiKeys).orderBy(desc(S.apiKeys.createdAt));
    const log = await this.db.select().from(S.automationLog).where(eq(S.automationLog.rule, 'crm')).orderBy(desc(S.automationLog.at)).limit(25);
    const crm = await this.db.select({ n: sql<number>`count(*)::int`, last: sql<string>`max(synced_at)` }).from(S.listings).where(eq(S.listings.source, 'crm'));
    return { keys: keys.map(k => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revoked: !!k.revokedAt })), log, crmListings: Number(crm[0].n), lastSync: crm[0].last, envKey: !!process.env.PP_CRM_API_KEY, sample: SAMPLE_CRM_LISTING('1042') };
  }
  @Post('admin/integrations/keys') async createKey(@Req() req: R, @Body() body: unknown) {
    const u = requireStaff(req, SUPER_ROLES); const b = parse(z.object({ name: z.string().trim().min(2).max(60) }), body);
    const raw = 'pp_live_' + randomBytes(24).toString('base64url'); const prefix = raw.slice(0, 12);
    const [k] = await this.db.insert(S.apiKeys).values({ name: b.name, prefix, keyHash: sha(raw), createdBy: u.id }).returning();
    await audit(this.db, req, 'api_key_created', 'api_key', k.id, { name: b.name, prefix }); return { id: k.id, key: raw, prefix, note: 'Copy this key now. It is shown only once.' };
  }
  @Post('admin/integrations/keys/:id/revoke') async revokeKey(@Req() req: R, @Param('id') id: string) {
    requireStaff(req, SUPER_ROLES); await this.db.update(S.apiKeys).set({ revokedAt: new Date() }).where(eq(S.apiKeys.id, id)); await audit(this.db, req, 'api_key_revoked', 'api_key', id); return { ok: true };
  }
  /** Demo: run the same upsert the CRM would call, with a sample payload. */
  @Post('admin/integrations/crm/sample') async sample(@Req() req: R) {
    const u = requireStaff(req, SUPER_ROLES); const r = await crmUpsert(this.db, SAMPLE_CRM_LISTING(), `test by ${u.name}`);
    await audit(this.db, req, 'crm_sample', 'listing', r.id); return r;
  }
}
