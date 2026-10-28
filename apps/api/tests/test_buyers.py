"""Buyers & outreach: import of the ownership exports and contacts, matching, campaigns, tracking links and unsubscribe."""
import io, time
from datetime import date, datetime
from openpyxl import Workbook


def xlsx(headers, rows) -> bytes:
    wb = Workbook(); ws = wb.active; ws.append(headers)
    for r in rows: ws.append(r)
    b = io.BytesIO(); wb.save(b); return b.getvalue()


PROPS = ['BAG pand id', 'Straat', 'Nummer', 'Letter', 'Toevoeging', 'Meerdere adressen', 'Postcode', 'Plaats', 'Gemeente', 'Provincie', 'Gebruiksdoel', 'Gebruiksoppervlakte (m²)', 'Perceeloppervlakte (m²)',
         'Bouwjaar', 'Monument', 'Status', 'Energielabels', 'Aantal eindgebruikers', 'Aankoopdatum', 'Aankoopjaar', 'Jaren in bezit', 'Segment', 'Koopsom (bandbreedte)', 'Type kooptransactie', 'Kopergroep',
         'Eigenaar', 'Naam koper (Kadaster)', 'Naam verkoper (Kadaster)', 'Transactieadres', 'Factsheet', 'Bronbestand']
OWNERS = ['Eigenaar', 'Kopergroep', 'Aantal panden', 'Totaal m²', 'Eerste aankoop', 'Laatste aankoop', 'Gem. jaren in bezit', 'Aantal recent gekocht (≤5 jr)', 'Aantal lang in bezit (≥15 jr)', 'Segment', 'Plaatsen', 'Kadaster-entiteiten']
HOLD = ['Eigenaar', 'BAG pand id', 'Adres', 'Plaats', 'Aankoopdatum', 'Jaren in bezit', 'Segment', 'Bronbestand']


def _building(i, city, use, band, owner, bought):
    return [599100000000000 + i, 'Teststraat', i, None, None, None, '3011AA', city, None, None, use, 120, 200, 1990, 'Nee', 'Pand in gebruik', 'B', 2, bought, bought.year, 1.5, 'recente koper', band,
            'Belegging', 'bedrijf', owner, None, None, f'TESTSTRAAT {i}, {city.upper()}', f'https://www.vastgoeddata.nl/factsheet/0{599100000000000 + i}', 'test/props.xlsx']


def _files():
    recent = datetime(2026, 3, 1); old = datetime(2004, 5, 1)
    b = [_building(i, 'Rotterdam', 'woonfunctie', '25m - 30m', 'Maas Wonen', recent) for i in range(1, 31)]
    b += [_building(100 + i, 'Groningen', 'kantoorfunctie', '1m - 1.2m', 'Noord Kantoren', old) for i in range(1, 6)]
    owners = [['Maas Wonen', 'bedrijf', 30, 3600, recent, recent, 0.6, 30, 0, 'recente koper', 'Rotterdam', 'MAAS WONEN B.V.'],
              ['Noord Kantoren', 'bedrijf', 5, 600, old, old, 22.0, 0, 5, 'lang in bezit', 'Groningen', 'NOORD KANTOREN B.V.']]
    hold = [[r[25], r[0], f'Teststraat {r[2]}', r[7], r[18], 1.5, r[21], 'owners/test'] for r in b]
    contacts = [['Maas Wonen', 'Mila Maas', 'Head of Acquisitions', 'mila@maaswonen.example', '+31 10 000 0000', 'nl'],
                ['MAAS WONEN B.V.', 'Ruben Maas', 'CIO', 'ruben@maaswonen.example', '', 'en'],
                ['Noord Kantoren', 'Nina Noord', 'Director', 'nina@noordkantoren.example', '', 'nl'],
                ['Nieuw Fonds', 'Nora Nieuw', 'Partner', 'not-an-email', '', 'nl']]
    return [('files', ('properties_test.xlsx', xlsx(PROPS, b), 'application/octet-stream')), ('files', ('owners_test.xlsx', xlsx(OWNERS, owners), 'application/octet-stream')),
            ('files', ('owner_properties_test.xlsx', xlsx(HOLD, hold), 'application/octet-stream')),
            ('files', ('contacts.xlsx', xlsx(['Bedrijf', 'Naam', 'Functie', 'E-mail', 'Telefoon', 'Taal'], contacts), 'application/octet-stream'))]


def _wait(a, batch):
    for _ in range(100):
        r = a.get(f'/admin/buyers/imports?batch={batch}').json()
        if r['done']: return r['imports']
        time.sleep(0.2)
    raise AssertionError('import did not finish')


def test_buyers_import_match_and_outreach(client):
    a = client('admin@demo.nl'); anon = client(); investor = client('investor@demo.nl')
    assert anon.get('/admin/buyers').status_code in (401, 403) and investor.get('/admin/buyers').status_code == 403, 'staff only'

    r = a.post('/admin/buyers/import', files=_files()); assert r.status_code == 201, r.text
    imps = {i['fileName']: i for i in _wait(a, r.json()['batch'])}
    assert [imps[f]['kind'] for f in ('properties_test.xlsx', 'owners_test.xlsx', 'owner_properties_test.xlsx', 'contacts.xlsx')] == ['properties', 'owners', 'holdings', 'contacts']
    assert all(i['status'] == 'done' for i in imps.values()), imps
    assert imps['contacts.xlsx']['created'] == 3 and imps['contacts.xlsx']['skipped'] == 1, 'legal entity name matches the company; a bad email is reported'
    assert imps['properties_test.xlsx']['created'] == 35

    again = a.post('/admin/buyers/import', files=_files()[:1]).json(); assert _wait(a, again['batch'])[0]['updated'] == 35, 're-import updates, no duplicates'
    bad = a.post('/admin/buyers/import', files=[('files', ('x.xlsx', xlsx(['Foo', 'Bar'], [[1, 2]]), 'application/octet-stream'))]).json()
    assert _wait(a, bad['batch'])[0]['status'] == 'failed'

    ov = a.get('/admin/buyers').json(); maas = next(c for c in ov['companies'] if c['name'] == 'Maas Wonen')
    assert maas['buildings'] == 30 and maas['emailable'] == 2 and maas['residentialShare'] == 1.0
    d = a.get(f"/admin/buyers/{maas['id']}").json(); assert d['profile']['topCities'][0] == ['Rotterdam', 30] and len(d['holdings']) == 30

    rz = next(l for l in ov['listings'] if l['name'] == 'A foothold in Rotterdam')
    m = a.get(f"/admin/buyers/match/{rz['id']}?lang=en").json()
    assert m['buyers'][0]['name'] == 'Maas Wonen' and m['buyers'][0]['score'] > m['buyers'][1]['score'] and 'Rotterdam' in m['buyers'][0]['reasons'][0]

    noord = next(c for c in ov['companies'] if c['name'] == 'Noord Kantoren')
    a.patch(f"/admin/buyers/{noord['id']}", json={'doNotContact': True})
    body = dict(listingId=rz['id'], companyIds=[maas['id'], noord['id']], language='nl', subject=m['templates']['nl']['subject'], body=m['templates']['nl']['body'])
    pv = a.post('/admin/outreach/preview', json=body).json()
    assert pv['count'] == 2 and pv['skip']['doNotContact'] == 1 and 'Beste Mila' in pv['sample']['body'] and 'Maas Wonen' in pv['sample']['subject'] and '/api/m/' in pv['sample']['body']
    camp = a.post('/admin/outreach/campaigns', json=body); assert camp.status_code == 201 and camp.json()['queued'] == 2
    assert a.post('/admin/outreach/campaigns', json=body).status_code == 400, 'the same people are not emailed twice about the same property'

    sent = a.post('/admin/outreach/send-now').json(); assert sent['sent'] == 2 and sent['mode'] == 'simulated'
    out = [m for m in a.get('/admin/outbox').json() if m['kind'] == 'outreach']; assert len(out) == 2
    mila = next(m for m in out if m['toEmail'] == 'mila@maaswonen.example'); ruben = next(m for m in out if m['toEmail'] == 'ruben@maaswonen.example')
    assert 'Beste Mila' in mila['body'] and 'Afmelden' not in mila['body'] and '/u/' in mila['body']
    link = lambda m: next(w for w in m['body'].split() if '/api/m/' in w).split('/api/m/')[1]
    tok = link(mila)

    assert anon.get(f'/m/{tok}/o.gif').headers['content-type'] == 'image/gif'
    go = anon.get(f'/m/{tok}', follow_redirects=False); assert go.status_code == 302 and go.headers['location'].startswith('/invite/'), 'the email link opens a personal invitation'
    info = anon.get(f"/invites/{go.headers['location'].split('/')[-1]}").json(); assert info['email'] == 'mila@maaswonen.example' and info['listings'] == 1 and info['companyName'] == 'Maas Wonen'
    anon.post(f"/invites/{go.headers['location'].split('/')[-1]}/accept", json={'password': 'a-long-password', 'acceptTerms': True})
    assert [l['slug'] for l in anon.get('/listings').json()] == ['rotterdam-zuid'], 'sees only the property from the email'

    cid = camp.json()['id']; c = a.get(f'/admin/outreach/{cid}').json()
    assert c['funnel']['sent'] == 2 and c['funnel']['opened'] == 1 and c['funnel']['clicked'] == 1 and c['funnel']['registered'] == 1
    assert a.get(f"/admin/buyers/{maas['id']}").json()['stage'] == 'interested'

    rt = link(ruben); assert anon.get(f'/m/{rt}/info').json()['unsubscribed'] is False
    assert anon.post(f'/m/{rt}/unsubscribe').status_code == 201 and anon.get(f'/m/{rt}/info').json()['unsubscribed'] is True
    assert a.get('/admin/outreach').json()['totals']['unsubscribed'] == 1
    assert anon.get('/m/' + '0' * 40, follow_redirects=False).headers['location'].startswith('/?link='), 'unknown tokens go nowhere'


def test_buyers_contacts_by_hand(client):
    a = client('admin@demo.nl')
    co = a.post('/admin/buyers/companies', json={'name': 'Handmatig Fonds'}); assert co.status_code == 201
    cid = co.json()['id']
    assert a.post(f'/admin/buyers/{cid}/contacts', json={'name': 'Hanna Hand', 'email': 'Hanna@Handmatig.example', 'language': 'en'}).status_code == 201
    assert a.post(f'/admin/buyers/{cid}/contacts', json={'name': 'Hanna Twice', 'email': 'hanna@handmatig.example'}).status_code == 400
    d = a.get(f'/admin/buyers/{cid}').json(); assert d['contactList'][0]['email'] == 'hanna@handmatig.example'
    assert a.delete(f"/admin/buyers/contacts/{d['contactList'][0]['id']}").status_code == 200
    assert a.get('/admin/buyers/template').headers['content-type'].startswith('application/vnd.openxmlformats')
