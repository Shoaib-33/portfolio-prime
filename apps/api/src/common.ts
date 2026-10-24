import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, extname } from 'path';
import { eq, and, gt } from 'drizzle-orm';
import type { Request } from 'express';
import { DB, schema, DATA_DIR } from './db/client';
import { ConfigMap, Viewer, tierOf, canDetails, offMarketState, priceBand, figures, dealScore, isStaff, STAFF_ROLES } from './domain';
const S = schema;

export type ReqUser = typeof S.users.$inferSelect & { sessionId: string; twofaPassed: boolean };
export type Req = Request & { user?: ReqUser | null };

/* ---------- Secrets ---------- */
function secret(): Buffer { if (process.env.PP_SECRET) return Buffer.from(process.env.PP_SECRET); const f = resolve(DATA_DIR, 'secret.key'); mkdirSync(DATA_DIR, { recursive: true }); if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex')); return Buffer.from(readFileSync(f, 'utf8')); }
let SECRET: Buffer; const key = () => (SECRET ||= secret());

/* ---------- Passwords and sessions ---------- */
export function hashPassword(pw: string) { const salt = randomBytes(16); return 'scrypt$' + salt.toString('hex') + '$' + scryptSync(pw, salt, 64).toString('hex'); }
export function verifyPassword(pw: string, stored: string) { const [, salt, hash] = stored.split('$'); if (!salt || !hash) return false; const h = scryptSync(pw, Buffer.from(salt, 'hex'), 64); return timingSafeEqual(h, Buffer.from(hash, 'hex')); }
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
export const SESSION_COOKIE = 'pp_session';
export async function createSession(db: DB, userId: string, twofaPassed: boolean) {
  const token = randomBytes(32).toString('base64url');
  await db.insert(S.sessions).values({ id: sha(token), userId, twofaPassed, expiresAt: new Date(Date.now() + 14 * 864e5) });
  return token;
}
export async function loadSession(db: DB, token?: string): Promise<ReqUser | null> {
  if (!token) return null;
  const rows = await db.select().from(S.sessions).innerJoin(S.users, eq(S.sessions.userId, S.users.id)).where(and(eq(S.sessions.id, sha(token)), gt(S.sessions.expiresAt, new Date()))).limit(1);
  if (!rows.length || rows[0].users.deletedAt) return null;
  return { ...rows[0].users, sessionId: rows[0].sessions.id, twofaPassed: rows[0].sessions.twofaPassed };
}
export const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.RENDER === 'true' || process.env.PP_SECURE_COOKIE === '1', path: '/', maxAge: 14 * 864e5 };

export function requireUser(req: Req): ReqUser { if (!req.user) throw new UnauthorizedException('Please log in.'); return req.user; }
export function requireStaff(req: Req, roles: string[] = STAFF_ROLES): ReqUser {
  const u = requireUser(req);
  if (!isStaff(u)) throw new ForbiddenException('Staff only.');
  if (u.role !== 'admin' && !roles.includes(u.role)) throw new ForbiddenException(`Your role (${u.role}) cannot do this.`);
  if (!u.twofaPassed) throw new ForbiddenException('Staff accounts need two-factor login.');
  return u;
}
export const viewerOf = (req: Req): Viewer | null => req.user ? { id: req.user.id, role: req.user.role, verified: req.user.verified, pro: req.user.pro, twofaEnabled: req.user.twofaEnabled } : null;

/* ---------- Signed, expiring links (plan: 5-minute signed URLs) ---------- */
export function signToken(payload: Record<string, unknown>, ttlSec = 300) { const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString('base64url'); return body + '.' + createHmac('sha256', key()).update(body).digest('base64url'); }
export function readToken<T = any>(token: string): T | null { const [body, sig] = String(token).split('.'); if (!body || !sig) return null; const exp = createHmac('sha256', key()).update(body).digest('base64url'); if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null; const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; }

/* ---------- Storage (local folder in demo; S3-compatible bucket in production) ---------- */
const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
export async function saveFile(db: DB, buf: Buffer, originalName: string) { const ext = extname(originalName || '').toLowerCase().slice(0, 8) || '.bin'; const k = randomBytes(16).toString('hex') + ext; await db.insert(schema.files).values({ key: k, name: String(originalName || 'file').slice(0, 200), mime: MIME[ext] || 'application/octet-stream', size: buf.length, data: buf.toString('base64') }); return k; }
export async function readStored(db: DB, k: string) { const f = (await db.select().from(schema.files).where(eq(schema.files.key, k)))[0]; if (!f) throw new Error('File not found: ' + k); return Buffer.from(f.data, 'base64'); }

/* ---------- Audit, notifications, automation ---------- */
export async function audit(db: DB, req: Req | null, action: string, objectType: string, objectId: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(S.auditEvents).values({ actorId: req?.user?.id ?? null, actorLabel: req?.user ? `${req.user.name} <${req.user.email}>` : 'Visitor', action, objectType, objectId, meta, ip: req ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : null });
}
export async function notify(db: DB, userId: string, type: string, title: string, body: string, listingSlug: string | null = null) { await db.insert(S.notifications).values({ userId, type, title, body, listingSlug }); }
export async function ruleOn(db: DB, k: string) { const r = await db.select().from(S.automationSettings).where(eq(S.automationSettings.key, k)); return r[0]?.enabled !== false; }
export async function logRule(db: DB, rule: string, text: string) { await db.insert(S.automationLog).values({ rule, text }); }
export async function draftEmail(db: DB, to: string, subject: string, body: string, kind: string) { if (await ruleOn(db, 'emails')) { await db.insert(S.outbox).values({ toEmail: to, subject, body, kind }); await logRule(db, 'emails', `Confirmation drafted for ${to}`); } }
export async function getConfig(db: DB): Promise<ConfigMap> { const rows = await db.select().from(S.config); return Object.fromEntries(rows.map(r => [r.key, r.value])); }

/* ---------- Listing serialisation with server-side access control ---------- */
export type ListingRow = typeof S.listings.$inferSelect; export type PropertyRow = typeof S.properties.$inferSelect;
export function serializeListing(l: ListingRow, p: PropertyRow, viewer: Viewer | null, c: ConfigMap, extra: { hasNda?: boolean; saved?: boolean; bidRound?: any } = {}) {
  const om = offMarketState(l.dealType, l.proEarlyAccessUntil, viewer);
  const base = { id: l.id, slug: l.slug, status: l.status, dealType: l.dealType, city: p.city, publishedAt: l.publishedAt, offMarket: om, saved: !!extra.saved };
  if (om !== 'open') return { ...base, locked: true, propertyType: p.propertyType, propertyTypeNl: p.propertyTypeNl, areaM2: p.areaM2, image: p.image, proEarlyAccessUntil: l.proEarlyAccessUntil };
  const full = canDetails(viewer); const fg = figures({ askingPrice: l.askingPrice, grossRentAnnual: l.grossRentAnnual, operatingCostsAnnual: l.operatingCostsAnnual, areaM2: p.areaM2, unitsCount: 0 }, c);
  const onReq = l.priceOnRequest && !viewer?.verified && !isStaff(viewer);
  const score = dealScore({ askingPrice: l.askingPrice, grossRentAnnual: l.grossRentAnnual, energyLabel: p.energyLabel, demand: l.demand, occupancy: l.occupancy, plotM2: p.plotM2, areaM2: p.areaM2, buildYear: p.buildYear });
  const teaser = { ...base, locked: false, name: l.name, nameNl: l.nameNl, description: l.description, descriptionNl: l.descriptionNl, highlights: l.highlights, district: p.district, category: p.category, propertyType: p.propertyType, propertyTypeNl: p.propertyTypeNl, image: p.image, areaM2: p.areaM2, plotM2: p.plotM2, featured: l.featured,
    priceDisplay: full ? (onReq ? 'Price on request' : null) : priceBand(l.askingPrice, l.priceOnRequest), bar: l.grossRentAnnual ? +fg.bar.toFixed(2) : null, dealScore: score, full, bidRound: extra.bidRound || null };
  if (!full) return teaser;
  return { ...teaser, askingPrice: onReq ? null : l.askingPrice, previousPrice: onReq ? null : l.previousPrice, priceType: l.priceType, address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng,
    grossRentAnnual: l.grossRentAnnual, operatingCostsAnnual: fg.opex, nar: l.grossRentAnnual ? +fg.nar.toFixed(2) : null, perM2: onReq ? null : Math.round(fg.perM2), wozValue: p.wozValue, wozYear: p.wozYear, energyLabel: p.energyLabel, tenure: p.tenure, buildYear: p.buildYear, occupancy: l.occupancy,
    acquisition: onReq ? null : fg.acquisition, hasNda: !!extra.hasNda, dataRoom: !!(viewer?.verified && extra.hasNda) };
}
export const tierInfo = (u: ReqUser | null | undefined) => ({ tier: tierOf(u ? { id: u.id, verified: u.verified, pro: u.pro } : null) });
