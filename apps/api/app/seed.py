"""Seeds a fresh demo database. All people, companies and properties are fictional. Password for every demo account: Demo2026!
Each step is idempotent, so it also upgrades databases seeded by the earlier Node.js backend (the live demo)."""
from __future__ import annotations
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from . import db
from .db import T, func, select
from .common import eur_nl, hash_password, now, save_file
from .domain import CONFIG_DEFAULTS, RETIRED_ROLES, new_totp_secret, preset
from .pdf import sample_pdf

DEMO_PASSWORD = 'Demo2026!'
DEMO_INVITE_TOKEN = 'demo-invite-pieter'
DAY = timedelta(days=1)

LISTINGS = [
    dict(slug='rotterdam-zuid', image='p1', name='A foothold in Rotterdam', nameNl='Een voet aan de grond in Rotterdam', city='Rotterdam', district='Zuid', address='Sample Maasstraat 40–48', postcode='3072 AB', category='portfolios', propertyType='Residential portfolio', propertyTypeNl='Woningportefeuille', dealType='portfolio', price=4260000, units=24, area=1788, rent=255600, opex=56200, woz=4410000, label='C', year=1936, tenure='Freehold (eigen grond)', occupancy=96, demand=12, status='available', days=3, featured=True, lat=51.9, lng=4.49,
         description='An established residential portfolio across a connected Rotterdam neighbourhood. A considered opportunity for buyers looking for scale, an existing rental income and a long-term presence in the city.', descriptionNl='Een gevestigde woningportefeuille in een verbonden Rotterdamse wijk.', highlights=['24 apartments across three buildings', 'Whole portfolio or selected units', 'Established residential neighbourhood']),
    dict(slug='amsterdam-canal-house', image='r1', name='A piece of Amsterdam', nameNl='Een stukje Amsterdam', city='Amsterdam', district='Centrum', address='Sample Herengracht 312', postcode='1016 BX', category='homes', propertyType='Historic canal house', propertyTypeNl='Historisch grachtenpand', dealType='direct', price=4850000, units=1, area=312, plot=160, rent=0, opex=0, woz=4120000, label='D', year=1665, tenure='Ground lease (erfpacht), canon prepaid to 2068', demand=9, status='available', days=22, featured=True, lat=52.36, lng=4.9,
         description='A characterful city home with a distinctly Amsterdam silhouette. Generous proportions, period details and outdoor space bring together the intimacy of a private residence and the energy of the city.', highlights=['312 m² of living space', 'Historic character and a private garden', 'Viewings by appointment']),
    dict(slug='utrecht-oost', image='p2', name='Room to grow in Utrecht', nameNl='Ruimte om te groeien in Utrecht', city='Utrecht', district='Oost', address='Sample Biltstraat 120', postcode='3572 BK', category='buildings', propertyType='Apartment building', propertyTypeNl='Appartementencomplex', dealType='direct', price=3180000, units=12, area=920, rent=162180, opex=34100, woz=3260000, label='B', year=1974, tenure='Freehold (eigen grond)', occupancy=100, demand=10, status='available', days=5, featured=True, lat=52.09, lng=5.14,
         description='Twelve apartments in one of the Netherlands’ most connected cities. A manageable building for investors who value a clear property story, straightforward ownership and a detailed view of each unit.', highlights=['12 apartments in one acquisition', 'Fully let in this sample rent roll', 'Individual unit breakdown available']),
    dict(slug='eindhoven-collection', image='p3', name='The Eindhoven collection', nameNl='De Eindhoven-collectie', city='Eindhoven', district='Strijp', address='Sample Torenallee 20', postcode='5617 BC', category='portfolios', propertyType='Residential portfolio', propertyTypeNl='Woningportefeuille', dealType='bid_round', price=7240000, units=38, area=2690, rent=456120, opex=95800, woz=7580000, label='A', year=2008, tenure='Freehold (eigen grond)', occupancy=97, demand=14, status='available', days=10, lat=51.45, lng=5.45,
         description='A larger residential holding in a city shaped by design and technology. Offered through a structured bid round with a fixed deadline and sealed bids.', highlights=['38 residential units', 'Sealed bid round, closes 14 November', 'Whole portfolio']),
    dict(slug='wassenaar-villa', image='r2', name='Space to slow down', nameNl='Ruimte om te vertragen', city='Wassenaar', district='Woodland setting', address='Sample Laan van Clingendael 7', postcode='2242 AB', category='homes', propertyType='Detached villa', propertyTypeNl='Vrijstaande villa', dealType='off_market', price=2950000, units=1, area=380, plot=1450, rent=0, opex=0, woz=2680000, label='C', year=1934, tenure='Freehold (eigen grond)', demand=6, status='available', days=0, priceOnRequest=True, lat=52.14, lng=4.4,
         description='A spacious family residence in a green setting, offered off-market. Investor Pro members see it first; verified investors 48 hours later.', highlights=['380 m² of living space', '1,450 m² plot', 'Off-market · private appointments']),
    dict(slug='rotterdam-penthouse', image='r3', name='Above the everyday', nameNl='Boven het alledaagse', city='Rotterdam', district='Kop van Zuid', address='Sample Wilhelminakade 900', postcode='3072 AP', category='homes', propertyType='Riverside penthouse', propertyTypeNl='Penthouse aan de rivier', dealType='direct', price=1650000, units=1, area=168, plot=70, rent=0, opex=0, woz=1480000, label='A', year=2009, tenure='Freehold (apartment right)', demand=8, status='coming_soon', days=1, priceOnRequest=True, lat=51.91, lng=4.49,
         description='An elevated city retreat with generous terrace space. A contemporary home for buyers drawn to light, open views and a well-connected Rotterdam address.', highlights=['168 m² interior', '70 m² terrace', 'Two parking spaces in the sample specification']),
    dict(slug='den-haag-building', image='p4', name='A classic city address', nameNl='Een klassiek stadsadres', city='Den Haag', district='Noord', address='Sample Laan van Meerdervoort 55', postcode='2517 AB', category='buildings', propertyType='Apartment building', propertyTypeNl='Appartementencomplex', dealType='direct', price=2380000, units=9, area=742, rent=133280, opex=30500, woz=2450000, label='C', year=1928, tenure='Ground lease (erfpacht), perpetual', occupancy=100, demand=5, status='under_offer', days=36, lat=52.09, lng=4.31,
         description='A period residential building with an established rental profile. Currently under offer; save it or register interest in similar opportunities.', highlights=['Nine residential units', 'Period architecture', 'Register interest in similar buildings']),
]
SOLD = [('Zwolle', 'Residential portfolio', 18, 3250000, 24, 'bid_round', 40), ('Haarlem', 'Apartment building', 10, 3150000, 31, 'direct', 70), ('Amersfoort', 'Residential portfolio', 26, 5300000, 19, 'off_market', 100),
        ('Delft', 'Mixed-use building', 6, 1700000, 27, 'direct', 130), ('Groningen', 'Room rental building', 14, 1250000, 16, 'off_market', 160)]
FOLDERS = [('Legal', ['Kadaster ownership extract', 'Deed of division (splitsingsakte)', 'Ground lease conditions'], False), ('Technical', ['Building inspection 2025', 'Asbestos inventory', 'Energy labels per unit', 'Floor plans'], True),
           ('Financial', ['Rent roll (tenant data redacted)', 'Lease agreements, sample of 6', 'Service-cost statement 2025'], False), ('Zoning', ['Omgevingsplan extract'], True)]


def _config_rows():
    return [{'key': c['key'], 'label': c['label'], 'value': c['value'], 'unit': c['unit'], 'valid_from': c['validFrom']} for c in CONFIG_DEFAULTS]


def seed_if_empty() -> bool:
    if db.count(T.users) > 0: return False
    t0 = now()
    db.run(pg_insert(T.config).values(_config_rows()).on_conflict_do_nothing())
    db.ins(T.automation_settings, [{'key': k, 'enabled': True} for k in ['scoring', 'followups', 'emails', 'matches', 'priceAlerts']], returning=False)
    pw = hash_password(DEMO_PASSWORD)
    mk = lambda email, name, **extra: db.ins(T.users, {'email': email, 'name': name, 'password_hash': pw, **extra})
    mk('admin@demo.nl', 'Ada Admin', role='admin', twofa_enabled=True, twofa_secret=new_totp_secret())
    mk('free@demo.nl', 'Femke Free', investor_type='Private person')
    mk('verified@demo.nl', 'Victor Verified', investor_type='Private BV', company_name='Victor Beheer BV', verified=True, twofa_enabled=True, twofa_secret=new_totp_secret(), account_manager='Ada Admin', lead_score=55)
    pro = mk('pro@demo.nl', 'Priya Pro', investor_type='Family office', company_name='Delta Holding BV', verified=True, pro=True, twofa_enabled=True, twofa_secret=new_totp_secret(), account_manager='Ada Admin', lead_score=80)
    db.ins(T.subscriptions, {'user_id': pro['id'], 'plan': 'year', 'method': 'iDEAL', 'mollie_payment_id': 'tr_demo_seed', 'current_period_end': t0 + 300 * DAY}, returning=False)
    bidders = [mk(e, n, investor_type=t, country=c, company_name=co, verified=True, lead_score=60) for e, n, t, c, co in
               [('hanseatic@demo.nl', 'Jonas Becker', 'Fund', 'DE', 'Hanseatic Wohnen GmbH'), ('alnoor@demo.nl', 'Omar Haddad', 'Family office', 'AE', 'Al Noor Capital'), ('jansen@demo.nl', 'Marieke Jansen', 'Private BV', 'NL', 'M. Jansen Beheer BV')]]
    pend_a = mk('brightwater@demo.nl', 'Oliver Grant', investor_type='Fund', country='GB', company_name='Brightwater Estates Ltd')
    pend_b = mk('oranjewal@demo.nl', 'Sophie van Dijk', investor_type='Private BV', company_name='Oranjewal Capital BV')
    dummy = sample_pdf('Identity document (sample)', 'Uploaded for KYC review', ['Placeholder file for the demo compliance queue.'])
    db.ins(T.kyc_cases, [{'user_id': pend_a['id'], 'risk': 'high', 'ticket': 8000000, 'kvk': None, 'ubo_name': 'Oliver Grant', 'id_file_key': save_file(dummy, 'id.pdf'), 'id_file_name': 'passport.pdf', 'proof_file_key': save_file(dummy, 'pof.pdf'), 'proof_file_name': 'bank-letter.pdf'},
                         {'user_id': pend_b['id'], 'risk': 'low', 'ticket': 2000000, 'kvk': '81234567', 'ubo_name': 'Sophie van Dijk', 'id_file_key': save_file(dummy, 'id.pdf'), 'id_file_name': 'id-card.pdf', 'proof_file_key': save_file(dummy, 'pof.pdf'), 'proof_file_name': 'financing-letter.pdf'}], returning=False)

    for x in LISTINGS:
        p = db.ins(T.properties, {'address': x['address'], 'postcode': x['postcode'], 'city': x['city'], 'district': x['district'], 'lat': x['lat'], 'lng': x['lng'], 'plot_m2': x.get('plot'), 'area_m2': x['area'], 'build_year': x['year'],
                                  'category': x['category'], 'property_type': x['propertyType'], 'property_type_nl': x['propertyTypeNl'], 'tenure': x['tenure'], 'energy_label': x['label'], 'woz_value': x['woz'], 'woz_year': 2026, 'image': x['image']})
        monthly = x['rent'] // x['units'] // 12 if x['rent'] else 0
        db.ins(T.units, [{'property_id': p['id'], 'ref': str(i).zfill(2), 'area_m2': x['area'] // x['units'], 'rent_monthly': monthly + ((i * 37) % 120) - 60 if monthly else 0,
                          'rent_type': 'none' if not monthly else 'social' if monthly < 880 else 'mid' if monthly < 1180 else 'free', 'energy_label': x['label'],
                          'occupancy': 'vacant' if (x.get('occupancy') and i == x['units'] and x['occupancy'] < 100) else ('let' if x['rent'] else 'vacant')} for i in range(1, x['units'] + 1)], returning=False)
        l = db.ins(T.listings, {'property_id': p['id'], 'slug': x['slug'], 'name': x['name'], 'name_nl': x['nameNl'], 'description': x['description'], 'description_nl': x.get('descriptionNl'), 'highlights': x['highlights'],
                                'status': x['status'], 'deal_type': x['dealType'], 'asking_price': x['price'], 'price_on_request': bool(x.get('priceOnRequest')), 'gross_rent_annual': x['rent'], 'operating_costs_annual': x['opex'] or None,
                                'occupancy': x.get('occupancy'), 'demand': x['demand'], 'featured': bool(x.get('featured')), 'published_at': t0 - x['days'] * DAY,
                                'pro_early_access_until': t0 + timedelta(hours=47) if x['dealType'] == 'off_market' else None})
        for folder, files, dl in FOLDERS:
            for f in files:
                pdf = sample_pdf(f, f"{x['name']} · {x['address']}, {x['postcode']} {x['city']}", [f"This is a fictional {f.lower()} for {x['name']}. In production the acquisition team uploads the real file here; tenant names and contact details are redacted before upload (AVG).",
                                                                                               f"Property: {x['propertyType']}, {x['area']} m², built {x['year']}, energy label {x['label']}. Asking price €{eur_nl(x['price'])} k.k."])
                db.ins(T.documents, {'listing_id': l['id'], 'folder': folder, 'filename': f + '.pdf', 'storage_key': save_file(pdf, f + '.pdf'), 'download_allowed': dl}, returning=False)
        if x['dealType'] == 'bid_round':
            fixed = datetime(2026, 11, 14, 11, 0, tzinfo=timezone.utc)
            r = db.ins(T.bid_rounds, {'listing_id': l['id'], 'opens_at': t0 - 10 * DAY, 'closes_at': t0 + 14 * DAY if fixed < t0 + DAY else fixed, 'min_bid': 6900000})
            for i, (amt, cond) in enumerate(zip([7050000, 7310000, 6920000], ['Subject to financing', 'No conditions', 'Subject to due diligence'])):
                db.ins(T.offers, {'listing_id': l['id'], 'user_id': bidders[i]['id'], 'bid_round_id': r['id'], 'bidder_label': bidders[i]['company_name'], 'amount': amt, 'conditions': [cond], 'status': 'sealed',
                                  'proof_file_key': save_file(dummy, 'pof.pdf'), 'proof_file_name': 'proof-of-funds.pdf', 'lead_score': 75, 'lead_band': 'Hot'}, returning=False)
    for city, type_, units, price, days, deal, ago in SOLD:
        p = db.ins(T.properties, {'address': 'Sold property', 'postcode': '0000 AA', 'city': city, 'area_m2': units * 70, 'build_year': 1960, 'category': 'portfolios', 'property_type': type_, 'tenure': 'Freehold (eigen grond)', 'energy_label': 'C', 'image': 'p1'})
        db.ins(T.units, [{'property_id': p['id'], 'ref': str(i), 'area_m2': 70} for i in range(1, units + 1)], returning=False)
        db.ins(T.listings, {'property_id': p['id'], 'slug': f'sold-{city.lower()}-{units}', 'name': f'{type_}, {city}', 'description': 'Sold.', 'status': 'sold', 'deal_type': deal, 'asking_price': price, 'demand': days, 'published_at': t0 - ago * DAY}, returning=False)
    db.ins(T.acquisition_leads, [
        {'source': 'Website', 'address': 'Sample Broersvest 4, Schiedam', 'property_type': 'Residential portfolio', 'units': 8, 'asking_price': 1450000, 'est_value': 1380000, 'stage': 'new', 'contact_name': 'Private owner (box 3 landlord)'},
        {'source': 'Broker', 'address': 'Sample Velperweg 18, Arnhem', 'property_type': 'Apartment building', 'units': 14, 'asking_price': 2600000, 'est_value': 2450000, 'stage': 'contacted', 'owner_name': 'Ada Admin', 'contact_name': 'Makelaar'},
        {'source': 'Referral', 'address': 'Sample Rapenburg 9, Leiden', 'property_type': 'Canal house', 'units': 1, 'asking_price': 1900000, 'est_value': 1850000, 'stage': 'valuation', 'owner_name': 'Ada Admin'},
        {'source': 'List · box 3 landlords', 'address': 'Sample Spoorlaan 2, Tilburg', 'property_type': 'Residential portfolio', 'units': 6, 'asking_price': 1100000, 'est_value': 1020000, 'stage': 'offer_made', 'owner_name': 'Ada Admin'},
        {'source': 'Website', 'address': 'Sample Kleverparkweg 30, Haarlem', 'property_type': 'Apartment building', 'units': 10, 'asking_price': 3400000, 'est_value': 3250000, 'stage': 'under_contract', 'owner_name': 'Ada Admin'},
        {'source': 'Broker', 'address': 'Sample Assendorperstraat 5, Zwolle', 'property_type': 'Residential portfolio', 'units': 12, 'asking_price': 2300000, 'est_value': 2250000, 'stage': 'acquired', 'owner_name': 'Ada Admin'}], returning=False)
    db.ins(T.automation_log, {'rule': 'system', 'text': 'Demo database created and seeded'}, returning=False)
    seed_messages(); seed_institutional(); seed_access()
    print('Seeded demo database. Demo password for all demo accounts: ' + DEMO_PASSWORD)
    return True


def seed_messages():
    """Sample conversation for the messaging demo (only when there are no messages yet)."""
    if db.count(T.messages) > 0: return
    inv, am, l = db.get(T.users, email='verified@demo.nl'), db.get(T.users, email='admin@demo.nl'), db.get(T.listings, slug='rotterdam-zuid')
    if not inv or not am or not l: return
    t = now() - timedelta(hours=26); h = timedelta(hours=1)
    db.ins(T.messages, [
        {'investor_id': inv['id'], 'listing_id': l['id'], 'sender_id': inv['id'], 'body': 'Hello Ada, are any of the 24 units in Rotterdam-Zuid due for a rent review in the next 12 months?', 'created_at': t, 'read_at': t + h},
        {'investor_id': inv['id'], 'listing_id': l['id'], 'sender_id': am['id'], 'from_staff': True, 'body': 'Hi Victor, five leases index on 1 July and two mid-rent units can move to market rent after renovation. The rent roll in the data room (Financial folder) shows the dates per unit.', 'created_at': t + 2 * h, 'read_at': t + 3 * h},
        {'investor_id': inv['id'], 'listing_id': l['id'], 'sender_id': inv['id'], 'body': 'Thank you. Could we schedule a viewing next week, ideally Tuesday morning?', 'created_at': t + 20 * h}], returning=False)


STAGES = [('teaser', 'Teaser & NDA'), ('im', 'Information memorandum'), ('indicative', 'Indicative bids'), ('shortlist', 'Shortlist & management presentations'), ('dataroom', 'Full data room & site visits'), ('final', 'Final binding bids'), ('signing', 'SPA signing & notary transfer')]
DEALS = [
    dict(slug='project-tulip', name='Project Tulip', nameNl='Project Tulp', image='p2', city='Utrecht', district='Randstad · 6 cities', address='42 residential complexes (addresses in the IM)', postcode='Multiple', propertyType='Institutional residential portfolio', propertyTypeNl='Institutionele woningportefeuille', category='portfolios', units=860, year=1998, label='B', tenure='Mostly freehold (82%), remainder ground lease (erfpacht)', occupancy=98, bar=5.35, wozF=1.04, status='available', stage=2, lat=52.0907, lng=5.1214, mix='existing',
         description='A stabilised residential portfolio of 860 rental homes in 42 complexes across Amsterdam, Utrecht, Rotterdam, Den Haag, Haarlem and Amersfoort. Sold as one portfolio through a structured two-round process, with vendor due diligence available to shortlisted parties.', descriptionNl='Een gestabiliseerde woningportefeuille van 860 huurwoningen in 42 complexen in de Randstad, verkocht via een gestructureerd biedproces in twee rondes.',
         highlights=['860 rental homes in 42 complexes, 6 Randstad cities', '98% occupancy · 40% free-sector, 40% mid-rent, 20% social', 'Two-round process · vendor due diligence for the shortlist'], advisor='Portfolio & Prime Capital Markets'),
    dict(slug='project-delta', name='Project Delta', nameNl='Project Delta', image='p4', city='Rotterdam', district='Merwe-Vierhavens (M4H)', address='Build-to-rent scheme (plot details in the IM)', postcode='Multiple', propertyType='Build-to-rent · forward funding', propertyTypeNl='Nieuwbouw huur · forward funding', category='buildings', units=312, year=2028, label='A', tenure='Freehold (eigen grond)', occupancy=None, bar=5.0, wozF=0.95, status='available', stage=1, lat=51.9055, lng=4.4421, mix='new',
         description='Forward funding of a 312-home build-to-rent scheme in Rotterdam’s M4H district, delivered turnkey in Q3 2028 with BENG/NZEB performance. Fixed price, developer completion guarantee and a 24-month rent guarantee on the lease-up.', descriptionNl='Forward funding van een nieuwbouwproject met 312 huurwoningen in Rotterdam M4H, turnkey oplevering Q3 2028.',
         highlights=['312 new rental homes, energy label A (NZEB)', 'Turnkey delivery Q3 2028, fixed price', '24-month rent guarantee during lease-up'], advisor='Portfolio & Prime Capital Markets'),
]


def seed_institutional():
    """A qualified fund account, two private deal rooms with a structured sale process, Q&A and indicative bids."""
    db.run(pg_insert(T.config).values(_config_rows()).on_conflict_do_nothing())
    if db.get(T.listings, slug='project-tulip'): return
    t0 = now(); iso = lambda d: (t0 + d * DAY).isoformat().replace('+00:00', 'Z')
    fund = db.get(T.users, email='fund@demo.nl') or db.ins(T.users, {'email': 'fund@demo.nl', 'name': 'Ingrid Lund', 'password_hash': hash_password(DEMO_PASSWORD), 'investor_type': 'Pension fund', 'country': 'DK', 'company_name': 'Nordhavn Pension Partners',
                                                                      'verified': True, 'twofa_enabled': True, 'twofa_secret': new_totp_secret(), 'account_manager': 'Ada Admin', 'lead_score': 85})
    db.run(pg_insert(T.buy_boxes).values(user_id=fund['id'], regions=['Amsterdam', 'Utrecht', 'Rotterdam'], types=['portfolios', 'buildings'], ticket_min=25000000, ticket_max=400000000, target_bar=4.8, financing='cash', strategy='Buy-to-let').on_conflict_do_nothing())
    bidders = db.all_(T.users, T.users.c.email.in_(['hanseatic@demo.nl', 'alnoor@demo.nl']))
    bidders.sort(key=lambda u: ['hanseatic@demo.nl', 'alnoor@demo.nl'].index(u['email']))
    pro = db.get(T.users, email='pro@demo.nl')
    for x in DEALS:
        units = []; rent = area = 0
        for i in range(1, x['units'] + 1):
            a = 45 + (i * 29) % 41 if x['mix'] == 'new' else 48 + (i * 37) % 55; k = i % 10
            label = 'A' if x['mix'] == 'new' else 'AAAAAABBBBBBCCCCDDEF'[i % 20]
            type_ = ('mid' if k < 6 else 'free') if x['mix'] == 'new' else 'social' if k < 2 else 'mid' if k < 6 else 'free'
            m = 760 + (i * 13) % 140 if type_ == 'social' else 1040 + (i * 17) % 230 if type_ == 'mid' else 1380 + (i * 23) % 560
            vacant = x['mix'] == 'existing' and i % 50 == 0
            if not vacant: rent += m * 12
            area += a
            units.append({'ref': str(i).zfill(3), 'area_m2': a, 'rent_monthly': m, 'rent_type': type_, 'energy_label': label, 'occupancy': 'vacant' if vacant else 'let'})
        price = round(rent / (x['bar'] / 100) / 5e5) * 500000
        p = db.ins(T.properties, {'address': x['address'], 'postcode': x['postcode'], 'city': x['city'], 'district': x['district'], 'lat': x['lat'], 'lng': x['lng'], 'area_m2': area, 'build_year': x['year'], 'category': x['category'],
                                  'property_type': x['propertyType'], 'property_type_nl': x['propertyTypeNl'], 'tenure': x['tenure'], 'energy_label': x['label'], 'woz_value': round(price * x['wozF']), 'woz_year': 2026, 'image': x['image']})
        for j in range(0, len(units), 200): db.ins(T.units, [{**u, 'property_id': p['id']} for u in units[j:j + 200]], returning=False)
        l = db.ins(T.listings, {'property_id': p['id'], 'slug': x['slug'], 'name': x['name'], 'name_nl': x['nameNl'], 'description': x['description'], 'description_nl': x['descriptionNl'], 'highlights': x['highlights'], 'status': x['status'],
                                'deal_type': 'institutional', 'asking_price': price, 'gross_rent_annual': rent, 'operating_costs_annual': round(rent * (0.19 if x['mix'] == 'new' else 0.23)), 'occupancy': x['occupancy'], 'demand': 14,
                                'featured': False, 'published_at': t0 - (4 if x['mix'] == 'new' else 12) * DAY})
        for folder, files, dl in FOLDERS + [('Process', ['Information memorandum', 'Process letter', 'Draft share purchase agreement'], False)]:
            for f in files:
                pdf = sample_pdf(f, f"{x['name']} · {x['propertyType']}", [f"Fictional {f.lower()} for {x['name']}: {x['units']} homes, {x['district']}. In production the capital-markets team uploads the real file; tenant data is redacted (AVG).",
                                                                          f"Guide price €{eur_nl(price)} k.k. · gross rent €{eur_nl(rent)} a year."])
                db.ins(T.documents, {'listing_id': l['id'], 'folder': folder, 'filename': f + '.pdf', 'storage_key': save_file(pdf, f + '.pdf'), 'download_allowed': dl}, returning=False)
        deadlines = {'indicative': 9, 'shortlist': 16, 'dataroom': 30, 'final': 44, 'signing': 70} if x['stage'] == 2 else {'indicative': 21, 'shortlist': 28, 'dataroom': 42, 'final': 60, 'signing': 90}
        db.ins(T.sale_processes, {'listing_id': l['id'], 'stage': x['stage'], 'min_ticket': 25000000, 'advisor': x['advisor'], 'stages': [{'key': k, 'label': lb, 'deadline': iso(deadlines[k]) if k in deadlines else None} for k, lb in STAGES]}, returning=False)
        if x['slug'] == 'project-tulip':
            for i, b in enumerate(bidders):
                db.run(pg_insert(T.nda_signatures).values(user_id=b['id'], listing_id=l['id'], signed_name=b['name'], template_version='NDA v1.2 (NL/EN)', ip='seed').on_conflict_do_nothing())
                db.ins(T.offers, {'listing_id': l['id'], 'user_id': b['id'], 'bidder_label': b['company_name'], 'amount': round(price * (0.965 if i else 0.985) / 1e5) * 100000, 'conditions': ['Indicative bid', 'Subject to due diligence'],
                                  'financing_type': 'Cash' if i else 'Mixed', 'status': 'indicative', 'message': 'Indicative, non-binding. Subject to IC approval and confirmatory due diligence.', 'lead_score': 80, 'lead_band': 'Hot'}, returning=False)
            qa = [
                {'listing_id': l['id'], 'category': 'Financial', 'question': 'Can you split the rent roll by city and by regulation segment (social / mid / free)?', 'answer': 'Yes. The rent roll in the Financial folder now has a city column and a WWS segment column per unit. Summary: 20% social, 40% mid-rent, 40% free-sector.', 'answered_by': 'Capital Markets team', 'answered_at': t0 - 6 * DAY, 'created_at': t0 - 7 * DAY},
                {'listing_id': l['id'], 'category': 'Legal', 'question': 'Which complexes are on ground lease, and when are the canon revisions?', 'answer': 'Seven complexes (18% of units), all Amsterdam. Five are converted to perpetual with canon fixed; two have revisions in 2031 and 2034. Details in Legal › Ground lease conditions.', 'answered_by': 'Capital Markets team', 'answered_at': t0 - 4 * DAY, 'created_at': t0 - 5 * DAY},
                {'listing_id': l['id'], 'category': 'Technical', 'question': 'Is there a long-term maintenance plan (MJOP) per complex?', 'answer': 'Yes, MJOPs for all 42 complexes are in Technical › Building inspection 2025, with a 10-year capex total of €31.2m.', 'answered_by': 'Capital Markets team', 'answered_at': t0 - 3 * DAY, 'created_at': t0 - 3 * DAY - timedelta(hours=5)},
                {'listing_id': l['id'], 'category': 'Process', 'question': 'Is the vendor open to a share deal instead of an asset deal?', 'answer': 'The vendor prefers a share deal (SPV with fiscal unity ending at closing). Asset-deal bids are accepted but will be compared on a net basis including transfer tax.', 'answered_by': 'Capital Markets team', 'answered_at': t0 - 2 * DAY, 'created_at': t0 - 2 * DAY - timedelta(hours=3)},
            ]
            db.ins(T.qa_items, qa, returning=False)
            if pro: db.ins(T.qa_items, {'listing_id': l['id'], 'user_id': pro['id'], 'category': 'Financial', 'question': 'What indexation was applied to the free-sector leases in 2025 and 2026?'}, returning=False)
    db.ins(T.automation_log, {'rule': 'system', 'text': 'Private deal rooms added: Project Tulip, Project Delta'}, returning=False)


# Invite-only access for the demo accounts: who sees which properties and features (only people whose access was never set).
ACCESS = [
    ('free@demo.nl', ['rotterdam-zuid', 'utrecht-oost', 'amsterdam-canal-house'], ['map', 'analysis', 'messages']),
    ('verified@demo.nl', ['rotterdam-zuid', 'utrecht-oost', 'eindhoven-collection', 'den-haag-building', 'rotterdam-penthouse', 'wassenaar-villa'], preset('buyer') + ['membership']),
    ('pro@demo.nl', 'all', preset('everything')),
    ('fund@demo.nl', ['project-tulip', 'project-delta', 'rotterdam-zuid', 'eindhoven-collection', 'utrecht-oost'], preset('institution')),
    ('hanseatic@demo.nl', ['project-tulip', 'project-delta'], preset('institution')), ('alnoor@demo.nl', ['project-tulip', 'project-delta'], preset('institution')),
    ('jansen@demo.nl', ['eindhoven-collection', 'rotterdam-zuid'], preset('buyer')), ('brightwater@demo.nl', ['project-tulip'], preset('viewer')), ('oranjewal@demo.nl', ['utrecht-oost', 'den-haag-building'], preset('viewer')),
]


def seed_access():
    from .routers.access import new_invite, set_listings
    users = {u['email']: u for u in db.all_(T.users)}; slugs = {l['slug']: l['id'] for l in db.all_(T.listings)}; admin = users.get('admin@demo.nl'); aid = admin['id'] if admin else None
    # Three kinds of user only: accounts with an earlier staff role (sales, compliance, acquisition, ...) are deactivated,
    # not erased, so their history (messages, decisions, audit log) stays intact.
    for u in users.values():
        if u['role'] in RETIRED_ROLES and not u['deleted_at']:
            db.upd(T.users, T.users.c.id == u['id'], {'deleted_at': now(), 'status': 'suspended'}); db.run(T.sessions.delete().where(T.sessions.c.user_id == u['id']))
    if 'developer@demo.nl' not in users:
        db.ins(T.users, {'email': 'developer@demo.nl', 'name': 'Dev Patel', 'password_hash': hash_password(DEMO_PASSWORD), 'role': 'developer', 'twofa_enabled': True, 'twofa_secret': new_totp_secret(), 'access_updated_at': now()}, returning=False)
    for email, listings, features in ACCESS:
        u = users.get(email)
        if not u or u['access_updated_at']: continue
        db.upd(T.users, T.users.c.id == u['id'], {'listing_scope': 'all' if listings == 'all' else 'selected', 'features': features, 'access_updated_at': now(), 'invited_by': aid})
        if listings != 'all': set_listings(u['id'], [slugs[s] for s in listings if s in slugs], aid)
    if 'pieter@demo.nl' not in users:  # an invitation that is still waiting, with a known demo link: /invite/demo-invite-pieter
        u = db.ins(T.users, {'email': 'pieter@demo.nl', 'name': 'Pieter de Vries', 'company_name': 'Oranje Woonfonds', 'investor_type': 'Fund', 'status': 'invited', 'password_hash': 'invited$demo', 'listing_scope': 'selected',
                             'features': preset('buyer'), 'invited_by': aid, 'access_updated_at': now(), 'account_manager': 'Ada Admin'})
        set_listings(u['id'], [slugs[s] for s in ['rotterdam-zuid', 'utrecht-oost', 'eindhoven-collection'] if s in slugs], aid)
        new_invite(u['id'], aid, 30, 'As discussed on the phone: three residential assets that fit your Randstad mandate.', DEMO_INVITE_TOKEN)
    if not db.get(T.enquiries, kind='access'):
        t0 = now()
        db.ins(T.enquiries, [
            {'kind': 'access', 'name': 'Lena Hoffmann', 'email': 'l.hoffmann@example.de', 'message': 'Rheinland Wohnkapital GmbH · Fund · Wants to invest · Ticket €20–60m · Looking for mid-rent portfolios in Utrecht and Rotterdam.', 'lead_band': 'Investor', 'created_at': t0 - 2 * DAY},
            {'kind': 'access', 'name': 'Joost Bakker', 'email': 'joost@example.nl', 'message': 'Bakker Beheer BV · Private BV · Invest and sell · Owns 22 homes in Haarlem; open to selling part and reinvesting.', 'lead_band': 'Seller', 'created_at': t0 - timedelta(hours=5)}], returning=False)


def seed_all():
    seed_if_empty(); seed_messages(); seed_institutional(); seed_access()


if __name__ == '__main__':
    import shutil
    if '--reset' in sys.argv:
        shutil.rmtree(db.DATA_DIR / 'pg', ignore_errors=True); print('Removed old demo data.')
    db.engine()
    if not seed_if_empty(): print('Database already has data. Use --reset to start over.')
    db.close()
