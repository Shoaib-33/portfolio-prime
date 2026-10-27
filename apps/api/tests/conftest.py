"""End-to-end tests run against a fresh embedded PostgreSQL with the demo seed (no network, no background jobs)."""
import os, sys, tempfile
os.environ.setdefault('PP_MEMORY_DB', '1'); os.environ.setdefault('PP_NO_JOBS', '1'); os.environ.setdefault('PP_OFFLINE', '1')
os.environ.setdefault('PP_DATA_DIR', tempfile.mkdtemp(prefix='pp-test-data-'))
os.environ.pop('DATABASE_URL', None); os.environ.pop('ANTHROPIC_API_KEY', None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


# Investors the tests work with (the demo itself has one investor; the admin invites everyone else).
PEOPLE = {
    'free@test.nl': dict(name='Femke Free', slugs=['rotterdam-zuid', 'utrecht-oost', 'amsterdam-canal-house'], features=['map', 'analysis', 'messages']),
    'verified@test.nl': dict(name='Victor Verified', investor_type='Private BV', company_name='Victor Beheer BV', verified=True, twofa=True,
                             slugs=['rotterdam-zuid', 'utrecht-oost', 'eindhoven-collection', 'den-haag-building', 'rotterdam-penthouse', 'wassenaar-villa'], preset='buyer', extra=['membership']),
    'pro@test.nl': dict(name='Priya Pro', investor_type='Family office', company_name='Delta Holding BV', verified=True, pro=True, twofa=True, slugs='all', preset='everything'),
    'fund@test.nl': dict(name='Ingrid Lund', investor_type='Pension fund', company_name='Nordhavn Pension Partners', country='DK', verified=True, twofa=True,
                         slugs=['project-tulip', 'project-delta', 'rotterdam-zuid', 'eindhoven-collection', 'utrecht-oost'], preset='institution', buy_box=True),
    'highrisk@test.nl': dict(name='Oliver Grant', investor_type='Fund', company_name='Brightwater Estates Ltd', country='GB', slugs=['project-tulip'], features=['map']),
}


def _create_people():
    from app import db
    from app.db import T
    from app.common import hash_password
    from app.domain import new_totp_secret, preset
    from app.routers.access import set_listings
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    slugs = {l['slug']: l['id'] for l in db.all_(T.listings)}; pw = hash_password('Demo2026!')
    for email, p in PEOPLE.items():
        feats = preset(p['preset']) + p.get('extra', []) if 'preset' in p else p['features']
        u = db.ins(T.users, {'email': email, 'name': p['name'], 'password_hash': pw, 'investor_type': p.get('investor_type', 'Private person'), 'company_name': p.get('company_name'), 'country': p.get('country', 'NL'),
                             'verified': p.get('verified', False), 'pro': p.get('pro', False), 'twofa_enabled': p.get('twofa', False), 'twofa_secret': new_totp_secret() if p.get('twofa') else None,
                             'listing_scope': 'all' if p['slugs'] == 'all' else 'selected', 'features': feats, 'account_manager': 'Ada Admin'})
        if p['slugs'] != 'all': set_listings(u['id'], [slugs[s] for s in p['slugs']], None)
        if p.get('buy_box'): db.run(pg_insert(T.buy_boxes).values(user_id=u['id'], regions=['Amsterdam', 'Utrecht', 'Rotterdam'], types=['portfolios', 'buildings'], ticket_min=25000000, ticket_max=400000000, target_bar=4.8, financing='cash', strategy='Buy-to-let'))


@pytest.fixture(scope='session')
def app():
    from app.main import app as fastapi_app
    with TestClient(fastapi_app):  # runs startup: migrations + seed (developer, admin, investor)
        _create_people()
        yield fastapi_app


class Client:
    """A browser-like client with its own session cookie."""
    def __init__(self, app):
        self.c = TestClient(app, base_url='http://testserver')

    def req(self, method, path, **kw):
        return self.c.request(method, '/api' + path, **kw)

    def get(self, path, **kw): return self.req('GET', path, **kw)
    def post(self, path, **kw): return self.req('POST', path, **kw)
    def put(self, path, **kw): return self.req('PUT', path, **kw)
    def patch(self, path, **kw): return self.req('PATCH', path, **kw)
    def delete(self, path, **kw): return self.req('DELETE', path, **kw)

    def login(self, email, password='Demo2026!'):
        r = self.post('/auth/login', json={'email': email, 'password': password})
        if r.status_code == 201 and r.json().get('needs2fa'): self.post('/auth/2fa/verify', json={'code': r.json()['demoCode']})
        return r


@pytest.fixture
def client(app):
    def make(email=None):
        c = Client(app)
        if email: c.login(email)
        return c
    return make


PDF = ('proof.pdf', b'%PDF-1.4 test', 'application/pdf')


def invited(make, email, slugs, features):
    """Admin invites someone with the given properties and features; returns a logged-in client for them."""
    a = make('admin@demo.nl'); ov = a.get('/admin/access').json()
    r = a.post('/admin/access/invites', json={'name': 'Invited Person', 'email': email, 'listingIds': [next(l['id'] for l in ov['listings'] if l['slug'] == s) for s in slugs], 'features': features})
    c = make(); c.post(f"/invites/{r.json()['path'].split('/')[-1]}/accept", json={'password': 'a-long-password', 'acceptTerms': True}); return c
