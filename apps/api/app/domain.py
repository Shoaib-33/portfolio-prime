"""Pure business rules. No database access here, so they are easy to test (plan: 100% branch coverage on calculators and access rules)."""
from __future__ import annotations
import base64, hashlib, hmac, math, os, re, struct, time
from datetime import datetime, timezone
from typing import Any, Optional

# A viewer is a plain dict: id, role, verified, pro, twofaEnabled, investorType, listingScope, listingIds, features
Viewer = Optional[dict]

STAFF_ROLES = ['admin', 'developer', 'acquisition', 'sales', 'compliance', 'editor', 'readonly']
SUPER_ROLES = ['admin', 'developer']  # every right; the other staff roles are limited to their area


def is_staff(v: Viewer) -> bool:
    return bool(v) and (v.get('role') or '') in STAFF_ROLES


def is_super(v: Viewer) -> bool:
    return bool(v) and (v.get('role') or '') in SUPER_ROLES


def tier_of(v: Viewer) -> str:
    if not v or not v.get('id'): return 'visitor'
    if v.get('pro') and v.get('verified'): return 'pro'
    if v.get('verified'): return 'verified'
    return 'free'


TIER_LABEL = {'visitor': 'Visitor', 'free': 'Free member', 'verified': 'Verified investor', 'pro': 'Investor Pro'}


def alert_frequency(v: Viewer):
    return {'visitor': None, 'free': 'weekly', 'verified': 'daily', 'pro': 'instant'}[tier_of(v)]


def can_details(v: Viewer) -> bool:
    return tier_of(v) != 'visitor' or is_staff(v)


def can_offer(v: Viewer) -> bool:
    return bool(v and v.get('verified'))


# ---------- Invite-only access ----------
# Visitors see only the public company pages. An invited person sees the properties an admin shared with them
# (or all, including future listings) and only the features switched on for them. Staff see everything.
FEATURES = [
    {'key': 'map', 'label': 'Map view', 'desc': 'See shared properties on a map with exact pins.', 'group': 'Explore'},
    {'key': 'finder', 'label': 'Smart finder', 'desc': 'Match equity and financing to the shared properties.', 'group': 'Explore'},
    {'key': 'market', 'label': 'Market report', 'desc': 'Yields, prices and transactions per city.', 'group': 'Explore'},
    {'key': 'analysis', 'label': 'Analysis & IC memo', 'desc': 'Valuation, comparables, stress tests, ESG and the memo PDF.', 'group': 'Underwrite'},
    {'key': 'analyst', 'label': 'AI analyst', 'desc': 'Ask questions about a property; answers cite the data.', 'group': 'Underwrite'},
    {'key': 'dataroom', 'label': 'Data room', 'desc': 'NDA, documents and the unit-level rent roll (after KYC).', 'group': 'Underwrite'},
    {'key': 'institutional', 'label': 'Private deal rooms', 'desc': 'Structured sale process with Q&A for institutions.', 'group': 'Transact'},
    {'key': 'offers', 'label': 'Offers & bids', 'desc': 'Make offers, sealed bids and process bids (after KYC).', 'group': 'Transact'},
    {'key': 'messages', 'label': 'Messages', 'desc': 'Secure chat with the account manager.', 'group': 'Transact'},
    {'key': 'membership', 'label': 'Membership', 'desc': 'Investor Pro upgrade and off-market first look.', 'group': 'Account'},
    {'key': 'sell', 'label': 'Sell to us', 'desc': 'Offer a property or portfolio to our acquisition team.', 'group': 'Account'},
]
FEATURE_KEYS = [f['key'] for f in FEATURES]
FEATURE_PRESETS = [
    {'key': 'viewer', 'label': 'Viewer', 'desc': 'Looks at the shared properties and asks questions.', 'features': ['map', 'messages']},
    {'key': 'buyer', 'label': 'Buyer', 'desc': 'Underwrites, opens the data room and makes offers.', 'features': ['map', 'finder', 'analysis', 'analyst', 'dataroom', 'offers', 'messages']},
    {'key': 'institution', 'label': 'Institution', 'desc': 'Private deal rooms, analysis, AI and bids.', 'features': ['map', 'market', 'analysis', 'analyst', 'dataroom', 'institutional', 'offers', 'messages']},
    {'key': 'everything', 'label': 'Everything', 'desc': 'Every feature.', 'features': FEATURE_KEYS},
]


def preset(key: str) -> list[str]:
    return list(next(p for p in FEATURE_PRESETS if p['key'] == key)['features'])


def can_see_listing(v: Viewer, listing_id: str) -> bool:
    """Can this person see this listing at all? Visitors never; staff always; invited people only what was shared."""
    if not v or not v.get('id'): return False
    if is_staff(v): return True
    return v.get('listingScope') == 'all' or listing_id in (v.get('listingIds') or [])


def has_feature(v: Viewer, key: str) -> bool:
    return bool(v and v.get('id')) and (is_staff(v) or key in (v.get('features') or []))


def features_of(v: Viewer) -> list[str]:
    if not v or not v.get('id'): return []
    if is_staff(v): return list(FEATURE_KEYS)
    return [k for k in FEATURE_KEYS if k in (v.get('features') or [])]


# Qualified (institutional) investors: verified funds, family offices, pension funds and insurers (KYB + proof of funds).
INSTITUTIONAL_TYPES = ['Fund', 'Family office', 'Pension fund', 'Insurer', 'Institutional investor']


def is_qualified(v: Viewer) -> bool:
    return is_staff(v) or (bool(v and v.get('verified')) and (v.get('investorType') or '') in INSTITUTIONAL_TYPES)


def _ts(x) -> float:
    if isinstance(x, datetime): return x.timestamp() * 1000
    return datetime.fromisoformat(str(x).replace('Z', '+00:00')).timestamp() * 1000


def off_market_state(deal_type: str, pro_until, v: Viewer, now: float | None = None) -> str:
    """Off-market visibility: Pro first, verified investors after the early-access window, everyone else locked.
    Institutional deals (private deal rooms) open to qualified investors only."""
    now = time.time() * 1000 if now is None else now
    if deal_type == 'institutional': return 'open' if is_qualified(v) else 'locked'
    if deal_type != 'off_market' or is_staff(v): return 'open'
    t = tier_of(v)
    if t == 'pro': return 'open'
    if t == 'verified': return 'open' if pro_until and now >= _ts(pro_until) else 'pro-window'
    return 'locked'


def _fmt_m(x: float) -> str:
    s = f'{x / 1e6:.2f}'.rstrip('0').rstrip('.')
    return s


def price_band(price: float, on_request: bool = False) -> str:
    if on_request: return 'Price on request'
    step = 250000 if price < 2e6 else 500000 if price < 5e7 else 5e7
    lo = math.floor(price / step) * step
    return f'€{_fmt_m(lo)}–{_fmt_m(lo + step)}m'


# ---------- Config table (plan: TaxRate / Config, never hard-coded) ----------
CONFIG_DEFAULTS = [
    {'key': 'transfer_tax_residential_investor', 'label': 'Transfer tax · residential, investor', 'value': 8, 'unit': '%', 'validFrom': '2026-01-01'},
    {'key': 'transfer_tax_own_home', 'label': 'Transfer tax · own main residence', 'value': 2, 'unit': '%', 'validFrom': '2026-01-01'},
    {'key': 'transfer_tax_commercial', 'label': 'Transfer tax · commercial property', 'value': 10.4, 'unit': '%', 'validFrom': '2026-01-01'},
    {'key': 'other_acquisition_costs', 'label': 'Notary, valuation and financing fees', 'value': 1, 'unit': '%', 'validFrom': '2026-01-01'},
    {'key': 'buyer_fee', 'label': 'Buyer’s fee on own stock (open question in plan)', 'value': 0, 'unit': '%', 'validFrom': '2026-01-01'},
    {'key': 'pro_price_month', 'label': 'Investor Pro · monthly', 'value': 99, 'unit': '€', 'validFrom': '2026-01-01'},
    {'key': 'pro_price_year', 'label': 'Investor Pro · yearly', 'value': 990, 'unit': '€', 'validFrom': '2026-01-01'},
    {'key': 'source_of_funds_threshold', 'label': 'Source-of-funds check above', 'value': 1000000, 'unit': '€', 'validFrom': '2026-01-01'},
    {'key': 'wws_social_points', 'label': 'WWS · social rent up to (points)', 'value': 143, 'unit': 'pts', 'validFrom': '2026-07-01'},
    {'key': 'wws_mid_points', 'label': 'WWS · mid rent up to (points)', 'value': 186, 'unit': 'pts', 'validFrom': '2026-07-01'},
    {'key': 'wws_rent_per_point', 'label': 'WWS · maximum rent per point (approx.)', 'value': 6.4, 'unit': '€', 'validFrom': '2026-07-01'},
    {'key': 'institutional_min_ticket', 'label': 'Private deal room · minimum ticket', 'value': 25000000, 'unit': '€', 'validFrom': '2026-01-01'},
]


def cfg(c: dict, key: str) -> float:
    if c and key in c and c[key] is not None:
        v = float(c[key]); return int(v) if v.is_integer() else v
    d = next((x['value'] for x in CONFIG_DEFAULTS if x['key'] == key), 0)
    return d


# ---------- Underwriting (plan section 5) ----------
def acquisition(price: float, c: dict, own_home: bool = False, homes: bool = False) -> dict:
    tax_rate = cfg(c, 'transfer_tax_own_home') if own_home and homes else cfg(c, 'transfer_tax_residential_investor')
    tax = round(price * tax_rate / 100); other = round(price * cfg(c, 'other_acquisition_costs') / 100); fee = round(price * cfg(c, 'buyer_fee') / 100)
    return {'taxRate': tax_rate, 'tax': tax, 'other': other, 'fee': fee, 'total': price + tax + other + fee}


def figures(l: dict, c: dict) -> dict:
    a = acquisition(l['askingPrice'], c); rent = l.get('grossRentAnnual') or 0
    opex = l.get('operatingCostsAnnual'); opex = rent * 0.22 if opex is None else opex
    return {'bar': rent / l['askingPrice'] * 100 if rent else 0, 'nar': (rent - opex) / a['total'] * 100 if rent else 0, 'perM2': l['askingPrice'] / l['areaM2'],
            'perUnit': l['askingPrice'] / max(1, l.get('unitsCount') or 0), 'grm': l['askingPrice'] / rent if rent else 0, 'opex': opex, 'acquisition': a}


def finance(price: float, rent: float, ltv=60, interest=4, expense=22, vacancy=3, costs=9) -> dict:
    loan = price * ltv / 100; equity = price - loan + price * costs / 100; net = rent * (1 - vacancy / 100) * (1 - expense / 100); debt = loan * interest / 100; cash = net - debt
    return {'loan': loan, 'equity': equity, 'net': net, 'debt': debt, 'cash': cash, 'coc': cash / equity * 100 if equity else 0, 'dscr': net / debt if debt else 0}


def max_price(equity: float, ltv: float) -> int:
    return math.floor(equity / (1 - ltv / 100 + 0.09))


LABEL_SCORE = {'A': 95, 'B': 85, 'C': 70, 'D': 55, 'E': 40, 'F': 30, 'G': 20}


def _clamp(v: float) -> int:
    return max(0, min(100, js_round(v)))


def js_round(x: float) -> int:
    """Math.round semantics (halves round up), unlike Python's banker's rounding."""
    return math.floor(x + 0.5)


def deal_score(l: dict) -> dict:
    income = bool(l.get('grossRentAnnual')); y = l['grossRentAnnual'] / l['askingPrice'] * 100 if income else 0
    occ = l.get('occupancy'); plot = l.get('plotM2') or 0
    parts = [
        ['Rental yield' if income else 'Space & setting', _clamp((y - 3.5) / 3 * 100) if income else _clamp(45 + min(plot / 1500, 1) * 30 + min(l['areaM2'] / 400, 1) * 20)],
        ['Energy performance', LABEL_SCORE.get(l['energyLabel'], 50)],
        ['Buyer demand', _clamp(25 + (l.get('demand') or 0) * 5)],
        ['Income stability' if income else 'Building condition', _clamp(80 if occ is None else occ) if income else _clamp(85 if l['buildYear'] >= 2000 else 72 if l['buildYear'] >= 1950 else 62)],
    ]
    w = [0.35, 0.2, 0.2, 0.25]
    total = _clamp(sum(p[1] * w[i] for i, p in enumerate(parts)))
    return {'total': total, 'band': 'Strong' if total >= 75 else 'Good' if total >= 60 else 'Fair', 'parts': parts}


# ---------- CRM, compliance ----------
def lead_score(kind: str, verified: bool, amount=None, message=None, units=None, asking_price=None) -> dict:
    v = {'offer': 50, 'bid': 55, 'viewing': 35, 'question': 20}.get(kind, 15)
    if verified: v += 15
    if amount and asking_price and amount >= asking_price * 0.95: v += 20
    elif amount: v += 8
    if units: v += 5
    if len(message or '') > 80: v += 5
    v = _clamp(v); return {'value': v, 'band': 'Hot' if v >= 70 else 'Warm' if v >= 45 else 'Cold'}


def kyc_risk(investor_type='Private person', country='NL', ticket=0, pep=False) -> str:
    v = 0
    if country not in ['NL', 'BE', 'DE', 'FR', 'LU']: v += 2
    if investor_type in ['Fund', 'Family office']: v += 1
    if float(ticket or 0) > 5e6: v += 1
    if pep: v += 3
    return 'high' if v >= 4 else 'medium' if v >= 2 else 'low'


DEAL_STAGES = ['Offer accepted', 'LOI signed', 'Purchase agreement signed', 'Cooling-off period (3 days, private buyers)', 'Deposit paid to notary', 'Due diligence & conditions lapse', 'Notary transfer']
LEAD_STAGES = ['new', 'contacted', 'valuation', 'offer_made', 'under_contract', 'acquired', 'lost']
LISTING_STATUSES = ['draft', 'coming_soon', 'available', 'under_offer', 'sold_stc', 'sold', 'withdrawn']
DEAL_TYPES = ['direct', 'portfolio', 'bid_round', 'off_market', 'institutional']

# ---------- Location: provinces, city centres, distance (map and radius search) ----------
CITY_GEO = {
    'Amsterdam': {'province': 'Noord-Holland', 'lat': 52.3728, 'lng': 4.8936}, 'Haarlem': {'province': 'Noord-Holland', 'lat': 52.3808, 'lng': 4.6368},
    'Rotterdam': {'province': 'Zuid-Holland', 'lat': 51.9225, 'lng': 4.4792}, 'Den Haag': {'province': 'Zuid-Holland', 'lat': 52.0705, 'lng': 4.3007}, 'Wassenaar': {'province': 'Zuid-Holland', 'lat': 52.1428, 'lng': 4.4014},
    'Utrecht': {'province': 'Utrecht', 'lat': 52.0907, 'lng': 5.1214}, 'Eindhoven': {'province': 'Noord-Brabant', 'lat': 51.4416, 'lng': 5.4697},
}
PROVINCES = ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland']


def province_of(city: str):
    return CITY_GEO.get(city, {}).get('province')


def distance_km(a: dict, b: dict) -> float:
    r = math.radians; d_lat = r(b['lat'] - a['lat']); d_lng = r(b['lng'] - a['lng'])
    h = math.sin(d_lat / 2) ** 2 + math.cos(r(a['lat'])) * math.cos(r(b['lat'])) * math.sin(d_lng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _imul31(a: int, c: int) -> int:
    return (a * 31 + c) & 0xFFFFFFFF


def bag_lookup(postcode: str, number: str):
    """Simulated BAG response. Production: BAG API Individuele Bevragingen v2 behind the same adapter."""
    pc = re.sub(r'\s', '', str(postcode or '').upper())
    if not re.fullmatch(r'\d{4}[A-Z]{2}', pc) or not str(number or '').strip(): return None
    h = 7
    for ch in pc + str(number): h = _imul31(h, ord(ch))
    p2 = int(pc[:2])
    city = 'Amsterdam' if p2 <= 11 else 'Den Haag' if 25 <= p2 <= 26 else 'Rotterdam' if 30 <= p2 <= 31 else 'Utrecht' if p2 == 35 else 'Eindhoven' if p2 == 56 else 'Haarlem'
    g = CITY_GEO[city]
    return {'address': f'Sample street {number}', 'postcode': f'{pc[:4]} {pc[4:]}', 'city': city, 'buildYear': 1900 + h % 118, 'areaM2': 420 + h % 1600, 'units': 4 + h % 30,
            'use': 'woonfunctie', 'energyLabel': 'ABCDEF'[h % 6], 'lat': round(g['lat'] + ((h % 41) - 20) / 1000, 4), 'lng': round(g['lng'] + ((h >> 8) % 41 - 20) / 1000, 4), 'source': 'Simulated BAG response'}


def matches_search(l: dict, f: dict) -> bool:
    """Saved search / buy-box matching."""
    if l['status'] in ['under_offer', 'sold', 'sold_stc', 'draft', 'withdrawn']: return False
    bar = l['grossRentAnnual'] / l['askingPrice'] * 100 if l.get('grossRentAnnual') else 0
    g = lambda k: f.get(k)
    if g('city') and g('city') != 'all' and l['city'] != g('city'): return False
    if g('regions') and l['city'] not in g('regions'): return False
    if g('category') and g('category') != 'all' and l['category'] != g('category'): return False
    if g('types') and l['category'] not in g('types'): return False
    if g('dealType') and g('dealType') != 'all' and l['dealType'] != g('dealType'): return False
    if g('budget') and l['askingPrice'] > float(g('budget')): return False
    if g('ticketMax') and l['askingPrice'] > float(g('ticketMax')): return False
    if g('ticketMin') and l['askingPrice'] < float(g('ticketMin')): return False
    if g('minYield') and bar < float(g('minYield')): return False
    if g('targetBar') and bar < float(g('targetBar')): return False
    return True


# ---------- TOTP (RFC 6238) ----------
def new_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode().rstrip('=')


def totp(secret: str, at: float | None = None, step: int = 30) -> str:
    at = time.time() * 1000 if at is None else at
    key = base64.b32decode(secret + '=' * (-len(secret) % 8))
    h = hmac.new(key, struct.pack('>Q', int(at // 1000 // step)), hashlib.sha1).digest()
    o = h[-1] & 15
    return str((struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000).zfill(6)


def verify_totp(secret: str, code: str, at: float | None = None) -> bool:
    at = time.time() * 1000 if at is None else at
    return any(totp(secret, at + w * 30000) == str(code).strip() for w in (-1, 0, 1))
