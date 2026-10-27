"""End-to-end API tests: access control is enforced on the server, not in the browser. Tests run in file order and share one database."""
from conftest import PDF, invited


def ids_by_slug(ov):
    return lambda slug: next(l['id'] for l in ov['listings'] if l['slug'] == slug)


def test_visitors_see_only_the_public_site(client):
    v = client()
    for path in ['/listings', '/listings/rotterdam-zuid', '/listings/map', '/market/report', '/institutional/deals', '/finder']: assert v.get(path).status_code == 401, path
    assert v.post('/calculations', json={'slug': 'rotterdam-zuid'}).status_code == 403
    assert v.get('/stats').status_code == 200 and v.get('/listings/sold').status_code == 200, 'anonymised track record stays public'
    assert v.post('/auth/register', json={'name': 'Test', 'email': 'new@example.com', 'password': 'longpassword'}).status_code == 403, 'no self-registration'
    assert v.post('/access-requests', json={'name': 'Lena', 'email': 'lena@example.com', 'interest': 'invest', 'consent': True}).status_code == 201


def test_invited_person_sees_exactly_what_was_shared(client):
    c = client('free@demo.nl')
    assert sorted(l['slug'] for l in c.get('/listings').json()) == ['amsterdam-canal-house', 'rotterdam-zuid', 'utrecht-oost']
    d = c.get('/listings/rotterdam-zuid').json(); assert d['askingPrice'] == 4260000 and d['address'] and d['nar'] > 0
    assert c.get('/listings/eindhoven-collection').status_code == 404, 'not shared: indistinguishable from not existing'
    assert c.get('/listings/eindhoven-collection/analysis').status_code == 404 and c.post('/favorites/eindhoven-collection').status_code == 404
    assert c.get('/finder').status_code == 403 and c.post('/ai/ask', json={'question': 'Hello?'}).status_code == 403
    assert len(c.get('/listings/map').json()['features']) == 3
    assert c.get('/listings/rotterdam-zuid/dataroom').status_code == 403
    assert c.post('/listings/rotterdam-zuid/offers', data={'amount': '4000000'}).status_code == 403
    me = c.get('/me').json()['user']; assert me['features'] == ['map', 'analysis', 'messages'] and me['listings'] == 3
    assert c.get('/admin/overview').status_code == 403 and c.get('/admin/access').status_code == 403


def test_invitation_flow(client):
    a, sales = client('admin@demo.nl'), client('sales@demo.nl'); ov = a.get('/admin/access').json(); id_ = ids_by_slug(ov)
    assert sales.get('/admin/access').status_code == 403, 'only admin and developer manage access'
    assert a.post('/admin/access/invites', json={'name': 'X', 'email': 'nope'}).status_code == 400
    inv = a.post('/admin/access/invites', json={'name': 'Bea Buyer', 'email': 'bea@example.com', 'companyName': 'Bea Capital BV', 'investorType': 'Private BV', 'listingIds': [id_('utrecht-oost'), id_('den-haag-building')], 'features': ['messages', 'analysis']})
    assert inv.status_code == 201 and inv.json()['path'].startswith('/invite/'); token = inv.json()['path'].split('/')[-1]
    assert a.post('/admin/access/invites', json={'name': 'Bea Buyer', 'email': 'bea@example.com'}).status_code == 409
    assert client().post('/auth/login', json={'email': 'bea@example.com', 'password': 'whatever12'}).status_code == 401, 'cannot log in before accepting'
    info = client().get(f'/invites/{token}').json(); assert info['name'] == 'Bea Buyer' and info['listings'] == 2 and [f['key'] for f in info['features']] == ['analysis', 'messages']
    assert client().get('/invites/forged-token').status_code == 404
    bea = client(); assert bea.post(f'/invites/{token}/accept', json={'password': 'short', 'acceptTerms': True}).status_code == 400
    assert bea.post(f'/invites/{token}/accept', json={'password': 'a-long-password', 'acceptTerms': True}).status_code == 201
    assert client().post(f'/invites/{token}/accept', json={'password': 'another-password', 'acceptTerms': True}).status_code == 404, 'single use'
    assert sorted(l['slug'] for l in bea.get('/listings').json()) == ['den-haag-building', 'utrecht-oost']
    assert bea.get('/listings/utrecht-oost/analysis').json()['valuation'] and bea.get('/listings/map').status_code == 403
    uid = next(u['id'] for u in a.get('/admin/access').json()['users'] if u['email'] == 'bea@example.com')
    upd = a.put(f'/admin/access/users/{uid}', json={'listingScope': 'selected', 'listingIds': [id_('utrecht-oost'), id_('rotterdam-zuid')], 'features': ['messages', 'map']}).json(); assert upd['added'] == 1
    assert sorted(l['slug'] for l in bea.get('/listings').json()) == ['rotterdam-zuid', 'utrecht-oost'], 'changes apply on the next request'
    assert bea.get('/listings/map').status_code == 200 and bea.get('/listings/utrecht-oost/analysis').status_code == 403
    assert any(n['type'] == 'share' for n in bea.get('/me/dashboard').json()['notifications'])
    assert a.post(f'/admin/access/users/{uid}/status', json={'status': 'suspended'}).status_code == 201
    assert bea.get('/listings').status_code == 401, 'paused access signs the person out'
    assert bea.post('/auth/login', json={'email': 'bea@example.com', 'password': 'a-long-password'}).status_code == 403
    dev = client('developer@demo.nl'); assert dev.get('/admin/access').status_code == 200, 'developer manages access too'
    assert dev.post(f'/admin/access/users/{uid}/status', json={'status': 'active'}).status_code == 201
    assert bea.post('/auth/login', json={'email': 'bea@example.com', 'password': 'a-long-password'}).status_code == 201
    assert client().get('/invites/demo-invite-pieter').json()['listings'] == 3, 'seeded demo invitation'


def test_data_room_and_watermarked_documents(client):
    c = client('verified@demo.nl')
    assert c.get('/listings/utrecht-oost/dataroom').status_code == 403, 'NDA required'
    assert c.post('/listings/utrecht-oost/nda', json={'signedName': 'Victor Verified', 'accept': True}).status_code == 201
    room = c.get('/listings/utrecht-oost/dataroom').json(); assert len(room['folders']) >= 3
    legal = next(f for f in room['folders'] if f['name'] == 'Legal')['files'][0]
    assert c.post(f"/documents/{legal['id']}/view-url?download=1").status_code == 403, 'legal folder is view-only'
    url = c.post(f"/documents/{legal['id']}/view-url").json()['url']
    f = c.c.get(url); assert f.status_code == 200 and f.headers['content-type'] == 'application/pdf' and len(f.content) > 1000
    other = client('pro@demo.nl'); assert other.c.get(url).status_code == 403, 'link is bound to the user'
    assert c.get('/documents/file/forged.token').status_code == 403


def test_offers_deals_and_bid_rounds(client):
    c = client('verified@demo.nl')
    o = c.post('/listings/utrecht-oost/offers', data={'amount': '3100000', 'transferDate': '2030-01-15', 'financingType': 'Mortgage', 'conditions': 'Financing'}, files={'proof': PDF})
    assert o.status_code == 201 and o.json()['lead']['band'] == 'Hot'
    staff = client('sales@demo.nl')
    assert staff.post(f"/admin/offers/{o.json()['id']}/decision", json={'decision': 'accepted'}).status_code == 201
    assert staff.post(f"/admin/offers/{o.json()['id']}/decision", json={'decision': 'rejected'}).status_code == 400, 'cannot decide twice'
    dash = c.get('/me/dashboard').json(); assert len(dash['deals']) == 1 and dash['deals'][0]['stage'] == 0
    rnd = c.get('/listings/eindhoven-collection').json()['bidRound']
    assert c.post(f"/bid-rounds/{rnd['id']}/bids", data={'amount': '1000', 'conditions': 'No conditions', 'acceptRules': 'on'}, files={'proof': PDF}).status_code == 400
    assert c.post(f"/bid-rounds/{rnd['id']}/bids", data={'amount': '7500000', 'conditions': 'No conditions', 'acceptRules': 'on'}, files={'proof': PDF}).status_code == 201
    assert staff.post(f"/admin/bid-rounds/{rnd['id']}/close").status_code == 201
    assert c.post(f"/bid-rounds/{rnd['id']}/bids", data={'amount': '7500000', 'conditions': 'No conditions', 'acceptRules': 'on'}, files={'proof': PDF}).status_code == 400, 'closed round rejects bids'
    assert staff.post(f"/admin/bid-rounds/{rnd['id']}/award").json()['amount'] == 7500000


def test_roles(client):
    assert client('sales@demo.nl').get('/admin/kyc').status_code == 403
    comp = client('compliance@demo.nl'); high = next(k for k in comp.get('/admin/kyc').json() if k['risk'] == 'high')
    assert comp.post(f"/admin/kyc/{high['id']}/decision", json={'decision': 'approved'}).status_code == 400
    assert comp.post(f"/admin/kyc/{high['id']}/decision", json={'decision': 'approved', 'notes': 'EDD: source of funds verified'}).status_code == 201
    assert comp.put('/admin/config', json={'buyer_fee': 1}).status_code == 403, 'only admin edits config'


def test_staff_2fa_and_price_drop_alerts(client):
    a = client(); r = a.post('/auth/login', json={'email': 'admin@demo.nl', 'password': 'Demo2026!'}); assert r.json()['needs2fa'] is True
    assert a.get('/admin/overview').status_code == 403
    a.post('/auth/2fa/verify', json={'code': r.json()['demoCode']}); assert a.get('/admin/overview').status_code == 200
    f = client('free@demo.nl'); f.post('/favorites/rotterdam-zuid')
    lid = next(l['id'] for l in a.get('/admin/listings').json() if l['slug'] == 'rotterdam-zuid')
    assert a.patch(f'/admin/listings/{lid}', json={'askingPrice': 4000000}).json()['alerts'] == 1
    assert any('Price reduced' in n['title'] for n in f.get('/me/dashboard').json()['notifications'])


def test_kyc_submission(client):
    c = client('free@demo.nl')
    k = c.post('/kyc/cases', data={'liveness': 'on', 'ticket': '1000000', 'pep': 'no'}, files={'idDoc': ('id.pdf', b'%PDF-1.4 x', 'application/pdf'), 'proof': PDF})
    assert k.status_code == 201 and k.json()['risk'] == 'low'
    assert c.post('/kyc/cases', data={'liveness': 'on', 'ticket': '1', 'pep': 'no'}, files={'idDoc': ('x.txt', b'x', 'text/plain'), 'proof': PDF}).status_code == 400
    client('compliance@demo.nl').post(f"/admin/kyc/{k.json()['id']}/decision", json={'decision': 'approved'})
    assert c.get('/me').json()['user']['verified'] is True


def test_map_and_location_filters(client):
    m = client('free@demo.nl'); fc = m.get('/listings/map').json(); assert fc['type'] == 'FeatureCollection'
    rz = next(f for f in fc['features'] if f['properties']['slug'] == 'rotterdam-zuid'); assert rz['properties']['approx'] is False and rz['geometry']['coordinates'] == [4.49, 51.9]
    v = client('pro@demo.nl')
    zh = v.get('/listings?province=Zuid-Holland').json(); assert zh and all(l['province'] == 'Zuid-Holland' for l in zh)
    near = v.get('/listings?near=Rotterdam&radius=10').json(); assert near and all(l['city'] == 'Rotterdam' for l in near)
    assert any(l['city'] in ('Den Haag', 'Utrecht') for l in v.get('/listings?near=Rotterdam&radius=50').json())
    assert v.get('/geo/resolve?q=Utrecht').json()['place']['name'] == 'Utrecht'


def test_messaging(client):
    inv = client('free@demo.nl')
    assert client().post('/messages', json={'listing': 'utrecht-oost', 'body': 'Hello'}).status_code == 401
    assert inv.post('/messages', json={'listing': 'utrecht-oost', 'body': 'Is the roof recently renewed?'}).status_code == 201
    sales = client('sales@demo.nl'); t = next(x for x in sales.get('/admin/messages').json()['threads'] if x['slug'] == 'utrecht-oost' and x['investorEmail'] == 'free@demo.nl'); assert t['unreadForStaff'] == 1
    assert sales.post('/admin/messages', json={'investorId': t['investorId'], 'listing': 'utrecht-oost', 'body': 'Yes, in 2021. The inspection report is in the data room.'}).status_code == 201
    assert next(x for x in inv.get('/messages').json()['threads'] if x['slug'] == 'utrecht-oost')['unreadForInvestor'] == 1
    th = inv.get('/messages/thread?listing=utrecht-oost').json(); assert len(th['messages']) == 2 and th['messages'][1]['fromStaff'] is True
    assert next(x for x in inv.get('/messages').json()['threads'] if x['slug'] == 'utrecht-oost')['unreadForInvestor'] == 0, 'opening the thread marks it read'
    assert not any(x['slug'] == 'utrecht-oost' for x in client('pro@demo.nl').get('/messages').json()['threads']), 'threads are private'
    comp = client('compliance@demo.nl'); assert comp.get('/admin/messages').status_code == 200
    assert comp.post('/admin/messages', json={'investorId': t['investorId'], 'listing': 'utrecht-oost', 'body': 'Hi'}).status_code == 403
    assert inv.get('/admin/messages').status_code == 403


def test_private_deal_rooms(client):
    priv = client('verified@demo.nl'); assert not any(l['slug'] == 'project-tulip' for l in priv.get('/listings').json()), 'not shared, not listed'
    assert priv.get('/listings/project-tulip').status_code == 404 and priv.get('/listings/project-tulip/process').status_code == 403
    t = invited(client, 'teaser@example.com', ['project-tulip'], ['institutional']).get('/listings/project-tulip').json()
    assert t['locked'] is True and t['name'] == 'Project Tulip' and 'askingPrice' not in t and 'address' not in t and t['priceDisplay'].startswith('€')
    fund = client('fund@demo.nl'); d = fund.get('/listings/project-tulip').json(); assert d['locked'] is False and d['askingPrice'] > 1e8 and d['unitsCount'] == 860
    pr = fund.get('/listings/project-tulip/process').json(); assert pr['stageKey'] == 'indicative' and pr['nda'] is False and len(pr['qa']) == 0, 'Q&A needs the NDA'
    bid = lambda amount: fund.post('/listings/project-tulip/process/bids', json={'amount': amount, 'financingType': 'Cash', 'structure': 'Share deal', 'acceptRules': True})
    assert bid(300_000_000).status_code == 403
    assert fund.post('/listings/project-tulip/nda', json={'signedName': 'Ingrid Lund', 'accept': True}).status_code == 201
    pr2 = fund.get('/listings/project-tulip/process').json(); assert len(pr2['qa']) >= 4 and all(q['answer'] for q in pr2['qa'])
    assert bid(1_000_000).status_code == 400, 'minimum ticket'
    assert bid(round(d['askingPrice'] * 0.99)).status_code == 201
    assert fund.post('/listings/project-tulip/qa', json={'category': 'Tax', 'question': 'Is the SPV part of a fiscal unity today?'}).status_code == 201
    assert fund.post('/listings/project-tulip/offers', data={}).status_code == 400, 'no ordinary offers on a process deal'
    sales = client('sales@demo.nl'); tp = next(p for p in sales.get('/admin/processes').json() if p['slug'] == 'project-tulip')
    assert len(tp['bids']) == 3 and len(tp['openQuestions']) >= 2
    q = next(q for q in tp['openQuestions'] if 'fiscal unity' in q['question'])
    assert sales.post(f"/admin/qa/{q['id']}/answer", json={'answer': 'Yes; it ends at closing.'}).status_code == 201
    assert sales.post(f"/admin/processes/{tp['id']}/advance", json={}).json()['shortlist'] == 3
    assert fund.get('/listings/project-tulip/process').json()['shortlisted'] is True
    assert next(p for p in client('compliance@demo.nl').get('/admin/processes').json() if p['slug'] == 'project-tulip')['bids'][0]['amount'] is None, 'compliance does not see bid amounts'


def test_analysis_memo_and_ai(client):
    assert client().post('/ai/ask', json={'question': 'What is the yield?'}).status_code == 401
    free = invited(client, 'analyst@example.com', ['rotterdam-zuid', 'utrecht-oost'], ['analysis', 'analyst'])
    a = free.get('/listings/rotterdam-zuid/analysis').json()
    assert a['valuation']['point'] > 0 and a['comparables'] and len(a['stress']) >= 5 and a['regulation'] is None, 'rent-roll analysis needs verification + NDA'
    s = free.post('/analysis/scenario', json={'slug': 'rotterdam-zuid', 'interest': 6}).json(); assert s['scenario']['leveredIrr'] < s['base']['leveredIrr']
    assert free.get('/listings/rotterdam-zuid/memo').status_code == 403
    ans = free.post('/ai/ask', json={'slug': 'rotterdam-zuid', 'question': 'What happens if interest rises 200 bp?'}).json()
    assert ans['mode'] == 'engine' and 'IRR' in ans['answer'] and any(x['id'] == 'S4' for x in ans['sources'])
    assert free.post('/ai/ask', json={'slug': 'project-tulip', 'question': 'Summary?'}).status_code == 404, 'the AI cannot open a deal that was not shared'
    assert "can't tell you whether to buy" in free.post('/ai/ask', json={'slug': 'utrecht-oost', 'question': 'Should I buy this?'}).json()['answer']
    fund = client('fund@demo.nl'); t = fund.get('/listings/project-tulip/analysis').json()
    assert t['regulation'] and t['regulation']['units'] == 860 and any('regulation' in f['title'].lower() for f in t['flags'])
    assert 'units rent above' in fund.post('/ai/ask', json={'slug': 'project-tulip', 'question': 'How exposed is the rent roll to the WWS caps?'}).json()['answer']
    memo = fund.get('/listings/project-tulip/memo'); assert memo.status_code == 200 and memo.headers['content-type'] == 'application/pdf'
    m = fund.get('/me/mandate').json(); assert m['hasBox'] and m['matches'][0]['score'] == 100 and any(x['slug'] == 'project-tulip' for x in m['matches'][:2])
    assert 'Project' in fund.post('/ai/ask', json={'question': 'Which portfolio has the highest yield within €500m?'}).json()['answer']
    assert len(fund.get('/market/report').json()['cities']) >= 6 and free.get('/market/report').status_code == 403


def test_crm_integration(client):
    dev = client('developer@demo.nl')
    key = dev.post('/admin/integrations/keys', json={'name': 'Company CRM'}).json()['key']; assert key.startswith('pp_live_')
    crm = lambda method, path, k=key, **kw: client().req(method, path, headers={'x-api-key': k}, **kw)
    assert crm('GET', '/integrations/crm/ping', 'pp_live_wrong').status_code == 401 and client().get('/integrations/crm/ping').status_code == 401
    body = {'externalId': 'CRM-777', 'name': 'Delft canal portfolio', 'status': 'available', 'dealType': 'portfolio', 'askingPrice': 5200000, 'grossRentAnnual': 290000, 'shareWith': ['free@demo.nl'],
            'property': {'address': 'Sample Oude Delft 10', 'postcode': '2611 BB', 'city': 'Delft', 'areaM2': 1400, 'buildYear': 1890, 'category': 'portfolios', 'propertyType': 'Residential portfolio', 'energyLabel': 'D'},
            'units': [{'ref': '01', 'areaM2': 70, 'rentMonthly': 1200}, {'ref': '02', 'areaM2': 70, 'rentMonthly': 1215, 'rentType': 'mid'}]}
    assert crm('POST', '/integrations/crm/listings', json={**body, 'askingPrice': 'x'}).status_code == 400
    r = crm('POST', '/integrations/crm/listings', json=body).json(); assert r['created'] is True and r['shared'] == 1
    again = crm('POST', '/integrations/crm/listings', json={**body, 'askingPrice': 4990000}).json(); assert again['created'] is False and again['slug'] == r['slug']
    free = client('free@demo.nl'); l = free.get(f"/listings/{r['slug']}").json(); assert l['askingPrice'] == 4990000 and l['unitsCount'] == 2
    assert client('verified@demo.nl').get(f"/listings/{r['slug']}").status_code == 404, 'not shared with everyone'
    assert crm('DELETE', '/integrations/crm/listings/CRM-777').status_code == 200 and free.get(f"/listings/{r['slug']}").status_code == 404, 'withdrawn'
    assert client('sales@demo.nl').get('/admin/integrations').status_code == 403
    assert any('CRM-777' in x['text'] for x in dev.get('/admin/integrations').json()['log'])
