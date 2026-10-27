/* Institutional layer: private deal rooms with a structured sale process, Q&A log, analysis pack, scenario engine,
   investment-committee memo, mandate matching, the AI analyst and the public market report. */
import { Controller, Get, Post, Param, Body, Req, Res, Inject, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { eq, and, desc, inArray, isNull, sql } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireUser, requireStaff, viewerOf, audit, notify, draftEmail, getConfig, serializeListing } from '../common';
import { isQualified, offMarketState, isStaff, cfg } from '../domain';
import { MARKET, MARKET_ASOF, COMPS, mandateFit, scenario, stressTests } from '../analytics';
import { askAnalyst } from '../ai';
import { memoPdf, watermark } from '../pdf';
import { parse } from './public.controller';
import { getListing, hasNda, listListings, unitCounts } from './listings.service';
import { analysisPack } from './analysis.service';

const eur = (n: number) => '€' + Math.round(n).toLocaleString('nl-NL');
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 30, windowMs = 36e5) { const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs); if (a.length >= max) throw new HttpException('You have reached the hourly limit for the AI analyst. Try again later.', 429); a.push(now); hits.set(key, a); }

@Controller()
export class InstitutionalController {
  constructor(@Inject('DB') private db: DB) {}
  private async process(listingId: string) { return (await this.db.select().from(S.saleProcesses).where(eq(S.saleProcesses.listingId, listingId)))[0] || null; }
  private summary(pr: any) { const cur = pr.stages[pr.stage]; const next = pr.stages.slice(pr.stage).find((s: any) => s.deadline); return { stage: pr.stage, stageLabel: cur?.label, stageKey: cur?.key, nextDeadline: next ? { label: next.label, at: next.deadline } : null, stages: pr.stages.length, minTicket: pr.minTicket }; }

  /** Private deal rooms. Everyone sees the codename teaser and the process stage; details open to qualified investors. */
  @Get('institutional/deals') async deals(@Req() req: R) {
    const v = viewerOf(req); const c = await getConfig(this.db);
    const rows = await this.db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).where(eq(S.listings.dealType, 'institutional')).orderBy(desc(S.listings.askingPrice));
    const counts = await unitCounts(this.db, rows.map(r => r.properties.id)); const out = [];
    for (const { listings: l, properties: p } of rows) { if (['draft', 'withdrawn', 'sold'].includes(l.status)) continue; const pr = await this.process(l.id);
      const parties = Number((await this.db.select({ n: sql<number>`count(*)::int` }).from(S.ndaSignatures).where(eq(S.ndaSignatures.listingId, l.id)))[0].n);
      out.push({ ...serializeListing(l, p, v, c), unitsCount: counts[p.id] || 1, process: pr ? this.summary(pr) : null, parties }); }
    return { qualified: isQualified(v), minTicket: cfg(c, 'institutional_min_ticket'), deals: out };
  }

  @Get('listings/:slug/analysis') async analysis(@Req() req: R, @Param('slug') slug: string) {
    const r = await analysisPack(this.db, slug, viewerOf(req));
    if (r.status === 404) throw new NotFoundException('Listing not found'); if (r.status === 401) throw new HttpException(r.message, 401); if (r.status === 403) throw new ForbiddenException(r.message);
    return r.pack;
  }
  @Post('analysis/scenario') async scenarioRun(@Req() req: R, @Body() body: unknown) {
    const b = parse(z.object({ slug: z.string(), interest: z.coerce.number().min(0).max(15).optional(), ltv: z.coerce.number().min(0).max(85).optional(), vacancy: z.coerce.number().min(0).max(50).optional(), rentGrowth: z.coerce.number().min(-5).max(10).optional(), exitYield: z.coerce.number().min(1).max(15).optional(), years: z.coerce.number().int().min(1).max(20).optional() }), body);
    const r = await analysisPack(this.db, b.slug, viewerOf(req)); if (r.status !== 200) throw new HttpException((r as any).message || 'Not found', r.status);
    if (!r.pack.scenarioInputs.rent) throw new BadRequestException('This property has no rental income to model.');
    const { slug, ...o } = b; const inputs = { ...r.pack.scenarioInputs, ...Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) };
    return { scenario: scenario(inputs), base: r.pack.scenarioBase, stress: stressTests(inputs, r.pack.regulation?.rentAfter ?? null) };
  }

  /** Draft investment-committee memo as a watermarked PDF. Verified investors and staff. */
  @Get('listings/:slug/memo') async memo(@Req() req: R, @Res() res: Response, @Param('slug') slug: string) {
    const u = requireUser(req); if (!u.verified && !isStaff(u)) throw new ForbiddenException('The memo generator is for verified investors.');
    const r = await analysisPack(this.db, slug, viewerOf(req)); if (r.status !== 200) throw new HttpException((r as any).message || 'Not found', r.status);
    const k = r.pack; const L = k.listing; const b = k.scenarioBase; const v = k.valuation; const pct = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toFixed(2) + '%';
    const sections = [
      { heading: '1. Summary', lines: [`${L.name}: ${L.propertyType} in ${L.city}${L.district ? ' (' + L.district + ')' : ''}. ${L.units} units, ${L.areaM2.toLocaleString('nl-NL')} m², built ${L.buildYear}, energy label ${L.energyLabel}, ${L.tenure}.`, `Asking price ${eur(L.askingPrice)} k.k.; total acquisition cost ${eur(k.acquisition.total)} including ${k.acquisition.taxRate}% transfer tax.`, ...(L.bar ? [`Gross rent ${eur(L.grossRentAnnual)} a year: BAR ${pct(L.bar)}, NIY ${pct(b?.entryNiy)}. Occupancy ${L.occupancy ?? '—'}%.`] : [])] },
      { heading: '2. Valuation', lines: [`Automated estimate ${eur(v.point)} (range ${eur(v.low)} – ${eur(v.high)}); asking is ${v.vsAsking >= 0 ? '+' : ''}${v.vsAsking}% vs the midpoint: ${v.verdict.toLowerCase()}.`, `Method: ${v.method}. Benchmarks ${v.asOf}.`, ...k.comparables.map(c => `- ${c.name}, ${c.city}: ${c.units} units, ${eur(c.price)}, BAR ${c.bar}%, ${eur(c.perUnit)} per unit (${c.date}, ${c.buyer}).`)] },
      ...(b ? [{ heading: '3. Returns and stress tests', lines: [`Base case: LTV ${b.inputs.ltv}%, interest ${b.inputs.interest}%, rent growth ${b.inputs.rentGrowth}%, ${b.inputs.years}-year hold, exit yield ${b.inputs.exitYield}%.`, `Levered IRR ${pct(b.leveredIrr)}, unlevered IRR ${pct(b.unleveredIrr)}, year-1 cash-on-cash ${pct(b.cocYear1)}, DSCR ${b.dscr ?? '—'}, equity multiple ${b.equityMultiple}x, equity ${eur(b.equity)}.`, ...k.stress.map(s => `- ${s.name}: levered IRR ${pct(s.leveredIrr)}, DSCR ${s.dscr ?? '—'}, multiple ${s.equityMultiple ?? '—'}x.`)] }] : []),
      { heading: '4. Rent regulation (WWS)', lines: k.regulation ? [`Indicative segments: ${k.regulation.segments.social} social, ${k.regulation.segments.mid} mid-rent, ${k.regulation.segments.free} free-sector.`, `${k.regulation.affected} units above their points maximum; exposure ${eur(k.regulation.annualLoss)} a year (${k.regulation.lossPct}% of rent).`, k.regulation.note] : ['Unit-level assessment requires the rent roll (verification and the property NDA).'] },
      { heading: '5. ESG', lines: [`Label mix: ${k.esg.distribution.map(d => d.label + ' ' + d.units).join(', ')}; ${k.esg.shareAorB}% of floor area label A/B.`, `Energy intensity ~${k.esg.energyIntensity} kWh/m²/yr; ~${k.esg.co2PerM2} kg CO2/m²/yr. EU Taxonomy: ${k.esg.taxonomyAligned ? 'likely aligned' : 'not aligned on the label test'}. Upgrade capex to label B ~${eur(k.esg.upgradeCapexToB)}.`] },
      { heading: '6. Risks and mitigants', lines: k.flags.map(f => `- [${f.level.toUpperCase()}] ${f.title}: ${f.detail} (${f.source})`) },
      { heading: '7. Open points for the committee', lines: ['- Confirm the rent roll against lease agreements and the WWS points survey per unit.', '- Technical due diligence: MJOP capex, asbestos, installations.', '- Tax structuring (asset vs share deal) and financing terms.', '- Decision requested: approval to submit an indicative / binding bid within the stated range.'] },
    ];
    const pdf = await memoPdf(`Investment memo · ${L.name}`, `Prepared ${new Date().toISOString().slice(0, 10)} for ${u.companyName || u.name} · access: ${k.access}`, sections, 'Draft generated from platform data. Not investment advice. Figures indicative; verify in the data room. Portfolio & Prime demo.');
    const stamped = await watermark(pdf, `${u.name} · ${u.email} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    await audit(this.db, req, 'memo_generated', 'listing', r.l.id, { slug });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="IC-memo-${slug}.pdf"`); res.setHeader('Cache-Control', 'no-store'); res.send(stamped);
  }

  /* ---------- Structured sale process ---------- */
  private async procGate(req: R, slug: string) {
    const u = requireUser(req); const v = viewerOf(req); if (!isQualified(v)) throw new ForbiddenException('Private deal rooms are open to verified institutional investors.');
    const x = await getListing(this.db, slug); if (!x || x.l.dealType !== 'institutional' || offMarketState(x.l.dealType, null, v) !== 'open') throw new NotFoundException();
    const pr = await this.process(x.l.id); if (!pr) throw new NotFoundException('No sale process for this listing.'); return { u, x, pr };
  }
  @Get('listings/:slug/process') async getProcess(@Req() req: R, @Param('slug') slug: string) {
    const { u, x, pr } = await this.procGate(req, slug); const nda = isStaff(u) || await hasNda(this.db, u.id, x.l.id);
    const bids = await this.db.select().from(S.offers).where(and(eq(S.offers.listingId, x.l.id), inArray(S.offers.status, ['indicative', 'final'])));
    const qa = nda ? await this.db.select().from(S.qaItems).where(eq(S.qaItems.listingId, x.l.id)).orderBy(desc(S.qaItems.createdAt)) : [];
    const mine = bids.filter(b => b.userId === u.id).map(b => ({ id: b.id, amount: b.amount, status: b.status, financingType: b.financingType, conditions: b.conditions, at: b.createdAt }));
    return { ...this.summary(pr), stagesList: pr.stages.map((s, i) => ({ ...s, state: i < pr.stage ? 'done' : i === pr.stage ? 'current' : 'next' })), advisor: pr.advisor, nda, shortlisted: pr.shortlist.includes(u.id),
      bidsReceived: { indicative: bids.filter(b => b.status === 'indicative').length, final: bids.filter(b => b.status === 'final').length }, myBids: mine,
      qa: qa.filter(q => q.answer || q.userId === u.id || isStaff(u)).map(q => ({ id: q.id, category: q.category, question: q.question, answer: q.answer, answeredAt: q.answeredAt, at: q.createdAt, mine: q.userId === u.id })) };
  }
  @Post('listings/:slug/process/bids') async processBid(@Req() req: R, @Param('slug') slug: string, @Body() body: unknown) {
    const { u, x, pr } = await this.procGate(req, slug); if (isStaff(u)) throw new ForbiddenException('Staff cannot bid.');
    if (!(await hasNda(this.db, u.id, x.l.id))) throw new ForbiddenException('Sign the NDA for this deal room first.');
    const key = pr.stages[pr.stage]?.key; if (key !== 'indicative' && key !== 'final') throw new BadRequestException(`Bids are not open in the current stage (${pr.stages[pr.stage]?.label}).`);
    if (key === 'final' && !pr.shortlist.includes(u.id)) throw new ForbiddenException('Final bids are open to shortlisted parties only.');
    const b = parse(z.object({ amount: z.coerce.number().int().min(pr.minTicket || 1, `The minimum ticket is ${eur(pr.minTicket || 0)}`).max(5e9), financingType: z.enum(['Cash', 'Mixed', 'Debt-financed']), structure: z.enum(['Share deal', 'Asset deal', 'Either']), conditions: z.string().max(400).optional(), message: z.string().max(2000).optional(), acceptRules: z.literal(true) }), body);
    const status = key === 'final' ? 'final' : 'indicative';
    const conditions = [status === 'final' ? 'Final binding bid' : 'Indicative bid', b.structure, ...(b.conditions ? [b.conditions] : [])];
    const mine = (await this.db.select().from(S.offers).where(and(eq(S.offers.listingId, x.l.id), eq(S.offers.userId, u.id), eq(S.offers.status, status))))[0];
    if (mine) await this.db.update(S.offers).set({ amount: b.amount, financingType: b.financingType, conditions, message: b.message }).where(eq(S.offers.id, mine.id));
    else await this.db.insert(S.offers).values({ listingId: x.l.id, userId: u.id, bidderLabel: u.companyName || u.name, amount: b.amount, financingType: b.financingType, conditions, message: b.message, status, leadScore: 85, leadBand: 'Hot' });
    await audit(this.db, req, 'process_bid', 'listing', x.l.id, { amount: b.amount, status, updated: !!mine });
    await notify(this.db, u.id, 'bid', status === 'final' ? 'Final bid received' : 'Indicative bid received', `${x.l.name} · ${eur(b.amount)}. ${status === 'final' ? 'Binding subject to the SPA.' : 'Non-binding. The shortlist follows after the deadline.'}`, x.l.slug);
    await draftEmail(this.db, u.email, `${x.l.name}: bid received`, `Dear ${u.name}, we received your ${status} bid of ${eur(b.amount)} for ${x.l.name}. Bids stay confidential.`, 'bid');
    return { ok: true, status, updated: !!mine };
  }
  @Post('listings/:slug/qa') async ask(@Req() req: R, @Param('slug') slug: string, @Body() body: unknown) {
    const { u, x } = await this.procGate(req, slug); if (!isStaff(u) && !(await hasNda(this.db, u.id, x.l.id))) throw new ForbiddenException('Sign the NDA for this deal room first.');
    const b = parse(z.object({ category: z.enum(['Financial', 'Legal', 'Technical', 'Tax', 'Process', 'General']), question: z.string().trim().min(10).max(1500) }), body);
    const [q] = await this.db.insert(S.qaItems).values({ listingId: x.l.id, userId: u.id, category: b.category, question: b.question }).returning();
    await audit(this.db, req, 'qa_question', 'listing', x.l.id, { category: b.category }); return { id: q.id };
  }

  /* ---------- Staff: processes and Q&A ---------- */
  @Get('admin/processes') async adminProcesses(@Req() req: R) {
    const u = requireStaff(req, ['admin', 'sales', 'compliance', 'readonly']); const seeAmounts = ['admin', 'sales'].includes(u.role);
    const rows = await this.db.select().from(S.saleProcesses).innerJoin(S.listings, eq(S.saleProcesses.listingId, S.listings.id));
    const out = [];
    for (const { sale_processes: pr, listings: l } of rows) {
      const bids = await this.db.select().from(S.offers).where(and(eq(S.offers.listingId, l.id), inArray(S.offers.status, ['indicative', 'final']))).orderBy(desc(S.offers.amount));
      const open = await this.db.select().from(S.qaItems).where(and(eq(S.qaItems.listingId, l.id), isNull(S.qaItems.answer)));
      out.push({ id: pr.id, slug: l.slug, name: l.name, askingPrice: l.askingPrice, ...this.summary(pr), stagesList: pr.stages, shortlist: pr.shortlist.length,
        bids: bids.map(b => ({ id: b.id, bidder: b.bidderLabel, amount: seeAmounts ? b.amount : null, vsGuide: seeAmounts ? Math.round(b.amount / l.askingPrice * 1000) / 10 : null, status: b.status, financing: b.financingType, conditions: b.conditions, at: b.createdAt })),
        openQuestions: open.map(q => ({ id: q.id, category: q.category, question: q.question, at: q.createdAt })) });
    }
    return out;
  }
  @Post('admin/processes/:id/advance') async advance(@Req() req: R, @Param('id') id: string) {
    requireStaff(req, ['admin', 'sales']); const pr = (await this.db.select().from(S.saleProcesses).where(eq(S.saleProcesses.id, id)))[0]; if (!pr) throw new NotFoundException();
    if (pr.stage >= pr.stages.length - 1) throw new BadRequestException('The process is already at its last stage.');
    const stage = pr.stage + 1; const key = pr.stages[stage].key; let shortlist = pr.shortlist;
    const l = (await this.db.select().from(S.listings).where(eq(S.listings.id, pr.listingId)))[0];
    if (key === 'shortlist') { // shortlist = the best indicative bids (top 3)
      const bids = await this.db.select().from(S.offers).where(and(eq(S.offers.listingId, pr.listingId), eq(S.offers.status, 'indicative'))).orderBy(desc(S.offers.amount));
      shortlist = bids.slice(0, 3).map(b => b.userId!).filter(Boolean);
      for (const b of bids) if (b.userId) await notify(this.db, b.userId, 'bid', shortlist.includes(b.userId) ? 'You are on the shortlist' : 'Shortlist update', shortlist.includes(b.userId) ? `${l.name}: you are invited to management presentations and the full data room.` : `${l.name}: thank you for your indicative bid; you were not shortlisted this time.`, l.slug);
    }
    await this.db.update(S.saleProcesses).set({ stage, shortlist }).where(eq(S.saleProcesses.id, id));
    await audit(this.db, req, 'process_advance', 'listing', pr.listingId, { stage: pr.stages[stage].label }); return { ok: true, stage: pr.stages[stage].label, shortlist: shortlist.length };
  }
  @Post('admin/qa/:id/answer') async answer(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    const u = requireStaff(req, ['admin', 'sales']); const b = parse(z.object({ answer: z.string().trim().min(5).max(4000) }), body);
    const q = (await this.db.select().from(S.qaItems).where(eq(S.qaItems.id, id)))[0]; if (!q) throw new NotFoundException();
    await this.db.update(S.qaItems).set({ answer: b.answer, answeredBy: 'Capital Markets team', answeredAt: new Date() }).where(eq(S.qaItems.id, id));
    const l = (await this.db.select().from(S.listings).where(eq(S.listings.id, q.listingId)))[0];
    if (q.userId) await notify(this.db, q.userId, 'qa', 'Your Q&A question was answered', `${l.name} · ${q.category}`, l.slug);
    await audit(this.db, req, 'qa_answer', 'qa', id, { by: u.email }); return { ok: true };
  }

  /* ---------- Mandate matching ---------- */
  @Get('me/mandate') async mandate(@Req() req: R) {
    const u = requireUser(req); const box = (await this.db.select().from(S.buyBoxes).where(eq(S.buyBoxes.userId, u.id)))[0] || null;
    const ls = (await listListings(this.db, viewerOf(req), {})).filter((l: any) => !l.locked && ['available', 'coming_soon'].includes(l.status));
    const matches = ls.map((l: any) => ({ slug: l.slug, name: l.name, city: l.city, image: l.image, dealType: l.dealType, price: l.askingPrice ?? null, priceDisplay: l.priceDisplay, bar: l.bar, units: l.unitsCount, ...mandateFit({ city: l.city, category: l.category, askingPrice: l.askingPrice ?? 0, bar: l.bar ?? 0, energyLabel: l.energyLabel || 'C', dealType: l.dealType }, box) }))
      .sort((a: any, b: any) => b.score - a.score);
    return { hasBox: !!box, matches };
  }

  /* ---------- AI analyst ---------- */
  @Post('ai/ask') async ai(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); rateLimit(u.id);
    const b = parse(z.object({ question: z.string().trim().min(3).max(1000), slug: z.string().max(80).optional(), history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) })).max(12).optional() }), body);
    const a = await askAnalyst(this.db, viewerOf(req), b); if ('error' in a) throw new HttpException(a.message, a.error);
    await this.db.insert(S.aiLogs).values({ userId: u.id, listingSlug: b.slug || null, question: b.question, mode: a.mode });
    return a;
  }
  @Get('ai/status') status() { return { mode: process.env.ANTHROPIC_API_KEY ? 'claude' : 'engine', model: process.env.ANTHROPIC_API_KEY ? (process.env.PP_AI_MODEL || 'claude-opus-5-5') : null }; }

  /* ---------- Public market report (lead magnet; full PDF for members) ---------- */
  @Get('market/report') async report() {
    const c = await getConfig(this.db);
    const live = await this.db.select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(asking_price),0)::bigint` }).from(S.listings).where(inArray(S.listings.status, ['available', 'coming_soon', 'under_offer']));
    return { asOf: MARKET_ASOF, cities: Object.entries(MARKET).map(([city, m]) => ({ city, ...m })), transactions: COMPS.map(({ buyer, ...x }) => ({ ...x, buyerType: buyer })),
      transferTax: cfg(c, 'transfer_tax_residential_investor'), wws: { social: cfg(c, 'wws_social_points'), mid: cfg(c, 'wws_mid_points'), perPoint: cfg(c, 'wws_rent_per_point') },
      platform: { liveDeals: Number(live[0].n), liveVolume: Number(live[0].v) } };
  }
}
