import { Controller, Get, Post, Param, Query, Body, Req, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, viewerOf, getConfig, serializeListing, audit, logRule, draftEmail } from '../common';
import { canDetails, finance, figures, CONFIG_DEFAULTS, cfg, bagLookup, offMarketState, priceBand, maxPrice, dealScore } from '../domain';
import { listListings, getListing, hasNda, bidRoundInfo, unitCounts, staffOrVerified } from './listings.service';

export const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => { const r = s.safeParse(v); if (!r.success) throw new BadRequestException(r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')); return r.data; };

@Controller()
export class PublicController {
  constructor(@Inject('DB') private db: DB) {}
  @Get('health') health() { return { ok: true, mode: 'demo', database: 'PGlite (PostgreSQL)' }; }
  @Get('config/public') async publicConfig() { const c = await getConfig(this.db); return { proPriceMonth: cfg(c, 'pro_price_month'), proPriceYear: cfg(c, 'pro_price_year'), buyerFee: cfg(c, 'buyer_fee') }; }
  @Get('stats') async stats() {
    const sold = await this.db.select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(asking_price),0)::bigint` }).from(S.listings).where(eq(S.listings.status, 'sold'));
    const inv = await this.db.select({ n: sql<number>`count(*)::int` }).from(S.users).where(and(eq(S.users.role, 'investor'), eq(S.users.verified, true)));
    return { dealsClosed: 33 + Number(sold[0].n), volumeM: Math.round(191 + Number(sold[0].v) / 1e6), verifiedInvestors: 1236 + Number(inv[0].n), avgDaysToOffer: 23, note: 'Historic baseline plus live database counts' };
  }
  @Get('listings') async list(@Req() req: R, @Query() q: Record<string, string>) { return listListings(this.db, viewerOf(req), q); }
  @Get('listings/sold') async sold() {
    const rows = await this.db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(eq(S.listings.status, 'sold'));
    const counts = await unitCounts(this.db, rows.map(r => r.properties.id));
    return rows.map(({ listings: l, properties: p }) => ({ city: p.city, propertyType: p.propertyType, units: counts[p.id] || 1, priceBand: priceBand(l.askingPrice), dealType: l.dealType, soldAt: l.publishedAt, daysToOffer: l.demand }));
  }
  @Get('listings/:slug') async detail(@Req() req: R, @Param('slug') slug: string) {
    const x = await getListing(this.db, slug); if (!x || ['draft', 'withdrawn'].includes(x.l.status)) throw new NotFoundException('Listing not found');
    const v = viewerOf(req); const c = await getConfig(this.db);
    const counts = await unitCounts(this.db, [x.p.id]); const nda = await hasNda(this.db, v?.id, x.l.id);
    const saved = v?.id ? !!(await this.db.select().from(S.favorites).where(and(eq(S.favorites.userId, v.id), eq(S.favorites.listingId, x.l.id))))[0] : false;
    const bid = await bidRoundInfo(this.db, x.l.id);
    let myBid = null; if (bid && v?.id) myBid = (await this.db.select().from(S.offers).where(and(eq(S.offers.bidRoundId, bid.id), eq(S.offers.userId, v.id))))[0] || null;
    await audit(this.db, req, 'view', 'listing', x.l.id, { slug });
    const out: any = { ...serializeListing(x.l, x.p, v, c, { hasNda: nda, saved, bidRound: bid }), unitsCount: counts[x.p.id] || 1 };
    if (!out.locked) out.documentsTeaser = (await this.db.select({ folder: S.documents.folder, n: sql<number>`count(*)::int` }).from(S.documents).where(eq(S.documents.listingId, x.l.id)).groupBy(S.documents.folder)).map(r => ({ folder: r.folder, files: Number(r.n) }));
    if (myBid) out.myBid = { amount: myBid.amount, conditions: myBid.conditions, status: myBid.status };
    return out;
  }
  /** Unit-level rent roll: verified investor with the NDA for this listing (or staff). */
  @Get('listings/:slug/units') async units(@Req() req: R, @Param('slug') slug: string) {
    const x = await getListing(this.db, slug); if (!x) throw new NotFoundException(); const v = viewerOf(req);
    if (!(staffOrVerified(v) && (await hasNda(this.db, v?.id, x.l.id) || v?.role !== 'investor'))) throw new ForbiddenException('Verification and the property NDA are required.');
    const u = await this.db.select().from(S.units).where(eq(S.units.propertyId, x.p.id)).orderBy(S.units.ref);
    return u.map(r => ({ ref: r.ref, areaM2: r.areaM2, rentMonthly: r.rentMonthly, rentType: r.rentType, energyLabel: r.energyLabel, occupancy: r.occupancy, unitPrice: Math.round(x.l.askingPrice / u.length * 1.06) }));
  }
  /** Plan: POST /calculations (inputs to outputs). Free members and up. */
  @Post('calculations') async calc(@Req() req: R, @Body() body: unknown) {
    const b = parse(z.object({ slug: z.string(), ltv: z.coerce.number().min(0).max(90).default(60), interest: z.coerce.number().min(0).max(15).default(4), expense: z.coerce.number().min(0).max(80).default(22), vacancy: z.coerce.number().min(0).max(50).default(3) }), body);
    if (!canDetails(viewerOf(req))) throw new ForbiddenException('Join free to use the calculator.');
    const x = await getListing(this.db, b.slug); if (!x) throw new NotFoundException(); if (offMarketState(x.l.dealType, x.l.proEarlyAccessUntil, viewerOf(req)) !== 'open') throw new ForbiddenException();
    const c = await getConfig(this.db);
    return { inputs: b, finance: finance(x.l.askingPrice, x.l.grossRentAnnual, b), figures: figures({ askingPrice: x.l.askingPrice, grossRentAnnual: x.l.grossRentAnnual, operatingCostsAnnual: x.l.operatingCostsAnnual, areaM2: x.p.areaM2, unitsCount: 1 }, c), disclaimer: 'Indicative only. Not investment or tax advice.' };
  }
  /** Smart finder: rank available income listings by reach and deal score. */
  @Get('finder') async finder(@Req() req: R, @Query() q: Record<string, string>) {
    const equity = Number(q.equity || 2500000), ltv = Number(q.ltv || 60), interest = Number(q.interest || 4), minYield = Number(q.minYield || 0), city = q.city || 'all';
    const all = (await listListings(this.db, viewerOf(req), {})).filter((l: any) => !l.locked && l.status === 'available' && l.bar && (city === 'all' || l.city === city));
    const rows = [];
    for (const l of all) { const x = await getListing(this.db, l.slug); const f = finance(x.l.askingPrice, x.l.grossRentAnnual, { ltv, interest }); const fit = f.equity <= equity && l.bar >= minYield; rows.push({ slug: l.slug, name: l.name, city: l.city, district: l.district, image: l.image, price: canDetails(viewerOf(req)) ? x.l.askingPrice : null, priceDisplay: l.priceDisplay, equityNeeded: Math.round(f.equity), cashFlow: Math.round(f.cash), coc: +f.coc.toFixed(1), fit, reach: Math.min(100, Math.round(equity / f.equity * 100)), score: l.dealScore.total, bar: l.bar }); }
    rows.sort((a, b) => (+b.fit - +a.fit) || b.score - a.score);
    return { maxPrice: maxPrice(equity, ltv), rows };
  }
  /** "Sell your property to us" lead form (plan: key lead source for the acquisition CRM). */
  @Post('sell-leads') async sellLead(@Req() req: R, @Body() body: unknown) {
    const b = parse(z.object({ postcode: z.string().min(6).max(8), number: z.string().min(1).max(10), propertyType: z.string().max(60), units: z.coerce.number().int().min(1).max(1000), rent: z.coerce.number().min(0).optional(), asking: z.coerce.number().min(0).optional(), name: z.string().min(2).max(80), email: z.string().email().max(160), consent: z.literal(true) }), body);
    const bag = bagLookup(b.postcode, b.number); const city = bag?.city || 'the Netherlands';
    const bars: Record<string, number> = { Amsterdam: 4.4, Rotterdam: 6, Utrecht: 5.1, Eindhoven: 6.1, 'Den Haag': 5.6, Haarlem: 5 };
    let lo: number, hi: number, basis: string;
    if (b.rent) { const v = b.rent / ((bars[city] || 5.5) / 100); lo = v * 0.94; hi = v * 1.04; basis = `Based on €${b.rent.toLocaleString('nl-NL')} annual rent and a typical ${city} BAR of ${(bars[city] || 5.5).toFixed(1)}%.`; }
    else if (b.asking) { lo = b.asking * 0.9; hi = b.asking * 0.98; basis = 'Based on your asking price and recent comparable sales.'; }
    else { lo = b.units * 170000; hi = b.units * 215000; basis = `Based on ${b.units} units at typical per-unit values in ${city}.`; }
    const [lead] = await this.db.insert(S.acquisitionLeads).values({ source: 'Website', address: `${bag?.address || 'Address'}, ${bag?.postcode || b.postcode} ${city}`, postcode: b.postcode, propertyType: b.propertyType, units: b.units, askingPrice: b.asking || null, estValue: Math.round((lo + hi) / 2 / 1000) * 1000, contactName: b.name, contactEmail: b.email }).returning();
    await logRule(this.db, 'acquisition', `New seller lead from the website · ${b.propertyType}, ${b.units} units, ${city}`);
    await draftEmail(this.db, b.email, 'Your valuation request', `Dear ${b.name}, thank you for your request. Our acquisition team will call you within one working day with a direct offer.`, 'valuation');
    await audit(this.db, req, 'lead_created', 'acquisition_lead', lead.id, { source: 'website' });
    const r5 = (n: number) => Math.round(n / 5000) * 5000;
    return { reference: 'L-' + lead.id.slice(0, 6).toUpperCase(), low: r5(lo), high: r5(hi), basis };
  }
}
