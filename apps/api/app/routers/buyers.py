"""Buyers & outreach (staff only): import the ownership exports and contact lists, company profiles, potential buyers per
listing, email campaigns with personal invitation links, and the public tracking / unsubscribe links in those emails."""
from __future__ import annotations
import base64, io, os, re, uuid
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, desc, func, or_, select
from ..common import audit, bad, form_body, json_body, log_rule, not_found, notify, now, parse, parse_value, require_staff, sha
from ..domain import preset
from ..services import buyers as B
from .access import Email, Uuid, new_invite, set_listings

router = APIRouter()
def post(path): return router.post(path, status_code=201)

STAGES = [('new', 'New'), ('contacted', 'Contacted'), ('interested', 'Interested'), ('in_talks', 'In talks'), ('customer', 'Customer'), ('not_interested', 'Not interested')]
S = lambda lo, hi: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]
MAX_UPLOAD = 25 * 1024 * 1024


def _company_out(c: dict, contacts: int = 0, emailable: int = 0, last_email=None) -> dict:
    p = c['profile'] or {}
    return {'id': c['id'], 'name': c['name'], 'group': c['buyer_group'], 'buildings': c['buildings'], 'totalM2': c['total_m2'], 'firstPurchase': c['first_purchase'], 'lastPurchase': c['last_purchase'],
            'avgYears': c['avg_years'], 'recentCount': c['recent_count'], 'longCount': c['long_count'], 'segment': c['segment'], 'cities': (c['cities'] or [])[:6], 'citiesCount': len(c['cities'] or []),
            'stage': c['stage'], 'doNotContact': c['do_not_contact'], 'contacts': contacts, 'emailable': emailable, 'lastEmailAt': last_email,
            'residentialShare': p.get('residentialShare'), 'maxDeal': p.get('maxDeal'), 'recent12m': p.get('recent12m', 0)}


def _contact_counts() -> dict:
    C = T.buyer_contacts.c
    rs = db.rows(select(C.company_id, func.count().label('n'), func.count().filter(and_(C.email.isnot(None), C.unsubscribed_at.is_(None))).label('e')).group_by(C.company_id))
    return {r['company_id']: (r['n'], r['e']) for r in rs}


def _last_emails() -> dict:
    M = T.outreach_messages.c
    return {r['company_id']: r['at'] for r in db.rows(select(M.company_id, func.max(M.sent_at).label('at')).group_by(M.company_id))}


@router.get('/admin/buyers')
def overview(request: Request, q: str = '', segment: str = '', stage: str = '', contacts: str = '', sort: str = 'buildings'):
    require_staff(request)
    counts, last = _contact_counts(), _last_emails(); qk = q.strip().lower()
    rows = []
    for c in db.all_(T.buyer_companies):
        n, e = counts.get(c['id'], (0, 0))
        if qk and qk not in c['name_key'] and not any(qk in (x or '').lower() for x in (c['cities'] or []) + (c['legal_entities'] or [])): continue
        if segment and c['segment'] != segment: continue
        if stage and c['stage'] != stage: continue
        if contacts == 'with' and not e: continue
        if contacts == 'without' and e: continue
        rows.append(_company_out(c, n, e, last.get(c['id'])))
    key = {'buildings': lambda x: -(x['buildings'] or 0), 'recent': lambda x: -(x['lastPurchase'].toordinal() if x['lastPurchase'] else 0), 'name': lambda x: x['name'].lower(), 'm2': lambda x: -(x['totalM2'] or 0)}
    rows.sort(key=key.get(sort, key['buildings']))
    M = T.outreach_messages.c
    stats = {'companies': db.count(T.buyer_companies), 'buildings': db.count(T.buyer_buildings), 'holdings': db.count(T.buyer_holdings), 'contacts': db.count(T.buyer_contacts),
             'emailable': sum(e for _, e in counts.values()), 'withContacts': sum(1 for _, e in counts.values() if e), 'sent': db.count(T.outreach_messages, M.sent_at.isnot(None)),
             'queued': db.count(T.outreach_messages, M.status == 'queued'), 'registered': db.count(T.outreach_messages, M.accepted_at.isnot(None))}
    imports = db.camels(db.all_(T.buyer_imports, order=desc(T.buyer_imports.c.created_at), limit=8))
    listings = [{'id': l['id'], 'name': l['name'], 'city': p['city'], 'status': l['status']} for l, p in _listing_rows() if l['status'] not in ('sold', 'withdrawn')]
    return {'stats': stats, 'companies': rows, 'imports': imports, 'stages': STAGES, 'segments': sorted({c['segment'] for c in db.all_(T.buyer_companies) if c['segment']}),
            'mail': B.mail_mode(), 'listings': listings}


def _listing_rows():
    L, P = T.listings, T.properties
    return [({k: r[k] for k in r if not k.startswith('p_')}, {k[2:]: r[k] for k in r if k.startswith('p_')}) for r in
            db.rows(select(L, *[c.label('p_' + c.name) for c in P.c]).select_from(L.join(P, L.c.property_id == P.c.id)).order_by(desc(L.c.created_at)))]


@post('/admin/buyers/import')
async def upload(request: Request, form=Depends(form_body)):
    """Accepts the files and imports them in the background (a 30,000-row export takes longer than a web request may last).
    The page polls GET /admin/buyers/imports?batch=… for progress."""
    me = require_staff(request)
    files = [f for f in form.getlist('files') if hasattr(f, 'filename') and f.filename]
    if not files: raise bad('Choose one or more Excel files (.xlsx) or CSV files.')
    data = []
    for f in files:
        if not re.search(r'\.(xlsx|xlsm|csv)$', f.filename, re.I): raise bad(f'{f.filename}: only .xlsx and .csv files can be imported.')
        buf = await f.read()
        if len(buf) > MAX_UPLOAD: raise bad(f'{f.filename}: larger than 25 MB. Split the export into batches.')
        data.append((f.filename, buf))
    batch = str(uuid.uuid4())
    rows = [db.ins(T.buyer_imports, {'batch': batch, 'status': 'queued', 'kind': 'pending', 'file_name': name[:200], 'created_by': me['id']}) for name, _ in data]
    B.start_batch([(r['id'], name, buf) for r, (name, buf) in zip(rows, data)], {k: me[k] for k in ('id', 'name', 'email')})
    return {'batch': batch, 'files': [{'id': r['id'], 'file': r['file_name']} for r in rows]}


@router.get('/admin/buyers/imports')
def imports(request: Request, batch: str = ''):
    require_staff(request); I = T.buyer_imports
    rs = db.all_(I, I.c.batch == parse_value(Uuid, batch, 'batch'), order=I.c.created_at) if batch else db.all_(I, order=desc(I.c.created_at), limit=12)
    return {'imports': db.camels(rs), 'done': all(r['status'] in ('done', 'failed') for r in rs)}


@router.get('/admin/buyers/template')
def template(request: Request):
    require_staff(request)
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = 'contacts'
    ws.append(['Bedrijf', 'Naam', 'Functie', 'E-mail', 'Telefoon', 'Taal', 'Notities'])
    ws.append(['Amvest', 'Voornaam Achternaam', 'Head of Acquisitions', 'naam@voorbeeld.nl', '+31 20 000 0000', 'nl', 'Example row: replace or delete'])
    for col, w in zip('ABCDEFG', (30, 26, 24, 30, 18, 8, 30)): ws.column_dimensions[col].width = w
    out = io.BytesIO(); wb.save(out)
    return Response(out.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'content-disposition': 'attachment; filename="contacts-template.xlsx"'})


class CompanyIn(BaseModel):
    name: S(2, 160)


@post('/admin/buyers/companies')
def add_company(request: Request, body=Depends(json_body)):
    require_staff(request); b = parse(CompanyIn, body)
    if db.get(T.buyer_companies, name_key=B.name_key(b.name)): raise bad('This company is already in the list.')
    c = db.ins(T.buyer_companies, {'name': b.name, 'name_key': B.name_key(b.name), 'source_file': 'manual'})
    audit(request, 'buyer_company_created', 'buyer_company', c['id']); return {'id': c['id']}


def _company(id: str) -> dict:
    c = db.get(T.buyer_companies, id=id) if parse_value(Uuid, id, 'id') else None
    if not c: raise not_found('Company not found')
    return c


@router.get('/admin/buyers/{id}')
def company(request: Request, id: str):
    require_staff(request); c = _company(id); p = c['profile'] or {}
    H, Bd = T.buyer_holdings, T.buyer_buildings
    rows = db.rows(select(H.c.bag_pand_id, H.c.address, H.c.city, H.c.purchase_date, H.c.segment, Bd.c.use_purpose, Bd.c.floor_m2, Bd.c.build_year, Bd.c.price_band, Bd.c.transaction_type, Bd.c.factsheet, Bd.c.street, Bd.c.number)
                   .select_from(H.outerjoin(Bd, H.c.bag_pand_id == Bd.c.bag_pand_id)).where(H.c.company_id == c['id']).order_by(H.c.purchase_date.desc().nulls_last()).limit(60))
    names = p.get('cityNames') or {}
    top = lambda d, n=10: [[names.get(k, k), v] for k, v in sorted((d or {}).items(), key=lambda x: -x[1])[:n]]
    contacts = db.camels(db.all_(T.buyer_contacts, T.buyer_contacts.c.company_id == c['id'], order=T.buyer_contacts.c.created_at))
    M, CP, L = T.outreach_messages, T.outreach_campaigns, T.listings
    history = db.rows(select(M.c.id, M.c.to_email, M.c.status, M.c.sent_at, M.c.opened_at, M.c.clicked_at, M.c.accepted_at, M.c.created_at, M.c.subject, L.c.name.label('listing'))
                      .select_from(M.join(CP, M.c.campaign_id == CP.c.id).join(L, CP.c.listing_id == L.c.id)).where(M.c.company_id == c['id']).order_by(desc(M.c.created_at)).limit(50))
    n, e = _contact_counts().get(c['id'], (0, 0))
    return {**_company_out(c, n, e), 'legalEntities': c['legal_entities'], 'allCities': c['cities'], 'notes': c['notes'], 'sourceFile': c['source_file'],
            'profile': {**{k: v for k, v in p.items() if k not in ('cityCounts', 'cityNames', 'recentCityCounts', 'provinceCounts')}, 'topCities': top(p.get('cityCounts')), 'recentCities': top(p.get('recentCityCounts'), 6),
                        'provinces': sorted((p.get('provinceCounts') or {}).items(), key=lambda x: -x[1])},
            'holdings': [{'bagId': r['bag_pand_id'], 'address': r['address'] or ' '.join(x for x in [r['street'], r['number']] if x) or None, 'city': r['city'], 'purchaseDate': r['purchase_date'], 'segment': r['segment'],
                          'use': r['use_purpose'], 'floorM2': r['floor_m2'], 'buildYear': r['build_year'], 'priceBand': r['price_band'], 'transactionType': r['transaction_type'], 'factsheet': r['factsheet']} for r in rows],
            'contactList': contacts, 'history': db.camels(history), 'stages': STAGES}


class CompanyPatch(BaseModel):
    stage: Optional[Literal[tuple(k for k, _ in STAGES)]] = None  # type: ignore
    notes: Optional[Annotated[str, StringConstraints(max_length=4000)]] = None
    doNotContact: Optional[bool] = None


@router.patch('/admin/buyers/{id}')
def patch_company(request: Request, id: str, body=Depends(json_body)):
    require_staff(request); c = _company(id); b = parse(CompanyPatch, body)
    vals = {k: v for k, v in {'stage': b.stage, 'notes': b.notes, 'do_not_contact': b.doNotContact}.items() if v is not None}
    if vals:
        db.upd(T.buyer_companies, T.buyer_companies.c.id == c['id'], {**vals, 'updated_at': now()})
        if b.doNotContact: db.upd(T.outreach_messages, and_(T.outreach_messages.c.company_id == c['id'], T.outreach_messages.c.status == 'queued'), {'status': 'cancelled', 'error': 'Do not contact'})
        audit(request, 'buyer_company_updated', 'buyer_company', c['id'], {k: v for k, v in vals.items() if k != 'notes'})
    return {'ok': True}


class ContactIn(BaseModel):
    name: S(2, 120)
    role: Optional[S(0, 120)] = None
    email: Optional[Email] = None
    phone: Optional[S(0, 40)] = None
    language: Literal['nl', 'en'] = 'nl'
    notes: Optional[S(0, 1000)] = None


@post('/admin/buyers/{id}/contacts')
def add_contact(request: Request, id: str, body=Depends(json_body)):
    me = require_staff(request); c = _company(id); b = parse(ContactIn, body)
    if b.email and any((x['email'] or '').lower() == b.email for x in db.all_(T.buyer_contacts, T.buyer_contacts.c.company_id == c['id'])): raise bad('This email is already a contact of this company.')
    x = db.ins(T.buyer_contacts, {'company_id': c['id'], 'name': b.name, 'role': b.role or None, 'email': b.email or None, 'phone': b.phone or None, 'language': b.language, 'notes': b.notes or None, 'created_by': me['id']})
    audit(request, 'buyer_contact_created', 'buyer_contact', x['id'], {'company': c['name']}); return {'id': x['id']}


@router.delete('/admin/buyers/contacts/{cid}')
def delete_contact(request: Request, cid: str):
    """Erasure on request (AVG/GDPR): removes the person and their email history."""
    require_staff(request); parse_value(Uuid, cid, 'id')
    x = db.get(T.buyer_contacts, id=cid)
    if not x: raise not_found('Contact not found')
    db.run(T.buyer_contacts.delete().where(T.buyer_contacts.c.id == cid))
    audit(request, 'buyer_contact_deleted', 'buyer_contact', cid); return {'ok': True}


class ContactPatch(BaseModel):
    unsubscribed: Optional[bool] = None


@router.patch('/admin/buyers/contacts/{cid}')
def patch_contact(request: Request, cid: str, body=Depends(json_body)):
    require_staff(request); parse_value(Uuid, cid, 'id'); b = parse(ContactPatch, body)
    if b.unsubscribed is not None:
        db.upd(T.buyer_contacts, T.buyer_contacts.c.id == cid, {'unsubscribed_at': now() if b.unsubscribed else None})
        if b.unsubscribed: db.upd(T.outreach_messages, and_(T.outreach_messages.c.contact_id == cid, T.outreach_messages.c.status == 'queued'), {'status': 'cancelled', 'error': 'Unsubscribed'})
        audit(request, 'buyer_contact_unsubscribed' if b.unsubscribed else 'buyer_contact_resubscribed', 'buyer_contact', cid)
    return {'ok': True}


# ---------- Potential buyers for a listing ----------
def _listing(listing_id: str):
    parse_value(Uuid, listing_id, 'listingId')
    rs = [x for x in _listing_rows() if x[0]['id'] == listing_id]
    if not rs: raise not_found('Listing not found')
    l, p = rs[0]
    l['_units'] = db.count(T.units, T.units.c.property_id == p['id']) or 1
    return l, p


@router.get('/admin/buyers/match/{listing_id}')
def potential_buyers(request: Request, listing_id: str, lang: Literal['nl', 'en'] = 'nl', limit: int = 60):
    require_staff(request); l, p = _listing(listing_id)
    counts, last = _contact_counts(), _last_emails()
    M, CP = T.outreach_messages.c, T.outreach_campaigns.c
    emailed = {r['company_id']: r['at'] for r in db.rows(select(M.company_id, func.max(M.created_at).label('at')).select_from(T.outreach_messages.join(T.outreach_campaigns, M.campaign_id == CP.id))
                                                         .where(CP.listing_id == l['id'], M.status != 'cancelled').group_by(M.company_id))}
    ranked = B.match(l, p, db.all_(T.buyer_companies), lang)
    for x in ranked:
        n, e = counts.get(x['id'], (0, 0)); x.update({'contacts': n, 'emailable': e, 'emailedForThis': emailed.get(x['id']), 'lastEmailAt': last.get(x['id'])})
    return {'listing': {'id': l['id'], 'name': l['name'], 'nameNl': l['name_nl'], 'slug': l['slug'], 'city': p['city'], 'propertyType': p['property_type'], 'units': l['_units'], 'askingPrice': l['asking_price'],
                        'priceOnRequest': l['price_on_request'], 'status': l['status'], 'dealType': l['deal_type']},
            'buyers': ranked[:max(1, min(limit, 500))], 'total': len(ranked), 'templates': B.TEMPLATES, 'presets': ['viewer', 'buyer', 'institution'], 'mail': B.mail_mode()}


class CampaignIn(BaseModel):
    listingId: Uuid
    companyIds: list[Uuid] = Field(min_length=1, max_length=500)
    language: Literal['nl', 'en'] = 'nl'
    subject: S(5, 200)
    body: S(40, 6000)
    preset: Literal['viewer', 'buyer', 'institution'] = 'institution'
    resend: bool = False


def _base_url(request: Request) -> str:
    if os.environ.get('PP_PUBLIC_URL'): return os.environ['PP_PUBLIC_URL'].rstrip('/')
    o = request.headers.get('origin')
    if o and re.fullmatch(r'https?://[\w.\-:]+', o): return o.rstrip('/')
    h = request.headers.get('x-forwarded-host') or request.headers.get('host') or 'localhost:3000'
    return f"{request.headers.get('x-forwarded-proto', 'http')}://{h}"


def _messages_for(b: CampaignIn, l: dict, p: dict, sender: str):
    """(company, contact, subject, body, score) for every contact that may be emailed, plus the skip counts."""
    ranked = {x['id']: x for x in B.match(l, p, db.all_(T.buyer_companies, T.buyer_companies.c.id.in_(b.companyIds)), b.language)}
    M, CP = T.outreach_messages.c, T.outreach_campaigns.c
    done = {r['contact_id'] for r in db.rows(select(M.contact_id).select_from(T.outreach_messages.join(T.outreach_campaigns, M.campaign_id == CP.id)).where(CP.listing_id == l['id'], M.status != 'cancelled'))}
    out, skip = [], {'noContact': 0, 'unsubscribed': 0, 'alreadyEmailed': 0, 'doNotContact': 0}
    for c in db.all_(T.buyer_companies, T.buyer_companies.c.id.in_(b.companyIds)):
        if c['do_not_contact']: skip['doNotContact'] += 1; continue
        contacts = [x for x in db.all_(T.buyer_contacts, T.buyer_contacts.c.company_id == c['id']) if x['email']]
        if not contacts: skip['noContact'] += 1; continue
        reason = (ranked.get(c['id'], {}).get('reasons') or [''])[0]
        for x in contacts:
            if x['unsubscribed_at']: skip['unsubscribed'] += 1; continue
            if x['id'] in done and not b.resend: skip['alreadyEmailed'] += 1; continue
            v = B.values_for(l, p, l['_units'], c, x, reason, sender, b.language)
            out.append((c, x, B.personalise(b.subject, v), B.personalise(b.body, v), ranked.get(c['id'], {}).get('score')))
    return out, skip


@post('/admin/outreach/preview')
def preview(request: Request, body=Depends(json_body)):
    me = require_staff(request); b = parse(CampaignIn, body); l, p = _listing(b.listingId)
    msgs, skip = _messages_for(b, l, p, me['name'])
    if not msgs: return {'count': 0, 'skip': skip, 'sample': None}
    c, x, subject, text_, _ = msgs[0]
    base = _base_url(request); L = B.links(base, 'preview-token')
    foot = B.FOOTER[b.language].replace('{company}', c['name']).replace('{unsubscribe}', L['unsubscribe'])
    return {'count': len(msgs), 'companies': len({m[0]['id'] for m in msgs}), 'skip': skip,
            'sample': {'to': f"{x['name']} <{x['email']}>", 'company': c['name'], 'subject': subject, 'body': text_.replace('{link}', L['link']).replace('{unsubscribe}', L['unsubscribe']) + '\n\n--\n' + foot}}


@post('/admin/outreach/campaigns')
def create_campaign(request: Request, body=Depends(json_body)):
    me = require_staff(request); b = parse(CampaignIn, body); l, p = _listing(b.listingId)
    msgs, skip = _messages_for(b, l, p, me['name'])
    if not msgs: raise bad('Nobody to email: the selected companies have no contact person with an email address (or were already emailed about this property).')
    camp = db.ins(T.outreach_campaigns, {'listing_id': l['id'], 'name': f"{l['name']} · {now().strftime('%d-%m-%Y %H:%M')}", 'language': b.language, 'subject': b.subject, 'body': b.body, 'preset': b.preset,
                                         'base_url': _base_url(request), 'created_by': me['id'], 'sender_name': me['name']})
    for c, x, subject, text_, score in msgs:
        mid = db.ins(T.outreach_messages, {'campaign_id': camp['id'], 'company_id': c['id'], 'contact_id': x['id'], 'to_email': x['email'], 'subject': subject, 'body': text_, 'token_hash': 'pending-' + os.urandom(8).hex(), 'score': score})['id']
        db.upd(T.outreach_messages, T.outreach_messages.c.id == mid, {'token_hash': sha(B.token_for(mid))})
    audit(request, 'outreach_campaign', 'listing', l['id'], {'emails': len(msgs), 'companies': len({m[0]['id'] for m in msgs}), 'language': b.language})
    log_rule('outreach', f"{me['name']} queued {len(msgs)} email{'s' if len(msgs) != 1 else ''} about {l['name']}")
    return {'id': camp['id'], 'queued': len(msgs), 'skip': skip, 'mail': B.mail_mode()}


def _funnel(ms: list[dict]) -> dict:
    return {'total': len(ms), 'queued': sum(m['status'] == 'queued' for m in ms), 'sent': sum(bool(m['sent_at']) for m in ms), 'opened': sum(bool(m['opened_at']) for m in ms),
            'clicked': sum(bool(m['clicked_at']) for m in ms), 'registered': sum(bool(m['accepted_at']) for m in ms), 'failed': sum(m['status'] == 'failed' for m in ms),
            'unsubscribed': sum(bool(m['unsubscribed_at']) for m in ms), 'cancelled': sum(m['status'] == 'cancelled' for m in ms)}


@router.get('/admin/outreach')
def campaigns(request: Request):
    require_staff(request)
    msgs = db.all_(T.outreach_messages); by = {}
    for m in msgs: by.setdefault(m['campaign_id'], []).append(m)
    listings = {l['id']: (l, p) for l, p in _listing_rows()}
    out = []
    for c in db.all_(T.outreach_campaigns, order=desc(T.outreach_campaigns.c.created_at)):
        l, p = listings.get(c['listing_id'], ({'name': '—', 'slug': None}, {'city': ''}))
        ms = by.get(c['id'], [])
        out.append({'id': c['id'], 'name': c['name'], 'listing': l['name'], 'listingId': c['listing_id'], 'slug': l.get('slug'), 'city': p.get('city'), 'language': c['language'], 'sender': c['sender_name'],
                    'createdAt': c['created_at'], 'subject': ms[0]['subject'] if ms else c['subject'], 'funnel': _funnel(ms)})
    return {'campaigns': out, 'totals': _funnel(msgs), 'mail': B.mail_mode()}


@router.get('/admin/outreach/{id}')
def campaign(request: Request, id: str):
    require_staff(request); parse_value(Uuid, id, 'id')
    c = db.get(T.outreach_campaigns, id=id)
    if not c: raise not_found('Campaign not found')
    M, Co, Ct = T.outreach_messages, T.buyer_companies, T.buyer_contacts
    rows = db.rows(select(M, Co.c.name.label('company'), Ct.c.name.label('contact')).select_from(M.join(Co, M.c.company_id == Co.c.id).join(Ct, M.c.contact_id == Ct.c.id))
                   .where(M.c.campaign_id == id).order_by(desc(M.c.score), M.c.created_at))
    users = [r['user_id'] for r in rows if r['user_id']]
    A = T.audit_events.c
    views = {r['actor_id']: r['n'] for r in db.rows(select(A.actor_id, func.count().label('n')).where(A.actor_id.in_(users), A.action == 'view', A.object_id == c['listing_id']).group_by(A.actor_id))} if users else {}
    offers = {r['user_id']: r['n'] for r in db.rows(select(T.offers.c.user_id, func.count().label('n')).where(T.offers.c.user_id.in_(users), T.offers.c.listing_id == c['listing_id']).group_by(T.offers.c.user_id))} if users else {}
    l = db.get(T.listings, id=c['listing_id'])
    return {'id': c['id'], 'name': c['name'], 'listing': l['name'] if l else '—', 'slug': l['slug'] if l else None, 'language': c['language'], 'subject': rows[0]['subject'] if rows else c['subject'], 'body': c['body'], 'sender': c['sender_name'], 'createdAt': c['created_at'],
            'funnel': _funnel(rows), 'messages': [{'id': r['id'], 'company': r['company'], 'companyId': r['company_id'], 'contact': r['contact'], 'email': r['to_email'], 'status': r['status'], 'score': r['score'], 'error': r['error'],
                                                   'sentAt': r['sent_at'], 'openedAt': r['opened_at'], 'clickedAt': r['clicked_at'], 'registeredAt': r['accepted_at'], 'unsubscribedAt': r['unsubscribed_at'],
                                                   'views': views.get(r['user_id'], 0), 'offers': offers.get(r['user_id'], 0)} for r in rows], 'mail': B.mail_mode()}


@post('/admin/outreach/send-now')
def send_now(request: Request):
    require_staff(request); r = B.send_queued(100); audit(request, 'outreach_send', 'outreach', None, {'sent': r['sent'], 'failed': r['failed']}); return r


@post('/admin/outreach/{id}/retry')
def retry(request: Request, id: str):
    require_staff(request); parse_value(Uuid, id, 'id'); M = T.outreach_messages.c
    n = db.count(T.outreach_messages, M.campaign_id == id, M.status == 'failed')
    db.upd(T.outreach_messages, and_(M.campaign_id == id, M.status == 'failed'), {'status': 'queued', 'error': None}); return {'requeued': n}


@post('/admin/outreach/{id}/cancel')
def cancel(request: Request, id: str):
    require_staff(request); parse_value(Uuid, id, 'id'); M = T.outreach_messages.c
    n = db.count(T.outreach_messages, M.campaign_id == id, M.status == 'queued')
    db.upd(T.outreach_messages, and_(M.campaign_id == id, M.status == 'queued'), {'status': 'cancelled', 'error': 'Cancelled by staff'})
    audit(request, 'outreach_cancel', 'outreach_campaign', id, {'cancelled': n}); return {'cancelled': n}


# ---------- Public links inside the emails ----------
GIF = base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')


@router.get('/m/{token}/o.gif')
def opened(token: str):
    m = B.message_by_token(token)
    if m and m['status'] != 'cancelled': B.advance(m, 'opened', 'opened_at')
    return Response(GIF, media_type='image/gif', headers={'cache-control': 'no-store, max-age=0'})


@router.get('/m/{token}')
def clicked(request: Request, token: str):
    """The personal link: creates (or refreshes) this person's invitation with access to the property, then opens it."""
    m = B.message_by_token(token)
    if not m: return RedirectResponse('/?link=invalid', 302)
    camp = db.get(T.outreach_campaigns, id=m['campaign_id']); l = db.get(T.listings, id=camp['listing_id']) if camp else None
    contact = db.get(T.buyer_contacts, id=m['contact_id']); company = db.get(T.buyer_companies, id=m['company_id'])
    if not camp or not l or not contact or l['status'] in ('withdrawn', 'draft'): return RedirectResponse('/?link=closed', 302)
    B.advance(m, 'clicked', 'clicked_at')
    if company and company['stage'] in ('new', 'contacted'): db.upd(T.buyer_companies, T.buyer_companies.c.id == company['id'], {'stage': 'interested'})
    U = T.users.c; u = db.get(T.users, email=m['to_email'])
    if u and (u['deleted_at'] or u['status'] == 'suspended'): return RedirectResponse('/?link=closed', 302)
    if not u:
        u = db.ins(T.users, {'email': m['to_email'], 'name': contact['name'], 'company_name': company['name'] if company else None, 'investor_type': 'Institutional investor', 'country': 'NL', 'role': 'investor',
                             'status': 'invited', 'password_hash': 'invited$' + os.urandom(8).hex(), 'listing_scope': 'selected', 'features': preset(camp['preset']), 'invited_by': camp['created_by'],
                             'access_updated_at': now(), 'account_manager': camp['sender_name'], 'locale': camp['language']})
        audit(request, 'invite_created', 'user', u['id'], {'role': 'investor', 'source': 'outreach', 'listing': l['slug']}, actor={'id': None, 'name': 'Outreach link', 'email': m['to_email']})
        log_rule('access', f"{contact['name']} ({company['name'] if company else '—'}) opened the outreach link: invitation created")
    if u['role'] == 'investor' and u['listing_scope'] != 'all':
        have = [r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == u['id'])]
        if l['id'] not in have:
            set_listings(u['id'], have + [l['id']], camp['created_by'])
            if u['status'] == 'active': notify(u['id'], 'access', 'New property shared with you', f"{l['name']} is now in your selection.", l['slug'])
    db.upd(T.outreach_messages, T.outreach_messages.c.id == m['id'], {'user_id': u['id']}); db.upd(T.buyer_contacts, T.buyer_contacts.c.id == contact['id'], {'user_id': u['id']})
    if u['status'] == 'invited':
        inv = new_invite(u['id'], camp['created_by'], 30, f"Re: {l['name']}")
        return RedirectResponse(inv['path'], 302)
    return RedirectResponse(f"/login?next=/listings/{l['slug']}", 302)


@router.get('/m/{token}/info')
def unsubscribe_info(token: str):
    m = B.message_by_token(token)
    if not m: raise not_found('This link is not valid.')
    c = db.get(T.buyer_contacts, id=m['contact_id']); e = m['to_email']; at = e.index('@')
    return {'email': e[:2] + '•' * max(1, at - 2) + e[at:], 'unsubscribed': bool(c and c['unsubscribed_at'])}


@post('/m/{token}/unsubscribe')
def unsubscribe(request: Request, token: str):
    m = B.message_by_token(token)
    if not m: raise not_found('This link is not valid.')
    t = now()
    db.upd(T.buyer_contacts, and_(T.buyer_contacts.c.id == m['contact_id'], T.buyer_contacts.c.unsubscribed_at.is_(None)), {'unsubscribed_at': t})
    db.upd(T.outreach_messages, T.outreach_messages.c.id == m['id'], {'unsubscribed_at': m['unsubscribed_at'] or t})
    db.upd(T.outreach_messages, and_(T.outreach_messages.c.contact_id == m['contact_id'], T.outreach_messages.c.status == 'queued'), {'status': 'cancelled', 'error': 'Unsubscribed'})
    audit(request, 'outreach_unsubscribe', 'buyer_contact', m['contact_id'], actor={'id': None, 'name': 'Email recipient', 'email': m['to_email']})
    return {'ok': True}
