import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Req, Res, Inject, UseInterceptors, UploadedFiles, BadRequestException, ForbiddenException, UnauthorizedException, NotFoundException, ConflictException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireUser, hashPassword, verifyPassword, createSession, SESSION_COOKIE, cookieOpts, audit, notify, logRule, saveFile, getConfig, viewerOf } from '../common';
import { tierOf, alertFrequency, kycRisk, newTotpSecret, verifyTotp, totp, cfg, TIER_LABEL, DEAL_STAGES } from '../domain';
import { parse } from './public.controller';
import { getListing } from './listings.service';

const DEMO = process.env.PP_DEMO !== '0';
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];
export const checkFile = (f?: Express.Multer.File, label = 'File') => { if (!f) throw new BadRequestException(`${label} is required.`); if (!ALLOWED.includes(f.mimetype)) throw new BadRequestException(`${label} must be a PDF, PNG or JPG.`); return f; };
export const publicUser = (u: any) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale, investorType: u.investorType, country: u.country, companyName: u.companyName, verified: u.verified, pro: u.pro, twofaEnabled: u.twofaEnabled, tier: tierOf(u), tierLabel: TIER_LABEL[tierOf(u)], alertFrequency: alertFrequency(u), staff: u.role !== 'investor', twofaPassed: u.twofaPassed });

@Controller()
export class AccountController {
  constructor(@Inject('DB') private db: DB) {}
  @Post('auth/register') async register(@Req() req: R, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(8).max(200), investorType: z.enum(['Private person', 'Private BV', 'Fund', 'Family office', 'Developer']), country: z.string().length(2), companyName: z.string().max(120).optional(), acceptTerms: z.literal(true), locale: z.enum(['nl', 'en']).default('en') }), body);
    if ((await this.db.select().from(S.users).where(eq(S.users.email, b.email)))[0]) throw new ConflictException('An account with this email already exists.');
    const [u] = await this.db.insert(S.users).values({ name: b.name, email: b.email, passwordHash: hashPassword(b.password), investorType: b.investorType, country: b.country.toUpperCase(), companyName: b.companyName, locale: b.locale, lastLoginAt: new Date() }).returning();
    res.cookie(SESSION_COOKIE, await createSession(this.db, u.id, true), cookieOpts);
    req.user = { ...u, sessionId: '', twofaPassed: true }; await audit(this.db, req, 'register', 'user', u.id, { investorType: b.investorType });
    await notify(this.db, u.id, 'welcome', 'Welcome to Portfolio & Prime', 'You now see full financials and addresses. Verify your account to open data rooms and make offers.');
    return { user: publicUser({ ...u, twofaPassed: true }) };
  }
  @Post('auth/login') async login(@Req() req: R, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const b = parse(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }), body);
    const u = (await this.db.select().from(S.users).where(eq(S.users.email, b.email)))[0];
    if (!u || u.deletedAt || !verifyPassword(b.password, u.passwordHash)) { await audit(this.db, req, 'login_failed', 'user', null, { email: b.email }); throw new UnauthorizedException('Email or password is incorrect.'); }
    res.cookie(SESSION_COOKIE, await createSession(this.db, u.id, !u.twofaEnabled), cookieOpts);
    await this.db.update(S.users).set({ lastLoginAt: new Date() }).where(eq(S.users.id, u.id));
    req.user = { ...u, sessionId: '', twofaPassed: !u.twofaEnabled }; await audit(this.db, req, 'login', 'user', u.id);
    return { needs2fa: u.twofaEnabled, user: publicUser({ ...u, twofaPassed: !u.twofaEnabled }), ...(DEMO && u.twofaEnabled ? { demoCode: totp(u.twofaSecret!) } : {}) };
  }
  @Post('auth/2fa/verify') async verify2fa(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    if (!u.twofaSecret || !verifyTotp(u.twofaSecret, b.code)) throw new UnauthorizedException('That code is not valid. Try the current code.');
    await this.db.update(S.sessions).set({ twofaPassed: true }).where(eq(S.sessions.id, u.sessionId)); await audit(this.db, req, '2fa_passed', 'user', u.id); return { ok: true };
  }
  @Post('auth/2fa/setup') async setup2fa(@Req() req: R) {
    const u = requireUser(req); if (u.twofaEnabled) throw new BadRequestException('Two-factor login is already on.');
    const secret = newTotpSecret(); await this.db.update(S.users).set({ twofaSecret: secret }).where(eq(S.users.id, u.id));
    return { secret, otpauth: `otpauth://totp/Portfolio%20%26%20Prime:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Portfolio%20%26%20Prime`, ...(DEMO ? { demoCode: totp(secret), demoNote: 'Demo mode shows the current code. Production never does.' } : {}) };
  }
  @Post('auth/2fa/enable') async enable2fa(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    const fresh = (await this.db.select().from(S.users).where(eq(S.users.id, u.id)))[0];
    if (!fresh.twofaSecret || !verifyTotp(fresh.twofaSecret, b.code)) throw new UnauthorizedException('That code is not valid.');
    await this.db.update(S.users).set({ twofaEnabled: true }).where(eq(S.users.id, u.id)); await this.db.update(S.sessions).set({ twofaPassed: true }).where(eq(S.sessions.id, u.sessionId));
    await audit(this.db, req, '2fa_enabled', 'user', u.id); return { ok: true };
  }
  @Get('auth/2fa/demo-code') async demoCode(@Req() req: R) { const u = requireUser(req); if (!DEMO || !u.twofaSecret) throw new NotFoundException(); return { code: totp(u.twofaSecret), note: 'Demo mode only.' }; }
  @Post('auth/logout') async logout(@Req() req: R, @Res({ passthrough: true }) res: Response) { if (req.user) await this.db.delete(S.sessions).where(eq(S.sessions.id, req.user.sessionId)); res.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true }; }

  @Get('me') async me(@Req() req: R) {
    if (!req.user) return { user: null };
    const u = req.user; const kyc = (await this.db.select().from(S.kycCases).where(eq(S.kycCases.userId, u.id)).orderBy(desc(S.kycCases.submittedAt)).limit(1))[0];
    const unread = (await this.db.select().from(S.notifications).where(eq(S.notifications.userId, u.id))).filter(n => !n.readAt).length;
    return { user: publicUser(u), kyc: kyc ? { status: kyc.status, risk: kyc.risk, submittedAt: kyc.submittedAt } : { status: 'none' }, unread };
  }
  @Patch('me') async updateMe(@Req() req: R, @Body() body: unknown) { const u = requireUser(req); const b = parse(z.object({ name: z.string().trim().min(2).max(80).optional(), locale: z.enum(['nl', 'en']).optional() }), body); await this.db.update(S.users).set(b).where(eq(S.users.id, u.id)); return { ok: true }; }
  @Get('me/dashboard') async dashboard(@Req() req: R) {
    const u = requireUser(req); const db = this.db;
    const offers = await db.select().from(S.offers).innerJoin(S.listings, eq(S.offers.listingId, S.listings.id)).where(eq(S.offers.userId, u.id)).orderBy(desc(S.offers.createdAt));
    const deals = await db.select().from(S.deals).innerJoin(S.listings, eq(S.deals.listingId, S.listings.id)).where(eq(S.deals.userId, u.id));
    const enq = await db.select().from(S.enquiries).where(eq(S.enquiries.userId, u.id)).orderBy(desc(S.enquiries.createdAt));
    const ndas = await db.select().from(S.ndaSignatures).innerJoin(S.listings, eq(S.ndaSignatures.listingId, S.listings.id)).where(eq(S.ndaSignatures.userId, u.id));
    const favs = await db.select().from(S.favorites).innerJoin(S.listings, eq(S.favorites.listingId, S.listings.id)).where(eq(S.favorites.userId, u.id));
    const notes = await db.select().from(S.notifications).where(eq(S.notifications.userId, u.id)).orderBy(desc(S.notifications.createdAt)).limit(20);
    const box = (await db.select().from(S.buyBoxes).where(eq(S.buyBoxes.userId, u.id)))[0] || null;
    const searches = await db.select().from(S.savedSearches).where(eq(S.savedSearches.userId, u.id));
    const sub = (await db.select().from(S.subscriptions).where(eq(S.subscriptions.userId, u.id)).orderBy(desc(S.subscriptions.createdAt)).limit(1))[0] || null;
    return { offers: offers.map(r => ({ id: r.offers.id, listing: r.listings.name, slug: r.listings.slug, amount: r.offers.amount, conditions: r.offers.conditions, status: r.offers.status, counterAmount: r.offers.counterAmount, isBid: !!r.offers.bidRoundId, createdAt: r.offers.createdAt })),
      deals: deals.map(r => ({ id: r.deals.id, listing: r.listings.name, slug: r.listings.slug, price: r.deals.price, stage: r.deals.stage, stages: DEAL_STAGES })),
      enquiries: enq, ndas: ndas.map(r => ({ listing: r.listings.name, slug: r.listings.slug, signedAt: r.nda_signatures.signedAt, template: r.nda_signatures.templateVersion })), favorites: favs.map(r => r.listings.slug), notifications: notes, buyBox: box, savedSearches: searches, subscription: sub };
  }
  @Post('me/notifications/read') async readAll(@Req() req: R) { const u = requireUser(req); await this.db.update(S.notifications).set({ readAt: new Date() }).where(eq(S.notifications.userId, u.id)); return { ok: true }; }
  @Get('me/export') async exportMe(@Req() req: R) {
    const u = requireUser(req); await audit(this.db, req, 'data_export', 'user', u.id);
    const d = await this.dashboard(req); const kyc = await this.db.select().from(S.kycCases).where(eq(S.kycCases.userId, u.id));
    return { exportedAt: new Date(), user: publicUser(u), kycCases: kyc.map(k => ({ status: k.status, risk: k.risk, submittedAt: k.submittedAt, decidedAt: k.decidedAt })), ...d };
  }
  @Delete('me') async deleteMe(@Req() req: R, @Res({ passthrough: true }) res: Response) {
    const u = requireUser(req); if (u.role !== 'investor') throw new ForbiddenException('Staff accounts are removed by an admin.');
    await this.db.update(S.users).set({ deletedAt: new Date(), name: 'Deleted user', email: `deleted-${u.id}@invalid`, passwordHash: 'x', twofaSecret: null }).where(eq(S.users.id, u.id));
    await this.db.delete(S.sessions).where(eq(S.sessions.userId, u.id)); await audit(this.db, req, 'account_deleted', 'user', u.id, { note: 'KYC records retained 5 years under Wwft' });
    res.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true };
  }
  @Put('me/buy-box') async putBuyBox(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); const b = parse(z.object({ regions: z.array(z.string()).max(20).default([]), types: z.array(z.string()).max(10).default([]), ticketMin: z.coerce.number().int().min(0).optional().nullable(), ticketMax: z.coerce.number().int().min(0).optional().nullable(), targetBar: z.coerce.number().min(0).max(20).optional().nullable(), financing: z.enum(['cash', 'mortgage']).default('mortgage'), strategy: z.string().max(40).default('Buy-to-let') }), body);
    await this.db.insert(S.buyBoxes).values({ userId: u.id, ...b }).onConflictDoUpdate({ target: S.buyBoxes.userId, set: b }); return { ok: true };
  }
  @Get('saved-searches') async searches(@Req() req: R) { const u = requireUser(req); return this.db.select().from(S.savedSearches).where(eq(S.savedSearches.userId, u.id)); }
  @Post('saved-searches') async addSearch(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); const b = parse(z.object({ filters: z.record(z.string(), z.string()) }), body);
    const [s] = await this.db.insert(S.savedSearches).values({ userId: u.id, filters: b.filters, frequency: alertFrequency(u) || 'weekly' }).returning(); return s;
  }
  @Delete('saved-searches/:id') async delSearch(@Req() req: R, @Param('id') id: string) { const u = requireUser(req); await this.db.delete(S.savedSearches).where(and(eq(S.savedSearches.id, id), eq(S.savedSearches.userId, u.id))); return { ok: true }; }
  @Post('favorites/:slug') async fav(@Req() req: R, @Param('slug') slug: string) {
    const u = requireUser(req); const x = await getListing(this.db, slug); if (!x) throw new NotFoundException();
    const has = (await this.db.select().from(S.favorites).where(and(eq(S.favorites.userId, u.id), eq(S.favorites.listingId, x.l.id))))[0];
    if (has) await this.db.delete(S.favorites).where(and(eq(S.favorites.userId, u.id), eq(S.favorites.listingId, x.l.id))); else await this.db.insert(S.favorites).values({ userId: u.id, listingId: x.l.id });
    return { saved: !has };
  }

  /* ---------- KYC (plan: P1 manual review with document upload) ---------- */
  @Post('kyc/cases') @UseInterceptors(FileFieldsInterceptor([{ name: 'idDoc', maxCount: 1 }, { name: 'proof', maxCount: 1 }], { limits: { fileSize: 10 * 1024 * 1024 } }))
  async kyc(@Req() req: R, @UploadedFiles() files: { idDoc?: Express.Multer.File[]; proof?: Express.Multer.File[] }, @Body() body: unknown) {
    const u = requireUser(req); if (u.verified) throw new BadRequestException('You are already verified.');
    if ((await this.db.select().from(S.kycCases).where(and(eq(S.kycCases.userId, u.id), eq(S.kycCases.status, 'pending'))))[0]) throw new BadRequestException('Your verification is already being reviewed.');
    const company = u.investorType !== 'Private person';
    const b = parse(z.object({ liveness: z.literal('on'), ticket: z.coerce.number().int().min(0), pep: z.enum(['yes', 'no']), kvk: company ? z.string().regex(/^\d{8}$/, 'KVK number must be 8 digits') : z.string().optional(), ubo: company ? z.string().min(2).max(80) : z.string().optional() }), body);
    const idF = checkFile(files?.idDoc?.[0], 'Identity document'), pf = checkFile(files?.proof?.[0], 'Proof of funds');
    const risk = kycRisk({ investorType: u.investorType, country: u.country, ticket: b.ticket, pep: b.pep === 'yes' });
    const [c] = await this.db.insert(S.kycCases).values({ userId: u.id, risk, pep: b.pep === 'yes', ticket: b.ticket, kvk: b.kvk || null, uboName: b.ubo || null, idFileKey: await saveFile(this.db, idF.buffer, idF.originalname), idFileName: idF.originalname, proofFileKey: await saveFile(this.db, pf.buffer, pf.originalname), proofFileName: pf.originalname }).returning();
    await audit(this.db, req, 'kyc_submit', 'kyc_case', c.id, { risk }); await logRule(this.db, 'compliance', `KYC case opened for ${u.name} · ${risk} risk${risk === 'high' ? ' · enhanced due diligence required' : ''}`);
    return { id: c.id, status: c.status, risk };
  }
  @Get('kyc/status') async kycStatus(@Req() req: R) { const u = requireUser(req); const k = (await this.db.select().from(S.kycCases).where(eq(S.kycCases.userId, u.id)).orderBy(desc(S.kycCases.submittedAt)).limit(1))[0]; return k ? { status: k.status, risk: k.risk, submittedAt: k.submittedAt, notes: k.status === 'rejected' ? k.notes : null } : { status: 'none' }; }

  /* ---------- Billing (plan: Mollie subscriptions; simulated here) ---------- */
  @Post('billing/checkout') async checkout(@Req() req: R, @Body() body: unknown) {
    const u = requireUser(req); if (!u.verified) throw new ForbiddenException('Verify your account before upgrading to Investor Pro.'); if (u.pro) throw new BadRequestException('You are already on Investor Pro.');
    const b = parse(z.object({ plan: z.enum(['month', 'year']), method: z.enum(['iDEAL', 'Card', 'SEPA direct debit']), withdrawalAcknowledged: z.literal(true) }), body);
    const c = await getConfig(this.db); const amount = b.plan === 'year' ? cfg(c, 'pro_price_year') : cfg(c, 'pro_price_month');
    const [s] = await this.db.insert(S.subscriptions).values({ userId: u.id, plan: b.plan, method: b.method, molliePaymentId: 'tr_demo_' + Date.now().toString(36), currentPeriodEnd: new Date(Date.now() + (b.plan === 'year' ? 365 : 30) * 864e5) }).returning();
    await this.db.update(S.users).set({ pro: true }).where(eq(S.users.id, u.id));
    await audit(this.db, req, 'subscription', 'subscription', s.id, { plan: b.plan, amount }); await notify(this.db, u.id, 'billing', 'Welcome to Investor Pro', 'You now get the first look at off-market deals and instant alerts.');
    return { ok: true, amount, paymentId: s.molliePaymentId, note: 'Simulated Mollie payment. No money was taken.' };
  }
}
