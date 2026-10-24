import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';
import { DB, schema as S } from '../db/client';
import { logRule, notify } from '../common';
import { runMatching } from './listings.service';

/* Background jobs stored in Postgres (plan uses Redis + BullMQ; this table-based queue keeps the demo to one database).
   Runs every 30 s: closes bid rounds at their deadline and releases off-market listings to verified investors. */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(@Inject('DB') private db: DB) {}
  onModuleInit() { if (process.env.PP_NO_JOBS !== '1') this.timer = setInterval(() => this.tick().catch(e => console.error('job tick failed', e)), 30000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async schedule(kind: string, runAt: Date, payload: Record<string, unknown>) { await this.db.insert(S.jobs).values({ kind, runAt, payload }); }
  async closeRound(id: string, by = 'scheduled job') {
    const r = (await this.db.select().from(S.bidRounds).innerJoin(S.listings, eq(S.bidRounds.listingId, S.listings.id)).where(eq(S.bidRounds.id, id)))[0];
    if (!r || r.bid_rounds.status !== 'open') return 0;
    await this.db.update(S.bidRounds).set({ status: 'closed' }).where(eq(S.bidRounds.id, id));
    const bids = await this.db.select().from(S.offers).where(eq(S.offers.bidRoundId, id));
    for (const b of bids) { await this.db.update(S.offers).set({ status: 'locked' }).where(eq(S.offers.id, b.id)); if (b.userId) await notify(this.db, b.userId, 'bid', 'Bid round closed', `${r.listings.name} · your sealed bid is locked. The result follows shortly.`, r.listings.slug); }
    await logRule(this.db, 'bidrounds', `Bid round for ${r.listings.name} closed by ${by} · ${bids.length} sealed bids locked`);
    return bids.length;
  }
  async tick() {
    let ran = 0; const now = new Date();
    for (const r of await this.db.select().from(S.bidRounds).where(and(eq(S.bidRounds.status, 'open'), lte(S.bidRounds.closesAt, now)))) { await this.closeRound(r.id); ran++; }
    for (const j of await this.db.select().from(S.jobs).where(and(eq(S.jobs.status, 'queued'), lte(S.jobs.runAt, now)))) {
      try { if (j.kind === 'offmarket_release') await runMatching(this.db, String(j.payload?.listingId), 'release'); await this.db.update(S.jobs).set({ status: 'done', attempts: j.attempts + 1 }).where(eq(S.jobs.id, j.id)); ran++; }
      catch (e: any) { await this.db.update(S.jobs).set({ status: j.attempts >= 2 ? 'failed' : 'queued', attempts: j.attempts + 1, lastError: String(e?.message || e) }).where(eq(S.jobs.id, j.id)); }
    }
    return ran;
  }
}
