"""Builds the analysis pack for one listing, applying the same access rules as the rest of the API:
- invited people with the analysis feature: valuation, comparables, property-level ESG and risk flags, scenarios;
- verified investors with the property NDA (or staff): unit-level rent regulation, ESG and red flags from the rent roll.
The AI analyst only ever sees this pack, so it can never reveal more than the viewer may see."""
from __future__ import annotations
from .. import db
from ..db import T
from ..analytics import valuation, comparables, esg, dd_flags, rent_regulation, stress_tests, scenario
from ..common import get_config
from ..domain import acquisition, can_details, can_see_listing, is_staff, js_round, off_market_state
from .listings import get_listing, has_nda, unit_counts


def unit_access(v: dict | None, listing_id: str) -> bool:
    return is_staff(v) or (bool(v and v.get('verified')) and has_nda(v.get('id'), listing_id))


def analysis_pack(slug: str, v: dict | None) -> dict:
    x = get_listing(slug)
    if not x or not can_see_listing(v, x['l']['id']) or x['l']['status'] in ['draft', 'withdrawn']: return {'status': 404}
    l, p = x['l'], x['p']
    if off_market_state(l['deal_type'], l['pro_early_access_until'], v) != 'open': return {'status': 403, 'message': 'This deal is not open to you.'}
    if not can_details(v): return {'status': 401, 'message': 'Join free to see the analysis.'}
    c = get_config(); n = unit_counts([p['id']]).get(p['id'], 1)
    deep = unit_access(v, l['id'])
    units = [{'ref': u['ref'], 'areaM2': u['area_m2'], 'rentMonthly': u['rent_monthly'], 'rentType': u['rent_type'], 'energyLabel': u['energy_label'], 'occupancy': u['occupancy']}
             for u in db.all_(T.units, T.units.c.property_id == p['id'])] if deep else []
    P = {'city': p['city'], 'areaM2': p['area_m2'], 'buildYear': p['build_year'], 'energyLabel': p['energy_label'], 'tenure': p['tenure'], 'wozValue': p['woz_value'], 'category': p['category'], 'district': p['district']}
    L = {'askingPrice': l['asking_price'], 'grossRentAnnual': l['gross_rent_annual'], 'operatingCostsAnnual': l['operating_costs_annual'], 'occupancy': l['occupancy'], 'dealType': l['deal_type']}
    reg = rent_regulation(units, P, c) if deep and l['gross_rent_annual'] else None
    acq = acquisition(l['asking_price'], c); costs_pct = js_round((acq['total'] / l['asking_price'] - 1) * 1000) / 10
    rent = l['gross_rent_annual']
    base = {'price': l['asking_price'], 'rent': rent, 'opexPct': js_round((l['operating_costs_annual'] if l['operating_costs_annual'] is not None else rent * 0.22) / rent * 100) if rent else 22,
            'vacancy': 3, 'ltv': 40 if n >= 100 else 55, 'interest': 4, 'rentGrowth': 2.5, 'years': 10, 'costsPct': int(costs_pct) if float(costs_pct).is_integer() else costs_pct}
    pack = {
        'listing': {'slug': l['slug'], 'name': l['name'], 'city': p['city'], 'district': p['district'], 'propertyType': p['property_type'], 'dealType': l['deal_type'], 'status': l['status'], 'units': n,
                    'areaM2': p['area_m2'], 'buildYear': p['build_year'], 'energyLabel': p['energy_label'], 'tenure': p['tenure'], 'askingPrice': l['asking_price'], 'grossRentAnnual': rent,
                    'operatingCostsAnnual': l['operating_costs_annual'], 'occupancy': l['occupancy'], 'bar': js_round(rent / l['asking_price'] * 10000) / 100 if rent else None, 'wozValue': p['woz_value']},
        'acquisition': acq,
        'valuation': valuation(L, P, n), 'comparables': comparables(P, n), 'esg': esg(units, P), 'flags': dd_flags(L, P, units, reg), 'regulation': reg,
        'scenarioBase': scenario(base) if rent else None, 'stress': stress_tests(base, reg['rentAfter'] if reg else None) if rent else [], 'scenarioInputs': base,
        'access': 'unit-level (rent roll)' if deep else 'property-level (verify and sign the NDA for the rent roll)',
    }
    return {'status': 200, 'l': l, 'p': p, 'unitsCount': n, 'deep': deep, 'pack': pack}
