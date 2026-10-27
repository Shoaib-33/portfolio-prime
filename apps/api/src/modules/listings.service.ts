import { and, eq, inArray, sql, desc, notInArray } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Viewer, matchesSearch, alertFrequency, tierOf, isStaff, canDetails, canSeeListing, provinceOf, distanceKm, CITY_GEO, isQualified } from '../domain';
import { resolvePlace } from '../geo';
import { serializeListing, getConfig, notify, logRule, ruleOn, draftEmail } from '../common';

export async function unitCounts(db: DB, propertyIds: string[]) {
  if (!propertyIds.length) return {} as Record<string, number>;
  const rows = await db.select({ pid: S.units.propertyId, n: sql<number>`count(*)::int` }).from(S.units).where(inArray(S.units.propertyId, propertyIds)).groupBy(S.units.propertyId);
  return Object.fromEntries(rows.map(r => [r.pid, Number(r.n)]));
}
export async function bidRoundInfo(db: DB, listingId: string) {
  const r = (await db.select().from(S.bidRounds).where(eq(S.bidRounds.listingId, listingId)))[0]; if (!r) return null;
  const n = (await db.select({ n: sql<number>`count(*)::int` }).from(S.offers).where(eq(S.offers.bidRoundId, r.id)))[0].n;
  return { id: r.id, opensAt: r.opensAt, closesAt: r.closesAt, minBid: r.minBid, status: r.status, sealedBids: Number(n) };
}
/** Public listing query with access control applied per viewer. Sold, draft and withdrawn listings are excluded. */
export async function listListings(db: DB, viewer: Viewer | null, f: Record<string, string> = {}) {
  const rows = await db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(notInArray(S.listings.status, ['draft', 'withdrawn', 'sold'])).orderBy(desc(S.listings.featured), desc(S.listings.publishedAt));
  const c = await getConfig(db); const counts = await unitCounts(db, rows.map(r => r.properties.id));
  const saved = viewer?.id ? new Set((await db.select().from(S.favorites).where(eq(S.favorites.userId, viewer.id))).map(x => x.listingId)) : new Set<string>();
  const q = (f.q || '').toLowerCase().trim();
  const near = f.near ? await resolvePlace(f.near) : null; const radius = Math.min(100, Math.max(1, Number(f.radius) || 25)); const exact = canDetails(viewer);
  let out = rows.filter(({ listings: l, properties: p }) => {
    if (!canSeeListing(viewer, l.id)) return false; // invite-only: just the properties shared with this person
    if (f.province && provinceOf(p.city) !== f.province) return false;
    if (near) {
      // Distance from the exact location for members; from the city centre for visitors (no address leak via radius probing).
      const at = exact && p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : CITY_GEO[p.city]; if (!at || distanceKm(near, at) > radius) return false;
    }
    if (!matchesSearch({ city: p.city, category: p.category, askingPrice: l.askingPrice, grossRentAnnual: l.grossRentAnnual, dealType: l.dealType, status: 'available' }, f)) return false;
    if (f.minLabel && 'ABCDEFG'.indexOf(p.energyLabel) > 'ABCDEFG'.indexOf(f.minLabel)) return false;
    if (q && ![l.name, l.nameNl, p.city, p.district, p.propertyType, p.propertyTypeNl, l.description].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).map(({ listings: l, properties: p }) => ({ ...serializeListing(l, p, viewer, c, { saved: saved.has(l.id) }), unitsCount: counts[p.id] || 1 } as any));
  const sorters: Record<string, (a: any, b: any) => number> = { newest: (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt), 'price-low': (a, b) => (a.askingPrice ?? 9e12) - (b.askingPrice ?? 9e12), bar: (a, b) => (b.bar ?? 0) - (a.bar ?? 0), score: (a, b) => (b.dealScore?.total ?? 0) - (a.dealScore?.total ?? 0) };
  if (f.sort && sorters[f.sort]) out = out.sort(sorters[f.sort]);
  return out;
}
/** Listing by slug, only when this viewer may see it (otherwise null, so callers answer 404 and never confirm it exists). */
export async function visibleListing(db: DB, slug: string, v: Viewer | null) { const x = await getListing(db, slug); return x && canSeeListing(v, x.l.id) ? x : null; }
/** People who may see a listing: staff, scope 'all', or an explicit share. Used for alerts. */
export async function audienceOf(db: DB, listingId: string) { return new Set((await db.select().from(S.listingAccess).where(eq(S.listingAccess.listingId, listingId))).map(r => r.userId)); }
const reaches = (u: { id: string; role: string; listingScope: string; status: string }, shared: Set<string>) => u.status === 'active' && (isStaff(u) || u.listingScope === 'all' || shared.has(u.id));
export async function getListing(db: DB, slug: string) {
  const r = (await db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(eq(S.listings.slug, slug)))[0];
  return r ? { l: r.listings, p: r.properties } : null;
}
export async function hasNda(db: DB, userId: string | undefined, listingId: string) {
  if (!userId) return false; return !!(await db.select().from(S.ndaSignatures).where(and(eq(S.ndaSignatures.userId, userId), eq(S.ndaSignatures.listingId, listingId))))[0];
}

/** Buy-box and saved-search matching on publish. Off-market: Pro now, verified investors when the early-access window ends (scheduled job). */
export async function runMatching(db: DB, listingId: string, audience: 'publish' | 'release' = 'publish') {
  if (!(await ruleOn(db, 'matches'))) return 0;
  const r = (await db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(eq(S.listings.id, listingId)))[0]; if (!r) return 0;
  const l = r.listings, p = r.properties; const subject = { city: p.city, category: p.category, askingPrice: l.askingPrice, grossRentAnnual: l.grossRentAnnual, dealType: l.dealType, status: l.status };
  const investors = await db.select().from(S.users).where(eq(S.users.role, 'investor'));
  const boxes = Object.fromEntries((await db.select().from(S.buyBoxes)).map(b => [b.userId, b]));
  const searches = await db.select().from(S.savedSearches); const shared = await audienceOf(db, listingId);
  let n = 0;
  for (const u of investors) {
    if (u.deletedAt || !reaches(u, shared)) continue; const tier = tierOf({ id: u.id, verified: u.verified, pro: u.pro });
    if (l.dealType === 'off_market') { if (audience === 'publish' && tier !== 'pro') continue; if (audience === 'release' && tier !== 'verified') continue; }
    if (l.dealType === 'institutional' && !isQualified({ id: u.id, verified: u.verified, investorType: u.investorType })) continue;
    const b = boxes[u.id]; const fitBox = b && matchesSearch(subject, { regions: b.regions, types: b.types, ticketMin: b.ticketMin, ticketMax: b.ticketMax, targetBar: b.targetBar });
    const fitSearch = searches.some(s => s.userId === u.id && matchesSearch(subject, s.filters));
    if (!fitBox && !fitSearch) continue;
    await notify(db, u.id, 'match', l.dealType === 'off_market' ? 'Off-market match: first look' : 'A new property matches your buy box', `${l.name} · ${p.city}`, l.slug);
    const freq = alertFrequency({ id: u.id, verified: u.verified, pro: u.pro });
    if (freq === 'instant') await draftEmail(db, u.email, 'New match: ' + l.name, `A property matching your criteria was just published: ${l.name} in ${p.city}.`, 'match');
    n++;
  }
  await logRule(db, 'matches', `${l.name} ${audience === 'release' ? 'released to verified investors' : 'published'} · ${n} investor${n === 1 ? '' : 's'} alerted${l.dealType === 'off_market' && audience === 'publish' ? ' (Investor Pro first)' : ''}`);
  return n;
}
/** Price change: alert investors who saved the listing, and saved searches it now fits. */
export async function priceChanged(db: DB, listingId: string, oldPrice: number, newPrice: number) {
  if (newPrice >= oldPrice || !(await ruleOn(db, 'priceAlerts'))) { await logRule(db, 'priceAlerts', `Price set to €${newPrice.toLocaleString('nl-NL')} · no alerts`); return 0; }
  const r = (await db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(eq(S.listings.id, listingId)))[0];
  const l = r.listings, p = r.properties; let n = 0; const done = new Set<string>();
  const shared = await audienceOf(db, listingId); const users = new Map((await db.select().from(S.users)).map(u => [u.id, u]));
  const ok = (id: string) => { const u = users.get(id); return !!u && reaches(u, shared); };
  for (const f of await db.select().from(S.favorites).where(eq(S.favorites.listingId, listingId))) { if (!ok(f.userId)) continue; await notify(db, f.userId, 'price', 'Price reduced on a saved property', `${l.name} · now €${newPrice.toLocaleString('nl-NL')} (was €${oldPrice.toLocaleString('nl-NL')})`, l.slug); done.add(f.userId); n++; }
  const base = { city: p.city, category: p.category, grossRentAnnual: l.grossRentAnnual, dealType: l.dealType, status: l.status };
  for (const s of await db.select().from(S.savedSearches)) { if (done.has(s.userId) || !ok(s.userId)) continue; if (matchesSearch({ ...base, askingPrice: newPrice }, s.filters) && !matchesSearch({ ...base, askingPrice: oldPrice }, s.filters)) { await notify(db, s.userId, 'price', 'Now within your budget', `${l.name} · €${newPrice.toLocaleString('nl-NL')}`, l.slug); done.add(s.userId); n++; } }
  await logRule(db, 'priceAlerts', `${l.name} reduced to €${newPrice.toLocaleString('nl-NL')} · ${n} alert${n === 1 ? '' : 's'}`);
  return n;
}
export const staffOrVerified = (v: Viewer | null) => isStaff(v) || !!v?.verified;
