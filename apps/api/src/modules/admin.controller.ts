import { Controller, Get, Post, Put, Patch, Param, Body, Req, Res, Query, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { eq, desc, asc, sql, and, inArray, ne } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireStaff, audit, notify, logRule, draftEmail, readStored, getConfig } from '../common';
import { bagLookup, CONFIG_DEFAULTS, DEAL_STAGES, LEAD_STAGES, LISTING_STATUSES, tierOf, TIER_LABEL, kycRisk } from '../domain';
import { parse } from './public.controller';
import { runMatching, priceChanged } from './listings.service';
import { JobsService } from './jobs.service';
import { samplePdf } from '../pdf';
import { saveFile } from '../common';

@Controller('admin')
export class AdminController {
  constructor(@Inject('DB') private db: DB, private jobs: JobsService) {}

  @Get('overview') async overview(@Req() req: R) {
    requireStaff(req); const db = this.db; const count = async (t: any, w?: any) => Number((await db.select({ n: sql<number>`count(*)::int` }).from(t).where(w))[0].n);
    const views = await count(S.auditEvents, and(eq(S.auditEvents.action, 'view'), eq(S.auditEvents.objectType, 'listing'))), ndas = await count(S.ndaSignatures), deals = await count(S.deals);
    const ndaUsers = (await db.select({ u: S.ndaSignatures.userId }).from(S.ndaSignatures)).map(r => r.u); const offers = ndaUsers.length ? await count(S.offers, inArray(S.offers.userId, ndaUsers)) : 0;
    const verified = await count(S.users, and(eq(S.users.role, 'investor'), eq(S.users.verified, true))), pro = await count(S.users, and(eq(S.users.role, 'investor'), eq(S.users.pro, true)));
    const leads = await db.select().from(S.acquisitionLeads); const active = leads.filter(l => !['acquired', 'lost'].includes(l.stage));
    return { kpis: [
      { label: 'Verified investors', value: verified, target: '1,500' }, { label: 'Paid conversion', value: verified ? +(pro / verified * 100).toFixed(1) + '%' : '0%', target: '10%' },
      { label: 'Listing → NDA rate', value: views ? +(ndas / views * 100).toFixed(1) + '%' : '—', target: '8%' }, { label: 'NDA → offer rate', value: ndas ? +(offers / ndas * 100).toFixed(1) + '%' : '—', target: '15%' },
      { label: 'Deals in progress', value: deals, target: '4+ closed / month' }, { label: 'Active seller leads', value: active.length, target: '60+ new / month' },
      { label: 'Pending KYC reviews', value: await count(S.kycCases, eq(S.kycCases.status, 'pending')), target: '< 1 working day' }, { label: 'Open offers', value: await count(S.offers, inArray(S.offers.status, ['submitted', 'in_review'])), target: 'reply < 24 h' }],
      funnel: [['Listing detail views', views], ['NDAs signed', ndas], ['Offers & bids', offers], ['Deals', deals]], pipelineValue: active.reduce((a, l) => a + (l.estValue || l.askingPrice || 0), 0),
      leadStages: LEAD_STAGES.map(st => [st, leads.filter(l => l.stage === st).length]), note: 'Live counts from the database.' };
  }
  @Get('investors') async investors(@Req() req: R) {
    requireStaff(req); const users = await this.db.select().from(S.users).where(eq(S.users.role, 'investor')).orderBy(desc(S.users.leadScore));
    const kyc = await this.db.select().from(S.kycCases).orderBy(desc(S.kycCases.submittedAt));
    const acts = await this.db.select().from(S.auditEvents).orderBy(desc(S.auditEvents.at)).limit(400);
    return users.filter(u => !u.deletedAt).map(u => { const k = kyc.find(c => c.userId === u.id); const a = acts.find(e => e.actorId === u.id); const score = Math.min(99, u.leadScore + acts.filter(e => e.actorId === u.id && ['view', 'download', 'nda_sign', 'offer_submit', 'bid_submit'].includes(e.action)).length * 4);
      return { id: u.id, name: u.name, email: u.email, type: u.investorType, country: u.country, tier: tierOf(u), tierLabel: TIER_LABEL[tierOf(u)], kyc: k?.status || 'none', risk: k?.risk || kycRisk({ investorType: u.investorType, country: u.country }), leadScore: score, lastActivity: a ? `${a.action} · ${a.objectType}` : '—', lastAt: a?.at || u.lastLoginAt, manager: u.accountManager || '—' }; });
  }
  /* ---------- Offers and deals ---------- */
  @Get('offers') async offers(@Req() req: R) {
    requireStaff(req); const rows = await this.db.select().from(S.offers).innerJoin(S.listings, eq(S.offers.listingId, S.listings.id)).leftJoin(S.users, eq(S.offers.userId, S.users.id)).where(sql`${S.offers.bidRoundId} is null`).orderBy(desc(S.offers.createdAt));
    return rows.map(r => ({ id: r.offers.id, investor: r.users?.name, email: r.users?.email, listing: r.listings.name, asking: r.listings.askingPrice, amount: r.offers.amount, vsAsking: +((r.offers.amount / r.listings.askingPrice - 1) * 100).toFixed(1), conditions: r.offers.conditions, financingType: r.offers.financingType, transferDate: r.offers.transferDate, proofFileName: r.offers.proofFileName, status: r.offers.status, counterAmount: r.offers.counterAmount, leadBand: r.offers.leadBand, leadScore: r.offers.leadScore, flagged: r.offers.flagged, followupAt: r.offers.followupAt, createdAt: r.offers.createdAt }));
  }
  @Post('offers/:id/decision') async decide(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    requireStaff(req, ['sales']); const b = parse(z.object({ decision: z.enum(['accepted', 'countered', 'rejected', 'in_review']), counterAmount: z.coerce.number().int().min(100000).optional() }), body);
    const o = (await this.db.select().from(S.offers).innerJoin(S.listings, eq(S.offers.listingId, S.listings.id)).where(eq(S.offers.id, id)))[0]; if (!o) throw new NotFoundException();
    if (!['submitted', 'in_review'].includes(o.offers.status)) throw new BadRequestException('This offer has already been decided.');
    if (b.decision === 'countered' && !b.counterAmount) throw new BadRequestException('Enter a counter amount.');
    await this.db.update(S.offers).set({ status: b.decision, counterAmount: b.counterAmount ?? null }).where(eq(S.offers.id, id));
    const uid = o.offers.userId!; const L = o.listings;
    if (b.decision === 'accepted') { await this.db.insert(S.deals).values({ listingId: L.id, offerId: id, userId: uid, price: o.offers.amount }); await this.db.update(S.listings).set({ status: 'under_offer' }).where(eq(S.listings.id, L.id)); await notify(this.db, uid, 'deal', 'Your offer was accepted', `${L.name} · €${o.offers.amount.toLocaleString('nl-NL')}. Next step: letter of intent.`, L.slug); }
    if (b.decision === 'countered') await notify(this.db, uid, 'offer', 'Counter-offer received', `${L.name} · counter at €${b.counterAmount!.toLocaleString('nl-NL')}`, L.slug);
    if (b.decision === 'rejected') await notify(this.db, uid, 'offer', 'Offer not accepted', `${L.name}. Thank you for your offer.`, L.slug);
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, uid)))[0]; if (u && b.decision !== 'in_review') await draftEmail(this.db, u.email, `Your offer on ${L.name}: ${b.decision}`, `Dear ${u.name}, your offer on ${L.name} has been ${b.decision}.`, 'offer_decision');
    await audit(this.db, req, 'admin_change', 'offer', id, { decision: b.decision, counter: b.counterAmount }); await logRule(this.db, 'pipeline', `Offer on ${L.name} ${b.decision}`); return { ok: true };
  }
  @Post('offers/:id/flag') async flag(@Req() req: R, @Param('id') id: string) { requireStaff(req, ['compliance']); const o = (await this.db.select().from(S.offers).where(eq(S.offers.id, id)))[0]; if (!o) throw new NotFoundException(); await this.db.update(S.offers).set({ flagged: !o.flagged }).where(eq(S.offers.id, id)); await audit(this.db, req, 'flag_transaction', 'offer', id, { flagged: !o.flagged }); return { flagged: !o.flagged }; }
  @Get('offers/:id/proof') async proof(@Req() req: R, @Res() res: Response, @Param('id') id: string) { requireStaff(req, ['sales', 'compliance']); const o = (await this.db.select().from(S.offers).where(eq(S.offers.id, id)))[0]; if (!o?.proofFileKey) throw new NotFoundException(); await audit(this.db, req, 'view', 'proof_of_funds', id); res.setHeader('Content-Disposition', `inline; filename="${(o.proofFileName || 'proof').replace(/[^\w.\- ]/g, '')}"`); res.setHeader('Cache-Control', 'no-store'); res.send(await readStored(this.db, o.proofFileKey)); }
  @Get('deals') async deals(@Req() req: R) { requireStaff(req); const rows = await this.db.select().from(S.deals).innerJoin(S.listings, eq(S.deals.listingId, S.listings.id)).leftJoin(S.users, eq(S.deals.userId, S.users.id)).orderBy(desc(S.deals.createdAt)); return rows.map(r => ({ id: r.deals.id, listing: r.listings.name, buyer: r.users?.name, price: r.deals.price, stage: r.deals.stage, stages: DEAL_STAGES })); }
  @Post('deals/:id/advance') async advance(@Req() req: R, @Param('id') id: string) {
    requireStaff(req, ['sales']); const d = (await this.db.select().from(S.deals).innerJoin(S.listings, eq(S.deals.listingId, S.listings.id)).where(eq(S.deals.id, id)))[0]; if (!d) throw new NotFoundException();
    if (d.deals.stage >= DEAL_STAGES.length - 1) throw new BadRequestException('This deal is complete.'); const stage = d.deals.stage + 1;
    await this.db.update(S.deals).set({ stage }).where(eq(S.deals.id, id)); if (stage === DEAL_STAGES.length - 1) await this.db.update(S.listings).set({ status: 'sold' }).where(eq(S.listings.id, d.listings.id));
    if (d.deals.userId) await notify(this.db, d.deals.userId, 'deal', 'Deal update: ' + DEAL_STAGES[stage], d.listings.name, d.listings.slug);
    await audit(this.db, req, 'admin_change', 'deal', id, { stage: DEAL_STAGES[stage] }); return { stage };
  }
  @Get('enquiries') async enquiries(@Req() req: R) { requireStaff(req); const rows = await this.db.select().from(S.enquiries).leftJoin(S.listings, eq(S.enquiries.listingId, S.listings.id)).orderBy(desc(S.enquiries.createdAt)); return rows.map(r => ({ ...r.enquiries, listing: r.listings?.name || 'General' })); }
  @Patch('enquiries/:id') async enquiryStatus(@Req() req: R, @Param('id') id: string, @Body() body: unknown) { requireStaff(req, ['sales']); const b = parse(z.object({ status: z.enum(['new', 'contacted', 'viewing_scheduled', 'closed']) }), body); await this.db.update(S.enquiries).set(b).where(eq(S.enquiries.id, id)); await logRule(this.db, 'pipeline', `Enquiry moved to ${b.status}`); return { ok: true }; }

  /* ---------- Bid rounds ---------- */
  @Get('bid-rounds') async rounds(@Req() req: R) {
    requireStaff(req); const rs = await this.db.select().from(S.bidRounds).innerJoin(S.listings, eq(S.bidRounds.listingId, S.listings.id));
    const out = []; for (const r of rs) { const bids = await this.db.select().from(S.offers).leftJoin(S.users, eq(S.offers.userId, S.users.id)).where(eq(S.offers.bidRoundId, r.bid_rounds.id)).orderBy(desc(S.offers.amount));
      out.push({ id: r.bid_rounds.id, listing: r.listings.name, closesAt: r.bid_rounds.closesAt, minBid: r.bid_rounds.minBid, status: r.bid_rounds.status, bidCount: bids.length, winnerOfferId: r.bid_rounds.winnerOfferId,
        ranking: r.bid_rounds.status === 'open' ? null : bids.map(b => ({ offerId: b.offers.id, bidder: b.offers.bidderLabel || b.users?.name, amount: b.offers.amount, conditions: b.offers.conditions, proof: !!b.offers.proofFileKey })) }); }
    return out;
  }
  @Post('bid-rounds/:id/close') async close(@Req() req: R, @Param('id') id: string) { requireStaff(req, ['sales']); const n = await this.jobs.closeRound(id, 'manual (demo)'); await audit(this.db, req, 'admin_change', 'bid_round', id, { action: 'close' }); return { closed: n }; }
  @Post('bid-rounds/:id/award') async award(@Req() req: R, @Param('id') id: string) {
    requireStaff(req, ['sales']); const r = (await this.db.select().from(S.bidRounds).innerJoin(S.listings, eq(S.bidRounds.listingId, S.listings.id)).where(eq(S.bidRounds.id, id)))[0]; if (!r) throw new NotFoundException();
    if (r.bid_rounds.status !== 'closed') throw new BadRequestException('Close the round first.');
    const bids = await this.db.select().from(S.offers).where(eq(S.offers.bidRoundId, id)).orderBy(desc(S.offers.amount)); if (!bids.length) throw new BadRequestException('No bids.');
    const win = bids[0]; await this.db.update(S.bidRounds).set({ status: 'awarded', winnerOfferId: win.id }).where(eq(S.bidRounds.id, id));
    await this.db.update(S.offers).set({ status: 'accepted' }).where(eq(S.offers.id, win.id)); for (const b of bids.slice(1)) await this.db.update(S.offers).set({ status: 'rejected' }).where(eq(S.offers.id, b.id));
    if (win.userId) await this.db.insert(S.deals).values({ listingId: r.listings.id, offerId: win.id, userId: win.userId, price: win.amount });
    await this.db.update(S.listings).set({ status: 'under_offer' }).where(eq(S.listings.id, r.listings.id));
    for (const b of bids) if (b.userId) await notify(this.db, b.userId, 'bid', b.id === win.id ? 'You won the bid round' : 'Bid round result', b.id === win.id ? `${r.listings.name} · your bid of €${b.amount.toLocaleString('nl-NL')} was the highest.` : `${r.listings.name} · another bid was selected. Thank you for taking part.`, r.listings.slug);
    await logRule(this.db, 'bidrounds', `${r.listings.name} awarded to ${win.bidderLabel} · ${bids.length - 1} unsuccessful bidders notified`); await audit(this.db, req, 'admin_change', 'bid_round', id, { action: 'award', winner: win.id }); return { winner: win.bidderLabel, amount: win.amount };
  }

  /* ---------- Acquisition pipeline (sell side) ---------- */
  @Get('leads') async leads(@Req() req: R) { requireStaff(req); return this.db.select().from(S.acquisitionLeads).orderBy(desc(S.acquisitionLeads.createdAt)); }
  @Post('leads') async addLead(@Req() req: R, @Body() body: unknown) { requireStaff(req, ['acquisition']); const b = parse(z.object({ address: z.string().min(3).max(160), propertyType: z.string().max(60), units: z.coerce.number().int().min(1).max(1000), askingPrice: z.coerce.number().int().min(0).optional(), source: z.string().max(60) }), body); const [l] = await this.db.insert(S.acquisitionLeads).values(b).returning(); await logRule(this.db, 'acquisition', `Lead added · ${b.address}`); return l; }
  @Patch('leads/:id') async patchLead(@Req() req: R, @Param('id') id: string, @Body() body: unknown) { const u = requireStaff(req, ['acquisition']); const b = parse(z.object({ stage: z.enum(LEAD_STAGES as [string, ...string[]]).optional(), ownerName: z.string().max(80).optional(), estValue: z.coerce.number().int().optional(), lostReason: z.string().max(200).optional() }), body); await this.db.update(S.acquisitionLeads).set(b).where(eq(S.acquisitionLeads.id, id)); await logRule(this.db, 'acquisition', `Lead ${id.slice(0, 6)} updated by ${u.name}${b.stage ? ' → ' + b.stage : ''}`); return { ok: true }; }

  /* ---------- Listings: BAG lookup, create, publish, status, price ---------- */
  @Get('bag') bag(@Req() req: R, @Query('postcode') postcode: string, @Query('number') number: string) { requireStaff(req, ['acquisition', 'editor']); const r = bagLookup(postcode, number); if (!r) throw new BadRequestException('Enter a Dutch postcode (1234 AB) and a house number.'); return r; }
  @Get('listings') async listings(@Req() req: R) { requireStaff(req); const rows = await this.db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).orderBy(desc(S.listings.createdAt)); return rows.map(r => ({ id: r.listings.id, slug: r.listings.slug, name: r.listings.name, city: r.properties.city, status: r.listings.status, dealType: r.listings.dealType, askingPrice: r.listings.askingPrice, previousPrice: r.listings.previousPrice, publishedAt: r.listings.publishedAt })); }
  @Post('listings') async createListing(@Req() req: R, @Body() body: unknown) {
    requireStaff(req, ['acquisition', 'editor']);
    const b = parse(z.object({ postcode: z.string(), number: z.string(), name: z.string().trim().min(3).max(100), category: z.enum(['portfolios', 'buildings', 'homes']), dealType: z.enum(['direct', 'portfolio', 'off_market']), askingPrice: z.coerce.number().int().min(100000).max(1e9), grossRentAnnual: z.coerce.number().int().min(0).max(1e8), units: z.coerce.number().int().min(1).max(500), description: z.string().max(4000).optional() }), body);
    const bag = bagLookup(b.postcode, b.number); if (!bag) throw new BadRequestException('BAG lookup failed: check the postcode and number.');
    const [p] = await this.db.insert(S.properties).values({ address: bag.address, postcode: bag.postcode, city: bag.city, district: 'BAG verified', lat: bag.lat, lng: bag.lng, areaM2: bag.areaM2, buildYear: bag.buildYear, category: b.category, propertyType: { portfolios: 'Residential portfolio', buildings: 'Apartment building', homes: 'Single home' }[b.category], tenure: 'Freehold (eigen grond)', energyLabel: bag.energyLabel, wozValue: Math.round(b.askingPrice * 1.02), wozYear: 2026, image: b.category === 'homes' ? 'r1' : b.category === 'portfolios' ? 'p1' : 'p2' }).returning();
    const per = Math.floor(bag.areaM2 / b.units); for (let i = 1; i <= b.units; i++) await this.db.insert(S.units).values({ propertyId: p.id, ref: String(i).padStart(2, '0'), areaM2: per, rentMonthly: Math.round(b.grossRentAnnual / b.units / 12), rentType: 'mid', energyLabel: bag.energyLabel });
    const slug = b.name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '-' + Date.now().toString(36).slice(-4);
    const [l] = await this.db.insert(S.listings).values({ propertyId: p.id, slug, name: b.name, description: b.description || 'Created from a BAG lookup. Add verified copy, media and documents before publishing.', highlights: ['BAG-verified address and building data', 'Own stock'], status: 'draft', dealType: b.dealType, askingPrice: b.askingPrice, grossRentAnnual: b.grossRentAnnual, operatingCostsAnnual: Math.round(b.grossRentAnnual * 0.22), occupancy: 100 }).returning();
    for (const [folder, file, dl] of [['Legal', 'Kadaster ownership extract.pdf', false], ['Technical', 'Building data (BAG).pdf', true]] as const) await this.db.insert(S.documents).values({ listingId: l.id, folder, filename: file, downloadAllowed: dl, storageKey: await saveFile(this.db, await samplePdf(file.replace('.pdf', ''), `${b.name} · ${bag.address}, ${bag.postcode} ${bag.city}`, ['Generated when the listing was created in the staff workspace.']), file) });
    await audit(this.db, req, 'admin_change', 'listing', l.id, { action: 'create', bag: bag.source }); return { id: l.id, slug, bag };
  }
  @Post('listings/:id/publish') async publish(@Req() req: R, @Param('id') id: string) {
    requireStaff(req, ['acquisition', 'editor']); const l = (await this.db.select().from(S.listings).where(eq(S.listings.id, id)))[0]; if (!l) throw new NotFoundException(); if (l.status !== 'draft') throw new BadRequestException('Only drafts can be published.');
    const proUntil = l.dealType === 'off_market' ? new Date(Date.now() + 48 * 36e5) : null;
    await this.db.update(S.listings).set({ status: 'available', publishedAt: new Date(), proEarlyAccessUntil: proUntil }).where(eq(S.listings.id, id));
    const n = await runMatching(this.db, id, 'publish'); if (proUntil) await this.jobs.schedule('offmarket_release', proUntil, { listingId: id });
    await audit(this.db, req, 'admin_change', 'listing', id, { action: 'publish' }); return { matched: n, proEarlyAccessUntil: proUntil };
  }
  @Patch('listings/:id') async patchListing(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    requireStaff(req, ['acquisition', 'editor', 'sales']); const b = parse(z.object({ status: z.enum(LISTING_STATUSES as [string, ...string[]]).optional(), askingPrice: z.coerce.number().int().min(100000).max(1e9).optional() }), body);
    const l = (await this.db.select().from(S.listings).where(eq(S.listings.id, id)))[0]; if (!l) throw new NotFoundException();
    const set: any = {}; if (b.status) set.status = b.status; if (b.askingPrice && b.askingPrice !== l.askingPrice) { set.askingPrice = b.askingPrice; set.previousPrice = l.askingPrice; }
    await this.db.update(S.listings).set(set).where(eq(S.listings.id, id)); let alerts = 0; if (set.askingPrice) alerts = await priceChanged(this.db, id, l.askingPrice, b.askingPrice!);
    await audit(this.db, req, 'admin_change', 'listing', id, b); return { ok: true, alerts };
  }

  /* ---------- Compliance ---------- */
  @Get('kyc') async kyc(@Req() req: R) { requireStaff(req, ['compliance']); const rows = await this.db.select().from(S.kycCases).innerJoin(S.users, eq(S.kycCases.userId, S.users.id)).orderBy(desc(S.kycCases.submittedAt)); return rows.map(r => ({ id: r.kyc_cases.id, name: r.users.name, email: r.users.email, type: r.users.investorType, country: r.users.country, status: r.kyc_cases.status, risk: r.kyc_cases.risk, pep: r.kyc_cases.pep, kvk: r.kyc_cases.kvk, ubo: r.kyc_cases.uboName, ticket: r.kyc_cases.ticket, idFileName: r.kyc_cases.idFileName, proofFileName: r.kyc_cases.proofFileName, submittedAt: r.kyc_cases.submittedAt, decidedAt: r.kyc_cases.decidedAt, notes: r.kyc_cases.notes, checks: `ID uploaded · liveness confirmed · sanctions screening clear (simulated)${r.kyc_cases.kvk ? ' · KVK ' + r.kyc_cases.kvk : ''}${r.kyc_cases.uboName ? ' · UBO ' + r.kyc_cases.uboName : ''}` })); }
  @Get('kyc/:id/file/:which') async kycFile(@Req() req: R, @Res() res: Response, @Param('id') id: string, @Param('which') which: string) { requireStaff(req, ['compliance']); const k = (await this.db.select().from(S.kycCases).where(eq(S.kycCases.id, id)))[0]; const key = which === 'id' ? k?.idFileKey : k?.proofFileKey; if (!key) throw new NotFoundException(); await audit(this.db, req, 'view', 'kyc_document', id, { which }); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Disposition', 'inline'); res.send(await readStored(this.db, key)); }
  @Post('kyc/:id/decision') async kycDecide(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    const staff = requireStaff(req, ['compliance']); const b = parse(z.object({ decision: z.enum(['approved', 'rejected']), notes: z.string().max(500).optional() }), body);
    const k = (await this.db.select().from(S.kycCases).where(eq(S.kycCases.id, id)))[0]; if (!k) throw new NotFoundException(); if (k.status !== 'pending') throw new BadRequestException('This case has already been decided.');
    if (k.risk === 'high' && b.decision === 'approved' && !b.notes) throw new BadRequestException('High-risk cases need enhanced due diligence notes before approval.');
    await this.db.update(S.kycCases).set({ status: b.decision, notes: b.notes, reviewerId: staff.id, decidedAt: new Date(), nextReviewAt: new Date(Date.now() + 365 * 864e5) }).where(eq(S.kycCases.id, id));
    if (b.decision === 'approved') { await this.db.update(S.users).set({ verified: true, accountManager: 'Sanne de Wit' }).where(eq(S.users.id, k.userId)); await notify(this.db, k.userId, 'kyc', 'You are verified', 'You can now open data rooms, make offers and join bid rounds.'); }
    else await notify(this.db, k.userId, 'kyc', 'Verification not approved', b.notes || 'Please contact us for details.');
    await audit(this.db, req, 'kyc_decision', 'kyc_case', id, { decision: b.decision }); await logRule(this.db, 'compliance', `KYC case ${id.slice(0, 6)} ${b.decision} by ${staff.name}`); return { ok: true };
  }
  @Get('audit') async auditLog(@Req() req: R, @Query('limit') limit = '100') { requireStaff(req, ['compliance']); return this.db.select().from(S.auditEvents).orderBy(desc(S.auditEvents.at)).limit(Math.min(500, Number(limit) || 100)); }

  /* ---------- Config, automation, outbox, jobs ---------- */
  @Get('config') async getCfg(@Req() req: R) { requireStaff(req); return this.db.select().from(S.config).orderBy(asc(S.config.key)); }
  @Put('config') async putCfg(@Req() req: R, @Body() body: unknown) { requireStaff(req, ['admin']); const b = parse(z.record(z.string(), z.coerce.number().min(0).max(1e8)), body); for (const [k, v] of Object.entries(b)) if (CONFIG_DEFAULTS.some(c => c.key === k)) await this.db.update(S.config).set({ value: v }).where(eq(S.config.key, k)); await audit(this.db, req, 'admin_change', 'config', null, b); return this.db.select().from(S.config); }
  @Get('automation') async automation(@Req() req: R) { requireStaff(req); const s = await this.db.select().from(S.automationSettings); const log = await this.db.select().from(S.automationLog).orderBy(desc(S.automationLog.at)).limit(60); const runs = await this.db.select({ rule: S.automationLog.rule, n: sql<number>`count(*)::int` }).from(S.automationLog).groupBy(S.automationLog.rule); return { settings: s, log, runs: Object.fromEntries(runs.map(r => [r.rule, Number(r.n)])) }; }
  @Put('automation/:key') async setRule(@Req() req: R, @Param('key') key: string, @Body() body: unknown) { requireStaff(req, ['admin']); const b = parse(z.object({ enabled: z.boolean() }), body); await this.db.insert(S.automationSettings).values({ key, enabled: b.enabled }).onConflictDoUpdate({ target: S.automationSettings.key, set: { enabled: b.enabled } }); await audit(this.db, req, 'admin_change', 'automation', key, b); return { ok: true }; }
  @Get('outbox') async outboxList(@Req() req: R) { requireStaff(req); return this.db.select().from(S.outbox).orderBy(desc(S.outbox.createdAt)).limit(50); }
  @Get('jobs') async jobList(@Req() req: R) { requireStaff(req); return this.db.select().from(S.jobs).orderBy(desc(S.jobs.runAt)).limit(30); }
  @Post('jobs/run') async runJobs(@Req() req: R) { requireStaff(req, ['admin']); return { ran: await this.jobs.tick() }; }
}
