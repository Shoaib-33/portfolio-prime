from __future__ import annotations
import re
from datetime import date, datetime, timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, asc
from ..common import (audit, bad, client_ip, draft_email, eur_nl, forbidden, form_body, iso, json_body, log_rule, not_found, notify, now, parse, read_stored,
                      read_token, require_feature, require_user, rule_on, save_file, sign_token, viewer_of)
from ..domain import can_see_listing, has_feature, is_staff, lead_score, off_market_state
from ..pdf import watermark
from ..services.listings import get_listing, has_nda
from .account import check_file

router = APIRouter()
def post(path): return router.post(path, status_code=201)

Email = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]


def listing_or_404(slug: str, request: Request) -> dict:
    v = viewer_of(request); x = get_listing(slug)
    if not x or not can_see_listing(v, x['l']['id']) or x['l']['status'] in ['draft', 'withdrawn'] or off_market_state(x['l']['deal_type'], x['l']['pro_early_access_until'], v) != 'open':
        raise not_found('Listing not found')
    return x


def room_gate(request: Request, listing_id: str) -> dict:
    """Data-room gate: login, KYC verified, NDA signed, 2FA, then a signed URL."""
    u = require_user(request)
    if is_staff(u): return u
    v = viewer_of(request)
    if not can_see_listing(v, listing_id): raise not_found()
    if not has_feature(v, 'dataroom') and not has_feature(v, 'institutional'): raise forbidden('The data room is not included in your access. Ask your account manager.')
    if not u['verified']: raise forbidden('Complete verification (KYC) first.')
    if not has_nda(u['id'], listing_id): raise forbidden('Accept the NDA for this property first.')
    if not u['twofaEnabled'] or not u['twofaPassed']: raise forbidden('Two-factor login is required for the data room.')
    return u


class NdaIn(BaseModel):
    signedName: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    accept: Literal[True]


@post('/listings/{slug}/nda')
def nda(request: Request, slug: str, body=Depends(json_body)):
    u = require_user(request); x = listing_or_404(slug, request)
    require_feature(request, 'institutional' if x['l']['deal_type'] == 'institutional' else 'dataroom')
    if not u['verified']: raise forbidden('Complete verification (KYC) first.')
    b = parse(NdaIn, body)
    if has_nda(u['id'], x['l']['id']): return {'ok': True, 'already': True}
    n = db.ins(T.nda_signatures, {'user_id': u['id'], 'listing_id': x['l']['id'], 'signed_name': b.signedName, 'template_version': 'NDA v1.2 (NL/EN)', 'method': 'clickwrap', 'ip': client_ip(request), 'user_agent': str(request.headers.get('user-agent') or '')[:300]})
    audit(request, 'nda_sign', 'listing', x['l']['id'], {'template': n['template_version']}); return {'ok': True}


@router.get('/listings/{slug}/dataroom')
def room(request: Request, slug: str):
    x = listing_or_404(slug, request); require_feature(request, 'institutional' if x['l']['deal_type'] == 'institutional' else 'dataroom'); room_gate(request, x['l']['id'])
    docs = db.all_(T.documents, T.documents.c.listing_id == x['l']['id'], order=[asc(T.documents.c.folder), asc(T.documents.c.filename)])
    folders: dict[str, list] = {}
    for d in docs: folders.setdefault(d['folder'], []).append({'id': d['id'], 'filename': d['filename'], 'version': d['version'], 'downloadAllowed': d['download_allowed'], 'uploadedAt': d['created_at']})
    return {'listing': x['l']['name'], 'folders': [{'name': k, 'files': v} for k, v in folders.items()]}


@post('/documents/{id}/view-url')
def view_url(request: Request, id: str, download: Optional[str] = None):
    d = db.get(T.documents, id=id) if re.fullmatch(r'[0-9a-f-]{36}', id) else None
    if not d: raise not_found()
    u = room_gate(request, d['listing_id'])
    if download and not d['download_allowed'] and not is_staff(u): raise forbidden('Downloads are blocked for this folder.')
    return {'url': f"/api/documents/file/{sign_token({'d': d['id'], 'u': u['id'], 'dl': bool(download)}, 300)}", 'expiresInSeconds': 300}


@router.get('/documents/file/{token}')
def file(request: Request, token: str):
    t = read_token(token)
    if not t: raise forbidden('This link has expired. Open the document again from the data room.')
    u = require_user(request)
    if u['id'] != t['u']: raise forbidden('This link belongs to another user.')
    d = db.get(T.documents, id=t['d'])
    if not d: raise not_found()
    stamped = watermark(read_stored(d['storage_key']), f"{u['name']} · {u['email']} · {now().strftime('%Y-%m-%d %H:%M')} UTC")
    audit(request, 'download' if t['dl'] else 'view', 'document', d['id'], {'filename': d['filename'], 'folder': d['folder']})
    name = re.sub(r'[^\w.\- ]', '', d['filename'])
    return Response(stamped, media_type='application/pdf', headers={'Content-Disposition': f"{'attachment' if t['dl'] else 'inline'}; filename=\"{name}\"", 'Cache-Control': 'no-store'})


# ---------- Offers, viewings, questions ----------
@post('/listings/{slug}/offers')
def offer(request: Request, slug: str, form=Depends(form_body)):
    u = require_feature(request, 'offers')
    if not u['verified']: raise forbidden('Only verified investors can make offers.')
    x = listing_or_404(slug, request); l = x['l']
    if l['status'] != 'available': raise bad('This property is not open for offers.')
    if l['deal_type'] == 'bid_round': raise bad('This property is sold through a bid round.')
    if l['deal_type'] == 'institutional': raise bad('This portfolio is sold through a structured process. Submit your bid in the Process tab.')
    try: amount = int(str(form.get('amount') or ''))
    except ValueError: raise bad('amount: Expected a whole number')
    if not 100000 <= amount <= 1e9: raise bad('amount: Must be between €100.000 and €1.000.000.000')
    td = str(form.get('transferDate') or '')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', td): raise bad('transferDate: Expected a date (YYYY-MM-DD)')
    ft = form.get('financingType')
    if ft not in ('Mortgage', 'Cash', 'Mixed'): raise bad('financingType: Choose Mortgage, Cash or Mixed')
    msg = str(form.get('message') or '') or None
    if msg and len(msg) > 2000: raise bad('message: At most 2000 characters')
    if date.fromisoformat(td) < date.today(): raise bad('The transfer date must be in the future.')
    pf = check_file(form.get('proof'), 'Proof of funds')
    conditions = [c for c in form.getlist('conditions') if c in ['Financing', 'Inspection', 'Board approval']]
    units = [int(n) for n in str(form.get('units') or '').split(',') if n.strip().isdigit() and int(n) > 0]
    lead = lead_score('offer', True, amount=amount, message=msg, units=units, asking_price=l['asking_price']) if rule_on('scoring') else None
    followup = now() + timedelta(hours=4 if lead and lead['band'] == 'Hot' else 24) if rule_on('followups') else None
    o = db.ins(T.offers, {'listing_id': l['id'], 'user_id': u['id'], 'amount': amount, 'conditions': conditions, 'financing_type': ft, 'transfer_date': td, 'units': units,
                          'proof_file_key': save_file(pf.file.read(), pf.filename), 'proof_file_name': pf.filename, 'message': msg, 'lead_score': lead and lead['value'], 'lead_band': lead and lead['band'], 'followup_at': followup})
    audit(request, 'offer_submit', 'offer', o['id'], {'amount': amount, 'listing': l['slug']})
    notify(u['id'], 'offer', 'Offer submitted', f"{l['name']} · €{eur_nl(amount)}. Offers are not binding until a purchase agreement is signed.", l['slug'])
    if lead: log_rule('scoring', f"Offer from {u['name']} on {l['name']} scored {lead['value']} ({lead['band']})")
    if followup: log_rule('followups', f"Follow-up {'within 4 hours' if lead and lead['band'] == 'Hot' else 'tomorrow'} · {l['name']}")
    draft_email(u['email'], 'We have received your offer', f"Dear {u['name']}, thank you for your offer of €{eur_nl(amount)} on {l['name']}. We reply within 24 hours.", 'offer')
    return {'id': o['id'], 'status': o['status'], 'lead': lead}


class EnquiryIn(BaseModel):
    kind: Literal['viewing', 'question']
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    email: Email
    preferredDate: Optional[Annotated[str, StringConstraints(pattern=r'^\d{4}-\d{2}-\d{2}$')]] = None
    format: Optional[Literal['In person', 'Video call']] = None
    message: Optional[Annotated[str, StringConstraints(max_length=2000)]] = None


@post('/listings/{slug}/enquiries')
def enquiry(request: Request, slug: str, body=Depends(json_body)):
    x = None if slug == 'general' else listing_or_404(slug, request)
    b = parse(EnquiryIn, body)
    if b.kind == 'question' and not b.message: raise bad('Please write your question.')
    if b.kind == 'viewing' and not b.preferredDate: raise bad('Choose a preferred date.')
    u = request.state.user
    lead = lead_score(b.kind, bool(u and u['verified']), message=b.message) if rule_on('scoring') else None
    followup = now() + timedelta(hours=4 if lead and lead['band'] == 'Hot' else 24) if rule_on('followups') else None
    e = db.ins(T.enquiries, {'listing_id': x['l']['id'] if x else None, 'user_id': u['id'] if u else None, 'kind': b.kind, 'name': b.name, 'email': b.email, 'preferred_date': b.preferredDate, 'format': b.format, 'message': b.message,
                             'lead_score': lead and lead['value'], 'lead_band': lead and lead['band'], 'followup_at': followup})
    audit(request, 'enquiry', 'enquiry', e['id'], {'kind': b.kind})
    if u: notify(u['id'], 'enquiry', 'Viewing request received' if b.kind == 'viewing' else 'Question received', f"{x['l']['name'] if x else 'General'} · we reply within 24 hours.", x['l']['slug'] if x else None)
    draft_email(b.email, 'Your viewing request' if b.kind == 'viewing' else 'Thank you for your question', f"Dear {b.name}, thank you. {'We confirm a slot within one working day; tenants receive proper notice where a property is let.' if b.kind == 'viewing' else 'Your account manager replies within 24 hours.'}", b.kind)
    return {'id': e['id'], 'reference': 'PP-' + e['id'][:6].upper()}


@post('/offers/{id}/accept-counter')
def accept_counter(request: Request, id: str):
    u = require_user(request); o = db.get(T.offers, id=id, user_id=u['id'])
    if not o or o['status'] != 'countered' or not o['counter_amount']: raise bad('There is no counter-offer to accept.')
    db.upd(T.offers, T.offers.c.id == id, {'status': 'accepted', 'amount': o['counter_amount']})
    db.ins(T.deals, {'listing_id': o['listing_id'], 'offer_id': o['id'], 'user_id': u['id'], 'price': o['counter_amount']}, returning=False)
    db.upd(T.listings, T.listings.c.id == o['listing_id'], {'status': 'under_offer'})
    audit(request, 'counter_accepted', 'offer', id, {'amount': o['counter_amount']}); notify(u['id'], 'deal', 'Deal started', 'Counter-offer accepted. Next step: letter of intent.'); return {'ok': True}


# ---------- Sealed bids (bid rounds) ----------
@post('/bid-rounds/{id}/bids')
def bid(request: Request, id: str, form=Depends(form_body)):
    u = require_feature(request, 'offers')
    if not u['verified']: raise forbidden('Only verified investors can bid.')
    r = db.get(T.bid_rounds, id=id) if re.fullmatch(r'[0-9a-f-]{36}', id) else None
    if not r or not can_see_listing(viewer_of(request), r['listing_id']): raise not_found()
    if r['status'] != 'open' or now() >= r['closes_at']: raise bad('This bid round is closed.')
    try: amount = int(str(form.get('amount') or ''))
    except ValueError: raise bad('amount: Expected a whole number')
    if amount < r['min_bid']: raise bad(f"amount: The minimum bid is €{eur_nl(r['min_bid'])}")
    if amount > 1e9: raise bad('amount: Too large')
    cond = form.get('conditions')
    if cond not in ('No conditions', 'Subject to financing', 'Subject to due diligence'): raise bad('conditions: Choose one of the listed conditions')
    if form.get('acceptRules') != 'on': raise bad('acceptRules: Accept the bid-round rules')
    pf = check_file(form.get('proof'), 'Proof of funds')
    mine = db.get(T.offers, bid_round_id=id, user_id=u['id'])
    vals = {'amount': amount, 'conditions': [cond], 'proof_file_key': save_file(pf.file.read(), pf.filename), 'proof_file_name': pf.filename}
    if mine: db.upd(T.offers, T.offers.c.id == mine['id'], vals)
    else: db.ins(T.offers, {**vals, 'listing_id': r['listing_id'], 'user_id': u['id'], 'bid_round_id': id, 'bidder_label': u['companyName'] or u['name'], 'status': 'sealed', 'lead_score': 75, 'lead_band': 'Hot'}, returning=False)
    audit(request, 'bid_submit', 'bid_round', id, {'amount': amount, 'updated': bool(mine)})
    notify(u['id'], 'bid', 'Sealed bid received', f"€{eur_nl(amount)}. Bids stay sealed until {r['closes_at'].strftime('%Y-%m-%d %H:%M')} UTC.")
    return {'ok': True, 'updated': bool(mine)}
