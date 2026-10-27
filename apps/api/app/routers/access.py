"""Invite-only access. Admins and developers create people, choose which properties and which features each person sees,
and share a personal invitation link. Visitors only see the public company pages and can request access."""
from __future__ import annotations
import base64, os, time, uuid
from datetime import timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, desc, func, select
from ..common import (ApiError, audit, bad, conflict, create_session, draft_email, hash_password, json_body, log_rule, not_found, notify, now, parse, parse_value,
                      require_staff, set_session_cookie, sha, client_ip)
from ..domain import FEATURE_KEYS, FEATURE_PRESETS, FEATURES, SUPER_ROLES, TIER_LABEL, features_of, is_staff, tier_of
from .account import public_user

router = APIRouter()
def post(path): return router.post(path, status_code=201)

ROLE_LABEL = {'investor': 'Investor', 'admin': 'Admin', 'developer': 'Developer', 'sales': 'Sales', 'compliance': 'Compliance', 'acquisition': 'Acquisition', 'editor': 'Editor', 'readonly': 'Read-only staff'}
INVESTOR_TYPES = ('Private person', 'Private BV', 'Fund', 'Family office', 'Pension fund', 'Insurer', 'Institutional investor', 'Developer')
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=160, pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')]
Uuid = Annotated[str, StringConstraints(pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
_hits: dict[str, list[float]] = {}


def rate_limit(key: str, mx: int, window: float = 3600):
    t = time.time(); a = [x for x in _hits.get(key, []) if t - x < window]
    if len(a) >= mx: raise ApiError(429, 'Too many requests. Please try again later.')
    a.append(t); _hits[key] = a


def invite_state(i: dict | None):
    if not i: return None
    if i['used_at']: return 'accepted'
    if i['revoked_at']: return 'revoked'
    return 'expired' if i['expires_at'] < now() else 'pending'


def new_invite(user_id: str, created_by: str | None, days: int = 14, message: str | None = None, token: str | None = None) -> dict:
    """Creates a fresh invitation link (older unused links for this person stop working). Returns the raw token once."""
    token = token or base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip('=')
    I = T.invites.c
    db.upd(T.invites, and_(I.user_id == user_id, I.used_at.is_(None), I.revoked_at.is_(None)), {'revoked_at': now()})
    expires = now() + timedelta(days=days)
    db.ins(T.invites, {'user_id': user_id, 'token_hash': sha(token), 'created_by': created_by, 'expires_at': expires, 'message': message or None}, returning=False)
    return {'token': token, 'path': f'/invite/{token}', 'expiresAt': expires}


def set_listings(user_id: str, listing_ids: list[str], granted_by: str | None) -> list[str]:
    """Replaces the properties shared with one person; returns the newly added ones."""
    before = {r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == user_id)}
    db.run(T.listing_access.delete().where(T.listing_access.c.user_id == user_id))
    ids = list(dict.fromkeys(listing_ids))
    if ids: db.ins(T.listing_access, [{'user_id': user_id, 'listing_id': x, 'granted_by': granted_by} for x in ids], returning=False)
    return [x for x in ids if x not in before]


def _admin(request: Request): return require_staff(request, SUPER_ROLES)


Feature = Literal[tuple(FEATURE_KEYS)]  # type: ignore


class AccessIn(BaseModel):
    listingScope: Literal['selected', 'all'] = 'selected'
    listingIds: list[Uuid] = Field(default_factory=list, max_length=2000)
    features: list[Feature] = Field(default_factory=list, max_length=len(FEATURE_KEYS))


# ---------- Admin: people and their access ----------
@router.get('/admin/access')
def overview(request: Request):
    _admin(request)
    users = [u for u in db.all_(T.users, order=desc(T.users.c.created_at)) if not u['deleted_at']]
    A = T.listing_access.c
    count = {r['user_id']: int(r['n']) for r in db.rows(select(A.user_id, func.count().label('n')).group_by(A.user_id))}
    shares = {r['listing_id']: int(r['n']) for r in db.rows(select(A.listing_id, func.count().label('n')).group_by(A.listing_id))}
    inv = db.all_(T.invites, order=desc(T.invites.c.created_at)); last = lambda uid: next((i for i in inv if i['user_id'] == uid), None)
    L, P = T.listings, T.properties
    ls = db.rows(select(L, P.c.city.label('_city'), P.c.district.label('_district'), P.c.image.label('_image'), P.c.property_type.label('_ptype'), P.c.id.label('_pid')).select_from(L.join(P, L.c.property_id == P.c.id)).order_by(desc(L.c.published_at)))
    un = {r['property_id']: int(r['n']) for r in db.rows(select(T.units.c.property_id, func.count().label('n')).group_by(T.units.c.property_id))}
    reqs = db.all_(T.enquiries, T.enquiries.c.kind == 'access', order=desc(T.enquiries.c.created_at)); emails = {u['email'] for u in users}
    out_users = []
    for u in users:
        cu = db.camel(u); staff = is_staff(cu); i = last(u['id'])
        out_users.append({'id': u['id'], 'name': u['name'], 'email': u['email'], 'companyName': u['company_name'], 'investorType': u['investor_type'], 'country': u['country'], 'role': u['role'], 'roleLabel': ROLE_LABEL.get(u['role'], u['role']),
                          'staff': staff, 'status': u['status'], 'listingScope': 'all' if staff else u['listing_scope'], 'listingCount': None if staff or u['listing_scope'] == 'all' else count.get(u['id'], 0), 'features': features_of(cu),
                          'verified': u['verified'], 'tierLabel': None if staff else TIER_LABEL[tier_of(cu)], 'twofaEnabled': u['twofa_enabled'], 'lastLoginAt': u['last_login_at'], 'createdAt': u['created_at'],
                          'accessUpdatedAt': u['access_updated_at'], 'invite': {'state': invite_state(i), 'expiresAt': i['expires_at'], 'createdAt': i['created_at']} if i else None})
    return {'users': out_users,
            'listings': [{'id': l['id'], 'slug': l['slug'], 'name': l['name'], 'city': l['_city'], 'district': l['_district'], 'image': l['_image'], 'dealType': l['deal_type'], 'status': l['status'], 'askingPrice': l['asking_price'],
                          'units': un.get(l['_pid'], 1), 'propertyType': l['_ptype'], 'source': l['source'], 'sharedWith': shares.get(l['id'], 0)} for l in ls if l['status'] != 'withdrawn'],
            'features': FEATURES, 'presets': FEATURE_PRESETS, 'roles': [{'key': k, 'label': v, 'staff': k != 'investor'} for k, v in ROLE_LABEL.items()], 'investorTypes': list(INVESTOR_TYPES),
            'requests': [{'id': r['id'], 'name': r['name'], 'email': r['email'], 'message': r['message'], 'status': r['status'], 'createdAt': r['created_at'], 'invited': r['email'].lower() in emails} for r in reqs]}


@router.get('/admin/access/users/{id}')
def person(request: Request, id: str):
    _admin(request); parse_value(Uuid, id, 'id')
    u = db.get(T.users, id=id)
    if not u or u['deleted_at']: raise not_found('Person not found')
    ids = [r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == id)]
    i = db.one(select(T.invites).where(T.invites.c.user_id == id).order_by(desc(T.invites.c.created_at)).limit(1))
    act = db.all_(T.audit_events, T.audit_events.c.actor_id == id, order=desc(T.audit_events.c.created_at), limit=8)
    return {'id': u['id'], 'name': u['name'], 'email': u['email'], 'companyName': u['company_name'], 'investorType': u['investor_type'], 'role': u['role'], 'staff': is_staff(u), 'status': u['status'],
            'listingScope': u['listing_scope'], 'listingIds': ids, 'features': u['features'], 'invite': {'state': invite_state(i), 'expiresAt': i['expires_at']} if i else None,
            'activity': [{'action': a['action'], 'objectType': a['object_type'], 'at': a['created_at']} for a in act]}


class UpdateIn(AccessIn):
    role: Optional[Literal[tuple(ROLE_LABEL)]] = None  # type: ignore
    accountManager: Optional[Annotated[str, StringConstraints(max_length=80)]] = None


@router.put('/admin/access/users/{id}')
def update(request: Request, id: str, body=Depends(json_body)):
    me = _admin(request); parse_value(Uuid, id, 'id'); b = parse(UpdateIn, body)
    u = db.get(T.users, id=id)
    if not u or u['deleted_at']: raise not_found('Person not found')
    if b.role and b.role != u['role'] and u['id'] == me['id']: raise bad('You cannot change your own role.')
    known = {r['id'] for r in db.rows(select(T.listings.c.id))}; ids = [x for x in b.listingIds if x in known]
    vals = {'listing_scope': b.listingScope, 'features': list(b.features), 'access_updated_at': now()}
    if b.role: vals['role'] = b.role
    if b.accountManager is not None: vals['account_manager'] = b.accountManager or None
    db.upd(T.users, T.users.c.id == id, vals)
    added = set_listings(id, ids, me['id'])
    if u['status'] == 'active' and not is_staff({'role': b.role or u['role']}):
        live = db.all_(T.listings, T.listings.c.id.in_(added), T.listings.c.status.in_(['available', 'coming_soon', 'under_offer'])) if added else []
        for l in live: notify(id, 'share', 'A property was shared with you', f"{l['name']} · open it from your selection.", l['slug'])
        if live: draft_email(u['email'], f"New for you: {live[0]['name']}" if len(live) == 1 else f'{len(live)} new properties shared with you',
                             f"Dear {u['name']}, {', '.join(l['name'] for l in live)} {'is' if len(live) == 1 else 'are'} now in your private selection. Log in to view.", 'share')
    audit(request, 'access_update', 'user', id, {'scope': b.listingScope, 'listings': len(ids), 'features': ' '.join(b.features), **({'role': b.role} if b.role else {})})
    return {'ok': True, 'listings': len(ids), 'added': len(added)}


class InviteIn(AccessIn):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    email: Email
    companyName: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]] = None
    investorType: Literal[INVESTOR_TYPES] = 'Private person'  # type: ignore
    country: Annotated[str, StringConstraints(min_length=2, max_length=2)] = 'NL'
    role: Literal[tuple(ROLE_LABEL)] = 'investor'  # type: ignore
    expiresDays: int = Field(14, ge=1, le=60)
    message: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]] = None
    accountManager: Optional[Annotated[str, StringConstraints(max_length=80)]] = None


@post('/admin/access/invites')
def invite(request: Request, body=Depends(json_body)):
    me = _admin(request); b = parse(InviteIn, body)
    if db.get(T.users, email=b.email): raise conflict('Someone with this email already has an account. Edit their access instead.')
    u = db.ins(T.users, {'email': b.email, 'name': b.name, 'company_name': b.companyName or None, 'investor_type': b.investorType, 'country': b.country.upper(), 'role': b.role, 'status': 'invited',
                         'password_hash': 'invited$' + os.urandom(8).hex(), 'listing_scope': b.listingScope, 'features': list(b.features), 'invited_by': me['id'], 'access_updated_at': now(),
                         'account_manager': b.accountManager or ('Sanne de Wit' if b.role == 'investor' else None)})
    known = {r['id'] for r in db.rows(select(T.listings.c.id))}; set_listings(u['id'], [x for x in b.listingIds if x in known], me['id'])
    inv = new_invite(u['id'], me['id'], b.expiresDays, b.message)
    draft_email(u['email'], 'Your private invitation to Portfolio & Prime', f"Dear {u['name']}, {me['name']} invited you to Portfolio & Prime{f': “{b.message}”' if b.message else '.'} Open your personal link to set a password: {inv['path']} (valid until {inv['expiresAt'].strftime('%Y-%m-%d')}).", 'invite')
    audit(request, 'invite_created', 'user', u['id'], {'role': b.role, 'scope': b.listingScope, 'listings': len(b.listingIds), 'features': ' '.join(b.features)})
    log_rule('access', f"{me['name']} invited {u['name']} ({ROLE_LABEL[b.role]})")
    return {'userId': u['id'], 'path': inv['path'], 'expiresAt': inv['expiresAt']}


class RelinkIn(BaseModel):
    expiresDays: int = Field(14, ge=1, le=60)


@post('/admin/access/users/{id}/invite')
def relink(request: Request, id: str, body=Depends(json_body)):
    me = _admin(request); b = parse(RelinkIn, body or {}); u = db.get(T.users, id=id) if parse_value(Uuid, id, 'id') else None
    if not u or u['deleted_at']: raise not_found('Person not found')
    if u['status'] != 'invited': raise bad('This person has already activated their account.')
    inv = new_invite(u['id'], me['id'], b.expiresDays); audit(request, 'invite_link', 'user', u['id'])
    return {'path': inv['path'], 'expiresAt': inv['expiresAt']}


@post('/admin/access/users/{id}/revoke-invite')
def revoke(request: Request, id: str):
    _admin(request); parse_value(Uuid, id, 'id'); I = T.invites.c
    db.upd(T.invites, and_(I.user_id == id, I.used_at.is_(None), I.revoked_at.is_(None)), {'revoked_at': now()})
    audit(request, 'invite_revoked', 'user', id); return {'ok': True}


class StatusIn(BaseModel):
    status: Literal['active', 'suspended']


@post('/admin/access/users/{id}/status')
def status(request: Request, id: str, body=Depends(json_body)):
    me = _admin(request); b = parse(StatusIn, body)
    if id == me['id']: raise bad('You cannot pause your own access.')
    u = db.get(T.users, id=id) if parse_value(Uuid, id, 'id') else None
    if not u or u['deleted_at']: raise not_found('Person not found')
    if u['status'] == 'invited': raise bad('This person has not activated their invitation yet. Revoke the link instead.')
    db.upd(T.users, T.users.c.id == id, {'status': b.status})
    if b.status == 'suspended': db.run(T.sessions.delete().where(T.sessions.c.user_id == id))  # signed out everywhere, immediately
    audit(request, 'access_paused' if b.status == 'suspended' else 'access_resumed', 'user', id); return {'ok': True, 'status': b.status}


# ---------- Public: invitation link and access requests ----------
def _open_invite(token: str):
    i = db.get(T.invites, token_hash=sha(str(token))); st = invite_state(i)
    if not i or st != 'pending':
        raise not_found('This invitation has expired. Ask your contact at Portfolio & Prime for a new link.' if st == 'expired' else
                        'This invitation was already used. Log in with your email and password.' if st == 'accepted' else 'This invitation link is not valid.')
    u = db.get(T.users, id=i['user_id'])
    if not u or u['status'] != 'invited': raise not_found('This invitation link is not valid.')
    return i, u


@router.get('/invites/{token}')
def invite_info(request: Request, token: str):
    rate_limit('invite:' + client_ip(request), 60)
    i, u = _open_invite(token); staff = is_staff(u)
    n = db.count(T.listing_access, T.listing_access.c.user_id == u['id'])
    by = db.get(T.users, id=i['created_by']) if i['created_by'] else None
    fs = features_of(db.camel(u))
    return {'name': u['name'], 'email': u['email'], 'companyName': u['company_name'], 'role': u['role'], 'roleLabel': ROLE_LABEL.get(u['role']), 'staff': staff, 'listings': 'all' if staff or u['listing_scope'] == 'all' else n,
            'features': [{'key': f['key'], 'label': f['label'], 'desc': f['desc']} for f in FEATURES if f['key'] in fs], 'invitedBy': by['name'] if by else 'Portfolio & Prime', 'message': i['message'],
            'expiresAt': i['expires_at'], 'accountManager': u['account_manager']}


class AcceptIn(BaseModel):
    password: Annotated[str, StringConstraints(min_length=10, max_length=200)]
    acceptTerms: Literal[True]
    locale: Literal['nl', 'en'] = 'en'


@post('/invites/{token}/accept')
def accept(request: Request, response: Response, token: str, body=Depends(json_body)):
    rate_limit('invite:' + client_ip(request), 60)
    i, u = _open_invite(token); b = parse(AcceptIn, body)
    db.upd(T.users, T.users.c.id == u['id'], {'password_hash': hash_password(b.password), 'status': 'active', 'locale': b.locale, 'last_login_at': now()})
    db.upd(T.invites, T.invites.c.id == i['id'], {'used_at': now()})
    set_session_cookie(response, create_session(u['id'], not u['twofa_enabled']))
    cu = {**db.camel(u), 'status': 'active', 'locale': b.locale, 'twofaPassed': not u['twofa_enabled'], 'listingIds': [r['listing_id'] for r in db.all_(T.listing_access, T.listing_access.c.user_id == u['id'])]}
    audit(request, 'invite_accepted', 'user', u['id'], actor=cu)
    if not is_staff(cu): notify(u['id'], 'welcome', 'Welcome to Portfolio & Prime', 'Your private selection is ready. Your account manager is one message away.')
    co = f" ({u['company_name']})" if u['company_name'] else ''
    if i['created_by']: notify(i['created_by'], 'access', 'Invitation accepted', f"{u['name']}{co} activated their account.")
    return {'user': public_user(cu)}


class RequestIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    email: Email
    companyName: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]] = None
    investorType: Literal[INVESTOR_TYPES] = 'Private person'  # type: ignore
    interest: Literal['invest', 'sell', 'both'] = 'invest'
    ticket: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    message: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]] = None
    consent: Literal[True]


@post('/access-requests')
def request_access(request: Request, body=Depends(json_body)):
    """Public 'request access' form: becomes an access request in People & access (sellers also go to the acquisition pipeline)."""
    rate_limit('access:' + client_ip(request), 10); b = parse(RequestIn, body)
    summary = ' · '.join(x for x in [b.companyName, b.investorType, {'invest': 'Wants to invest', 'sell': 'Wants to sell', 'both': 'Invest and sell'}[b.interest], f'Ticket {b.ticket}' if b.ticket else None, b.message] if x)
    e = db.ins(T.enquiries, {'kind': 'access', 'name': b.name, 'email': b.email, 'message': summary, 'lead_band': 'Seller' if b.interest == 'sell' else 'Investor'})
    if b.interest != 'invest':
        db.ins(T.acquisition_leads, {'source': 'Website · access request', 'address': b.companyName or b.name, 'property_type': 'To be discussed', 'units': 1, 'contact_name': b.name, 'contact_email': b.email, 'notes': b.message}, returning=False)
    log_rule('access', f"Access request from {b.name}{f' ({b.companyName})' if b.companyName else ''}")
    draft_email(b.email, 'We received your request', f'Dear {b.name}, thank you for your interest in Portfolio & Prime. A partner will contact you within one working day. Access is personal and by invitation.', 'access')
    audit(request, 'access_request', 'enquiry', e['id'], {'interest': b.interest})
    return {'reference': 'AR-' + e['id'][:6].upper()}


class ReqStatusIn(BaseModel):
    status: Literal['new', 'contacted', 'closed']


@post('/admin/access/requests/{id}/status')
def request_status(request: Request, id: str, body=Depends(json_body)):
    _admin(request); b = parse(ReqStatusIn, body)
    db.upd(T.enquiries, and_(T.enquiries.c.id == id, T.enquiries.c.kind == 'access'), {'status': b.status}); return {'ok': True}
