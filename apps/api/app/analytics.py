"""Institutional analytics: valuation and comparables, Dutch rent regulation (WWS), ESG, due-diligence flags, scenarios and
mandate fit. Pure functions, no database access, so every number the AI analyst quotes comes from here and is testable.
Market benchmarks and comparables below are fictional demo data; production plugs in a transaction-data provider."""
from __future__ import annotations
import math, re
from datetime import datetime
from .domain import cfg, js_round

# ---------- Market benchmarks (demo) ----------
MARKET = {
    'Amsterdam': {'bar': 4.3, 'perM2': 7400, 'rentM2': 27.5, 'growth': 3.1, 'vacancy': 1.2}, 'Utrecht': {'bar': 4.9, 'perM2': 5600, 'rentM2': 22.8, 'growth': 3.4, 'vacancy': 1.5},
    'Rotterdam': {'bar': 5.6, 'perM2': 4200, 'rentM2': 19.6, 'growth': 3.6, 'vacancy': 2.1}, 'Den Haag': {'bar': 5.3, 'perM2': 4700, 'rentM2': 20.4, 'growth': 3.0, 'vacancy': 1.8},
    'Eindhoven': {'bar': 5.8, 'perM2': 4100, 'rentM2': 18.9, 'growth': 3.3, 'vacancy': 2.0}, 'Haarlem': {'bar': 4.8, 'perM2': 6200, 'rentM2': 23.1, 'growth': 2.9, 'vacancy': 1.3},
    'Wassenaar': {'bar': 3.8, 'perM2': 6900, 'rentM2': 21.0, 'growth': 2.4, 'vacancy': 1.0},
}
MARKET_ASOF = 'Q3 2026 (demo benchmarks)'


def _mk(c: str) -> dict:
    return MARKET.get(c) or {'bar': 5.4, 'perM2': 4300, 'rentM2': 19, 'growth': 3, 'vacancy': 2}


# Fictional comparable transactions, labelled as such everywhere they appear.
COMPS = [
    {'city': 'Amsterdam', 'name': 'Nieuw-West residential block', 'units': 64, 'price': 21400000, 'bar': 4.5, 'label': 'B', 'date': '2026-06', 'buyer': 'Dutch pension fund'},
    {'city': 'Amsterdam', 'name': 'Oost mid-rent portfolio', 'units': 118, 'price': 39800000, 'bar': 4.4, 'label': 'A', 'date': '2026-03', 'buyer': 'German insurer'},
    {'city': 'Utrecht', 'name': 'Leidsche Rijn BTR scheme', 'units': 210, 'price': 71200000, 'bar': 4.8, 'label': 'A', 'date': '2026-05', 'buyer': 'Nordic fund'},
    {'city': 'Utrecht', 'name': 'Zuilen apartment building', 'units': 26, 'price': 6900000, 'bar': 5.2, 'label': 'C', 'date': '2025-12', 'buyer': 'Family office'},
    {'city': 'Rotterdam', 'name': 'Kralingen residential portfolio', 'units': 96, 'price': 24100000, 'bar': 5.5, 'label': 'C', 'date': '2026-04', 'buyer': 'UK fund'},
    {'city': 'Rotterdam', 'name': 'Feijenoord mixed portfolio', 'units': 152, 'price': 33600000, 'bar': 6.0, 'label': 'D', 'date': '2025-11', 'buyer': 'Private equity'},
    {'city': 'Den Haag', 'name': 'Statenkwartier apartments', 'units': 31, 'price': 9100000, 'bar': 5.1, 'label': 'C', 'date': '2026-02', 'buyer': 'Family office'},
    {'city': 'Eindhoven', 'name': 'Strijp-S rental tower', 'units': 180, 'price': 48500000, 'bar': 5.6, 'label': 'A', 'date': '2026-07', 'buyer': 'Dutch insurer'},
    {'city': 'Haarlem', 'name': 'Schalkwijk residential estate', 'units': 74, 'price': 19800000, 'bar': 5.0, 'label': 'B', 'date': '2026-01', 'buyer': 'Housing fund'},
    {'city': 'Randstad', 'name': 'Multi-city residential portfolio (1,050 units)', 'units': 1050, 'price': 342000000, 'bar': 5.2, 'label': 'B', 'date': '2026-05', 'buyer': 'Global asset manager'},
]


def r0(n): return js_round(n)
def r1(n): return js_round(n * 10) / 10
def r2(n): return js_round(n * 100) / 100


def _num(x):  # keep JSON tidy: 5.0 -> 5
    return int(x) if isinstance(x, float) and x.is_integer() else x


# ---------- Automated valuation ----------
def valuation(l: dict, p: dict, units_count: int) -> dict:
    m0 = _mk(p['city']); big = units_count > 100
    # Large portfolios trade at a yield premium (+40 bp) and below single-asset prices per m² (multi-city, mixed stock).
    m = {**m0, 'bar': r2(m0['bar'] + 0.4 if big else m0['bar']), 'perM2': js_round(m0['perM2'] * (0.82 if big else 0.93 if units_count > 40 else 1))}
    label_adj = {'A': 1.06, 'B': 1.03, 'C': 1, 'D': 0.96, 'E': 0.92, 'F': 0.89, 'G': 0.86}.get(p['energyLabel'], 1)
    income = l['grossRentAnnual'] / (m['bar'] / 100) if l.get('grossRentAnnual') else 0
    comparison = p['areaM2'] * m['perM2'] * label_adj; w_income = 0.8 if big else 0.7
    point = income * w_income + comparison * (1 - w_income) if income else comparison
    low, high = point * 0.94, point * 1.06; vs = (l['askingPrice'] - point) / point * 100
    pi, pc = js_round(w_income * 100), js_round(100 - w_income * 100)
    return {'point': r0(point / 1e4) * 10000, 'low': r0(low / 1e4) * 10000, 'high': r0(high / 1e4) * 10000, 'income': r0(income), 'comparison': r0(comparison), 'marketBar': _num(m['bar']), 'marketPerM2': m['perM2'],
            'vsAsking': _num(r1(vs)), 'verdict': 'Above the estimated range' if vs > 6 else 'Below the estimated range' if vs < -6 else 'Within the estimated range',
            'method': (f"{pi}% income approach (rent ÷ market BAR{' + 40 bp portfolio premium' if big else ''}) + {pc}% comparison approach (m² × market price, energy-label adjusted)" if income else 'Comparison approach (m² × market price, energy-label adjusted)'),
            'asOf': MARKET_ASOF}


def comparables(p: dict, units_count: int) -> list[dict]:
    big = units_count >= 200; pool = [c for c in COMPS if c['city'] == p['city'] or (big and c['units'] >= 150)]
    return [{**c, 'perUnit': r0(c['price'] / c['units'])} for c in (pool or COMPS)[:5]]


# ---------- Dutch rent regulation: WWS points (Wet betaalbare huur, 2024) ----------
ENERGY_PTS = {'A': 37, 'B': 33, 'C': 22, 'D': 14, 'E': 8, 'F': 4, 'G': 0}


def wws_points(u: dict, unit_woz: float) -> int:
    """Indicative WWS points for one unit. A real assessment needs a points survey per unit (kitchen, sanitary, outdoor space)."""
    area = u['areaM2']; energy = ENERGY_PTS.get(u.get('energyLabel') or 'C', 22); fixtures = 34
    woz = unit_woz / 14543 + (unit_woz / max(1, area)) / 229; base = area + energy + fixtures
    woz = min(woz, (base + woz) * 0.33)  # WOZ points capped at a third of the total
    return r0(base + woz)


def rent_regulation(units: list[dict], p: dict, c: dict) -> dict:
    social_pts, mid_pts, per_pt = cfg(c, 'wws_social_points'), cfg(c, 'wws_mid_points'), cfg(c, 'wws_rent_per_point')
    total_area = sum(u['areaM2'] for u in units) or 1
    now = after = 0; seg = {'social': 0, 'mid': 0, 'free': 0}; rws = []
    for u in units:
        woz = (p.get('wozValue') or 0) * u['areaM2'] / total_area; pts = wws_points(u, woz)
        segment = 'social' if pts <= social_pts else 'mid' if pts <= mid_pts else 'free'; seg[segment] += 1
        cap = None if segment == 'free' else r0(pts * per_pt); rent = 0 if u['occupancy'] == 'vacant' else u['rentMonthly']
        capped = cap if cap is not None and rent > cap else rent; now += rent * 12; after += capped * 12
        rws.append({'ref': u['ref'], 'areaM2': u['areaM2'], 'label': u.get('energyLabel'), 'points': pts, 'segment': segment, 'rent': rent, 'maxRent': cap, 'excess': max(0, rent - capped)})
    loss = now - after
    return {'units': len(units), 'segments': seg, 'rentNow': r0(now), 'rentAfter': r0(after), 'annualLoss': r0(loss), 'lossPct': _num(r1(loss / now * 100)) if now else 0,
            'affected': len([r for r in rws if r['excess'] > 0]), 'worst': sorted(rws, key=lambda r: -r['excess'])[:8],
            'thresholds': {'socialPts': social_pts, 'midPts': mid_pts, 'perPt': per_pt, 'socialMax': r0(social_pts * per_pt), 'midMax': r0(mid_pts * per_pt)},
            'note': 'Indicative points estimate (area, energy label, WOZ, standard fixtures). Mid-rent caps apply to new leases; social-rent tenants can ask the Huurcommissie for a reduction. Thresholds come from the config table and change every 1 July.'}


# ---------- ESG ----------
KWH = {'A': 105, 'B': 150, 'C': 190, 'D': 240, 'E': 290, 'F': 340, 'G': 400}


def esg(units: list[dict], p: dict) -> dict:
    lst = units or [{'ref': '1', 'areaM2': p['areaM2'], 'rentMonthly': 0, 'rentType': 'none', 'energyLabel': p['energyLabel'], 'occupancy': 'let'}]
    area = sum(u['areaM2'] for u in lst) or 1; dist: dict[str, int] = {}
    kwh = capex = a_or_b = 0
    nzeb = p['buildYear'] >= 2021  # new builds (BENG/NZEB) sit well below the label-A average
    for u in lst:
        lb = u.get('energyLabel') or p['energyLabel']; dist[lb] = dist.get(lb, 0) + 1
        kwh += (55 if nzeb and lb == 'A' else KWH.get(lb, 200)) * u['areaM2']
        steps = max(0, 'ABCDEFG'.find(lb) - 1); capex += steps * 65 * u['areaM2']
        if lb in 'AB': a_or_b += u['areaM2']
    intensity = kwh / area; co2 = intensity * 0.21; new_build = p['buildYear'] >= 2021
    taxonomy = intensity <= 95 if new_build else (a_or_b / area >= 0.99 and dist.get('A', 0) / len(lst) >= 0.85)
    return {'unitLevel': len(units) > 0, 'distribution': [{'label': k, 'units': dist[k]} for k in 'ABCDEFG' if dist.get(k)], 'energyIntensity': r0(intensity), 'co2PerM2': _num(r1(co2)), 'co2Total': r0(co2 * area / 1000),
            'upgradeCapexToB': r0(capex / 1000) * 1000, 'upgradeCapexPerUnit': r0(capex / len(lst)), 'shareAorB': r0(a_or_b / area * 100), 'taxonomyAligned': taxonomy,
            'sfdrInefficientShare': 0 if new_build else r0((1 - a_or_b / area) * 100),
            'note': 'Energy intensity and CO₂ are estimated from the energy labels (gas-heated stock). EU Taxonomy test: label A for pre-2021 buildings, NZEB −10% for newer. Capex assumes about €65 per m² per label step up to label B.'}


# ---------- Due-diligence red flags ----------
def _en(n: float) -> str:
    return f'{n:,.0f}'


def dd_flags(l: dict, p: dict, units: list[dict], reg: dict | None = None) -> list[dict]:
    f = []; year = datetime.now().year; n = len(units) or 1
    add = lambda level, title, detail, source: f.append({'level': level, 'title': title, 'detail': detail, 'source': source})
    if p['buildYear'] > year: add('medium', 'Forward funding: delivery and lease-up risk', f"Completion expected in {p['buildYear']}. Check the developer guarantee, fixed-price construction contract, penalty clauses and the lease-up assumption.", 'Legal › Turnkey agreement (forward funding)')
    if p['buildYear'] < 1994 and p['buildYear'] <= year: add('medium', 'Built before 1994: asbestos inventory needed', f"Build year {p['buildYear']}. Budget for an asbestos survey and possible removal before renovation.", 'Technical › Asbestos inventory')
    if re.search(r'erfpacht|ground lease', p['tenure'], re.I): add('low' if re.search(r'perpetual|prepaid|eeuwigdurend', p['tenure'], re.I) else 'medium', 'Ground lease (erfpacht)', f"{p['tenure']}. Check the canon revision date and the conditions for conversion to perpetual.", 'Legal › Ground lease conditions')
    vacant = len([u for u in units if u['occupancy'] == 'vacant'])
    if units and vacant / n > 0.03 and p['buildYear'] <= year: add('medium', f'Vacancy {_num(r1(vacant / n * 100))}%', f'{vacant} of {n} units vacant in the rent roll. Check letting history and reasons.', 'Financial › Rent roll')
    poor = len([u for u in units if (u.get('energyLabel') or p['energyLabel']) in 'EFG'])
    if poor: add('high' if poor / n > 0.2 else 'medium', f"{poor} unit{'' if poor == 1 else 's'} with energy label E–G", 'Lower WWS points, higher capex and weaker ESG reporting. Plan sustainability works.', 'Technical › Energy labels per unit')
    if reg and reg['lossPct'] > 2: add('high' if reg['lossPct'] > 8 else 'medium', f"Rent regulation: {reg['lossPct']}% of rent above the points cap", f"{reg['affected']} units rent above their indicative WWS maximum. Exposure: €{_en(reg['annualLoss'])} a year at re-letting or on tenant request.", 'Financial › Rent roll + WWS points estimate')
    age = year - p['buildYear']
    if age > 40: add('medium' if age > 80 else 'low', 'Major maintenance cycle', f"Average building age {age} years. Expect roofs, façades and installations within the MJOP horizon; estimate ~€{38 if age > 80 else 28} per m² a year.", 'Technical › Building inspection 2025')
    rent = l.get('grossRentAnnual') or 0
    opex_share = ((l.get('operatingCostsAnnual') if l.get('operatingCostsAnnual') is not None else rent * 0.22) / rent) if rent else 0
    if opex_share > 0.25: add('low', f'Operating costs {r0(opex_share * 100)}% of rent', 'Above the 20–24% typical for Dutch residential. Review the service-cost statement and management fees.', 'Financial › Service-cost statement 2025')
    if l.get('occupancy') and l['occupancy'] >= 97: add('positive', f"Occupancy {l['occupancy']}%", 'Stable income profile.', 'Financial › Rent roll')
    if p['energyLabel'] in 'AB': add('positive', f"Energy label {p['energyLabel']}", 'Strong points position and lower capex need.', 'Technical › Energy labels per unit')
    if re.search(r'^freehold|eigen grond|mostly freehold', p['tenure'], re.I): add('positive', 'Mostly freehold' if re.match(r'mostly', p['tenure'], re.I) else 'Freehold', 'No ground-lease canon (or only a small share of the stock).', 'Legal › Kadaster ownership extract')
    order = {'high': 0, 'medium': 1, 'low': 2, 'positive': 3}
    return sorted(f, key=lambda x: order[x['level']])


# ---------- Scenario and stress testing ----------
def irr(flows: list[float]):
    def npv(r): return sum(v / (1 + r) ** i for i, v in enumerate(flows))
    lo, hi = -0.99, 1.0
    if npv(lo) * npv(hi) > 0: return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2


def _g(s: dict, k: str, d):
    v = s.get(k); return d if v is None else v


def scenario(s: dict) -> dict:
    opex = _g(s, 'opexPct', 22); vac = _g(s, 'vacancy', 3); ltv = _g(s, 'ltv', 50); rate = _g(s, 'interest', 4); g = _g(s, 'rentGrowth', 2.5)
    years = max(1, min(20, js_round(_g(s, 'years', 10)))); costs = _g(s, 'costsPct', 9)
    noi1 = s['rent'] * (1 - vac / 100) * (1 - opex / 100); entry = noi1 / s['price'] * 100 if s['price'] else 0
    exit_y = s.get('exitYield') if s.get('exitYield') is not None else r2(entry or 4)
    loan = s['price'] * ltv / 100; equity = s['price'] * (1 + costs / 100) - loan; debt = loan * rate / 100
    noi = [noi1 * (1 + g / 100) ** (t - 1) for t in range(1, years + 2)]
    cash = [noi[t] - debt for t in range(years)]
    exit_value = noi[years] / (exit_y / 100) * (1 - 0.015) if exit_y > 0 else 0; proceeds = exit_value - loan
    lev = irr([-equity, *cash[:-1], cash[years - 1] + proceeds]); unlev = irr([-s['price'] * (1 + costs / 100), *noi[:years - 1], noi[years - 1] + exit_value])
    total_in = sum(cash) + proceeds
    return {'inputs': {'opexPct': opex, 'vacancy': vac, 'ltv': ltv, 'interest': _num(rate), 'rentGrowth': _num(g), 'exitYield': _num(exit_y), 'years': years, 'costsPct': _num(costs)}, 'equity': r0(equity), 'loan': r0(loan), 'noiYear1': r0(noi1), 'entryNiy': _num(r2(entry)),
            'cashYear1': r0(cash[0]), 'cocYear1': _num(r2(cash[0] / equity * 100)) if equity else 0, 'dscr': _num(r2(noi1 / debt)) if debt else None, 'exitValue': r0(exit_value),
            'leveredIrr': None if lev is None else _num(r2(lev * 100)), 'unleveredIrr': None if unlev is None else _num(r2(unlev * 100)), 'equityMultiple': _num(r2(total_in / equity)) if equity else None, 'cashFlows': [r0(x) for x in cash]}


def stress_tests(base: dict, regulated_rent=None) -> list[dict]:
    """Standard stress set an investment committee asks for. `regulated_rent` (WWS-capped) adds a regulation case."""
    b = scenario(base); ey = b['inputs']['exitYield']; i0 = _g(base, 'interest', 4)
    cases = [['Base case', 'Your inputs', base],
             ['Rates +200 bp', 'Refinancing at higher interest', {**base, 'interest': i0 + 2}],
             ['Exit yield +100 bp', 'Weaker market at sale', {**base, 'exitYield': ey + 1}],
             ['Rent freeze + 8% vacancy', 'No indexation, weaker letting', {**base, 'rentGrowth': 0, 'vacancy': 8}]]
    if regulated_rent and regulated_rent < base['rent']: cases.append(['WWS cap applied', 'All units at their indicative points maximum', {**base, 'rent': regulated_rent}])
    cases.append(['Combined downside', 'Rates +200 bp, exit +100 bp, rent freeze', {**base, 'interest': i0 + 2, 'exitYield': ey + 1, 'rentGrowth': 0, 'vacancy': 6}])
    out = []
    for name, detail, s in cases:
        r = scenario(s); out.append({'name': name, 'detail': detail, 'leveredIrr': r['leveredIrr'], 'unleveredIrr': r['unleveredIrr'], 'cocYear1': r['cocYear1'], 'dscr': r['dscr'], 'equityMultiple': r['equityMultiple'], 'exitValue': r['exitValue']})
    return out


# ---------- Mandate (buy box) fit ----------
def mandate_fit(x: dict, box: dict | None) -> dict:
    if not box: return {'score': 0, 'reasons': []}
    reasons = []; pts = mx = 0
    def add(w, ok, txt):
        nonlocal pts, mx
        mx += w; pts += w if ok else 0; reasons.append({'ok': ok, 'text': txt})
    regions, types = box.get('regions') or [], box.get('types') or []
    if regions: add(25, x['city'] in regions, f"In your region ({x['city']})" if x['city'] in regions else f"Outside your regions ({x['city']})")
    if types: add(20, x['category'] in types, 'Matches your property types' if x['category'] in types else 'Different property type')
    tmin, tmax = box.get('ticketMin'), box.get('ticketMax')
    if tmin or tmax:
        ok = (not tmin or x['askingPrice'] >= tmin) and (not tmax or x['askingPrice'] <= tmax)
        add(30, ok, 'Within your ticket size' if ok else 'Above your maximum ticket' if x['askingPrice'] > (tmax or math.inf) else 'Below your minimum ticket')
    if box.get('targetBar'): add(15, x['bar'] >= box['targetBar'], f"BAR {x['bar']:.2f}% vs your target {_num(box['targetBar'])}%" if x['bar'] else 'No rental income')
    ok = x['energyLabel'] in 'ABC'
    add(10, ok, f"Energy label {x['energyLabel']}" if ok else f"Energy label {x['energyLabel']}: capex needed")
    return {'score': r0(pts / mx * 100) if mx else 0, 'reasons': reasons}
