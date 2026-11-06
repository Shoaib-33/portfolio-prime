from __future__ import annotations
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, select, func, and_
from ..common import (audit, bad, draft_email, forbidden, get_config, json_body, log_rule, not_found, parse, require_feature, require_user,
                      serialize_listing, viewer_of, eur_nl)
import math
from datetime import datetime, timezone
from ..domain import CITY_GEO, bag_lookup, can_details, cfg, figures, finance, max_price, off_market_state, price_band, province_of
from ..geo import resolve_place
from ..services.listings import bid_round_info, get_listing, has_nda, list_listings, listing_rows, staff_or_verified, unit_counts, visible_listing

router = APIRouter()
def post(path): return router.post(path, status_code=201)

Email = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]


@router.get('/health')
def health():
    return {'ok': True, 'mode': 'demo', 'database': db.kind(), 'backend': 'FastAPI'}


@router.get('/config/public')
def public_config():
    c = get_config()
    return {'proPriceMonth': cfg(c, 'pro_price_month'), 'proPriceYear': cfg(c, 'pro_price_year'), 'buyerFee': cfg(c, 'buyer_fee'),
            # Used by the public FAQ, so its answers follow the configured rates
            'transferTaxResidential': cfg(c, 'transfer_tax_residential_investor'), 'transferTaxOwnHome': cfg(c, 'transfer_tax_own_home'), 'transferTaxCommercial': cfg(c, 'transfer_tax_commercial'),
            'otherAcquisitionCosts': cfg(c, 'other_acquisition_costs'), 'sourceOfFundsThreshold': cfg(c, 'source_of_funds_threshold')}


@router.get('/stats')
def stats():
    sold = db.one(select(func.count().label('n'), func.coalesce(func.sum(T.listings.c.asking_price), 0).label('v')).where(T.listings.c.status == 'sold'))
    inv = db.count(T.users, T.users.c.role == 'investor', T.users.c.verified.is_(True))
    return {'dealsClosed': 33 + int(sold['n']), 'volumeM': round(191 + int(sold['v']) / 1e6), 'verifiedInvestors': 1236 + inv, 'avgDaysToOffer': 23, 'note': 'Historic baseline plus live database counts'}


@router.get('/listings')
def listings(request: Request):
    """Invite-only: the offering is private. Logged-in people get the properties shared with them."""
    require_user(request)
    return list_listings(viewer_of(request), dict(request.query_params))


@router.get('/listings/sold')
def sold():
    rs = listing_rows(T.listings.c.status == 'sold'); counts = unit_counts([p['id'] for _, p in rs])
    return [{'city': p['city'], 'propertyType': p['property_type'], 'units': counts.get(p['id'], 1), 'priceBand': price_band(l['asking_price']), 'dealType': l['deal_type'], 'soldAt': l['published_at'], 'daysToOffer': l['demand'],
             **({'lat': CITY_GEO[p['city']]['lat'], 'lng': CITY_GEO[p['city']]['lng']} if p['city'] in CITY_GEO else {})} for l, p in rs]  # city centre only, never the address


# ---------- Visitor teasers: the offering is private, so only anonymised facts leave the server ----------
LIVE_STATUSES = ['available', 'coming_soon', 'under_offer']
CODENAMES = ['Linde', 'Eik', 'Beuk', 'Iep', 'Wilg', 'Els', 'Berk', 'Hazelaar', 'Esdoorn', 'Kastanje', 'Lijsterbes', 'Meidoorn', 'Vlier', 'Taxus', 'Hulst', 'Plataan']
TICKETS = {'lt2': (0, 2e6), '2-10': (2e6, 1e7), '10-50': (1e7, 5e7), '50plus': (5e7, 1e13)}


def _codename(listing_id: str) -> str:
    return 'Project ' + CODENAMES[sum(map(ord, str(listing_id))) % len(CODENAMES)]


def _live() -> list[tuple[dict, dict]]:
    return listing_rows(T.listings.c.status.in_(LIVE_STATUSES))


@router.get('/offering/teasers')
def offering_teasers():
    """Locked teaser cards for visitors: codename, city, type, units, price band and yield band. No name, address, photo or exact price."""
    rs = sorted(_live(), key=lambda r: (not r[0]['featured'], -(r[0]['published_at'].timestamp() if r[0]['published_at'] else 0)))
    counts = unit_counts([p['id'] for _, p in rs]); out = []
    for l, p in rs[:4]:
        y = (l['gross_rent_annual'] / l['asking_price'] * 100) if l['gross_rent_annual'] and l['asking_price'] and not l['price_on_request'] else None
        lo = math.floor(y * 2) / 2 if y else None
        out.append({'codename': _codename(l['id']), 'city': p['city'], 'province': province_of(p['city']), 'propertyType': p['property_type'], 'category': p['category'],
                    'units': counts.get(p['id'], 1), 'priceBand': price_band(l['asking_price'], l['price_on_request']), 'yieldBand': f'{lo:.1f}–{lo + .5:.1f}%' if lo else None,
                    'dealType': l['deal_type'], 'status': l['status'], 'isNew': bool(l['published_at'] and (datetime.now(timezone.utc) - l['published_at']).days < 14)})
    return {'items': out, 'total': len(rs)}


@router.get('/offering/match')
def offering_match(region: str = 'any', ticket: str = 'any', type: str = 'any'):
    """How many live properties fit a mandate (region = province, ticket band, category). Returns counts only."""
    rs = _live(); lo, hi = TICKETS.get(ticket, (0, 1e13))
    n = sum(1 for l, p in rs if (region == 'any' or province_of(p['city']) == region) and (type == 'any' or p['category'] == type)
            and (ticket == 'any' or (not l['price_on_request'] and lo <= l['asking_price'] < hi)))
    return {'count': n, 'total': len(rs), 'regions': sorted({province_of(p['city']) for _, p in rs if province_of(p['city'])})}


@router.get('/listings/map')
def listings_map(request: Request):
    """GeoJSON for the map view, same filters and access rules as the list."""
    require_feature(request, 'map')
    rs = [l for l in list_listings(viewer_of(request), dict(request.query_params)) if not l['locked'] and l.get('point')]
    return {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [l['point']['lng'], l['point']['lat']]},
            'properties': {'slug': l['slug'], 'name': l['name'], 'city': l['city'], 'district': l['district'], 'price': l.get('askingPrice'), 'priceDisplay': l['priceDisplay'], 'bar': l['bar'], 'status': l['status'], 'image': l['image'], 'approx': l['point']['approx']}} for l in rs]}


@router.get('/geo/resolve')
def geo(q: str = ''):
    return {'place': resolve_place(q)}


@router.get('/listings/{slug}')
def detail(request: Request, slug: str):
    require_user(request); v = viewer_of(request)
    x = visible_listing(slug, v)
    if not x or x['l']['status'] in ['draft', 'withdrawn']: raise not_found('Listing not found')
    l, p = x['l'], x['p']; c = get_config(); counts = unit_counts([p['id']]); nda = has_nda(v['id'], l['id'])
    saved = db.get(T.favorites, user_id=v['id'], listing_id=l['id']) is not None
    bid = bid_round_info(l['id']); my_bid = db.get(T.offers, bid_round_id=bid['id'], user_id=v['id']) if bid else None
    audit(request, 'view', 'listing', l['id'], {'slug': slug})
    out = {**serialize_listing(l, p, v, c, has_nda=nda, saved=saved, bid_round=bid), 'unitsCount': counts.get(p['id'], 1)}
    if not out['locked']:
        rs = db.rows(select(T.documents.c.folder, func.count().label('n')).where(T.documents.c.listing_id == l['id']).group_by(T.documents.c.folder))
        out['documentsTeaser'] = [{'folder': r['folder'], 'files': int(r['n'])} for r in rs]
    if my_bid: out['myBid'] = {'amount': my_bid['amount'], 'conditions': my_bid['conditions'], 'status': my_bid['status']}
    return out


@router.get('/listings/{slug}/units')
def units(request: Request, slug: str):
    """Unit-level rent roll: verified investor with the NDA for this listing (or staff)."""
    require_feature(request, 'dataroom'); v = viewer_of(request); x = visible_listing(slug, v)
    if not x: raise not_found()
    if not (staff_or_verified(v) and (has_nda(v['id'], x['l']['id']) or v.get('role') != 'investor')): raise forbidden('Verification and the property NDA are required.')
    us = db.all_(T.units, T.units.c.property_id == x['p']['id'], order=T.units.c.ref)
    return [{'ref': r['ref'], 'areaM2': r['area_m2'], 'rentMonthly': r['rent_monthly'], 'rentType': r['rent_type'], 'energyLabel': r['energy_label'], 'occupancy': r['occupancy'], 'unitPrice': round(x['l']['asking_price'] / len(us) * 1.06)} for r in us]


class CalcIn(BaseModel):
    slug: str
    ltv: float = Field(60, ge=0, le=90)
    interest: float = Field(4, ge=0, le=15)
    expense: float = Field(22, ge=0, le=80)
    vacancy: float = Field(3, ge=0, le=50)


@post('/calculations')
def calc(request: Request, body=Depends(json_body)):
    """Inputs to outputs. Invited people with access to the listing."""
    b = parse(CalcIn, body)
    if not can_details(viewer_of(request)): raise forbidden('Join free to use the calculator.')
    x = visible_listing(b.slug, viewer_of(request))
    if not x: raise not_found()
    if off_market_state(x['l']['deal_type'], x['l']['pro_early_access_until'], viewer_of(request)) != 'open': raise forbidden()
    c = get_config(); l, p = x['l'], x['p']
    return {'inputs': b.model_dump(), 'finance': finance(l['asking_price'], l['gross_rent_annual'], ltv=b.ltv, interest=b.interest, expense=b.expense, vacancy=b.vacancy),
            'figures': figures({'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'operatingCostsAnnual': l['operating_costs_annual'], 'areaM2': p['area_m2'], 'unitsCount': 1}, c),
            'disclaimer': 'Indicative only. Not investment or tax advice.'}


@router.get('/finder')
def finder(request: Request):
    """Smart finder: rank available income listings by reach and deal score."""
    require_feature(request, 'finder'); q = request.query_params
    f = lambda k, d: float(q.get(k) or d)
    equity, ltv, interest, min_yield, city = f('equity', 2500000), f('ltv', 60), f('interest', 4), f('minYield', 0), q.get('city') or 'all'
    v = viewer_of(request)
    rows_ = []
    for l in list_listings(v, {}):
        if l['locked'] or l['status'] != 'available' or not l.get('bar') or (city != 'all' and l['city'] != city): continue
        x = get_listing(l['slug']); fi = finance(x['l']['asking_price'], x['l']['gross_rent_annual'], ltv=ltv, interest=interest); fit = fi['equity'] <= equity and l['bar'] >= min_yield
        rows_.append({'slug': l['slug'], 'name': l['name'], 'city': l['city'], 'district': l['district'], 'image': l['image'], 'price': x['l']['asking_price'] if can_details(v) else None, 'priceDisplay': l['priceDisplay'],
                      'equityNeeded': round(fi['equity']), 'cashFlow': round(fi['cash']), 'coc': round(fi['coc'], 1), 'fit': fit, 'reach': min(100, round(equity / fi['equity'] * 100)), 'score': l['dealScore']['total'], 'bar': l['bar']})
    rows_.sort(key=lambda r: (-int(r['fit']), -r['score']))
    return {'maxPrice': max_price(equity, ltv), 'rows': rows_}


class SellIn(BaseModel):
    postcode: Annotated[str, StringConstraints(min_length=6, max_length=8)]
    number: Annotated[str, StringConstraints(min_length=1, max_length=10)]
    propertyType: Annotated[str, StringConstraints(max_length=60)]
    units: int = Field(ge=1, le=1000)
    rent: Optional[float] = Field(None, ge=0)
    asking: Optional[float] = Field(None, ge=0)
    name: Annotated[str, StringConstraints(min_length=2, max_length=80)]
    email: Email
    consent: Literal[True]


@post('/sell-leads')
def sell_lead(request: Request, body=Depends(json_body)):
    """'Sell your property to us' lead form (key lead source for the acquisition CRM)."""
    require_feature(request, 'sell'); b = parse(SellIn, body)
    bag = bag_lookup(b.postcode, b.number); city = bag['city'] if bag else 'the Netherlands'
    bars = {'Amsterdam': 4.4, 'Rotterdam': 6, 'Utrecht': 5.1, 'Eindhoven': 6.1, 'Den Haag': 5.6, 'Haarlem': 5}
    if b.rent:
        val = b.rent / (bars.get(city, 5.5) / 100); lo, hi = val * 0.94, val * 1.04; basis = f"Based on €{eur_nl(b.rent)} annual rent and a typical {city} BAR of {bars.get(city, 5.5):.1f}%."
    elif b.asking:
        lo, hi = b.asking * 0.9, b.asking * 0.98; basis = 'Based on your asking price and recent comparable sales.'
    else:
        lo, hi = b.units * 170000, b.units * 215000; basis = f'Based on {b.units} units at typical per-unit values in {city}.'
    lead = db.ins(T.acquisition_leads, {'source': 'Website', 'address': f"{bag['address'] if bag else 'Address'}, {bag['postcode'] if bag else b.postcode} {city}", 'postcode': b.postcode, 'property_type': b.propertyType,
                                        'units': b.units, 'asking_price': int(b.asking) if b.asking else None, 'est_value': round((lo + hi) / 2 / 1000) * 1000, 'contact_name': b.name, 'contact_email': b.email})
    log_rule('acquisition', f'New seller lead from the website · {b.propertyType}, {b.units} units, {city}')
    draft_email(b.email, 'Your valuation request', f'Dear {b.name}, thank you for your request. Our acquisition team will call you within one working day with a direct offer.', 'valuation')
    audit(request, 'lead_created', 'acquisition_lead', lead['id'], {'source': 'website'})
    r5 = lambda n: round(n / 5000) * 5000
    return {'reference': 'L-' + lead['id'][:6].upper(), 'low': r5(lo), 'high': r5(hi), 'basis': basis}
