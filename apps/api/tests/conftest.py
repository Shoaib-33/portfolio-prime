"""End-to-end tests run against a fresh embedded PostgreSQL with the demo seed (no network, no background jobs)."""
import os, sys, tempfile
os.environ.setdefault('PP_MEMORY_DB', '1'); os.environ.setdefault('PP_NO_JOBS', '1'); os.environ.setdefault('PP_OFFLINE', '1')
os.environ.setdefault('PP_DATA_DIR', tempfile.mkdtemp(prefix='pp-test-data-'))
os.environ.pop('DATABASE_URL', None); os.environ.pop('ANTHROPIC_API_KEY', None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope='session')
def app():
    from app.main import app as fastapi_app
    with TestClient(fastapi_app):  # runs startup: migrations + seed
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
