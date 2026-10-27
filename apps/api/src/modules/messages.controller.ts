import { Controller, Get, Post, Body, Query, Req, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, isNull, desc, asc } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { Req as R, requireUser, requireStaff, requireFeature, viewerOf, audit, notify, draftEmail } from '../common';
import { isStaff, canSeeListing } from '../domain';
import { parse } from './public.controller';

/** Plan section 11: secure in-platform messaging between investor and account manager, one thread per listing. */
@Controller()
export class MessagesController {
  constructor(@Inject('DB') private db: DB) {}

  private async listing(slug?: string | null, req?: R) {
    if (!slug || slug === 'general') return null;
    const l = (await this.db.select().from(S.listings).where(eq(S.listings.slug, slug)))[0]; if (!l || (req && !canSeeListing(viewerOf(req), l.id))) throw new NotFoundException('Listing not found'); return l;
  }
  private thread(investorId: string, listingId: string | null) { return and(eq(S.messages.investorId, investorId), listingId ? eq(S.messages.listingId, listingId) : isNull(S.messages.listingId)); }
  private async threads(investorId?: string) {
    const rows = await this.db.select({ m: S.messages, slug: S.listings.slug, listingName: S.listings.name, investorName: S.users.name, investorEmail: S.users.email, companyName: S.users.companyName })
      .from(S.messages).leftJoin(S.listings, eq(S.messages.listingId, S.listings.id)).innerJoin(S.users, eq(S.messages.investorId, S.users.id))
      .where(investorId ? eq(S.messages.investorId, investorId) : undefined).orderBy(desc(S.messages.createdAt));
    const map = new Map<string, any>();
    for (const r of rows) {
      const k = r.m.investorId + '|' + (r.slug || 'general');
      const t = map.get(k) || { investorId: r.m.investorId, investorName: r.investorName, investorEmail: r.investorEmail, companyName: r.companyName, slug: r.slug || 'general', listingName: r.listingName || 'General question', last: r.m.body.slice(0, 140), lastAt: r.m.createdAt, lastFromStaff: r.m.fromStaff, unreadForInvestor: 0, unreadForStaff: 0, count: 0 };
      t.count++; if (!r.m.readAt) { if (r.m.fromStaff) t.unreadForInvestor++; else t.unreadForStaff++; } map.set(k, t);
    }
    return [...map.values()];
  }
  private async conversation(investorId: string, listingId: string | null) {
    const rows = await this.db.select({ m: S.messages, sender: S.users.name }).from(S.messages).innerJoin(S.users, eq(S.messages.senderId, S.users.id)).where(this.thread(investorId, listingId)).orderBy(asc(S.messages.createdAt));
    return rows.map(r => ({ id: r.m.id, body: r.m.body, fromStaff: r.m.fromStaff, sender: r.sender, at: r.m.createdAt, read: !!r.m.readAt }));
  }
  private info(l: { slug: string; name: string } | null) { return l ? { slug: l.slug, name: l.name } : { slug: 'general', name: 'General question' }; }

  /* ---------- Investor ---------- */
  @Get('messages') async mine(@Req() req: R) { const u = requireFeature(req, 'messages'); return { threads: await this.threads(u.id) }; }
  @Get('messages/thread') async myThread(@Req() req: R, @Query('listing') slug: string) {
    const u = requireFeature(req, 'messages'); const l = await this.listing(slug, req);
    await this.db.update(S.messages).set({ readAt: new Date() }).where(and(this.thread(u.id, l?.id ?? null), eq(S.messages.fromStaff, true), isNull(S.messages.readAt)));
    return { listing: this.info(l), accountManager: u.accountManager || 'Sanne de Wit', messages: await this.conversation(u.id, l?.id ?? null) };
  }
  @Post('messages') async send(@Req() req: R, @Body() body: unknown) {
    const u = requireFeature(req, 'messages'); if (isStaff(u)) throw new BadRequestException('Staff reply from the staff workspace.');
    const b = parse(z.object({ listing: z.string().max(120).optional(), body: z.string().trim().min(2).max(4000) }), body);
    const l = await this.listing(b.listing, req);
    const [m] = await this.db.insert(S.messages).values({ investorId: u.id, listingId: l?.id ?? null, senderId: u.id, body: b.body }).returning();
    await audit(this.db, req, 'message_sent', 'message', m.id, { listing: l?.slug || 'general' });
    return { id: m.id };
  }

  /* ---------- Staff: sales (investor relations) and admin reply; compliance and read-only can read ---------- */
  @Get('admin/messages') async all(@Req() req: R) {
    requireStaff(req, ['admin', 'sales', 'compliance', 'readonly']);
    const threads = await this.threads(); return { threads, unread: threads.reduce((a, t) => a + t.unreadForStaff, 0) };
  }
  @Get('admin/messages/thread') async staffThread(@Req() req: R, @Query('investor') investorId: string, @Query('listing') slug: string) {
    const s = requireStaff(req, ['admin', 'sales', 'compliance', 'readonly']); parse(z.string().uuid(), investorId);
    const inv = (await this.db.select().from(S.users).where(eq(S.users.id, investorId)))[0]; if (!inv) throw new NotFoundException('Investor not found'); const l = await this.listing(slug);
    if (['admin', 'sales'].includes(s.role)) await this.db.update(S.messages).set({ readAt: new Date() }).where(and(this.thread(inv.id, l?.id ?? null), eq(S.messages.fromStaff, false), isNull(S.messages.readAt)));
    return { investor: { id: inv.id, name: inv.name, email: inv.email, companyName: inv.companyName, verified: inv.verified, pro: inv.pro }, listing: this.info(l), canReply: ['admin', 'sales'].includes(s.role), messages: await this.conversation(inv.id, l?.id ?? null) };
  }
  @Post('admin/messages') async reply(@Req() req: R, @Body() body: unknown) {
    const s = requireStaff(req, ['admin', 'sales']);
    const b = parse(z.object({ investorId: z.string().uuid(), listing: z.string().max(120).optional(), body: z.string().trim().min(2).max(4000) }), body);
    const inv = (await this.db.select().from(S.users).where(eq(S.users.id, b.investorId)))[0]; if (!inv || isStaff(inv)) throw new NotFoundException('Investor not found');
    const l = await this.listing(b.listing);
    const [m] = await this.db.insert(S.messages).values({ investorId: inv.id, listingId: l?.id ?? null, senderId: s.id, fromStaff: true, body: b.body }).returning();
    await this.db.update(S.messages).set({ readAt: new Date() }).where(and(this.thread(inv.id, l?.id ?? null), eq(S.messages.fromStaff, false), isNull(S.messages.readAt)));
    await notify(this.db, inv.id, 'message', `New message from ${s.name}`, `${l?.name || 'General question'} · ${b.body.slice(0, 90)}`, l?.slug ?? null);
    // The email only says there is a message: contents stay on the platform.
    await draftEmail(this.db, inv.email, inv.locale === 'nl' ? 'Nieuw bericht van uw accountmanager' : 'New message from your account manager', `${s.name} replied about ${l?.name || 'your question'}. Log in to read the message.`, 'message');
    await audit(this.db, req, 'message_reply', 'message', m.id, { investor: inv.id, listing: l?.slug || 'general' });
    return { id: m.id };
  }
}
