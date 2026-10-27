/* Invite-only access. Admins and developers create people, choose which properties and which features each person sees,
   and share a personal invitation link. Visitors only see the public company pages and can request access. */
import { Controller, Get, Post, Put, Param, Body, Req, Res, Inject, NotFoundException, BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { eq, and, desc, inArray, isNull, sql } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireStaff, audit, notify, logRule, draftEmail, hashPassword, createSession, SESSION_COOKIE, cookieOpts } from '../common';
import { FEATURES, FEATURE_KEYS, FEATURE_PRESETS, SUPER_ROLES, isStaff, featuresOf, TIER_LABEL, tierOf } from '../domain';
import { parse } from './public.controller';
import { publicUser } from './account.controller';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
export const ROLE_LABEL: Record<string, string> = { investor: 'Investor', admin: 'Admin', developer: 'Developer', sales: 'Sales', compliance: 'Compliance', acquisition: 'Acquisition', editor: 'Editor', readonly: 'Read-only staff' };
const INVESTOR_TYPES = ['Private person', 'Private BV', 'Fund', 'Family office', 'Pension fund', 'Insurer', 'Institutional investor', 'Developer'] as const;
const hits = new Map<string, number[]>();
function rateLimit(key: string, max: number, windowMs = 36e5) { const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs); if (a.length >= max) throw new HttpException('Too many requests. Please try again later.', 429); a.push(now); hits.set(key, a); }

export function inviteState(i?: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date } | null) {
  if (!i) return null; if (i.usedAt) return 'accepted'; if (i.revokedAt) return 'revoked'; return i.expiresAt.getTime() < Date.now() ? 'expired' : 'pending';
}
/** Creates a fresh invitation link (older unused links for this person stop working). Returns the raw token once. */
export async function newInvite(db: DB, userId: string, createdBy: string | null, days = 14, message?: string | null, token = randomBytes(24).toString('base64url')) {
  await db.update(S.invites).set({ revokedAt: new Date() }).where(and(eq(S.invites.userId, userId), isNull(S.invites.usedAt), isNull(S.invites.revokedAt)));
  const expiresAt = new Date(Date.now() + days * 864e5);
  await db.insert(S.invites).values({ userId, tokenHash: sha(token), createdBy, expiresAt, message: message || null });
  return { token, path: `/invite/${token}`, expiresAt };
}
/** Replaces the set of properties shared with one person and alerts them about newly shared, live properties. */
export async function setListings(db: DB, userId: string, listingIds: string[], grantedBy: string | null) {
  const before = new Set((await db.select().from(S.listingAccess).where(eq(S.listingAccess.userId, userId))).map(r => r.listingId));
  await db.delete(S.listingAccess).where(eq(S.listingAccess.userId, userId));
  const ids = [...new Set(listingIds)]; if (ids.length) await db.insert(S.listingAccess).values(ids.map(listingId => ({ userId, listingId, grantedBy })));
  return ids.filter(id => !before.has(id));
}

const accessBody = z.object({
  listingScope: z.enum(['selected', 'all']).default('selected'), listingIds: z.array(z.string().uuid()).max(2000).default([]),
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])).max(FEATURE_KEYS.length).default([]),
});

@Controller()
export class AccessController {
  constructor(@Inject('DB') private db: DB) {}
  private admin(req: R) { return requireStaff(req, SUPER_ROLES); }

  /* ---------- Admin: people and their access ---------- */
  @Get('admin/access') async overview(@Req() req: R) {
    this.admin(req); const db = this.db;
    const users = (await db.select().from(S.users).orderBy(desc(S.users.createdAt))).filter(u => !u.deletedAt);
    const grants = await db.select({ userId: S.listingAccess.userId, n: sql<number>`count(*)::int` }).from(S.listingAccess).groupBy(S.listingAccess.userId);
    const count = Object.fromEntries(grants.map(g => [g.userId, Number(g.n)]));
    const inv = await db.select().from(S.invites).orderBy(desc(S.invites.createdAt)); const lastInvite = (id: string) => inv.find(i => i.userId === id);
    const listings = await db.select().from(S.listings).innerJoin(S.properties, eq(S.listings.propertyId, S.properties.id)).orderBy(desc(S.listings.publishedAt));
    const units = await db.select({ pid: S.units.propertyId, n: sql<number>`count(*)::int` }).from(S.units).groupBy(S.units.propertyId); const un = Object.fromEntries(units.map(u => [u.pid, Number(u.n)]));
    const shares = await db.select({ l: S.listingAccess.listingId, n: sql<number>`count(*)::int` }).from(S.listingAccess).groupBy(S.listingAccess.listingId); const sh = Object.fromEntries(shares.map(x => [x.l, Number(x.n)]));
    const requests = await db.select().from(S.enquiries).where(eq(S.enquiries.kind, 'access')).orderBy(desc(S.enquiries.createdAt));
    return {
      users: users.map(u => { const i = lastInvite(u.id); const staff = isStaff(u); return { id: u.id, name: u.name, email: u.email, companyName: u.companyName, investorType: u.investorType, country: u.country, role: u.role, roleLabel: ROLE_LABEL[u.role] || u.role, staff, status: u.status,
        listingScope: staff ? 'all' : u.listingScope, listingCount: staff || u.listingScope === 'all' ? null : count[u.id] || 0, features: featuresOf(u), verified: u.verified, tierLabel: staff ? null : TIER_LABEL[tierOf(u)], twofaEnabled: u.twofaEnabled,
        lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, accessUpdatedAt: u.accessUpdatedAt, invite: i ? { state: inviteState(i), expiresAt: i.expiresAt, createdAt: i.createdAt } : null }; }),
      listings: listings.filter(r => r.listings.status !== 'withdrawn').map(({ listings: l, properties: p }) => ({ id: l.id, slug: l.slug, name: l.name, city: p.city, district: p.district, image: p.image, dealType: l.dealType, status: l.status, askingPrice: l.askingPrice, units: un[p.id] || 1, propertyType: p.propertyType, source: l.source, sharedWith: sh[l.id] || 0 })),
      features: FEATURES, presets: FEATURE_PRESETS, roles: Object.entries(ROLE_LABEL).map(([key, label]) => ({ key, label, staff: key !== 'investor' })), investorTypes: INVESTOR_TYPES,
      requests: requests.map(r => ({ id: r.id, name: r.name, email: r.email, message: r.message, status: r.status, createdAt: r.createdAt, invited: users.some(u => u.email === r.email.toLowerCase()) })),
    };
  }
  @Get('admin/access/users/:id') async person(@Req() req: R, @Param('id') id: string) {
    this.admin(req); parse(z.string().uuid(), id);
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, id)))[0]; if (!u || u.deletedAt) throw new NotFoundException('Person not found');
    const listingIds = (await this.db.select().from(S.listingAccess).where(eq(S.listingAccess.userId, id))).map(r => r.listingId);
    const i = (await this.db.select().from(S.invites).where(eq(S.invites.userId, id)).orderBy(desc(S.invites.createdAt)).limit(1))[0];
    const activity = await this.db.select().from(S.auditEvents).where(eq(S.auditEvents.actorId, id)).orderBy(desc(S.auditEvents.at)).limit(8);
    return { id: u.id, name: u.name, email: u.email, companyName: u.companyName, investorType: u.investorType, role: u.role, staff: isStaff(u), status: u.status, listingScope: u.listingScope, listingIds, features: u.features,
      invite: i ? { state: inviteState(i), expiresAt: i.expiresAt } : null, activity: activity.map(a => ({ action: a.action, objectType: a.objectType, at: a.at })) };
  }
  @Put('admin/access/users/:id') async update(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    const me = this.admin(req); parse(z.string().uuid(), id);
    const b = parse(accessBody.extend({ role: z.enum(Object.keys(ROLE_LABEL) as [string, ...string[]]).optional(), accountManager: z.string().max(80).optional() }), body);
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, id)))[0]; if (!u || u.deletedAt) throw new NotFoundException('Person not found');
    if (b.role && b.role !== u.role && u.id === me.id) throw new BadRequestException('You cannot change your own role.');
    const known = new Set((await this.db.select({ id: S.listings.id }).from(S.listings)).map(r => r.id)); const ids = b.listingIds.filter(x => known.has(x));
    await this.db.update(S.users).set({ listingScope: b.listingScope, features: b.features, accessUpdatedAt: new Date(), ...(b.role ? { role: b.role } : {}), ...(b.accountManager !== undefined ? { accountManager: b.accountManager || null } : {}) }).where(eq(S.users.id, id));
    const added = await setListings(this.db, id, ids, me.id);
    if (u.status === 'active' && !isStaff({ role: b.role || u.role })) {
      const live = added.length ? await this.db.select().from(S.listings).where(and(inArray(S.listings.id, added), inArray(S.listings.status, ['available', 'coming_soon', 'under_offer']))) : [];
      for (const l of live) await notify(this.db, id, 'share', 'A property was shared with you', `${l.name} · open it from your selection.`, l.slug);
      if (live.length) await draftEmail(this.db, u.email, live.length === 1 ? `New for you: ${live[0].name}` : `${live.length} new properties shared with you`, `Dear ${u.name}, ${live.map(l => l.name).join(', ')} ${live.length === 1 ? 'is' : 'are'} now in your private selection. Log in to view.`, 'share');
    }
    await audit(this.db, req, 'access_update', 'user', id, { scope: b.listingScope, listings: ids.length, features: b.features.join(' '), ...(b.role ? { role: b.role } : {}) });
    return { ok: true, listings: ids.length, added: added.length };
  }
  @Post('admin/access/invites') async invite(@Req() req: R, @Body() body: unknown) {
    const me = this.admin(req);
    const b = parse(accessBody.extend({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(160), companyName: z.string().trim().max(120).optional(),
      investorType: z.enum(INVESTOR_TYPES).default('Private person'), country: z.string().length(2).default('NL'), role: z.enum(Object.keys(ROLE_LABEL) as [string, ...string[]]).default('investor'),
      expiresDays: z.coerce.number().int().min(1).max(60).default(14), message: z.string().trim().max(1000).optional(), accountManager: z.string().max(80).optional() }), body);
    if ((await this.db.select().from(S.users).where(eq(S.users.email, b.email)))[0]) throw new ConflictException('Someone with this email already has an account. Edit their access instead.');
    const [u] = await this.db.insert(S.users).values({ email: b.email, name: b.name, companyName: b.companyName || null, investorType: b.investorType, country: b.country.toUpperCase(), role: b.role, status: 'invited',
      passwordHash: 'invited$' + randomBytes(8).toString('hex'), listingScope: b.listingScope, features: b.features, invitedBy: me.id, accessUpdatedAt: new Date(), accountManager: b.accountManager || (b.role === 'investor' ? 'Sanne de Wit' : null) }).returning();
    const known = new Set((await this.db.select({ id: S.listings.id }).from(S.listings)).map(r => r.id)); await setListings(this.db, u.id, b.listingIds.filter(x => known.has(x)), me.id);
    const inv = await newInvite(this.db, u.id, me.id, b.expiresDays, b.message);
    await draftEmail(this.db, u.email, 'Your private invitation to Portfolio & Prime', `Dear ${u.name}, ${me.name} invited you to Portfolio & Prime${b.message ? `: “${b.message}”` : '.'} Open your personal link to set a password: ${inv.path} (valid until ${inv.expiresAt.toISOString().slice(0, 10)}).`, 'invite');
    await audit(this.db, req, 'invite_created', 'user', u.id, { role: b.role, scope: b.listingScope, listings: b.listingIds.length, features: b.features.join(' ') });
    await logRule(this.db, 'access', `${me.name} invited ${u.name} (${ROLE_LABEL[b.role]})`);
    return { userId: u.id, path: inv.path, expiresAt: inv.expiresAt };
  }
  @Post('admin/access/users/:id/invite') async relink(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    const me = this.admin(req); const b = parse(z.object({ expiresDays: z.coerce.number().int().min(1).max(60).default(14) }), body || {});
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, id)))[0]; if (!u || u.deletedAt) throw new NotFoundException('Person not found');
    if (u.status !== 'invited') throw new BadRequestException('This person has already activated their account.');
    const inv = await newInvite(this.db, u.id, me.id, b.expiresDays);
    await audit(this.db, req, 'invite_link', 'user', u.id); return { path: inv.path, expiresAt: inv.expiresAt };
  }
  @Post('admin/access/users/:id/revoke-invite') async revoke(@Req() req: R, @Param('id') id: string) {
    this.admin(req); await this.db.update(S.invites).set({ revokedAt: new Date() }).where(and(eq(S.invites.userId, id), isNull(S.invites.usedAt), isNull(S.invites.revokedAt)));
    await audit(this.db, req, 'invite_revoked', 'user', id); return { ok: true };
  }
  @Post('admin/access/users/:id/status') async status(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    const me = this.admin(req); const b = parse(z.object({ status: z.enum(['active', 'suspended']) }), body);
    if (id === me.id) throw new BadRequestException('You cannot pause your own access.');
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, id)))[0]; if (!u || u.deletedAt) throw new NotFoundException('Person not found');
    if (u.status === 'invited') throw new BadRequestException('This person has not activated their invitation yet. Revoke the link instead.');
    await this.db.update(S.users).set({ status: b.status }).where(eq(S.users.id, id));
    if (b.status === 'suspended') await this.db.delete(S.sessions).where(eq(S.sessions.userId, id)); // signed out everywhere, immediately
    await audit(this.db, req, b.status === 'suspended' ? 'access_paused' : 'access_resumed', 'user', id); return { ok: true, status: b.status };
  }

  /* ---------- Public: invitation link and access requests ---------- */
  private async openInvite(token: string) {
    const i = (await this.db.select().from(S.invites).where(eq(S.invites.tokenHash, sha(String(token)))))[0];
    const state = inviteState(i); if (!i || state !== 'pending') throw new NotFoundException(state === 'expired' ? 'This invitation has expired. Ask your contact at Portfolio & Prime for a new link.' : state === 'accepted' ? 'This invitation was already used. Log in with your email and password.' : 'This invitation link is not valid.');
    const u = (await this.db.select().from(S.users).where(eq(S.users.id, i.userId)))[0]; if (!u || u.status !== 'invited') throw new NotFoundException('This invitation link is not valid.');
    return { i, u };
  }
  @Get('invites/:token') async inviteInfo(@Req() req: R, @Param('token') token: string) {
    rateLimit('invite:' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress), 60);
    const { i, u } = await this.openInvite(token); const staff = isStaff(u);
    const n = Number((await this.db.select({ n: sql<number>`count(*)::int` }).from(S.listingAccess).where(eq(S.listingAccess.userId, u.id)))[0].n);
    const by = i.createdBy ? (await this.db.select().from(S.users).where(eq(S.users.id, i.createdBy)))[0] : null;
    return { name: u.name, email: u.email, companyName: u.companyName, role: u.role, roleLabel: ROLE_LABEL[u.role], staff, listings: staff || u.listingScope === 'all' ? 'all' : n,
      features: FEATURES.filter(f => featuresOf(u).includes(f.key)).map(f => ({ key: f.key, label: f.label, desc: f.desc })), invitedBy: by?.name || 'Portfolio & Prime', message: i.message, expiresAt: i.expiresAt, accountManager: u.accountManager };
  }
  @Post('invites/:token/accept') async accept(@Req() req: R, @Res({ passthrough: true }) res: Response, @Param('token') token: string, @Body() body: unknown) {
    rateLimit('invite:' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress), 60);
    const { i, u } = await this.openInvite(token);
    const b = parse(z.object({ password: z.string().min(10, 'Use at least 10 characters').max(200), acceptTerms: z.literal(true), locale: z.enum(['nl', 'en']).default('en') }), body);
    await this.db.update(S.users).set({ passwordHash: hashPassword(b.password), status: 'active', locale: b.locale, lastLoginAt: new Date() }).where(eq(S.users.id, u.id));
    await this.db.update(S.invites).set({ usedAt: new Date() }).where(eq(S.invites.id, i.id));
    res.cookie(SESSION_COOKIE, await createSession(this.db, u.id, !u.twofaEnabled), cookieOpts);
    req.user = { ...u, status: 'active', sessionId: '', twofaPassed: !u.twofaEnabled, listingIds: [] }; await audit(this.db, req, 'invite_accepted', 'user', u.id);
    if (!isStaff(u)) await notify(this.db, u.id, 'welcome', 'Welcome to Portfolio & Prime', 'Your private selection is ready. Your account manager is one message away.');
    if (i.createdBy) await notify(this.db, i.createdBy, 'access', 'Invitation accepted', `${u.name}${u.companyName ? ` (${u.companyName})` : ''} activated their account.`);
    return { user: publicUser({ ...u, status: 'active', twofaPassed: !u.twofaEnabled }) };
  }
  /** Public "request access" form: becomes an access request in the admin's People & access tab (sellers also go to the acquisition pipeline). */
  @Post('access-requests') async requestAccess(@Req() req: R, @Body() body: unknown) {
    rateLimit('access:' + (req.headers['x-forwarded-for'] || req.socket?.remoteAddress), 10);
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(160), companyName: z.string().trim().max(120).optional(), investorType: z.enum(INVESTOR_TYPES).default('Private person'),
      interest: z.enum(['invest', 'sell', 'both']).default('invest'), ticket: z.string().max(40).optional(), message: z.string().trim().max(2000).optional(), consent: z.literal(true) }), body);
    const summary = [b.companyName, b.investorType, { invest: 'Wants to invest', sell: 'Wants to sell', both: 'Invest and sell' }[b.interest], b.ticket ? `Ticket ${b.ticket}` : null, b.message].filter(Boolean).join(' · ');
    const [e] = await this.db.insert(S.enquiries).values({ kind: 'access', name: b.name, email: b.email, message: summary, leadBand: b.interest === 'sell' ? 'Seller' : 'Investor' }).returning();
    if (b.interest !== 'invest') await this.db.insert(S.acquisitionLeads).values({ source: 'Website · access request', address: b.companyName || b.name, propertyType: 'To be discussed', units: 1, contactName: b.name, contactEmail: b.email, notes: b.message || null });
    await logRule(this.db, 'access', `Access request from ${b.name}${b.companyName ? ` (${b.companyName})` : ''}`);
    await draftEmail(this.db, b.email, 'We received your request', `Dear ${b.name}, thank you for your interest in Portfolio & Prime. A partner will contact you within one working day. Access is personal and by invitation.`, 'access');
    await audit(this.db, req, 'access_request', 'enquiry', e.id, { interest: b.interest });
    return { reference: 'AR-' + e.id.slice(0, 6).toUpperCase() };
  }
  @Post('admin/access/requests/:id/status') async requestStatus(@Req() req: R, @Param('id') id: string, @Body() body: unknown) {
    this.admin(req); const b = parse(z.object({ status: z.enum(['new', 'contacted', 'closed']) }), body);
    await this.db.update(S.enquiries).set({ status: b.status }).where(and(eq(S.enquiries.id, id), eq(S.enquiries.kind, 'access'))); return { ok: true };
  }
}
