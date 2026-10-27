"""Staff workspace: KPIs, investor CRM, offers and deals, bid rounds, acquisitions, listings, compliance, config, automation."""
from __future__ import annotations
import re, time
from datetime import timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, asc, desc, func, select
from ..common import (audit, bad, draft_email, eur_nl, forbidden, get_config, json_body, log_rule, not_found, notify, now, parse, read_stored, require_staff, save_file)
from ..domain import CONFIG_DEFAULTS, DEAL_STAGES, LEAD_STAGES, LISTING_STATUSES, TIER_LABEL, bag_lookup, kyc_risk, tier_of
from ..pdf import sample_pdf
from ..services.listings import price_changed, run_matching
from .. import jobs

router = APIRouter(prefix='/admin')
def post(path): return router.post(path, status_code=201)


@router.get('/overview')
def overview(request: Request):
    require_staff(request); A = T.audit_events.c
    views = db.count(T.audit_events, A.action == 'view', A.object_type == 'listing'); ndas = db.count(T.nda_signatures); deals = db.count(T.deals)
    nda_users = list({r['user_id'] for r in db.all_(T.nda_signatures)})
    offers = db.count(T.offers, T.offers.c.user_id.in_(nda_users)) if nda_users else 0
    verified = db.count(T.users, T.users.c.role == 'investor', T.users.c.verified.is_(True)); pro = db.count(T.users, T.users.c.role == 'investor', T.users.c.pro.is_(True))
    leads = db.all_(T.acquisition_leads); active = [l for l in leads if l['stage'] not in ('acquired', 'lost')]
    pct = lambda a, b: f'{round(a / b * 100, 1):g}%' if b else '—'
    return {'kpis': [
        {'label': 'Verified investors', 'value': verified, 'target': '1,500'}, {'label': 'Paid conversion', 'value': pct(pro, verified) if verified else '0%', 'target': '10%'},
        {'label': 'Listing → NDA rate', 'value': pct(ndas, views), 'target': '8%'}, {'label': 'NDA → offer rate', 'value': pct(offers, ndas), 'target': '15%'},
        {'label': 'Deals in progress', 'value': deals, 'target': '4+ closed / month'}, {'label': 'Active seller leads', 'value': len(active), 'target': '60+ new / month'},
        {'label': 'Pending KYC reviews', 'value': db.count(T.kyc_cases, T.kyc_cases.c.status == 'pending'), 'target': '< 1 working day'},
        {'label': 'Open offers', 'value': db.count(T.offers, T.offers.c.status.in_(['submitted', 'in_review'])), 'target': 'reply < 24 h'}],
        'funnel': [['Listing detail views', views], ['NDAs signed', ndas], ['Offers & bids', offers], ['Deals', deals]], 'pipelineValue': sum((l['est_value'] or l['asking_price'] or 0) for l in active),
        'leadStages': [[st, len([l for l in leads if l['stage'] == st])] for st in LEAD_STAGES], 'note': 'Live counts from the database.'}


@router.get('/investors')
def investors(request: Request):
    require_staff(request)
    users = db.all_(T.users, T.users.c.role == 'investor', order=desc(T.users.c.lead_score))
    kyc = db.all_(T.kyc_cases, order=desc(T.kyc_cases.c.created_at)); acts = db.all_(T.audit_events, order=desc(T.audit_events.c.created_at), limit=400)
    out = []
    for u in users:
        if u['deleted_at']: continue
        k = next((c for c in kyc if c['user_id'] == u['id']), None); a = next((e for e in acts if e['actor_id'] == u['id']), None)
        score = min(99, u['lead_score'] + len([e for e in acts if e['actor_id'] == u['id'] and e['action'] in ('view', 'download', 'nda_sign', 'offer_submit', 'bid_submit')]) * 4)
        v = {'id': u['id'], 'verified': u['verified'], 'pro': u['pro']}
        out.append({'id': u['id'], 'name': u['name'], 'email': u['email'], 'type': u['investor_type'], 'country': u['country'], 'tier': tier_of(v), 'tierLabel': TIER_LABEL[tier_of(v)], 'kyc': k['status'] if k else 'none',
                    'risk': k['risk'] if k else kyc_risk(u['investor_type'], u['country']), 'leadScore': score, 'lastActivity': f"{a['action']} · {a['object_type']}" if a else '—', 'lastAt': a['created_at'] if a else u['last_login_at'], 'manager': u['account_manager'] or '—'})
    return out


# ---------- Offers and deals ----------
def _offer_rows(where=None):
    O, L, U = T.offers, T.listings, T.users
    stmt = select(O, L.c.name.label('_ln'), L.c.slug.label('_ls'), L.c.asking_price.label('_asking'), U.c.name.label('_un'), U.c.email.label('_ue')).select_from(O.join(L, O.c.listing_id == L.c.id).outerjoin(U, O.c.user_id == U.c.id))
    if where is not None: stmt = stmt.where(where)
    return db.rows(stmt.order_by(desc(O.c.created_at)))


@router.get('/offers')
def offers(request: Request):
    require_staff(request)
    return [{'id': r['id'], 'investor': r['_un'], 'email': r['_ue'], 'listing': r['_ln'], 'asking': r['_asking'], 'amount': r['amount'], 'vsAsking': round((r['amount'] / r['_asking'] - 1) * 100, 1), 'conditions': r['conditions'],
             'financingType': r['financing_type'], 'transferDate': r['transfer_date'], 'proofFileName': r['proof_file_name'], 'status': r['status'], 'counterAmount': r['counter_amount'], 'leadBand': r['lead_band'],
             'leadScore': r['lead_score'], 'flagged': r['flagged'], 'followupAt': r['followup_at'], 'createdAt': r['created_at']} for r in _offer_rows(T.offers.c.bid_round_id.is_(None))]


class DecisionIn(BaseModel):
    decision: Literal['accepted', 'countered', 'rejected', 'in_review']
    counterAmount: Optional[int] = Field(None, ge=100000)


@post('/offers/{id}/decision')
def decide(request: Request, id: str, body=Depends(json_body)):
    require_staff(request); b = parse(DecisionIn, body)
    o = db.get(T.offers, id=id)
    if not o: raise not_found()
    L = db.get(T.listings, id=o['listing_id'])
    if o['status'] not in ('submitted', 'in_review'): raise bad('This offer has already been decided.')
    if b.decision == 'countered' and not b.counterAmount: raise bad('Enter a counter amount.')
    db.upd(T.offers, T.offers.c.id == id, {'status': b.decision, 'counter_amount': b.counterAmount})
    uid = o['user_id']
    if b.decision == 'accepted':
        db.ins(T.deals, {'listing_id': L['id'], 'offer_id': id, 'user_id': uid, 'price': o['amount']}, returning=False); db.upd(T.listings, T.listings.c.id == L['id'], {'status': 'under_offer'})
        notify(uid, 'deal', 'Your offer was accepted', f"{L['name']} · €{eur_nl(o['amount'])}. Next step: letter of intent.", L['slug'])
    if b.decision == 'countered': notify(uid, 'offer', 'Counter-offer received', f"{L['name']} · counter at €{eur_nl(b.counterAmount)}", L['slug'])
    if b.decision == 'rejected': notify(uid, 'offer', 'Offer not accepted', f"{L['name']}. Thank you for your offer.", L['slug'])
    u = db.get(T.users, id=uid)
    if u and b.decision != 'in_review': draft_email(u['email'], f"Your offer on {L['name']}: {b.decision}", f"Dear {u['name']}, your offer on {L['name']} has been {b.decision}.", 'offer_decision')
    audit(request, 'admin_change', 'offer', id, {'decision': b.decision, 'counter': b.counterAmount}); log_rule('pipeline', f"Offer on {L['name']} {b.decision}"); return {'ok': True}


@post('/offers/{id}/flag')
def flag(request: Request, id: str):
    require_staff(request); o = db.get(T.offers, id=id)
    if not o: raise not_found()
    db.upd(T.offers, T.offers.c.id == id, {'flagged': not o['flagged']}); audit(request, 'flag_transaction', 'offer', id, {'flagged': not o['flagged']}); return {'flagged': not o['flagged']}


@router.get('/offers/{id}/proof')
def proof(request: Request, id: str):
    require_staff(request); o = db.get(T.offers, id=id)
    if not o or not o['proof_file_key']: raise not_found()
    audit(request, 'view', 'proof_of_funds', id)
    name = re.sub(r'[^\w.\- ]', '', o['proof_file_name'] or 'proof')
    return Response(read_stored(o['proof_file_key']), media_type='application/pdf', headers={'Content-Disposition': f'inline; filename="{name}"', 'Cache-Control': 'no-store'})


@router.get('/deals')
def deals(request: Request):
    require_staff(request); D, L, U = T.deals, T.listings, T.users
    rs = db.rows(select(D, L.c.name.label('_ln'), U.c.name.label('_un')).select_from(D.join(L, D.c.listing_id == L.c.id).outerjoin(U, D.c.user_id == U.c.id)).order_by(desc(D.c.created_at)))
    return [{'id': r['id'], 'listing': r['_ln'], 'buyer': r['_un'], 'price': r['price'], 'stage': r['stage'], 'stages': DEAL_STAGES} for r in rs]


@post('/deals/{id}/advance')
def advance(request: Request, id: str):
    require_staff(request); d = db.get(T.deals, id=id)
    if not d: raise not_found()
    l = db.get(T.listings, id=d['listing_id'])
    if d['stage'] >= len(DEAL_STAGES) - 1: raise bad('This deal is complete.')
    stage = d['stage'] + 1; db.upd(T.deals, T.deals.c.id == id, {'stage': stage})
    if stage == len(DEAL_STAGES) - 1: db.upd(T.listings, T.listings.c.id == l['id'], {'status': 'sold'})
    if d['user_id']: notify(d['user_id'], 'deal', 'Deal update: ' + DEAL_STAGES[stage], l['name'], l['slug'])
    audit(request, 'admin_change', 'deal', id, {'stage': DEAL_STAGES[stage]}); return {'stage': stage}


@router.get('/enquiries')
def enquiries(request: Request):
    require_staff(request); E, L = T.enquiries, T.listings
    rs = db.rows(select(E, L.c.name.label('_ln')).select_from(E.outerjoin(L, E.c.listing_id == L.c.id)).order_by(desc(E.c.created_at)))
    return [{**db.camel({k: v for k, v in r.items() if k != '_ln'}), 'listing': r['_ln'] or 'General'} for r in rs]


class EnqStatusIn(BaseModel):
    status: Literal['new', 'contacted', 'viewing_scheduled', 'closed']


@router.patch('/enquiries/{id}')
def enquiry_status(request: Request, id: str, body=Depends(json_body)):
    require_staff(request); b = parse(EnqStatusIn, body); db.upd(T.enquiries, T.enquiries.c.id == id, {'status': b.status}); log_rule('pipeline', f'Enquiry moved to {b.status}'); return {'ok': True}


# ---------- Bid rounds ----------
@router.get('/bid-rounds')
def rounds(request: Request):
    require_staff(request); out = []
    for r in db.all_(T.bid_rounds):
        l = db.get(T.listings, id=r['listing_id']); O, U = T.offers, T.users
        bids = db.rows(select(O, U.c.name.label('_un')).select_from(O.outerjoin(U, O.c.user_id == U.c.id)).where(O.c.bid_round_id == r['id']).order_by(desc(O.c.amount)))
        out.append({'id': r['id'], 'listing': l['name'], 'closesAt': r['closes_at'], 'minBid': r['min_bid'], 'status': r['status'], 'bidCount': len(bids), 'winnerOfferId': r['winner_offer_id'],
                    'ranking': None if r['status'] == 'open' else [{'offerId': b['id'], 'bidder': b['bidder_label'] or b['_un'], 'amount': b['amount'], 'conditions': b['conditions'], 'proof': bool(b['proof_file_key'])} for b in bids]})
    return out


@post('/bid-rounds/{id}/close')
def close(request: Request, id: str):
    require_staff(request); n = jobs.close_round(id, 'manual (demo)'); audit(request, 'admin_change', 'bid_round', id, {'action': 'close'}); return {'closed': n}


@post('/bid-rounds/{id}/award')
def award(request: Request, id: str):
    require_staff(request); r = db.get(T.bid_rounds, id=id)
    if not r: raise not_found()
    l = db.get(T.listings, id=r['listing_id'])
    if r['status'] != 'closed': raise bad('Close the round first.')
    bids = db.all_(T.offers, T.offers.c.bid_round_id == id, order=desc(T.offers.c.amount))
    if not bids: raise bad('No bids.')
    win = bids[0]; db.upd(T.bid_rounds, T.bid_rounds.c.id == id, {'status': 'awarded', 'winner_offer_id': win['id']})
    db.upd(T.offers, T.offers.c.id == win['id'], {'status': 'accepted'})
    for b in bids[1:]: db.upd(T.offers, T.offers.c.id == b['id'], {'status': 'rejected'})
    if win['user_id']: db.ins(T.deals, {'listing_id': l['id'], 'offer_id': win['id'], 'user_id': win['user_id'], 'price': win['amount']}, returning=False)
    db.upd(T.listings, T.listings.c.id == l['id'], {'status': 'under_offer'})
    for b in bids:
        if b['user_id']: notify(b['user_id'], 'bid', 'You won the bid round' if b['id'] == win['id'] else 'Bid round result', f"{l['name']} · your bid of €{eur_nl(b['amount'])} was the highest." if b['id'] == win['id'] else f"{l['name']} · another bid was selected. Thank you for taking part.", l['slug'])
    log_rule('bidrounds', f"{l['name']} awarded to {win['bidder_label']} · {len(bids) - 1} unsuccessful bidders notified"); audit(request, 'admin_change', 'bid_round', id, {'action': 'award', 'winner': win['id']})
    return {'winner': win['bidder_label'], 'amount': win['amount']}


# ---------- Acquisition pipeline (sell side) ----------
@router.get('/leads')
def leads(request: Request):
    require_staff(request); return db.camels(db.all_(T.acquisition_leads, order=desc(T.acquisition_leads.c.created_at)))


class LeadIn(BaseModel):
    address: Annotated[str, StringConstraints(min_length=3, max_length=160)]
    propertyType: Annotated[str, StringConstraints(max_length=60)]
    units: int = Field(ge=1, le=1000)
    askingPrice: Optional[int] = Field(None, ge=0)
    source: Annotated[str, StringConstraints(max_length=60)]


@post('/leads')
def add_lead(request: Request, body=Depends(json_body)):
    require_staff(request); b = parse(LeadIn, body)
    l = db.ins(T.acquisition_leads, {'address': b.address, 'property_type': b.propertyType, 'units': b.units, 'asking_price': b.askingPrice, 'source': b.source}); log_rule('acquisition', f'Lead added · {b.address}'); return db.camel(l)


class LeadPatch(BaseModel):
    stage: Optional[Literal[tuple(LEAD_STAGES)]] = None  # type: ignore
    ownerName: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    estValue: Optional[int] = None
    lostReason: Optional[Annotated[str, StringConstraints(max_length=200)]] = None


@router.patch('/leads/{id}')
def patch_lead(request: Request, id: str, body=Depends(json_body)):
    u = require_staff(request); b = parse(LeadPatch, body)
    vals = {k: v for k, v in {'stage': b.stage, 'owner_name': b.ownerName, 'est_value': b.estValue, 'lost_reason': b.lostReason}.items() if v is not None}
    if vals: db.upd(T.acquisition_leads, T.acquisition_leads.c.id == id, vals)
    log_rule('acquisition', f"Lead {id[:6]} updated by {u['name']}{' → ' + b.stage if b.stage else ''}"); return {'ok': True}


# ---------- Listings: BAG lookup, create, publish, status, price ----------
@router.get('/bag')
def bag(request: Request, postcode: str = '', number: str = ''):
    require_staff(request); r = bag_lookup(postcode, number)
    if not r: raise bad('Enter a Dutch postcode (1234 AB) and a house number.')
    return r


@router.get('/listings')
def listings(request: Request):
    require_staff(request); L, P = T.listings, T.properties
    rs = db.rows(select(L, P.c.city.label('_city')).select_from(L.join(P, L.c.property_id == P.c.id)).order_by(desc(L.c.created_at)))
    return [{'id': r['id'], 'slug': r['slug'], 'name': r['name'], 'city': r['_city'], 'status': r['status'], 'dealType': r['deal_type'], 'askingPrice': r['asking_price'], 'previousPrice': r['previous_price'], 'publishedAt': r['published_at'], 'source': r['source']} for r in rs]


class ListingIn(BaseModel):
    postcode: str
    number: str
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)]
    category: Literal['portfolios', 'buildings', 'homes']
    dealType: Literal['direct', 'portfolio', 'off_market']
    askingPrice: int = Field(ge=100000, le=1_000_000_000)
    grossRentAnnual: int = Field(ge=0, le=100_000_000)
    units: int = Field(ge=1, le=500)
    description: Optional[Annotated[str, StringConstraints(max_length=4000)]] = None


@post('/listings')
def create_listing(request: Request, body=Depends(json_body)):
    require_staff(request); b = parse(ListingIn, body)
    bg = bag_lookup(b.postcode, b.number)
    if not bg: raise bad('BAG lookup failed: check the postcode and number.')
    p = db.ins(T.properties, {'address': bg['address'], 'postcode': bg['postcode'], 'city': bg['city'], 'district': 'BAG verified', 'lat': bg['lat'], 'lng': bg['lng'], 'area_m2': bg['areaM2'], 'build_year': bg['buildYear'],
                              'category': b.category, 'property_type': {'portfolios': 'Residential portfolio', 'buildings': 'Apartment building', 'homes': 'Single home'}[b.category], 'tenure': 'Freehold (eigen grond)',
                              'energy_label': bg['energyLabel'], 'woz_value': round(b.askingPrice * 1.02), 'woz_year': 2026, 'image': 'r1' if b.category == 'homes' else 'p1' if b.category == 'portfolios' else 'p2'})
    per = bg['areaM2'] // b.units
    db.ins(T.units, [{'property_id': p['id'], 'ref': str(i).zfill(2), 'area_m2': per, 'rent_monthly': round(b.grossRentAnnual / b.units / 12), 'rent_type': 'mid', 'energy_label': bg['energyLabel']} for i in range(1, b.units + 1)], returning=False)
    import unicodedata
    base = unicodedata.normalize('NFKD', b.name.lower()); base = re.sub(r'[^\w\s-]', '', base).strip(); base = re.sub(r'\s+', '-', base)[:60]
    slug = base + '-' + format(int(time.time() * 1000), 'x')[-4:]
    l = db.ins(T.listings, {'property_id': p['id'], 'slug': slug, 'name': b.name, 'description': b.description or 'Created from a BAG lookup. Add verified copy, media and documents before publishing.', 'highlights': ['BAG-verified address and building data', 'Own stock'],
                            'status': 'draft', 'deal_type': b.dealType, 'asking_price': b.askingPrice, 'gross_rent_annual': b.grossRentAnnual, 'operating_costs_annual': round(b.grossRentAnnual * 0.22), 'occupancy': 100})
    for folder, fname, dl in [('Legal', 'Kadaster ownership extract.pdf', False), ('Technical', 'Building data (BAG).pdf', True)]:
        pdf = sample_pdf(fname.replace('.pdf', ''), f"{b.name} · {bg['address']}, {bg['postcode']} {bg['city']}", ['Generated when the listing was created in the staff workspace.'])
        db.ins(T.documents, {'listing_id': l['id'], 'folder': folder, 'filename': fname, 'download_allowed': dl, 'storage_key': save_file(pdf, fname)}, returning=False)
    audit(request, 'admin_change', 'listing', l['id'], {'action': 'create', 'bag': bg['source']}); return {'id': l['id'], 'slug': slug, 'bag': bg}


@post('/listings/{id}/publish')
def publish(request: Request, id: str):
    require_staff(request); l = db.get(T.listings, id=id)
    if not l: raise not_found()
    if l['status'] != 'draft': raise bad('Only drafts can be published.')
    pro_until = now() + timedelta(hours=48) if l['deal_type'] == 'off_market' else None
    db.upd(T.listings, T.listings.c.id == id, {'status': 'available', 'published_at': now(), 'pro_early_access_until': pro_until})
    n = run_matching(id, 'publish')
    if pro_until: jobs.schedule('offmarket_release', pro_until, {'listingId': id})
    audit(request, 'admin_change', 'listing', id, {'action': 'publish'}); return {'matched': n, 'proEarlyAccessUntil': pro_until}


class ListingPatch(BaseModel):
    status: Optional[Literal[tuple(LISTING_STATUSES)]] = None  # type: ignore
    askingPrice: Optional[int] = Field(None, ge=100000, le=2_000_000_000)


@router.patch('/listings/{id}')
def patch_listing(request: Request, id: str, body=Depends(json_body)):
    require_staff(request); b = parse(ListingPatch, body)
    l = db.get(T.listings, id=id)
    if not l: raise not_found()
    vals = {}
    if b.status: vals['status'] = b.status
    if b.askingPrice and b.askingPrice != l['asking_price']: vals['asking_price'] = b.askingPrice; vals['previous_price'] = l['asking_price']
    if vals: db.upd(T.listings, T.listings.c.id == id, vals)
    alerts = price_changed(id, l['asking_price'], b.askingPrice) if 'asking_price' in vals else 0
    audit(request, 'admin_change', 'listing', id, b.model_dump(exclude_none=True)); return {'ok': True, 'alerts': alerts}


# ---------- Compliance ----------
@router.get('/kyc')
def kyc(request: Request):
    require_staff(request); K, U = T.kyc_cases, T.users
    rs = db.rows(select(K, U.c.name.label('_n'), U.c.email.label('_e'), U.c.investor_type.label('_t'), U.c.country.label('_c')).select_from(K.join(U, K.c.user_id == U.c.id)).where(U.c.deleted_at.is_(None)).order_by(desc(K.c.created_at)))
    return [{'id': r['id'], 'name': r['_n'], 'email': r['_e'], 'type': r['_t'], 'country': r['_c'], 'status': r['status'], 'risk': r['risk'], 'pep': r['pep'], 'kvk': r['kvk'], 'ubo': r['ubo_name'], 'ticket': r['ticket'],
             'idFileName': r['id_file_name'], 'proofFileName': r['proof_file_name'], 'submittedAt': r['created_at'], 'decidedAt': r['decided_at'], 'notes': r['notes'],
             'checks': f"ID uploaded · liveness confirmed · sanctions screening clear (simulated){' · KVK ' + r['kvk'] if r['kvk'] else ''}{' · UBO ' + r['ubo_name'] if r['ubo_name'] else ''}"} for r in rs]


@router.get('/kyc/{id}/file/{which}')
def kyc_file(request: Request, id: str, which: str):
    require_staff(request); k = db.get(T.kyc_cases, id=id); key = (k or {}).get('id_file_key' if which == 'id' else 'proof_file_key')
    if not key: raise not_found()
    audit(request, 'view', 'kyc_document', id, {'which': which}); f = db.get(T.files, key=key)
    return Response(read_stored(key), media_type=f['mime'] if f else 'application/octet-stream', headers={'Cache-Control': 'no-store', 'Content-Disposition': 'inline'})


class KycDecisionIn(BaseModel):
    decision: Literal['approved', 'rejected']
    notes: Optional[Annotated[str, StringConstraints(max_length=500)]] = None


@post('/kyc/{id}/decision')
def kyc_decide(request: Request, id: str, body=Depends(json_body)):
    staff = require_staff(request); b = parse(KycDecisionIn, body)
    k = db.get(T.kyc_cases, id=id)
    if not k: raise not_found()
    if k['status'] != 'pending': raise bad('This case has already been decided.')
    if k['risk'] == 'high' and b.decision == 'approved' and not b.notes: raise bad('High-risk cases need enhanced due diligence notes before approval.')
    db.upd(T.kyc_cases, T.kyc_cases.c.id == id, {'status': b.decision, 'notes': b.notes, 'reviewer_id': staff['id'], 'decided_at': now(), 'next_review_at': now() + timedelta(days=365)})
    if b.decision == 'approved':
        db.upd(T.users, T.users.c.id == k['user_id'], {'verified': True, 'account_manager': staff['name']}); notify(k['user_id'], 'kyc', 'You are verified', 'You can now open data rooms, make offers and join bid rounds.')
    else: notify(k['user_id'], 'kyc', 'Verification not approved', b.notes or 'Please contact us for details.')
    audit(request, 'kyc_decision', 'kyc_case', id, {'decision': b.decision}); log_rule('compliance', f"KYC case {id[:6]} {b.decision} by {staff['name']}"); return {'ok': True}


@router.get('/audit')
def audit_log(request: Request, limit: str = '100'):
    require_staff(request)
    try: n = min(500, int(limit) or 100)
    except ValueError: n = 100
    return db.logs(db.all_(T.audit_events, order=desc(T.audit_events.c.created_at), limit=n))


# ---------- Config, automation, outbox, jobs ----------
@router.get('/config')
def get_cfg(request: Request):
    require_staff(request); return db.camels(db.all_(T.config, order=asc(T.config.c.key)))


@router.put('/config')
def put_cfg(request: Request, body=Depends(json_body)):
    require_staff(request)
    if not isinstance(body, dict): raise bad('Expected an object of config values.')
    vals = {}
    for k, v in body.items():
        try: x = float(v)
        except (TypeError, ValueError): raise bad(f'{k}: Expected a number')
        if not 0 <= x <= 1e8: raise bad(f'{k}: Out of range')
        vals[k] = x
    for k, v in vals.items():
        if any(c['key'] == k for c in CONFIG_DEFAULTS): db.upd(T.config, T.config.c.key == k, {'value': v})
    audit(request, 'admin_change', 'config', None, vals); return db.camels(db.all_(T.config))


@router.get('/automation')
def automation(request: Request):
    require_staff(request); A = T.automation_log
    runs = db.rows(select(A.c.rule, func.count().label('n')).group_by(A.c.rule))
    return {'settings': db.camels(db.all_(T.automation_settings)), 'log': db.logs(db.all_(A, order=desc(A.c.created_at), limit=60)), 'runs': {r['rule']: int(r['n']) for r in runs}}


class RuleIn(BaseModel):
    enabled: bool


@router.put('/automation/{key}')
def set_rule(request: Request, key: str, body=Depends(json_body)):
    require_staff(request); b = parse(RuleIn, body)
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    db.run(pg_insert(T.automation_settings).values(key=key, enabled=b.enabled).on_conflict_do_update(index_elements=['key'], set_={'enabled': b.enabled}))
    audit(request, 'admin_change', 'automation', key, {'enabled': b.enabled}); return {'ok': True}


@router.get('/outbox')
def outbox(request: Request):
    require_staff(request); return db.camels(db.all_(T.outbox, order=desc(T.outbox.c.created_at), limit=50))


@router.get('/jobs')
def job_list(request: Request):
    require_staff(request); return db.camels(db.all_(T.jobs, order=desc(T.jobs.c.run_at), limit=30))


@post('/jobs/run')
def run_jobs(request: Request):
    require_staff(request); return {'ran': jobs.tick()}
