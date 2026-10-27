"""CRM integration. The company CRM is the source of truth for the properties it buys; it pushes each listing here with an API key.
POST /api/integrations/crm/listings upserts by the CRM's own id (externalId); DELETE withdraws. Admins and developers manage keys."""
from __future__ import annotations
import base64, os, re, unicodedata
from datetime import timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, desc, func, select
from ..common import ApiError, audit, bad, json_body, log_rule, not_found, now, parse, require_staff, sha, unauthorized
from ..domain import CITY_GEO, DEAL_TYPES, LISTING_STATUSES, SUPER_ROLES
from ..services.listings import price_changed, run_matching
from .access import set_listings

router = APIRouter()
def post(path): return router.post(path, status_code=201)

IMAGES = ['p1', 'p2', 'p3', 'p4', 'r1', 'r2', 'r3']
LIVE = ['available', 'coming_soon', 'under_offer']
Label = Literal['A', 'B', 'C', 'D', 'E', 'F', 'G']
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=160, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]
S = lambda mn=0, mx=200, strip=True: Annotated[str, StringConstraints(strip_whitespace=strip, min_length=mn, max_length=mx)]


class CrmProperty(BaseModel):
    address: S(3, 200); postcode: S(0, 20); city: S(2, 80); district: Optional[S(0, 80)] = None
    lat: Optional[float] = Field(None, ge=50, le=54); lng: Optional[float] = Field(None, ge=3, le=8)
    areaM2: int = Field(ge=1, le=2_000_000); plotM2: Optional[int] = Field(None, ge=0, le=10_000_000); buildYear: int = Field(ge=1200, le=2100)
    category: Literal['portfolios', 'buildings', 'homes']; propertyType: S(2, 80); propertyTypeNl: Optional[S(0, 80)] = None
    tenure: S(0, 160) = 'Freehold (eigen grond)'; energyLabel: Label = 'C'; wozValue: Optional[int] = Field(None, ge=0, le=2_000_000_000); image: Optional[S(0, 500)] = None


class CrmUnit(BaseModel):
    ref: S(0, 20); areaM2: int = Field(ge=1, le=20000); rentMonthly: int = Field(0, ge=0, le=1_000_000)
    rentType: Literal['social', 'mid', 'free'] = 'free'; energyLabel: Optional[Label] = None; occupancy: Literal['let', 'vacant'] = 'let'


class CrmListing(BaseModel):
    externalId: S(1, 80); name: S(3, 120); nameNl: Optional[S(0, 120)] = None
    description: S(0, 8000, False) = ''; descriptionNl: Optional[S(0, 8000, False)] = None; highlights: list[S(0, 160, False)] = Field(default_factory=list, max_length=12)
    status: Literal[tuple(LISTING_STATUSES)] = 'available'  # type: ignore
    dealType: Literal[tuple(DEAL_TYPES)] = 'direct'  # type: ignore
    askingPrice: int = Field(ge=10000, le=2_000_000_000); priceOnRequest: bool = False
    grossRentAnnual: int = Field(0, ge=0, le=500_000_000); operatingCostsAnnual: Optional[int] = Field(None, ge=0, le=500_000_000); occupancy: Optional[int] = Field(None, ge=0, le=100)
    featured: bool = False
    property: CrmProperty
    units: Optional[list[CrmUnit]] = Field(None, max_length=5000)
    shareWith: Optional[list[Email]] = Field(None, max_length=200)  # invited people who should see this listing straight away


def crm_upsert(b: CrmListing, actor: str) -> dict:
    """Insert or update one listing from the CRM. Publishing runs buy-box matching for the people who can see it."""
    pr = b.property; geo = CITY_GEO.get(pr.city)
    image = pr.image if pr.image and (pr.image in IMAGES or pr.image.startswith('https://')) else ('r1' if pr.category == 'homes' else 'p1' if pr.category == 'portfolios' else 'p2')
    prop = {'address': pr.address, 'postcode': pr.postcode, 'city': pr.city, 'district': pr.district, 'lat': pr.lat if pr.lat is not None else (geo or {}).get('lat'), 'lng': pr.lng if pr.lng is not None else (geo or {}).get('lng'),
            'plot_m2': pr.plotM2, 'area_m2': pr.areaM2, 'build_year': pr.buildYear, 'category': pr.category, 'property_type': pr.propertyType, 'property_type_nl': pr.propertyTypeNl, 'tenure': pr.tenure,
            'energy_label': pr.energyLabel, 'woz_value': pr.wozValue, 'woz_year': now().year if pr.wozValue else None, 'image': image}
    live = b.status in LIVE
    fields = {'name': b.name, 'name_nl': b.nameNl, 'description': b.description or 'Details follow from our acquisition team.', 'description_nl': b.descriptionNl, 'highlights': b.highlights, 'status': b.status, 'deal_type': b.dealType,
              'price_on_request': b.priceOnRequest, 'gross_rent_annual': b.grossRentAnnual, 'operating_costs_annual': b.operatingCostsAnnual if b.operatingCostsAnnual is not None else (round(b.grossRentAnnual * 0.22) if b.grossRentAnnual else None),
              'occupancy': b.occupancy, 'featured': b.featured, 'synced_at': now()}
    old = db.get(T.listings, external_id=b.externalId); created = False
    if old:
        db.upd(T.properties, T.properties.c.id == old['property_id'], prop)
        db.upd(T.listings, T.listings.c.id == old['id'], {**fields, 'asking_price': b.askingPrice, **({'previous_price': old['asking_price']} if b.askingPrice != old['asking_price'] else {}), **({'published_at': now()} if live and not old['published_at'] else {})})
        lid, slug, pid = old['id'], old['slug'], old['property_id']
    else:
        p = db.ins(T.properties, prop)
        base = re.sub(r'\s+', '-', re.sub(r'[^\w\s-]', '', unicodedata.normalize('NFKD', b.name.lower())).strip())[:50]
        slug = base + '-' + re.sub(r'[^a-z0-9]', '', b.externalId.lower())[-6:]
        if db.get(T.listings, slug=slug): slug += '-' + os.urandom(2).hex()
        l = db.ins(T.listings, {**fields, 'property_id': p['id'], 'slug': slug, 'asking_price': b.askingPrice, 'source': 'crm', 'external_id': b.externalId, 'published_at': now() if live else None,
                                'pro_early_access_until': now() + timedelta(hours=48) if b.dealType == 'off_market' else None})
        lid, pid, created = l['id'], p['id'], True
    if b.units is not None:
        db.run(T.units.delete().where(T.units.c.property_id == pid))
        db.ins(T.units, [{'property_id': pid, 'ref': u.ref, 'area_m2': u.areaM2, 'rent_monthly': u.rentMonthly, 'rent_type': u.rentType, 'energy_label': u.energyLabel or pr.energyLabel, 'occupancy': u.occupancy} for u in b.units], returning=False)
    shared = 0
    if b.shareWith:
        for u in db.all_(T.users, T.users.c.email.in_(b.shareWith)):
            cur = [r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == u['id'])]
            if lid not in cur: set_listings(u['id'], cur + [lid], None); shared += 1
    matched = 0
    if live and (created or not old['published_at']): matched = run_matching(lid, 'publish')
    elif old and b.askingPrice != old['asking_price']: price_changed(lid, old['asking_price'], b.askingPrice)
    log_rule('crm', f"{'Created' if created else 'Updated'} {b.name} (CRM {b.externalId}) · {b.status}{f' · shared with {shared}' if shared else ''}{f' · {matched} matched' if matched else ''} · {actor}")
    return {'id': lid, 'slug': slug, 'created': created, 'status': b.status, 'shared': shared, 'matched': matched}


def sample_listing(n: str | None = None) -> CrmListing:
    n = n or format(int(now().timestamp() * 1000), 'x')[-5:].upper()
    return CrmListing.model_validate({
        'externalId': f'CRM-{n}', 'name': f'Kralingen apartments {n}', 'description': 'Pre-war apartment building near the Kralingse Plas, bought by our acquisition team this month. Fully let, mostly mid-rent, with a recent roof and façade renovation.',
        'highlights': ['Fully let · 14 apartments', 'Roof and façade renovated 2024', 'Walking distance to the Kralingse Plas'], 'status': 'available', 'dealType': 'direct', 'askingPrice': 3950000, 'grossRentAnnual': 228000, 'occupancy': 100,
        'property': {'address': 'Sample Oudedijk 140', 'postcode': '3061 AN', 'city': 'Rotterdam', 'district': 'Kralingen', 'areaM2': 1080, 'buildYear': 1931, 'category': 'buildings', 'propertyType': 'Apartment building', 'energyLabel': 'C', 'wozValue': 3810000, 'image': 'p3'},
        'units': [{'ref': str(i + 1).zfill(2), 'areaM2': 77, 'rentMonthly': 1357, 'rentType': 'social' if i < 3 else 'mid' if i < 11 else 'free'} for i in range(14)]})


def _key(request: Request) -> str:
    """API key from `x-api-key` or `Authorization: Bearer`. Keys are stored hashed; PP_CRM_API_KEY works as a bootstrap key."""
    raw = (request.headers.get('x-api-key') or re.sub(r'^Bearer\s+', '', request.headers.get('authorization') or '', flags=re.I) or '').strip()
    if not raw: raise unauthorized('Send the API key in the x-api-key header.')
    if os.environ.get('PP_CRM_API_KEY') and raw == os.environ['PP_CRM_API_KEY']: return 'env key'
    k = db.one(select(T.api_keys).where(and_(T.api_keys.c.key_hash == sha(raw), T.api_keys.c.revoked_at.is_(None))))
    if not k: raise unauthorized('This API key is not valid or was revoked.')
    db.upd(T.api_keys, T.api_keys.c.id == k['id'], {'last_used_at': now()}); return f"key {k['prefix']}… ({k['name']})"


@router.get('/integrations/crm/ping')
def ping(request: Request):
    return {'ok': True, 'key': _key(request), 'time': now()}


@post('/integrations/crm/listings')
def upsert(request: Request, body=Depends(json_body)):
    who = _key(request); items = body if isinstance(body, list) else [body]
    if len(items) > 200: raise bad('Send at most 200 listings per request.')
    out = [crm_upsert(parse(CrmListing, x), who) for x in items]
    db.ins(T.audit_events, {'actor_label': f'CRM integration · {who}', 'action': 'crm_sync', 'object_type': 'listing', 'object_id': None, 'meta': {'count': len(out), 'created': len([o for o in out if o['created']])}}, returning=False)
    return {'results': out} if isinstance(body, list) else out[0]


@router.delete('/integrations/crm/listings/{external_id}')
def withdraw(request: Request, external_id: str):
    who = _key(request); l = db.get(T.listings, external_id=external_id)
    if not l: raise not_found('No listing with this CRM id.')
    db.upd(T.listings, T.listings.c.id == l['id'], {'status': 'withdrawn', 'synced_at': now()})
    log_rule('crm', f"Withdrawn {l['name']} (CRM {external_id}) · {who}"); return {'ok': True, 'slug': l['slug'], 'status': 'withdrawn'}


# ---------- Admin / developer console ----------
@router.get('/admin/integrations')
def console(request: Request):
    require_staff(request, SUPER_ROLES)
    keys = db.all_(T.api_keys, order=desc(T.api_keys.c.created_at))
    log = db.all_(T.automation_log, T.automation_log.c.rule == 'crm', order=desc(T.automation_log.c.created_at), limit=25)
    crm = db.one(select(func.count().label('n'), func.max(T.listings.c.synced_at).label('last')).where(T.listings.c.source == 'crm'))
    return {'keys': [{'id': k['id'], 'name': k['name'], 'prefix': k['prefix'], 'createdAt': k['created_at'], 'lastUsedAt': k['last_used_at'], 'revoked': bool(k['revoked_at'])} for k in keys],
            'log': db.logs(log), 'crmListings': int(crm['n']), 'lastSync': crm['last'], 'envKey': bool(os.environ.get('PP_CRM_API_KEY')), 'sample': sample_listing('1042').model_dump()}


class KeyIn(BaseModel):
    name: S(2, 60)


@post('/admin/integrations/keys')
def create_key(request: Request, body=Depends(json_body)):
    u = require_staff(request, SUPER_ROLES); b = parse(KeyIn, body)
    raw = 'pp_live_' + base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip('='); prefix = raw[:12]
    k = db.ins(T.api_keys, {'name': b.name, 'prefix': prefix, 'key_hash': sha(raw), 'created_by': u['id']})
    audit(request, 'api_key_created', 'api_key', k['id'], {'name': b.name, 'prefix': prefix})
    return {'id': k['id'], 'key': raw, 'prefix': prefix, 'note': 'Copy this key now. It is shown only once.'}


@post('/admin/integrations/keys/{id}/revoke')
def revoke_key(request: Request, id: str):
    require_staff(request, SUPER_ROLES); db.upd(T.api_keys, T.api_keys.c.id == id, {'revoked_at': now()}); audit(request, 'api_key_revoked', 'api_key', id); return {'ok': True}


@post('/admin/integrations/crm/sample')
def sample(request: Request):
    """Demo: run the same upsert the CRM would call, with a sample payload."""
    u = require_staff(request, SUPER_ROLES); r = crm_upsert(sample_listing(), f"test by {u['name']}")
    audit(request, 'crm_sample', 'listing', r['id']); return r
