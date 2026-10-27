"""Secure in-platform messaging between investor and account manager, one thread per listing."""
from __future__ import annotations
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, StringConstraints

from .. import db
from ..db import T, and_, asc, desc, select
from ..common import audit, bad, draft_email, json_body, not_found, notify, now, parse, parse_value, require_feature, require_staff, viewer_of
from ..domain import can_see_listing, is_staff

router = APIRouter()
def post(path): return router.post(path, status_code=201)
READERS = ['admin', 'sales', 'compliance', 'readonly']


def _listing(slug: str | None, request: Request | None = None):
    if not slug or slug == 'general': return None
    l = db.get(T.listings, slug=slug)
    if not l or (request is not None and not can_see_listing(viewer_of(request), l['id'])): raise not_found('Listing not found')
    return l


def _thread(investor_id: str, listing_id: str | None):
    M = T.messages.c
    return and_(M.investor_id == investor_id, M.listing_id == listing_id if listing_id else M.listing_id.is_(None))


def _threads(investor_id: str | None = None) -> list[dict]:
    M, L, U = T.messages, T.listings, T.users
    stmt = (select(M, L.c.slug.label('_slug'), L.c.name.label('_lname'), U.c.name.label('_iname'), U.c.email.label('_iemail'), U.c.company_name.label('_co'))
            .select_from(M.outerjoin(L, M.c.listing_id == L.c.id).join(U, M.c.investor_id == U.c.id)).order_by(desc(M.c.created_at)))
    if investor_id: stmt = stmt.where(M.c.investor_id == investor_id)
    out: dict[str, dict] = {}
    for r in db.rows(stmt):
        k = r['investor_id'] + '|' + (r['_slug'] or 'general')
        t = out.get(k) or {'investorId': r['investor_id'], 'investorName': r['_iname'], 'investorEmail': r['_iemail'], 'companyName': r['_co'], 'slug': r['_slug'] or 'general', 'listingName': r['_lname'] or 'General question',
                           'last': r['body'][:140], 'lastAt': r['created_at'], 'lastFromStaff': r['from_staff'], 'unreadForInvestor': 0, 'unreadForStaff': 0, 'count': 0}
        t['count'] += 1
        if not r['read_at']:
            if r['from_staff']: t['unreadForInvestor'] += 1
            else: t['unreadForStaff'] += 1
        out[k] = t
    return list(out.values())


def _conversation(investor_id: str, listing_id: str | None) -> list[dict]:
    M, U = T.messages, T.users
    rs = db.rows(select(M, U.c.name.label('_sender')).select_from(M.join(U, M.c.sender_id == U.c.id)).where(_thread(investor_id, listing_id)).order_by(asc(M.c.created_at)))
    return [{'id': r['id'], 'body': r['body'], 'fromStaff': r['from_staff'], 'sender': r['_sender'], 'at': r['created_at'], 'read': bool(r['read_at'])} for r in rs]


def _info(l):
    return {'slug': l['slug'], 'name': l['name']} if l else {'slug': 'general', 'name': 'General question'}


# ---------- Investor ----------
@router.get('/messages')
def mine(request: Request):
    u = require_feature(request, 'messages'); return {'threads': _threads(u['id'])}


@router.get('/messages/thread')
def my_thread(request: Request, listing: str = 'general'):
    u = require_feature(request, 'messages'); l = _listing(listing, request); lid = l['id'] if l else None
    db.upd(T.messages, and_(_thread(u['id'], lid), T.messages.c.from_staff.is_(True), T.messages.c.read_at.is_(None)), {'read_at': now()})
    return {'listing': _info(l), 'accountManager': u['accountManager'] or 'Sanne de Wit', 'messages': _conversation(u['id'], lid)}


class SendIn(BaseModel):
    listing: Optional[Annotated[str, StringConstraints(max_length=120)]] = None
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=4000)]


@post('/messages')
def send(request: Request, body=Depends(json_body)):
    u = require_feature(request, 'messages')
    if is_staff(u): raise bad('Staff reply from the staff workspace.')
    b = parse(SendIn, body); l = _listing(b.listing, request)
    m = db.ins(T.messages, {'investor_id': u['id'], 'listing_id': l['id'] if l else None, 'sender_id': u['id'], 'body': b.body})
    audit(request, 'message_sent', 'message', m['id'], {'listing': l['slug'] if l else 'general'}); return {'id': m['id']}


# ---------- Staff: sales and admin reply; compliance and read-only can read ----------
@router.get('/admin/messages')
def all_threads(request: Request):
    require_staff(request, READERS); th = _threads()
    return {'threads': th, 'unread': sum(t['unreadForStaff'] for t in th)}


@router.get('/admin/messages/thread')
def staff_thread(request: Request, investor: str = '', listing: str = 'general'):
    s = require_staff(request, READERS)
    import uuid
    try: uuid.UUID(investor)
    except ValueError: raise bad('investor: Invalid UUID')
    inv = db.get(T.users, id=investor)
    if not inv: raise not_found('Investor not found')
    l = _listing(listing); lid = l['id'] if l else None
    if s['role'] in ('admin', 'sales'): db.upd(T.messages, and_(_thread(inv['id'], lid), T.messages.c.from_staff.is_(False), T.messages.c.read_at.is_(None)), {'read_at': now()})
    return {'investor': {'id': inv['id'], 'name': inv['name'], 'email': inv['email'], 'companyName': inv['company_name'], 'verified': inv['verified'], 'pro': inv['pro']}, 'listing': _info(l),
            'canReply': s['role'] in ('admin', 'sales', 'developer'), 'messages': _conversation(inv['id'], lid)}


class ReplyIn(BaseModel):
    investorId: Annotated[str, StringConstraints(pattern=r'^[0-9a-fA-F-]{36}$')]
    listing: Optional[Annotated[str, StringConstraints(max_length=120)]] = None
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=4000)]


@post('/admin/messages')
def reply(request: Request, body=Depends(json_body)):
    s = require_staff(request, ['admin', 'sales']); b = parse(ReplyIn, body)
    inv = db.get(T.users, id=b.investorId)
    if not inv or is_staff(inv): raise not_found('Investor not found')
    l = _listing(b.listing); lid = l['id'] if l else None
    m = db.ins(T.messages, {'investor_id': inv['id'], 'listing_id': lid, 'sender_id': s['id'], 'from_staff': True, 'body': b.body})
    db.upd(T.messages, and_(_thread(inv['id'], lid), T.messages.c.from_staff.is_(False), T.messages.c.read_at.is_(None)), {'read_at': now()})
    notify(inv['id'], 'message', f"New message from {s['name']}", f"{l['name'] if l else 'General question'} · {b.body[:90]}", l['slug'] if l else None)
    # The email only says there is a message: contents stay on the platform.
    draft_email(inv['email'], 'Nieuw bericht van uw accountmanager' if inv['locale'] == 'nl' else 'New message from your account manager', f"{s['name']} replied about {l['name'] if l else 'your question'}. Log in to read the message.", 'message')
    audit(request, 'message_reply', 'message', m['id'], {'investor': inv['id'], 'listing': l['slug'] if l else 'general'}); return {'id': m['id']}
