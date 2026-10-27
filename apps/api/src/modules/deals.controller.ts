import { Controller, Get, Post, Param, Body, Req, Res, Query, Inject, UseInterceptors, UploadedFiles, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireUser, requireFeature, audit, notify, logRule, ruleOn, draftEmail, saveFile, readStored, signToken, readToken, viewerOf } from '../common';
import { leadScore, offMarketState, isStaff, canSeeListing, hasFeature } from '../domain';
import { parse } from './public.controller';
import { checkFile } from './account.controller';
import { getListing, hasNda } from './listings.service';
import { watermark } from '../pdf';

@Controller()
export class DealsController {
  constructor(@Inject('DB') private db: DB) {}
  private async listingOr404(slug: string, req: R) { const x = await getListing(this.db, slug); if (!x || !canSeeListing(viewerOf(req), x.l.id) || ['draft', 'withdrawn'].includes(x.l.status) || offMarketState(x.l.dealType, x.l.proEarlyAccessUntil, viewerOf(req)) !== 'open') throw new NotFoundException('Listing not found'); return x; }
  /** Data-room gate (plan: login, KYC verified, NDA signed, 2FA, then a signed URL). */
  private async roomGate(req: R, listingId: string) {
    const u = requireUser(req); if (isStaff(u)) return u;
    const v = viewerOf(req); if (!canSeeListing(v, listingId)) throw new NotFoundException();
    if (!hasFeature(v, 'dataroom') && !hasFeature(v, 'institutional')) throw new ForbiddenException('The data room is not included in your access. Ask your account manager.');
    if (!u.verified) throw new ForbiddenException('Complete verification (KYC) first.');
    if (!(await hasNda(this.db, u.id, listingId))) throw new ForbiddenException('Accept the NDA for this property first.');
    if (!u.twofaEnabled || !u.twofaPassed) throw new ForbiddenException('Two-factor login is required for the data room.');
    return u;
  }

  @Post('listings/:slug/nda') async nda(@Req() req: R, @Param('slug') slug: string, @Body() body: unknown) {
    const u = requireUser(req); const x = await this.listingOr404(slug, req);
    requireFeature(req, x.l.dealType === 'institutional' ? 'institutional' : 'dataroom'); if (!u.verified) throw new ForbiddenException('Complete verification (KYC) first.');
    const b = parse(z.object({ signedName: z.string().trim().min(2).max(80), accept: z.literal(true) }), body);
    if (await hasNda(this.db, u.id, x.l.id)) return { ok: true, already: true };
    const [n] = await this.db.insert(S.ndaSignatures).values({ userId: u.id, listingId: x.l.id, signedName: b.signedName, templateVersion: 'NDA v1.2 (NL/EN)', method: 'clickwrap', ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''), userAgent: String(req.headers['user-agent'] || '').slice(0, 300) }).returning();
    await audit(this.db, req, 'nda_sign', 'listing', x.l.id, { template: n.templateVersion }); return { ok: true };
  }
  @Get('listings/:slug/dataroom') async room(@Req() req: R, @Param('slug') slug: string) {
    const x = await this.listingOr404(slug, req); requireFeature(req, x.l.dealType === 'institutional' ? 'institutional' : 'dataroom'); await this.roomGate(req, x.l.id);
    const docs = await this.db.select().from(S.documents).where(eq(S.documents.listingId, x.l.id)).orderBy(asc(S.documents.folder), asc(S.documents.filename));
    const folders: Record<string, any[]> = {}; for (const d of docs) (folders[d.folder] ||= []).push({ id: d.id, filename: d.filename, version: d.version, downloadAllowed: d.downloadAllowed, uploadedAt: d.createdAt });
    return { listing: x.l.name, folders: Object.entries(folders).map(([name, files]) => ({ name, files })) };
  }
  @Post('documents/:id/view-url') async viewUrl(@Req() req: R, @Param('id') id: string, @Query('download') download?: string) {
    const d = (await this.db.select().from(S.documents).where(eq(S.documents.id, id)))[0]; if (!d) throw new NotFoundException();
    const u = await this.roomGate(req, d.listingId); if (download && !d.downloadAllowed && !isStaff(u)) throw new ForbiddenException('Downloads are blocked for this folder.');
    return { url: `/api/documents/file/${signToken({ d: d.id, u: u.id, dl: !!download }, 300)}`, expiresInSeconds: 300 };
  }
  @Get('documents/file/:token') async file(@Req() req: R, @Res() res: Response, @Param('token') token: string) {
    const t = readToken<{ d: string; u: string; dl: boolean }>(token); if (!t) throw new ForbiddenException('This link has expired. Open the document again from the data room.');
    const u = requireUser(req); if (u.id !== t.u) throw new ForbiddenException('This link belongs to another user.');
    const d = (await this.db.select().from(S.documents).where(eq(S.documents.id, t.d)))[0]; if (!d) throw new NotFoundException();
    const stamped = await watermark(await readStored(this.db, d.storageKey), `${u.name} · ${u.email} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    await audit(this.db, req, t.dl ? 'download' : 'view', 'document', d.id, { filename: d.filename, folder: d.folder });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `${t.dl ? 'attachment' : 'inline'}; filename="${d.filename.replace(/[^\w.\- ]/g, '')}"`); res.setHeader('Cache-Control', 'no-store'); res.send(stamped);
  }

  /* ---------- Offers, viewings, questions ---------- */
  @Post('listings/:slug/offers') @UseInterceptors(FileFieldsInterceptor([{ name: 'proof', maxCount: 1 }], { limits: { fileSize: 10 * 1024 * 1024 } }))
  async offer(@Req() req: R, @Param('slug') slug: string, @UploadedFiles() files: { proof?: Express.Multer.File[] }, @Body() body: any) {
    const u = requireFeature(req, 'offers'); if (!u.verified) throw new ForbiddenException('Only verified investors can make offers.');
    const x = await this.listingOr404(slug, req); if (x.l.status !== 'available') throw new BadRequestException('This property is not open for offers.'); if (x.l.dealType === 'bid_round') throw new BadRequestException('This property is sold through a bid round.'); if (x.l.dealType === 'institutional') throw new BadRequestException('This portfolio is sold through a structured process. Submit your bid in the Process tab.');
    const b = parse(z.object({ amount: z.coerce.number().int().min(100000).max(1e9), transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), financingType: z.enum(['Mortgage', 'Cash', 'Mixed']), conditions: z.union([z.string(), z.array(z.string())]).optional(), units: z.string().optional(), message: z.string().max(2000).optional() }), body);
    if (new Date(b.transferDate) < new Date(new Date().toDateString())) throw new BadRequestException('The transfer date must be in the future.');
    const pf = checkFile(files?.proof?.[0], 'Proof of funds'); const conditions = [b.conditions || []].flat().filter(c => ['Financing', 'Inspection', 'Board approval'].includes(c));
    const units = (b.units || '').split(',').filter(Boolean).map(Number).filter(n => n > 0);
    const lead = (await ruleOn(this.db, 'scoring')) ? leadScore({ kind: 'offer', amount: b.amount, message: b.message, units }, true, x.l.askingPrice) : null;
    const followupAt = (await ruleOn(this.db, 'followups')) ? new Date(Date.now() + (lead?.band === 'Hot' ? 4 : 24) * 36e5) : null;
    const [o] = await this.db.insert(S.offers).values({ listingId: x.l.id, userId: u.id, amount: b.amount, conditions, financingType: b.financingType, transferDate: b.transferDate, units, proofFileKey: await saveFile(this.db, pf.buffer, pf.originalname), proofFileName: pf.originalname, message: b.message, leadScore: lead?.value, leadBand: lead?.band, followupAt }).returning();
    await audit(this.db, req, 'offer_submit', 'offer', o.id, { amount: b.amount, listing: x.l.slug });
    await notify(this.db, u.id, 'offer', 'Offer submitted', `${x.l.name} · €${b.amount.toLocaleString('nl-NL')}. Offers are not binding until a purchase agreement is signed.`, x.l.slug);
    if (lead) await logRule(this.db, 'scoring', `Offer from ${u.name} on ${x.l.name} scored ${lead.value} (${lead.band})`);
    if (followupAt) await logRule(this.db, 'followups', `Follow-up ${lead?.band === 'Hot' ? 'within 4 hours' : 'tomorrow'} · ${x.l.name}`);
    await draftEmail(this.db, u.email, 'We have received your offer', `Dear ${u.name}, thank you for your offer of €${b.amount.toLocaleString('nl-NL')} on ${x.l.name}. We reply within 24 hours.`, 'offer');
    return { id: o.id, status: o.status, lead };
  }
  @Post('listings/:slug/enquiries') async enquiry(@Req() req: R, @Param('slug') slug: string, @Body() body: unknown) {
    const x = slug === 'general' ? null : await this.listingOr404(slug, req);
    const b = parse(z.object({ kind: z.enum(['viewing', 'question']), name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(160), preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), format: z.enum(['In person', 'Video call']).optional(), message: z.string().max(2000).optional() }), body);
    if (b.kind === 'question' && !b.message) throw new BadRequestException('Please write your question.'); if (b.kind === 'viewing' && !b.preferredDate) throw new BadRequestException('Choose a preferred date.');
    const lead = (await ruleOn(this.db, 'scoring')) ? leadScore({ kind: b.kind, message: b.message }, !!req.user?.verified) : null;
    const followupAt = (await ruleOn(this.db, 'followups')) ? new Date(Date.now() + (lead?.band === 'Hot' ? 4 : 24) * 36e5) : null;
    const [e] = await this.db.insert(S.enquiries).values({ listingId: x?.l.id ?? null, userId: req.user?.id ?? null, ...b, leadScore: lead?.value, leadBand: lead?.band, followupAt }).returning();
    await audit(this.db, req, 'enquiry', 'enquiry', e.id, { kind: b.kind });
    if (req.user) await notify(this.db, req.user.id, 'enquiry', b.kind === 'viewing' ? 'Viewing request received' : 'Question received', `${x?.l.name || 'General'} · we reply within 24 hours.`, x?.l.slug ?? null);
    await draftEmail(this.db, b.email, b.kind === 'viewing' ? 'Your viewing request' : 'Thank you for your question', `Dear ${b.name}, thank you. ${b.kind === 'viewing' ? 'We confirm a slot within one working day; tenants receive proper notice where a property is let.' : 'Your account manager replies within 24 hours.'}`, b.kind);
    return { id: e.id, reference: 'PP-' + e.id.slice(0, 6).toUpperCase() };
  }
  @Post('offers/:id/accept-counter') async acceptCounter(@Req() req: R, @Param('id') id: string) {
    const u = requireUser(req); const o = (await this.db.select().from(S.offers).where(and(eq(S.offers.id, id), eq(S.offers.userId, u.id))))[0];
    if (!o || o.status !== 'countered' || !o.counterAmount) throw new BadRequestException('There is no counter-offer to accept.');
    await this.db.update(S.offers).set({ status: 'accepted', amount: o.counterAmount }).where(eq(S.offers.id, id));
    await this.db.insert(S.deals).values({ listingId: o.listingId, offerId: o.id, userId: u.id, price: o.counterAmount });
    await this.db.update(S.listings).set({ status: 'under_offer' }).where(eq(S.listings.id, o.listingId));
    await audit(this.db, req, 'counter_accepted', 'offer', id, { amount: o.counterAmount }); await notify(this.db, u.id, 'deal', 'Deal started', 'Counter-offer accepted. Next step: letter of intent.'); return { ok: true };
  }

  /* ---------- Sealed bids (plan: P2 bid rounds) ---------- */
  @Post('bid-rounds/:id/bids') @UseInterceptors(FileFieldsInterceptor([{ name: 'proof', maxCount: 1 }], { limits: { fileSize: 10 * 1024 * 1024 } }))
  async bid(@Req() req: R, @Param('id') id: string, @UploadedFiles() files: { proof?: Express.Multer.File[] }, @Body() body: any) {
    const u = requireFeature(req, 'offers'); if (!u.verified) throw new ForbiddenException('Only verified investors can bid.');
    const r = (await this.db.select().from(S.bidRounds).where(eq(S.bidRounds.id, id)))[0]; if (!r || !canSeeListing(viewerOf(req), r.listingId)) throw new NotFoundException();
    if (r.status !== 'open' || new Date() >= r.closesAt) throw new BadRequestException('This bid round is closed.');
    const b = parse(z.object({ amount: z.coerce.number().int().min(r.minBid, `The minimum bid is €${r.minBid.toLocaleString('nl-NL')}`).max(1e9), conditions: z.enum(['No conditions', 'Subject to financing', 'Subject to due diligence']), acceptRules: z.literal('on') }), body);
    const pf = checkFile(files?.proof?.[0], 'Proof of funds');
    const mine = (await this.db.select().from(S.offers).where(and(eq(S.offers.bidRoundId, id), eq(S.offers.userId, u.id))))[0];
    const vals = { amount: b.amount, conditions: [b.conditions], proofFileKey: await saveFile(this.db, pf.buffer, pf.originalname), proofFileName: pf.originalname };
    if (mine) await this.db.update(S.offers).set(vals).where(eq(S.offers.id, mine.id));
    else await this.db.insert(S.offers).values({ ...vals, listingId: r.listingId, userId: u.id, bidRoundId: id, bidderLabel: u.companyName || u.name, status: 'sealed', leadScore: 75, leadBand: 'Hot' });
    await audit(this.db, req, 'bid_submit', 'bid_round', id, { amount: b.amount, updated: !!mine });
    await notify(this.db, u.id, 'bid', 'Sealed bid received', `€${b.amount.toLocaleString('nl-NL')}. Bids stay sealed until ${r.closesAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
    return { ok: true, updated: !!mine };
  }
}
