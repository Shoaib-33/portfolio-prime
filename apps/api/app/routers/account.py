from __future__ import annotations
import os
from datetime import timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, desc, and_, select
from ..common import (SESSION_COOKIE, audit, bad, create_session, forbidden, form_body, get_config, hash_password, iso, json_body, log_rule, not_found, notify,
                      now, parse, require_feature, require_user, save_file, set_session_cookie, unauthorized, verify_password, viewer_of)
from ..domain import (DEAL_STAGES, TIER_LABEL, alert_frequency, can_see_listing, cfg, features_of, kyc_risk, new_totp_secret, tier_of, totp, verify_totp)
from ..services.listings import get_listing

router = APIRouter()
def post(path): return router.post(path, status_code=201)

DEMO = os.environ.get('PP_DEMO') != '0'
ALLOWED = ['application/pdf', 'image/png', 'image/jpeg']
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=160, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]


def check_file(f, label='File'):
    if f is None or isinstance(f, str) or not getattr(f, 'filename', None): raise bad(f'{label} is required.')
    if f.content_type not in ALLOWED: raise bad(f'{label} must be a PDF, PNG or JPG.')
    return f


def public_user(u: dict | None) -> dict | None:
    """The signed-in person as the website sees them (u is a camelCase user dict)."""
    if not u: return None
    staff = u['role'] != 'investor'
    return {'features': features_of(u), 'listingScope': 'all' if staff else u.get('listingScope'), 'listings': None if staff or u.get('listingScope') == 'all' else len(u.get('listingIds') or []),
            'accountManager': u.get('accountManager'), 'id': u['id'], 'name': u['name'], 'email': u['email'], 'role': u['role'], 'locale': u['locale'], 'investorType': u['investorType'], 'country': u['country'],
            'companyName': u.get('companyName'), 'verified': u['verified'], 'pro': u['pro'], 'twofaEnabled': u['twofaEnabled'], 'tier': tier_of(u), 'tierLabel': TIER_LABEL[tier_of(u)], 'alertFrequency': alert_frequency(u),
            'staff': staff, 'twofaPassed': u.get('twofaPassed')}


@post('/auth/register')
def register():
    """Invite-only platform: accounts are created by an admin and activated through an invitation link (access router)."""
    raise forbidden('Portfolio & Prime is by invitation only. Request access on the home page, or use the link in your invitation.')


class LoginIn(BaseModel):
    email: Email
    password: Annotated[str, StringConstraints(min_length=1)]


@post('/auth/login')
def login(request: Request, response: Response, body=Depends(json_body)):
    b = parse(LoginIn, body)
    row = db.get(T.users, email=b.email); u = db.camel(row) if row else None
    if not u or u['deletedAt'] or not verify_password(b.password, u['passwordHash']):
        audit(request, 'login_failed', 'user', None, {'email': b.email})
        raise unauthorized('Your account is not active yet. Open the invitation link you received to set your password.' if u and u['status'] == 'invited' else 'Email or password is incorrect.')
    if u['status'] == 'suspended':
        audit(request, 'login_blocked', 'user', u['id'], actor=u); raise forbidden('Your access is paused. Please contact your account manager.')
    set_session_cookie(response, create_session(u['id'], not u['twofaEnabled']))
    db.upd(T.users, T.users.c.id == u['id'], {'last_login_at': now()})
    audit(request, 'login', 'user', u['id'], actor=u)
    u['listingIds'] = [r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == u['id'])]; u['twofaPassed'] = not u['twofaEnabled']
    return {'needs2fa': u['twofaEnabled'], 'user': public_user(u), **({'demoCode': totp(u['twofaSecret'])} if DEMO and u['twofaEnabled'] else {})}


class CodeIn(BaseModel):
    code: Annotated[str, StringConstraints(pattern=r'^\d{6}$')]


@post('/auth/2fa/verify')
def verify_2fa(request: Request, body=Depends(json_body)):
    u = require_user(request); b = parse(CodeIn, body)
    if not u['twofaSecret'] or not verify_totp(u['twofaSecret'], b.code): raise unauthorized('That code is not valid. Try the current code.')
    db.upd(T.sessions, T.sessions.c.id == u['sessionId'], {'twofa_passed': True}); audit(request, '2fa_passed', 'user', u['id']); return {'ok': True}


@post('/auth/2fa/setup')
def setup_2fa(request: Request):
    u = require_user(request)
    if u['twofaEnabled']: raise bad('Two-factor login is already on.')
    secret = new_totp_secret(); db.upd(T.users, T.users.c.id == u['id'], {'twofa_secret': secret})
    from urllib.parse import quote
    return {'secret': secret, 'otpauth': f"otpauth://totp/Portfolio%20%26%20Prime:{quote(u['email'], safe='')}?secret={secret}&issuer=Portfolio%20%26%20Prime",
            **({'demoCode': totp(secret), 'demoNote': 'Demo mode shows the current code. Production never does.'} if DEMO else {})}


@post('/auth/2fa/enable')
def enable_2fa(request: Request, body=Depends(json_body)):
    u = require_user(request); b = parse(CodeIn, body); fresh = db.get(T.users, id=u['id'])
    if not fresh['twofa_secret'] or not verify_totp(fresh['twofa_secret'], b.code): raise unauthorized('That code is not valid.')
    db.upd(T.users, T.users.c.id == u['id'], {'twofa_enabled': True}); db.upd(T.sessions, T.sessions.c.id == u['sessionId'], {'twofa_passed': True})
    audit(request, '2fa_enabled', 'user', u['id']); return {'ok': True}


@router.get('/auth/2fa/demo-code')
def demo_code(request: Request):
    u = require_user(request)
    if not DEMO or not u['twofaSecret']: raise not_found()
    return {'code': totp(u['twofaSecret']), 'note': 'Demo mode only.'}


@post('/auth/logout')
def logout(request: Request, response: Response):
    u = request.state.user
    if u: db.run(T.sessions.delete().where(T.sessions.c.id == u['sessionId']))
    response.delete_cookie(SESSION_COOKIE, path='/'); return {'ok': True}


@router.get('/me')
def me(request: Request):
    u = request.state.user
    if not u: return {'user': None}
    kyc = db.one(select(T.kyc_cases).where(T.kyc_cases.c.user_id == u['id']).order_by(desc(T.kyc_cases.c.created_at)).limit(1))
    unread = db.count(T.notifications, T.notifications.c.user_id == u['id'], T.notifications.c.read_at.is_(None))
    return {'user': public_user(u), 'kyc': {'status': kyc['status'], 'risk': kyc['risk'], 'submittedAt': kyc['created_at']} if kyc else {'status': 'none'}, 'unread': unread}


class MeIn(BaseModel):
    name: Optional[Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]] = None
    locale: Optional[Literal['nl', 'en']] = None


@router.patch('/me')
def update_me(request: Request, body=Depends(json_body)):
    u = require_user(request); b = parse(MeIn, body); vals = b.model_dump(exclude_none=True)
    if vals: db.upd(T.users, T.users.c.id == u['id'], vals)
    return {'ok': True}


def _dashboard(u: dict) -> dict:
    j = lambda t: t.join(T.listings, t.c.listing_id == T.listings.c.id)
    L = T.listings.c
    offers = db.rows(select(T.offers, L.name.label('_ln'), L.slug.label('_ls')).select_from(j(T.offers)).where(T.offers.c.user_id == u['id']).order_by(desc(T.offers.c.created_at)))
    deals = db.rows(select(T.deals, L.name.label('_ln'), L.slug.label('_ls')).select_from(j(T.deals)).where(T.deals.c.user_id == u['id']))
    enq = db.all_(T.enquiries, T.enquiries.c.user_id == u['id'], order=desc(T.enquiries.c.created_at))
    ndas = db.rows(select(T.nda_signatures, L.name.label('_ln'), L.slug.label('_ls')).select_from(j(T.nda_signatures)).where(T.nda_signatures.c.user_id == u['id']))
    favs = db.rows(select(L.slug).select_from(j(T.favorites)).where(T.favorites.c.user_id == u['id']))
    notes = db.all_(T.notifications, T.notifications.c.user_id == u['id'], order=desc(T.notifications.c.created_at), limit=20)
    box = db.get(T.buy_boxes, user_id=u['id'])
    searches = db.all_(T.saved_searches, T.saved_searches.c.user_id == u['id'])
    sub = db.one(select(T.subscriptions).where(T.subscriptions.c.user_id == u['id']).order_by(desc(T.subscriptions.c.created_at)).limit(1))
    return {'offers': [{'id': r['id'], 'listing': r['_ln'], 'slug': r['_ls'], 'amount': r['amount'], 'conditions': r['conditions'], 'status': r['status'], 'counterAmount': r['counter_amount'], 'isBid': bool(r['bid_round_id']), 'createdAt': r['created_at']} for r in offers],
            'deals': [{'id': r['id'], 'listing': r['_ln'], 'slug': r['_ls'], 'price': r['price'], 'stage': r['stage'], 'stages': DEAL_STAGES} for r in deals],
            'enquiries': db.camels(enq), 'ndas': [{'listing': r['_ln'], 'slug': r['_ls'], 'signedAt': r['created_at'], 'template': r['template_version']} for r in ndas], 'favorites': [r['slug'] for r in favs],
            'notifications': db.camels(notes), 'buyBox': db.camel(box), 'savedSearches': db.camels(searches), 'subscription': db.camel(sub)}


@router.get('/me/dashboard')
def dashboard(request: Request):
    return _dashboard(require_user(request))


@post('/me/notifications/read')
def read_all(request: Request):
    u = require_user(request); db.upd(T.notifications, T.notifications.c.user_id == u['id'], {'read_at': now()}); return {'ok': True}


@router.get('/me/export')
def export_me(request: Request):
    u = require_user(request); audit(request, 'data_export', 'user', u['id'])
    kyc = db.all_(T.kyc_cases, T.kyc_cases.c.user_id == u['id'])
    return {'exportedAt': now(), 'user': public_user(u), 'kycCases': [{'status': k['status'], 'risk': k['risk'], 'submittedAt': k['created_at'], 'decidedAt': k['decided_at']} for k in kyc], **_dashboard(u)}


@router.delete('/me')
def delete_me(request: Request, response: Response):
    u = require_user(request)
    if u['role'] != 'investor': raise forbidden('Staff accounts are removed by an admin.')
    db.upd(T.users, T.users.c.id == u['id'], {'deleted_at': now(), 'name': 'Deleted user', 'email': f"deleted-{u['id']}@invalid", 'password_hash': 'x', 'twofa_secret': None})
    db.run(T.sessions.delete().where(T.sessions.c.user_id == u['id'])); audit(request, 'account_deleted', 'user', u['id'], {'note': 'KYC records retained 5 years under Wwft'})
    response.delete_cookie(SESSION_COOKIE, path='/'); return {'ok': True}


class BuyBoxIn(BaseModel):
    regions: list[str] = Field(default_factory=list, max_length=20)
    types: list[str] = Field(default_factory=list, max_length=10)
    ticketMin: Optional[int] = Field(None, ge=0)
    ticketMax: Optional[int] = Field(None, ge=0)
    targetBar: Optional[float] = Field(None, ge=0, le=20)
    financing: Literal['cash', 'mortgage'] = 'mortgage'
    strategy: Annotated[str, StringConstraints(max_length=40)] = 'Buy-to-let'


@router.put('/me/buy-box')
def put_buy_box(request: Request, body=Depends(json_body)):
    u = require_user(request); b = parse(BuyBoxIn, body)
    vals = {'regions': b.regions, 'types': b.types, 'ticket_min': b.ticketMin, 'ticket_max': b.ticketMax, 'target_bar': b.targetBar, 'financing': b.financing, 'strategy': b.strategy}
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    db.run(pg_insert(T.buy_boxes).values(user_id=u['id'], **vals).on_conflict_do_update(index_elements=['user_id'], set_=vals)); return {'ok': True}


@router.get('/saved-searches')
def searches(request: Request):
    u = require_user(request); return db.camels(db.all_(T.saved_searches, T.saved_searches.c.user_id == u['id']))


class SearchIn(BaseModel):
    filters: dict[str, str]


@post('/saved-searches')
def add_search(request: Request, body=Depends(json_body)):
    u = require_user(request); b = parse(SearchIn, body)
    return db.camel(db.ins(T.saved_searches, {'user_id': u['id'], 'filters': b.filters, 'frequency': alert_frequency(u) or 'weekly'}))


@router.delete('/saved-searches/{id}')
def del_search(request: Request, id: str):
    u = require_user(request); db.run(T.saved_searches.delete().where(and_(T.saved_searches.c.id == id, T.saved_searches.c.user_id == u['id']))); return {'ok': True}


@post('/favorites/{slug}')
def fav(request: Request, slug: str):
    u = require_user(request); x = get_listing(slug)
    if not x or not can_see_listing(viewer_of(request), x['l']['id']): raise not_found()
    has = db.get(T.favorites, user_id=u['id'], listing_id=x['l']['id'])
    if has: db.run(T.favorites.delete().where(and_(T.favorites.c.user_id == u['id'], T.favorites.c.listing_id == x['l']['id'])))
    else: db.ins(T.favorites, {'user_id': u['id'], 'listing_id': x['l']['id']}, returning=False)
    return {'saved': not has}


# ---------- KYC (manual review with document upload) ----------
@post('/kyc/cases')
def kyc(request: Request, form=Depends(form_body)):
    u = require_user(request)
    if u['verified']: raise bad('You are already verified.')
    if db.get(T.kyc_cases, user_id=u['id'], status='pending'): raise bad('Your verification is already being reviewed.')
    company = u['investorType'] != 'Private person'
    if form.get('liveness') != 'on': raise bad('liveness: Invalid input: expected "on"')
    try: ticket = int(str(form.get('ticket') or ''))
    except ValueError: raise bad('ticket: Expected a whole number')
    if ticket < 0: raise bad('ticket: Must be 0 or more')
    pep = form.get('pep')
    if pep not in ('yes', 'no'): raise bad('pep: Expected "yes" or "no"')
    kvk, ubo = str(form.get('kvk') or ''), str(form.get('ubo') or '')
    if company:
        import re
        if not re.fullmatch(r'\d{8}', kvk): raise bad('kvk: KVK number must be 8 digits')
        if not 2 <= len(ubo) <= 80: raise bad('ubo: Enter the name of the ultimate beneficial owner')
    id_f, pf = check_file(form.get('idDoc'), 'Identity document'), check_file(form.get('proof'), 'Proof of funds')
    for f in (id_f, pf):
        if f.size and f.size > 10 * 1024 * 1024: raise bad('Files can be at most 10 MB.')
    risk = kyc_risk(u['investorType'], u['country'], ticket, pep == 'yes')
    c = db.ins(T.kyc_cases, {'user_id': u['id'], 'risk': risk, 'pep': pep == 'yes', 'ticket': ticket, 'kvk': kvk or None, 'ubo_name': ubo or None,
                             'id_file_key': save_file(id_f.file.read(), id_f.filename), 'id_file_name': id_f.filename, 'proof_file_key': save_file(pf.file.read(), pf.filename), 'proof_file_name': pf.filename})
    audit(request, 'kyc_submit', 'kyc_case', c['id'], {'risk': risk})
    log_rule('compliance', f"KYC case opened for {u['name']} · {risk} risk{' · enhanced due diligence required' if risk == 'high' else ''}")
    return {'id': c['id'], 'status': c['status'], 'risk': risk}


@router.get('/kyc/status')
def kyc_status(request: Request):
    u = require_user(request); k = db.one(select(T.kyc_cases).where(T.kyc_cases.c.user_id == u['id']).order_by(desc(T.kyc_cases.c.created_at)).limit(1))
    return {'status': k['status'], 'risk': k['risk'], 'submittedAt': k['created_at'], 'notes': k['notes'] if k['status'] == 'rejected' else None} if k else {'status': 'none'}


# ---------- Billing (Mollie subscriptions; simulated) ----------
class CheckoutIn(BaseModel):
    plan: Literal['month', 'year']
    method: Literal['iDEAL', 'Card', 'SEPA direct debit']
    withdrawalAcknowledged: Literal[True]


@post('/billing/checkout')
def checkout(request: Request, body=Depends(json_body)):
    u = require_feature(request, 'membership')
    if not u['verified']: raise forbidden('Verify your account before upgrading to Investor Pro.')
    if u['pro']: raise bad('You are already on Investor Pro.')
    b = parse(CheckoutIn, body); c = get_config(); amount = cfg(c, 'pro_price_year') if b.plan == 'year' else cfg(c, 'pro_price_month')
    import time
    s = db.ins(T.subscriptions, {'user_id': u['id'], 'plan': b.plan, 'method': b.method, 'mollie_payment_id': 'tr_demo_' + format(int(time.time() * 1000), 'x'), 'current_period_end': now() + timedelta(days=365 if b.plan == 'year' else 30)})
    db.upd(T.users, T.users.c.id == u['id'], {'pro': True})
    audit(request, 'subscription', 'subscription', s['id'], {'plan': b.plan, 'amount': amount}); notify(u['id'], 'billing', 'Welcome to Investor Pro', 'You now get the first look at off-market deals and instant alerts.')
    return {'ok': True, 'amount': amount, 'paymentId': s['mollie_payment_id'], 'note': 'Simulated Mollie payment. No money was taken.'}
