"""Shared helpers: errors, request parsing, passwords and sessions, signed links, file storage, audit/notifications and the
listing serializer that applies access control on the server (a visitor's browser never receives what it may not see)."""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, secrets, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import Request
from pydantic import BaseModel, ValidationError

from . import db
from .db import T, and_, select, func
from .domain import (CITY_GEO, FEATURES, STAFF_ROLES, can_details, deal_score, figures, has_feature, is_staff, is_super,
                     off_market_state, price_band, province_of, tier_of)

UTC = timezone.utc
def now() -> datetime: return datetime.now(UTC)


# ---------------- Errors (same JSON shape as before: { statusCode, message, error }) ----------------
class ApiError(Exception):
    NAMES = {400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 429: 'Too Many Requests'}
    def __init__(self, status: int, message: str):
        super().__init__(message); self.status = status; self.message = message


def bad(msg='Bad Request'): return ApiError(400, msg)
def unauthorized(msg='Unauthorized'): return ApiError(401, msg)
def forbidden(msg='Forbidden'): return ApiError(403, msg)
def not_found(msg='Not Found'): return ApiError(404, msg)
def conflict(msg='Conflict'): return ApiError(409, msg)


def parse(model: type[BaseModel], data: Any):
    """Validates a request body; a failure is a 400 listing each problem as `field: message`."""
    try:
        return model.model_validate(data if data is not None else {})
    except ValidationError as e:
        raise bad('; '.join(f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()))


def parse_value(model_field_type, value, name='value'):
    from pydantic import TypeAdapter
    try:
        return TypeAdapter(model_field_type).validate_python(value)
    except ValidationError as e:
        raise bad('; '.join(f"{name}: {err['msg']}" for err in e.errors()))


async def json_body(request: Request):
    raw = await request.body()
    if not raw: return {}
    try: return json.loads(raw)
    except Exception: raise bad('Request body is not valid JSON.')


async def form_body(request: Request):
    return await request.form()


# ---------------- Secrets ----------------
_SECRET: bytes | None = None
def _key() -> bytes:
    global _SECRET
    if _SECRET is None:
        if os.environ.get('PP_SECRET'): _SECRET = os.environ['PP_SECRET'].encode()
        else:
            f = db.DATA_DIR / 'secret.key'; db.DATA_DIR.mkdir(parents=True, exist_ok=True)
            if not f.exists(): f.write_text(secrets.token_hex(32))
            _SECRET = f.read_text().encode()
    return _SECRET


# ---------------- Passwords and sessions ----------------
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
    return f'scrypt${salt.hex()}${h.hex()}'


def verify_password(pw: str, stored: str) -> bool:
    parts = (stored or '').split('$')
    if len(parts) != 3 or parts[0] != 'scrypt' or not parts[1] or not parts[2]: return False
    try:
        h = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(parts[1]), n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(h, bytes.fromhex(parts[2]))
    except ValueError:
        return False


def sha(t: str) -> str: return hashlib.sha256(t.encode()).hexdigest()


SESSION_COOKIE = 'pp_session'
SESSION_DAYS = 14


def create_session(user_id: str, twofa_passed: bool) -> str:
    token = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')
    db.ins(T.sessions, {'id': sha(token), 'user_id': user_id, 'twofa_passed': twofa_passed, 'expires_at': now() + timedelta(days=SESSION_DAYS)}, returning=False)
    return token


def set_session_cookie(response, token: str):
    secure = os.environ.get('RENDER') == 'true' or os.environ.get('PP_SECURE_COOKIE') == '1'
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, path='/', httponly=True, samesite='lax', secure=secure)


def load_session(token: str | None) -> dict | None:
    """The signed-in user (camelCase dict) with sessionId, twofaPassed and the ids of listings shared with them."""
    if not token: return None
    r = db.one(select(T.users, T.sessions.c.id.label('_sid'), T.sessions.c.twofa_passed.label('_tfp')).select_from(T.sessions.join(T.users, T.sessions.c.user_id == T.users.c.id))
               .where(and_(T.sessions.c.id == sha(token), T.sessions.c.expires_at > now())))
    if not r or r['deleted_at'] or r['status'] != 'active': return None
    sid, tfp = r.pop('_sid'), r.pop('_tfp'); u = db.camel(r)
    u['listingIds'] = [] if is_staff(u) or u['listingScope'] == 'all' else [x['listing_id'] for x in db.rows(select(T.listing_access.c.listing_id).where(T.listing_access.c.user_id == u['id']))]
    u['sessionId'] = sid; u['twofaPassed'] = tfp
    return u


def user_of(request: Request) -> dict | None:
    return getattr(request.state, 'user', None)


def require_user(request: Request) -> dict:
    u = user_of(request)
    if not u: raise unauthorized('Please log in.')
    return u


def require_staff(request: Request, roles: list[str] = STAFF_ROLES) -> dict:
    u = require_user(request)
    if not is_staff(u): raise forbidden('Staff only.')
    if not is_super(u) and u['role'] not in roles: raise forbidden(f"Your role ({u['role']}) cannot do this.")
    if not u['twofaPassed']: raise forbidden('Staff accounts need two-factor login.')
    return u


def viewer_of(request: Request) -> dict | None:
    u = user_of(request)
    if not u: return None
    return {k: u.get(k) for k in ('id', 'role', 'verified', 'pro', 'twofaEnabled', 'investorType', 'listingScope', 'listingIds', 'features')}


def require_feature(request: Request, key: str) -> dict:
    """Feature switch set by an admin per person. Checked on the server for every gated endpoint."""
    u = require_user(request)
    if not has_feature(viewer_of(request), key):
        label = next((f['label'] for f in FEATURES if f['key'] == key), 'This feature')
        raise forbidden(f'{label} is not included in your access. Ask your account manager.')
    return u


def client_ip(request: Request) -> str:
    return str(request.headers.get('x-forwarded-for') or (request.client.host if request.client else ''))


# ---------------- Signed, expiring links (plan: 5-minute signed URLs) ----------------
def _b64(b: bytes) -> str: return base64.urlsafe_b64encode(b).decode().rstrip('=')
def _unb64(s: str) -> bytes: return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def sign_token(payload: dict, ttl_sec: int = 300) -> str:
    body = _b64(json.dumps({**payload, 'exp': int(time.time() * 1000) + ttl_sec * 1000}, separators=(',', ':')).encode())
    return body + '.' + _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())


def read_token(token: str) -> dict | None:
    try:
        body, sig = str(token).split('.')
    except ValueError:
        return None
    exp = _b64(hmac.new(_key(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, exp): return None
    try: p = json.loads(_unb64(body))
    except Exception: return None
    return p if p.get('exp', 0) > time.time() * 1000 else None


# ---------------- Storage: files table (survives restarts on hosts without a disk) ----------------
MIME = {'.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}


def save_file(buf: bytes, original_name: str) -> str:
    ext = (Path(original_name or '').suffix.lower()[:8]) or '.bin'
    k = secrets.token_hex(16) + ext
    db.ins(T.files, {'key': k, 'name': str(original_name or 'file')[:200], 'mime': MIME.get(ext, 'application/octet-stream'), 'size': len(buf), 'data': base64.b64encode(buf).decode()}, returning=False)
    return k


def read_stored(k: str) -> bytes:
    f = db.get(T.files, key=k)
    if not f: raise not_found('File not found: ' + k)
    return base64.b64decode(f['data'])


# ---------------- Audit, notifications, automation ----------------
def audit(request: Request | None, action: str, object_type: str, object_id: str | None, meta: dict | None = None, actor: dict | None = None):
    u = actor or (user_of(request) if request is not None else None)
    db.ins(T.audit_events, {'actor_id': u['id'] if u else None, 'actor_label': f"{u['name']} <{u['email']}>" if u else 'Visitor', 'action': action, 'object_type': object_type,
                            'object_id': object_id, 'meta': meta or {}, 'ip': client_ip(request) if request is not None else None}, returning=False)


def notify(user_id: str, type_: str, title: str, body: str, listing_slug: str | None = None):
    db.ins(T.notifications, {'user_id': user_id, 'type': type_, 'title': title, 'body': body, 'listing_slug': listing_slug}, returning=False)


def rule_on(key: str) -> bool:
    r = db.get(T.automation_settings, key=key)
    return not r or r['enabled'] is not False


def log_rule(rule: str, text_: str):
    db.ins(T.automation_log, {'rule': rule, 'text': text_}, returning=False)


def draft_email(to: str, subject: str, body: str, kind: str):
    if rule_on('emails'):
        db.ins(T.outbox, {'to_email': to, 'subject': subject, 'body': body, 'kind': kind}, returning=False)
        log_rule('emails', f'Confirmation drafted for {to}')


def get_config() -> dict:
    return {r['key']: r['value'] for r in db.all_(T.config)}


def eur_nl(n: float) -> str:
    """€1.234.567 (Dutch thousands separator)."""
    return f'{round(n):,}'.replace(',', '.')


def iso(d) -> str | None:
    if d is None: return None
    if isinstance(d, datetime): return d.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return str(d)


# ---------------- Listing serialisation with server-side access control ----------------
def serialize_listing(l: dict, p: dict, viewer: dict | None, c: dict, has_nda: bool = False, saved: bool = False, bid_round: dict | None = None) -> dict:
    """l and p are database rows (snake_case). Returns the API shape for this viewer."""
    om = off_market_state(l['deal_type'], l['pro_early_access_until'], viewer)
    base = {'id': l['id'], 'slug': l['slug'], 'status': l['status'], 'dealType': l['deal_type'], 'city': p['city'], 'province': province_of(p['city']), 'publishedAt': l['published_at'], 'offMarket': om, 'saved': saved}
    # Private deal rooms show a codename teaser (name, price band, highlights) so institutions can request access; nothing that identifies the assets.
    if om != 'open' and l['deal_type'] == 'institutional':
        return {**base, 'locked': True, 'name': l['name'], 'highlights': l['highlights'], 'priceDisplay': price_band(l['asking_price']), 'propertyType': p['property_type'], 'areaM2': p['area_m2'], 'image': p['image'], 'category': p['category']}
    if om != 'open':
        return {**base, 'locked': True, 'propertyType': p['property_type'], 'propertyTypeNl': p['property_type_nl'], 'areaM2': p['area_m2'], 'image': p['image'], 'proEarlyAccessUntil': l['pro_early_access_until']}
    full = can_details(viewer)
    fg = figures({'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'operatingCostsAnnual': l['operating_costs_annual'], 'areaM2': p['area_m2'], 'unitsCount': 0}, c)
    on_req = l['price_on_request'] and not (viewer or {}).get('verified') and not is_staff(viewer)
    score = deal_score({'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'energyLabel': p['energy_label'], 'demand': l['demand'], 'occupancy': l['occupancy'], 'plotM2': p['plot_m2'], 'areaM2': p['area_m2'], 'buildYear': p['build_year']})
    point = ({'lat': p['lat'], 'lng': p['lng'], 'approx': False} if full and p['lat'] is not None and p['lng'] is not None
             else {'lat': CITY_GEO[p['city']]['lat'], 'lng': CITY_GEO[p['city']]['lng'], 'approx': True} if p['city'] in CITY_GEO else None)
    teaser = {**base, 'locked': False, 'name': l['name'], 'nameNl': l['name_nl'], 'description': l['description'], 'descriptionNl': l['description_nl'], 'highlights': l['highlights'], 'district': p['district'],
              'category': p['category'], 'propertyType': p['property_type'], 'propertyTypeNl': p['property_type_nl'], 'image': p['image'], 'areaM2': p['area_m2'], 'plotM2': p['plot_m2'], 'featured': l['featured'],
              'priceDisplay': ('Price on request' if on_req else None) if full else price_band(l['asking_price'], l['price_on_request']),
              'bar': round(fg['bar'], 2) if l['gross_rent_annual'] else None, 'dealScore': score, 'full': full, 'bidRound': bid_round,
              # Map pin: exact for members; visitors get the city centre only, so the address cannot be read off the map.
              'point': point}
    if not full: return teaser
    return {**teaser, 'askingPrice': None if on_req else l['asking_price'], 'previousPrice': None if on_req else l['previous_price'], 'priceType': l['price_type'], 'address': p['address'], 'postcode': p['postcode'],
            'lat': p['lat'], 'lng': p['lng'], 'grossRentAnnual': l['gross_rent_annual'], 'operatingCostsAnnual': fg['opex'], 'nar': round(fg['nar'], 2) if l['gross_rent_annual'] else None,
            'perM2': None if on_req else round(fg['perM2']), 'wozValue': p['woz_value'], 'wozYear': p['woz_year'], 'energyLabel': p['energy_label'], 'tenure': p['tenure'], 'buildYear': p['build_year'],
            'occupancy': l['occupancy'], 'acquisition': None if on_req else fg['acquisition'], 'hasNda': has_nda, 'dataRoom': bool((viewer or {}).get('verified') and has_nda)}
