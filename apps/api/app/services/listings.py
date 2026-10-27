"""Listing queries with access control applied per viewer, plus buy-box matching and price-drop alerts."""
from __future__ import annotations
from .. import db
from ..db import T, select, func, and_, desc
from ..common import serialize_listing, get_config, notify, log_rule, rule_on, draft_email, eur_nl
from ..domain import (CITY_GEO, alert_frequency, can_details, can_see_listing, distance_km, is_qualified, is_staff, matches_search, province_of, tier_of)
from ..geo import resolve_place

LJ = T  # alias for readability in joins


def _join():
    return T.listings.join(T.properties, T.listings.c.property_id == T.properties.c.id)


def _split(r: dict) -> tuple[dict, dict]:
    """A joined listings+properties row -> (listing, property) dicts (column names overlap, so select them labelled)."""
    l = {k[2:]: v for k, v in r.items() if k.startswith('l_')}; p = {k[2:]: v for k, v in r.items() if k.startswith('p_')}
    return l, p


def _cols():
    return [c.label('l_' + c.name) for c in T.listings.c] + [c.label('p_' + c.name) for c in T.properties.c]


def listing_rows(*where, order=None) -> list[tuple[dict, dict]]:
    stmt = select(*_cols()).select_from(_join())
    if where: stmt = stmt.where(and_(*where))
    if order is not None: stmt = stmt.order_by(*order)
    return [_split(r) for r in db.rows(stmt)]


def unit_counts(property_ids: list[str]) -> dict[str, int]:
    if not property_ids: return {}
    rs = db.rows(select(T.units.c.property_id, func.count().label('n')).where(T.units.c.property_id.in_(property_ids)).group_by(T.units.c.property_id))
    return {r['property_id']: int(r['n']) for r in rs}


def bid_round_info(listing_id: str) -> dict | None:
    r = db.get(T.bid_rounds, listing_id=listing_id)
    if not r: return None
    n = db.count(T.offers, T.offers.c.bid_round_id == r['id'])
    return {'id': r['id'], 'opensAt': r['opens_at'], 'closesAt': r['closes_at'], 'minBid': r['min_bid'], 'status': r['status'], 'sealedBids': n}


def list_listings(viewer: dict | None, f: dict | None = None) -> list[dict]:
    """Listing query with access control applied per viewer. Sold, draft and withdrawn listings are excluded."""
    f = {k: v for k, v in (f or {}).items()}
    rs = listing_rows(T.listings.c.status.notin_(['draft', 'withdrawn', 'sold']), order=[desc(T.listings.c.featured), desc(T.listings.c.published_at)])
    c = get_config(); counts = unit_counts([p['id'] for _, p in rs])
    saved = {x['listing_id'] for x in db.all_(T.favorites, T.favorites.c.user_id == viewer['id'])} if viewer and viewer.get('id') else set()
    q = str(f.get('q') or '').lower().strip()
    near = resolve_place(f['near']) if f.get('near') else None
    try: radius = min(100, max(1, float(f.get('radius') or 25)))
    except ValueError: radius = 25
    exact = can_details(viewer); out = []
    for l, p in rs:
        if not can_see_listing(viewer, l['id']): continue  # invite-only: just the properties shared with this person
        if f.get('province') and province_of(p['city']) != f['province']: continue
        if near:
            # Distance from the exact location for members; from the city centre for visitors (no address leak via radius probing).
            at = {'lat': p['lat'], 'lng': p['lng']} if exact and p['lat'] is not None and p['lng'] is not None else CITY_GEO.get(p['city'])
            if not at or distance_km(near, at) > radius: continue
        if not matches_search({'city': p['city'], 'category': p['category'], 'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'dealType': l['deal_type'], 'status': 'available'}, f): continue
        if f.get('minLabel') and 'ABCDEFG'.find(p['energy_label']) > 'ABCDEFG'.find(f['minLabel']): continue
        if q and q not in ' '.join(str(x or '') for x in [l['name'], l['name_nl'], p['city'], p['district'], p['property_type'], p['property_type_nl'], l['description']]).lower(): continue
        out.append({**serialize_listing(l, p, viewer, c, saved=l['id'] in saved), 'unitsCount': counts.get(p['id'], 1)})
    sorters = {'newest': lambda x: -(x['publishedAt'].timestamp() if x.get('publishedAt') else 0), 'price-low': lambda x: x.get('askingPrice') if x.get('askingPrice') is not None else 9e12,
               'bar': lambda x: -(x.get('bar') or 0), 'score': lambda x: -((x.get('dealScore') or {}).get('total') or 0)}
    if f.get('sort') in sorters: out.sort(key=sorters[f['sort']])
    return out


def get_listing(slug: str) -> dict | None:
    rs = listing_rows(T.listings.c.slug == slug)
    if not rs: return None
    l, p = rs[0]; return {'l': l, 'p': p}


def get_listing_by_id(listing_id: str) -> dict | None:
    rs = listing_rows(T.listings.c.id == listing_id)
    if not rs: return None
    l, p = rs[0]; return {'l': l, 'p': p}


def visible_listing(slug: str, v: dict | None) -> dict | None:
    """Listing by slug, only when this viewer may see it (otherwise None, so callers answer 404 and never confirm it exists)."""
    x = get_listing(slug)
    return x if x and can_see_listing(v, x['l']['id']) else None


def has_nda(user_id: str | None, listing_id: str) -> bool:
    if not user_id: return False
    return db.get(T.nda_signatures, user_id=user_id, listing_id=listing_id) is not None


def audience_of(listing_id: str) -> set[str]:
    """People explicitly sharing this listing (staff and scope 'all' are added by `_reaches`)."""
    return {r['user_id'] for r in db.all_(T.listing_access, T.listing_access.c.listing_id == listing_id)}


def _reaches(u: dict, shared: set[str]) -> bool:
    return u['status'] == 'active' and (is_staff(u) or u['listing_scope'] == 'all' or u['id'] in shared)


def run_matching(listing_id: str, audience: str = 'publish') -> int:
    """Buy-box and saved-search matching on publish. Off-market: Pro now, verified investors when the early-access window ends."""
    if not rule_on('matches'): return 0
    x = get_listing_by_id(listing_id)
    if not x: return 0
    l, p = x['l'], x['p']
    subject = {'city': p['city'], 'category': p['category'], 'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'dealType': l['deal_type'], 'status': l['status']}
    investors = db.all_(T.users, T.users.c.role == 'investor')
    boxes = {b['user_id']: b for b in db.all_(T.buy_boxes)}; searches = db.all_(T.saved_searches); shared = audience_of(listing_id)
    n = 0
    for u in investors:
        if u['deleted_at'] or not _reaches(u, shared): continue
        v = {'id': u['id'], 'verified': u['verified'], 'pro': u['pro'], 'investorType': u['investor_type']}; tier = tier_of(v)
        if l['deal_type'] == 'off_market':
            if audience == 'publish' and tier != 'pro': continue
            if audience == 'release' and tier != 'verified': continue
        if l['deal_type'] == 'institutional' and not is_qualified(v): continue
        b = boxes.get(u['id'])
        fit_box = b and matches_search(subject, {'regions': b['regions'], 'types': b['types'], 'ticketMin': b['ticket_min'], 'ticketMax': b['ticket_max'], 'targetBar': b['target_bar']})
        fit_search = any(s['user_id'] == u['id'] and matches_search(subject, s['filters']) for s in searches)
        if not fit_box and not fit_search: continue
        notify(u['id'], 'match', 'Off-market match: first look' if l['deal_type'] == 'off_market' else 'A new property matches your buy box', f"{l['name']} · {p['city']}", l['slug'])
        if alert_frequency(v) == 'instant':
            draft_email(u['email'], 'New match: ' + l['name'], f"A property matching your criteria was just published: {l['name']} in {p['city']}.", 'match')
        n += 1
    log_rule('matches', f"{l['name']} {'released to verified investors' if audience == 'release' else 'published'} · {n} investor{'' if n == 1 else 's'} alerted{' (Investor Pro first)' if l['deal_type'] == 'off_market' and audience == 'publish' else ''}")
    return n


def price_changed(listing_id: str, old_price: int, new_price: int) -> int:
    """Price change: alert investors who saved the listing, and saved searches it now fits."""
    if new_price >= old_price or not rule_on('priceAlerts'):
        log_rule('priceAlerts', f'Price set to €{eur_nl(new_price)} · no alerts'); return 0
    x = get_listing_by_id(listing_id); l, p = x['l'], x['p']; n = 0; done: set[str] = set()
    shared = audience_of(listing_id); users = {u['id']: u for u in db.all_(T.users)}
    ok = lambda uid: uid in users and _reaches(users[uid], shared)
    for f in db.all_(T.favorites, T.favorites.c.listing_id == listing_id):
        if not ok(f['user_id']): continue
        notify(f['user_id'], 'price', 'Price reduced on a saved property', f"{l['name']} · now €{eur_nl(new_price)} (was €{eur_nl(old_price)})", l['slug']); done.add(f['user_id']); n += 1
    base = {'city': p['city'], 'category': p['category'], 'grossRentAnnual': l['gross_rent_annual'], 'dealType': l['deal_type'], 'status': l['status']}
    for s in db.all_(T.saved_searches):
        if s['user_id'] in done or not ok(s['user_id']): continue
        if matches_search({**base, 'askingPrice': new_price}, s['filters']) and not matches_search({**base, 'askingPrice': old_price}, s['filters']):
            notify(s['user_id'], 'price', 'Now within your budget', f"{l['name']} · €{eur_nl(new_price)}", l['slug']); done.add(s['user_id']); n += 1
    log_rule('priceAlerts', f"{l['name']} reduced to €{eur_nl(new_price)} · {n} alert{'' if n == 1 else 's'}")
    return n


def staff_or_verified(v: dict | None) -> bool:
    return is_staff(v) or bool(v and v.get('verified'))
