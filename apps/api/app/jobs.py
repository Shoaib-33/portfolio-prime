"""Background jobs stored in PostgreSQL (the plan uses Redis + BullMQ; a table-based queue keeps the demo to one database).
Runs every 30 s: closes bid rounds at their deadline, releases off-market listings to verified investors and sends queued outreach emails in batches."""
from __future__ import annotations
import logging, os, threading
from . import db
from .db import T, and_
from .common import log_rule, notify, now
from .services.listings import run_matching

log = logging.getLogger('pp.jobs')
_stop = threading.Event()


def schedule(kind: str, run_at, payload: dict):
    db.ins(T.jobs, {'kind': kind, 'run_at': run_at, 'payload': payload}, returning=False)


def close_round(id: str, by: str = 'scheduled job') -> int:
    r = db.get(T.bid_rounds, id=id)
    if not r or r['status'] != 'open': return 0
    l = db.get(T.listings, id=r['listing_id'])
    db.upd(T.bid_rounds, T.bid_rounds.c.id == id, {'status': 'closed'})
    bids = db.all_(T.offers, T.offers.c.bid_round_id == id)
    for b in bids:
        db.upd(T.offers, T.offers.c.id == b['id'], {'status': 'locked'})
        if b['user_id']: notify(b['user_id'], 'bid', 'Bid round closed', f"{l['name']} · your sealed bid is locked. The result follows shortly.", l['slug'])
    log_rule('bidrounds', f"Bid round for {l['name']} closed by {by} · {len(bids)} sealed bids locked")
    return len(bids)


def tick() -> int:
    ran = 0; t = now()
    for r in db.all_(T.bid_rounds, T.bid_rounds.c.status == 'open', T.bid_rounds.c.closes_at <= t):
        close_round(r['id']); ran += 1
    for j in db.all_(T.jobs, T.jobs.c.status == 'queued', T.jobs.c.run_at <= t):
        try:
            if j['kind'] == 'offmarket_release': run_matching(str((j['payload'] or {}).get('listingId')), 'release')
            db.upd(T.jobs, T.jobs.c.id == j['id'], {'status': 'done', 'attempts': j['attempts'] + 1}); ran += 1
        except Exception as e:
            db.upd(T.jobs, T.jobs.c.id == j['id'], {'status': 'failed' if j['attempts'] >= 2 else 'queued', 'attempts': j['attempts'] + 1, 'last_error': str(e)[:500]})
    from .services.buyers import send_queued  # outreach emails go out gradually, a batch per tick
    ran += send_queued()['sent']
    return ran


def start():
    if os.environ.get('PP_NO_JOBS') == '1': return
    def loop():
        while not _stop.wait(30):
            try: tick()
            except Exception: log.exception('job tick failed')
    threading.Thread(target=loop, name='pp-jobs', daemon=True).start()


def stop():
    _stop.set()
