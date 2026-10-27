"""Business rules and calculators (pure functions)."""
from datetime import datetime, timezone
import time
from app.domain import (FEATURE_KEYS, acquisition, alert_frequency, bag_lookup, can_details, can_offer, can_see_listing, deal_score, features_of, figures, finance,
                        has_feature, is_qualified, is_staff, kyc_risk, lead_score, matches_search, max_price, new_totp_secret, off_market_state, price_band, tier_of, totp, verify_totp)
from app.analytics import dd_flags, esg, irr, mandate_fit, rent_regulation, scenario, stress_tests, valuation, wws_points


def test_tiers():
    assert tier_of(None) == 'visitor' and tier_of({'id': 'a'}) == 'free' and tier_of({'id': 'a', 'verified': True}) == 'verified' and tier_of({'id': 'a', 'verified': True, 'pro': True}) == 'pro'
    assert tier_of({'id': 'a', 'pro': True}) == 'free', 'Pro without verification is not Pro'
    assert can_details(None) is False and can_details({'id': 'a'}) is True and can_offer({'id': 'a'}) is False and can_offer({'id': 'a', 'verified': True}) is True
    assert is_staff({'id': 's', 'role': 'compliance'}) and not is_staff({'id': 'i', 'role': 'investor'}) and can_details({'id': 's', 'role': 'admin'})
    assert [alert_frequency(v) for v in [None, {'id': 'a'}, {'id': 'a', 'verified': True}, {'id': 'a', 'verified': True, 'pro': True}]] == [None, 'weekly', 'daily', 'instant']


def test_off_market():
    until = datetime(2026, 10, 26, 9, tzinfo=timezone.utc); before = until.timestamp() * 1000 - 1; after = until.timestamp() * 1000 + 1
    assert off_market_state('off_market', until, None, before) == 'locked' and off_market_state('off_market', until, {'id': 'a'}, before) == 'locked'
    assert off_market_state('off_market', until, {'id': 'a', 'verified': True}, before) == 'pro-window' and off_market_state('off_market', until, {'id': 'a', 'verified': True}, after) == 'open'
    assert off_market_state('off_market', until, {'id': 'a', 'verified': True, 'pro': True}, before) == 'open' and off_market_state('off_market', until, {'id': 's', 'role': 'sales'}, before) == 'open'
    assert off_market_state('direct', None, None) == 'open'


def test_price_band():
    assert price_band(4260000) == '€4–4.5m' and price_band(1650000) == '€1.5–1.75m' and price_band(2950000, True) == 'Price on request' and price_band(298500000) == '€250–300m'


def test_figures_and_acquisition():
    f = figures({'askingPrice': 4260000, 'grossRentAnnual': 255600, 'operatingCostsAnnual': 56200, 'areaM2': 1788, 'unitsCount': 24}, {})
    assert abs(f['bar'] - 6) < 1e-9 and abs(f['nar'] - (255600 - 56200) / (4260000 * 1.09) * 100) < 1e-9
    assert acquisition(1e6, {'transfer_tax_residential_investor': 10.4})['taxRate'] == 10.4 and acquisition(1e6, {}, own_home=True, homes=True)['taxRate'] == 2
    assert acquisition(1e6, {}, own_home=True, homes=False)['taxRate'] == 8 and acquisition(1e6, {'buyer_fee': 1})['fee'] == 10000


def test_finance():
    f = finance(1e6, 1e5, ltv=60, interest=4, expense=20, vacancy=10)
    assert round(f['net']) == 72000 and round(f['cash']) == 48000 and round(f['equity']) == 490000 and round(f['dscr'], 9) == 3 and finance(1e6, 1e5, ltv=0)['dscr'] == 0 and max_price(1e6, 60) > 2e6


def test_scores():
    s = deal_score({'askingPrice': 7240000, 'grossRentAnnual': 456120, 'energyLabel': 'A', 'demand': 14, 'occupancy': 97, 'areaM2': 2690, 'buildYear': 2008})
    assert 0 <= s['total'] <= 100 and len(s['parts']) == 4
    assert deal_score({'askingPrice': 1e6, 'grossRentAnnual': 0, 'energyLabel': 'Z', 'areaM2': 100, 'buildYear': 1900})['parts'][1][1] == 50
    assert lead_score('offer', True, amount=1e6, asking_price=1e6)['band'] == 'Hot' and lead_score('question', False)['band'] == 'Cold' and lead_score('viewing', True, message='x' * 90)['band'] == 'Warm'


def test_kyc_risk():
    assert kyc_risk() == 'low' and kyc_risk('Fund', 'GB') == 'medium' and kyc_risk('Fund', 'AE', 2e7) == 'high' and kyc_risk(pep=True) == 'medium' and kyc_risk(pep=True, country='US') == 'high'


def test_bag_lookup():
    assert bag_lookup('bad', '1') is None and bag_lookup('3011AB', '') is None
    a = bag_lookup('3011 ab', '12'); assert a['city'] == 'Rotterdam' and bag_lookup('3011AB', '12') == a


def test_matching():
    l = {'city': 'Rotterdam', 'category': 'portfolios', 'askingPrice': 4260000, 'grossRentAnnual': 255600, 'dealType': 'portfolio', 'status': 'available'}
    assert matches_search(l, {'city': 'Rotterdam', 'budget': 5e6, 'minYield': 5}) and not matches_search(l, {'city': 'Utrecht'}) and not matches_search(l, {'budget': 4e6})
    assert not matches_search({**l, 'status': 'under_offer'}, {}) and not matches_search(l, {'regions': ['Utrecht']})
    assert matches_search(l, {'regions': ['Rotterdam'], 'types': ['portfolios'], 'ticketMin': 1e6, 'ticketMax': 5e6, 'targetBar': 5.5}) and not matches_search(l, {'targetBar': 7})


def test_qualified():
    assert is_qualified({'id': 'a', 'verified': True, 'investorType': 'Pension fund'}) and not is_qualified({'id': 'a', 'verified': False, 'investorType': 'Fund'})
    assert not is_qualified({'id': 'a', 'verified': True, 'investorType': 'Private BV'}) and off_market_state('institutional', None, {'id': 's', 'role': 'sales'}) == 'open' and off_market_state('institutional', None, None) == 'locked'


def test_irr_and_scenarios():
    assert abs(irr([-100, 10, 110]) - 0.1) < 1e-6 and irr([100, 10]) is None
    base = {'price': 1e7, 'rent': 6e5, 'ltv': 50, 'interest': 4}; b = scenario(base)
    assert scenario({**base, 'interest': 6})['leveredIrr'] < b['leveredIrr'] and scenario({**base, 'exitYield': b['inputs']['exitYield'] + 1})['leveredIrr'] < b['leveredIrr']
    assert scenario({**base, 'ltv': 0})['dscr'] is None
    st = stress_tests(base, 5e5); assert len(st) == 6 and next(s for s in st if s['name'] == 'WWS cap applied')['leveredIrr'] < b['leveredIrr']


def test_wws():
    u = lambda a, label, rent: {'ref': '1', 'areaM2': a, 'rentMonthly': rent, 'rentType': 'mid', 'energyLabel': label, 'occupancy': 'let'}
    assert wws_points(u(80, 'A', 0), 300000) > wws_points(u(50, 'F', 0), 300000)
    p = {'city': 'Utrecht', 'areaM2': 100, 'buildYear': 1970, 'energyLabel': 'D', 'tenure': 'Freehold', 'wozValue': 250000, 'category': 'buildings'}
    r = rent_regulation([u(50, 'E', 1600), u(50, 'E', 600)], p, {}); assert r['affected'] == 1 and r['annualLoss'] > 0 and r['rentAfter'] < r['rentNow']
    assert rent_regulation([u(140, 'A', 2400)], {**p, 'wozValue': 900000}, {})['segments']['free'] == 1


def test_esg_valuation_flags_mandate():
    p = {'city': 'Rotterdam', 'areaM2': 1000, 'buildYear': 1936, 'energyLabel': 'C', 'tenure': 'Ground lease (erfpacht)', 'wozValue': 4e6, 'category': 'portfolios'}
    e = esg([], p); assert e['taxonomyAligned'] is False and e['upgradeCapexToB'] > 0 and esg([], {**p, 'energyLabel': 'A', 'buildYear': 1990})['taxonomyAligned'] is True
    l = {'askingPrice': 4e6, 'grossRentAnnual': 24e4, 'operatingCostsAnnual': 5e4, 'occupancy': 96, 'dealType': 'portfolio'}; v = valuation(l, p, 20); assert v['low'] < v['point'] < v['high']
    f = dd_flags(l, p, []); assert any('asbestos' in x['title'] for x in f) and any('Ground lease' in x['title'] for x in f)
    assert any('Forward funding' in x['title'] for x in dd_flags(l, {**p, 'buildYear': 2099}, []))
    assert mandate_fit({'city': 'Rotterdam', 'category': 'portfolios', 'askingPrice': 4e6, 'bar': 6, 'energyLabel': 'C', 'dealType': 'portfolio'}, {'regions': ['Rotterdam'], 'types': ['portfolios'], 'ticketMin': 1e6, 'ticketMax': 5e6, 'targetBar': 5})['score'] == 100
    assert mandate_fit({'city': 'Amsterdam', 'category': 'homes', 'askingPrice': 9e6, 'bar': 0, 'energyLabel': 'F', 'dealType': 'direct'}, {'regions': ['Rotterdam'], 'ticketMax': 5e6})['score'] < 20
    assert mandate_fit({'city': 'x', 'category': 'x', 'askingPrice': 1, 'bar': 0, 'energyLabel': 'A', 'dealType': 'direct'}, None)['score'] == 0


def test_totp():
    rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; assert totp(rfc, 59000) == '287082' and totp(rfc, 1111111109000) == '081804'
    s = new_totp_secret(); now = time.time() * 1000; assert verify_totp(s, totp(s, now - 30000), now) and not verify_totp(s, totp(s, now - 120000), now)


def test_invite_only_access():
    assert not can_see_listing(None, 'L1') and can_see_listing({'id': 'a', 'role': 'admin'}, 'L1') and can_see_listing({'id': 'd', 'role': 'developer'}, 'L1')
    inv = {'id': 'u', 'role': 'investor', 'listingScope': 'selected', 'listingIds': ['L1', 'L2', 'L3'], 'features': ['map']}
    assert can_see_listing(inv, 'L2') and not can_see_listing(inv, 'L4') and can_see_listing({**inv, 'listingScope': 'all'}, 'L4')
    assert has_feature(inv, 'map') and not has_feature(inv, 'analyst') and not has_feature(None, 'map') and has_feature({'id': 's', 'role': 'sales'}, 'analyst')
    assert features_of({**inv, 'features': ['bogus', 'map']}) == ['map'] and features_of({'id': 'a', 'role': 'admin'}) == FEATURE_KEYS
