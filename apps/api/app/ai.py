"""AI investment analyst.
- With ANTHROPIC_API_KEY set: Claude answers from the viewer's analysis pack only, cites sources [S1].., and runs scenarios
  through a tool, so every figure comes from the server's calculators (never from the model's memory).
- Without a key (demo default): a built-in analyst engine answers the common investor questions from the same pack.
Both modes analyse; neither recommends buying or selling (investment advice is regulated)."""
from __future__ import annotations
import json, math, os, re
from datetime import datetime
import httpx
from . import db
from .db import T
from .analytics import MARKET, MARKET_ASOF, scenario
from .common import get_config
from .domain import cfg, js_round
from .services.analysis import analysis_pack
from .services.listings import list_listings

DISCLAIMER = 'AI analysis from platform data. Not investment, tax or legal advice; verify in the data room and with your advisers.'


def _trim(s: str) -> str:
    return re.sub(r'\.$', '', re.sub(r'0+$', '', s)) if '.' in s else s


def eur(n) -> str:
    if n is None: return '—'
    a = abs(n)
    if a >= 1e9: return f'€{_trim(f"{n / 1e9:.2f}")}bn'
    if a >= 1e6: return f'€{_trim(f"{n / 1e6:.{0 if a >= 1e8 else 2}f}")}m'
    return f'€{js_round(n):,}'


def an(w: str) -> str:
    return ('an ' if re.match(r'^[aeiou]', w, re.I) else 'a ') + w


def pc(n, d=2) -> str:
    return '—' if n is None else f'{n:.{d}f}%'


def _fmt(n) -> str:  # 4.0 -> "4", 2.5 -> "2.5"
    return str(int(n)) if isinstance(n, float) and n.is_integer() else str(n)


def _date(s) -> str:
    d = s if isinstance(s, datetime) else datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    return f'{d.day} {d.strftime("%b")} {d.year}'


def sources_for(pack, process) -> list[dict]:
    s = []
    if pack:
        s.append({'id': 'S1', 'label': f"Listing figures · {pack['listing']['name']}"})
        s.append({'id': 'S2', 'label': f"Rent roll ({pack['listing']['units']} units) · data room › Financial" if pack['regulation'] else 'Property file (rent roll needs verification + NDA)'})
        s.append({'id': 'S3', 'label': 'WWS points estimate · Wet betaalbare huur (2024), thresholds from the config table'})
        s.append({'id': 'S4', 'label': 'Scenario engine · server calculation (10-year DCF, interest-only debt)'})
        s.append({'id': 'S5', 'label': f'Market benchmarks and comparable transactions · {MARKET_ASOF}'})
        s.append({'id': 'S6', 'label': 'Config table · transfer tax and acquisition costs (2026)'})
        s.append({'id': 'S7', 'label': 'ESG estimate from energy labels · data room › Technical'})
        if process: s.append({'id': 'S8', 'label': 'Sale process letter and Q&A log · data room › Process'})
    else:
        s += [{'id': 'S1', 'label': 'Live offering · listings you can access'}, {'id': 'S5', 'label': f'Market benchmarks · {MARKET_ASOF}'},
              {'id': 'S6', 'label': 'Config table · transfer tax, WWS thresholds (2026)'}, {'id': 'S3', 'label': 'Wet betaalbare huur (2024) · WWS points system'}]
    return s


def ask_analyst(v: dict | None, question: str, slug: str | None = None, history: list[dict] | None = None) -> dict:
    pack = proc = None
    if slug:
        r = analysis_pack(slug, v)
        if r['status'] != 200: return {'error': r['status'], 'message': r.get('message') or 'Listing not found'}
        pack = r['pack']
        if r['l']['deal_type'] == 'institutional':
            pr = db.get(T.sale_processes, listing_id=r['l']['id'])
            if pr: proc = {'current': pr['stages'][pr['stage']]['label'] if pr['stage'] < len(pr['stages']) else None, 'stages': pr['stages'], 'minTicket': pr['min_ticket']}
    listings = [] if pack else [{'slug': l['slug'], 'name': l['name'], 'city': l['city'], 'type': l['propertyType'], 'dealType': l['dealType'], 'status': l['status'], 'price': l.get('askingPrice'),
                                 'priceDisplay': l.get('priceDisplay'), 'bar': l.get('bar'), 'units': l.get('unitsCount'), 'score': (l.get('dealScore') or {}).get('total'), 'label': l.get('energyLabel')}
                                for l in list_listings(v, {}) if not l.get('locked')]
    ctx = {'pack': pack, 'process': proc, 'listings': listings, 'config': get_config(), 'sources': sources_for(pack, proc)}
    if os.environ.get('ANTHROPIC_API_KEY'):
        try:
            return claude(ctx, question, history or [])
        except Exception as e:
            a = engine(ctx, question); a['answer'] = f'_(Claude unavailable: {str(e)[:80]}. Built-in analyst answered.)_\n\n' + a['answer']; return a
    return engine(ctx, question)


# ---------------- Claude ----------------
def claude(ctx: dict, question: str, history: list[dict]) -> dict:
    model = os.environ.get('PP_AI_MODEL') or 'claude-opus-5-5'
    system = f"""You are the senior investment analyst of Portfolio & Prime, a Dutch residential investment platform for professional and institutional investors.
Answer like an experienced acquisitions analyst: precise, quantified, concise (under 220 words unless asked for more), structured with short paragraphs or "- " bullets, **bold** for key figures.
Rules:
- Use ONLY the data in CONTEXT and results of the run_scenario tool. Never invent figures, addresses, tenants or market data. If something is not in the context, say what is missing and where it would be (data room folder, Q&A).
- Cite sources inline with their ids, e.g. [S1], [S4]. Only cite ids listed in SOURCES.
- For any "what if" on rates, leverage, vacancy, rent growth, exit yield, hold period or rent, call run_scenario; do not compute IRR yourself.
- You analyse; you do not advise. Never say "buy", "you should invest" or similar. If asked for a recommendation, give the evidence for and against and say the decision is the investor's.
- Reply in the language of the question (Dutch, English or German).
SOURCES: {json.dumps(ctx['sources'])}
CONTEXT: {json.dumps({'pack': ctx['pack'], 'process': ctx['process'], 'listings': ctx['listings'], 'market': MARKET, 'transferTaxInvestorPct': cfg(ctx['config'], 'transfer_tax_residential_investor')}, default=str)}"""
    tools = [{'name': 'run_scenario', 'description': 'Run the platform DCF for the current listing with changed assumptions. Returns levered/unlevered IRR, cash-on-cash, DSCR, equity multiple and exit value, plus the base case for comparison.',
              'input_schema': {'type': 'object', 'properties': {'interest': {'type': 'number', 'description': 'interest rate %'}, 'ltv': {'type': 'number'}, 'vacancy': {'type': 'number'}, 'rentGrowth': {'type': 'number'},
                                                                'exitYield': {'type': 'number', 'description': 'exit net initial yield %'}, 'years': {'type': 'number'}, 'rent': {'type': 'number', 'description': 'annual gross rent €'}}}}]
    messages = [{'role': h['role'], 'content': h['text']} for h in history[-6:]] + [{'role': 'user', 'content': question}]
    for _ in range(4):
        r = httpx.post('https://api.anthropic.com/v1/messages', timeout=45, headers={'content-type': 'application/json', 'x-api-key': os.environ['ANTHROPIC_API_KEY'], 'anthropic-version': '2023-06-01'},
                       json={'model': model, 'max_tokens': 1200, 'system': system, 'tools': tools if (ctx['pack'] or {}).get('scenarioBase') else [], 'messages': messages})
        if r.status_code >= 400: raise RuntimeError(f'API {r.status_code}')
        d = r.json(); messages.append({'role': 'assistant', 'content': d.get('content')})
        calls = [b for b in d.get('content') or [] if b.get('type') == 'tool_use']
        if d.get('stop_reason') != 'tool_use' or not calls:
            txt = '\n'.join(b['text'] for b in d.get('content') or [] if b.get('type') == 'text').strip()
            cited = set(re.findall(r'\[(S\d)\]', txt))
            return {'mode': 'claude', 'model': model, 'answer': txt, 'sources': [s for s in ctx['sources'] if s['id'] in cited], 'followUps': follow_ups(ctx), 'disclaimer': DISCLAIMER}
        messages.append({'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': c['id'], 'content': json.dumps(run_scenario(ctx, c.get('input') or {}))} for c in calls]})
    raise RuntimeError('too many tool calls')


def run_scenario(ctx: dict, o: dict) -> dict:
    base = ctx['pack']['scenarioInputs']
    clean = {k: o[k] for k in ['interest', 'ltv', 'vacancy', 'rentGrowth', 'exitYield', 'years', 'rent'] if isinstance(o.get(k), (int, float)) and not isinstance(o.get(k), bool) and math.isfinite(o[k])}
    return {'base': scenario(base), 'scenario': scenario({**base, **clean}), 'changed': clean}


def follow_ups(ctx: dict) -> list[str]:
    if not ctx['pack']: return ['Which portfolio has the highest yield?', 'How does Dutch rent regulation affect returns?', 'What does it cost to buy as an investor?']
    f = ['What are the biggest risks?', 'What happens if rates rise 200 bp?', 'Is the asking price in line with the market?']
    if ctx['pack']['regulation']: f.insert(1, 'How exposed is the rent roll to the WWS caps?')
    else: f.append('How sustainable is it (ESG)?')
    if ctx['process']: f.append('Where are we in the sale process?')
    return f[:4]


# ---------------- Built-in analyst engine ----------------
def has(q: str, pattern: str) -> bool:
    return re.search(pattern, q) is not None


def num(q: str, pattern: str):
    m = re.search(pattern, q)
    if not m: return None
    g = m.groups()[-1] if m.groups() else m.group(0)
    return float(g.replace(',', '.')) if g is not None else None


def overrides(q: str, base: dict) -> dict:
    o = {}
    bp = num(q, r'(\d+)\s*(?:bp|bps|basis points?)')
    up = num(q, r'(?:rates?|interest|rente)\s*(?:rise|rises|go(?:es)? up|increase[sd]?|up|stijgt|\+)\s*(?:by\s*)?(\d+(?:[.,]\d+)?)\s*%')
    ab = num(q, r'(?:interest|rate|rente)[^0-9%]{0,20}?(?:of|at|to|is|=)?\s*(\d+(?:[.,]\d+)?)\s*%')
    i0 = base.get('interest') if base.get('interest') is not None else 4
    if bp is not None: o['interest'] = i0 + bp / 100
    elif up is not None: o['interest'] = i0 + up
    elif ab is not None: o['interest'] = ab
    vac = num(q, r'vacan\w*[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%')
    if vac is not None: o['vacancy'] = vac
    ex = num(q, r'exit[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*%')
    if ex is not None: o['exitYield'] = ex
    ltv = num(q, r'(?:ltv|leverage|loan.to.value|gearing)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%')
    if ltv is not None: o['ltv'] = ltv
    g = num(q, r'(?:rent growth|indexation|growth|indexatie)[^0-9-]{0,20}(-?\d+(?:[.,]\d+)?)\s*%')
    if g is not None: o['rentGrowth'] = g
    if has(q, r'rent freeze|no indexation|huurbevriezing'): o['rentGrowth'] = 0
    yrs = num(q, r'(\d{1,2})\s*(?:-?\s*years?|yrs?|jaar)')
    if yrs is not None and 1 <= yrs <= 20: o['years'] = yrs
    return o


def _pct2(x) -> str:
    return re.sub(r'\.?0+$', '', f'{x:.2f}') + '%'


def _comp(c: dict) -> str:
    return f"{c['name']} ({c['units']} units, BAR {_fmt(c['bar'])}%, {eur(c['perUnit'])}/unit, {c['date']})"


def _signed(x) -> str:
    return f"{'+' if x >= 0 else ''}{_fmt(x)}"


def engine(ctx: dict, question: str) -> dict:
    q = question.lower(); out: list[str] = []; used: set[str] = set()

    def cite(*ids):
        used.update(ids); return ''.join(f'[{i}]' for i in ids)

    p = ctx['pack']
    advice = has(q, r'should (i|we) (buy|invest|bid)|is (it|this) a good (deal|investment|buy)|recommend|worth (buying|it)|moet ik|soll(te)? ich')
    if advice: out.append("I can't tell you whether to buy: that is your investment committee's decision. Here is the evidence on both sides.")
    if not p: return general(ctx, q, out, cite, used)
    L = p['listing']; b = p['scenarioBase']; v = p['valuation']
    intents = {
        'scenario': has(q, r'interest|rate|rente|ltv|leverage|gearing|exit|irr|hold|vacan|growth|indexation|stress|downside|what if|scenario|freeze|bp\b|basis point|refinanc|wat als'),
        'regulation': has(q, r'wws|regulat|points|punten|betaalbare|rent cap|huurcommissie|social|mid.?rent|middenhuur|liberali|huurprijs'),
        'risk': has(q, r'risk|red flag|due diligence|\bdd\b|issue|problem|maintenance|mjop|asbestos|ground lease|erfpacht|watch out|concern|weak|downside|risico'),
        'esg': has(q, r'esg|energy|label|sustainab|taxonomy|sfdr|co2|carbon|green|paris|duurzaam|gresb|nzeb'),
        'valuation': has(q, r'valu|worth|fair|overpriced|cheap|expensive|comparable|comps|benchmark|market price|per m|per unit|discount|premium|asking|waarde'),
        'tax': has(q, r'tax|overdracht|transfer|cost(s)? (to|of) buy|acquisition cost|notary|k\.k\.|belasting|grunderwerb'),
        'yield': has(q, r'yield|\bbar\b|\bnar\b|return|income|cash.?flow|cash-on-cash|\bcoc\b|dscr|rendement|niy'),
        'process': has(q, r'process|deadline|stage|round|timeline|shortlist|indicative|binding|bid|q&a|spa|closing'),
    }
    summary = not any(intents.values()) or has(q, r'summar|overview|tell me|explain|memo|key points|thesis|in short|samenvatting|highlights')

    if summary or advice:
        out.append(f"**{L['name']}** is {an(L['propertyType'].lower())} in {L['city']}{' (' + L['district'] + ')' if L['district'] else ''}: {L['units']} unit{'' if L['units'] == 1 else 's'}, {L['areaM2']:,} m², built {L['buildYear']}, energy label {L['energyLabel']} {cite('S1')}.")
        if L['bar']: out.append(f"- Asking **{eur(L['askingPrice'])}** k.k. for **{eur(L['grossRentAnnual'])}** gross rent: BAR **{pc(L['bar'])}**, entry NIY {pc(b['entryNiy'] if b else None)} {cite('S1', 'S4')}.")
        else: out.append(f"- Asking **{eur(L['askingPrice'])}** k.k.; no rental income (owner-occupier asset) {cite('S1')}.")
        out.append(f"- Estimated value **{eur(v['low'])}–{eur(v['high'])}**; asking is {(_fmt(v['vsAsking']) + '% above') if v['vsAsking'] >= 0 else (_fmt(abs(v['vsAsking'])) + '% below')} the midpoint ({v['verdict'].lower()}) {cite('S5')}.")
        if b: out.append(f"- Base case (LTV {_fmt(b['inputs']['ltv'])}%, {_fmt(b['inputs']['interest'])}% interest, {_fmt(b['inputs']['rentGrowth'])}% rent growth, {b['inputs']['years']} years): levered IRR **{pc(b['leveredIrr'])}**, unlevered {pc(b['unleveredIrr'])}, DSCR {b['dscr'] if b['dscr'] is not None else '—'} {cite('S4')}.")
        top = [f for f in p['flags'] if f['level'] in ('high', 'medium')][:2]
        if top: out.append(f"- Main watch points: {'; '.join(f['title'] for f in top)} {cite('S2')}.")
        plus = [f for f in p['flags'] if f['level'] == 'positive'][:3]
        if plus: out.append(f"- Strengths: {'; '.join(f['title'] for f in plus)} {cite('S2')}.")
    so = overrides(q, p['scenarioInputs']) if b else {}
    if intents['yield'] and not summary and L['bar'] and not (intents['scenario'] and so):
        out.append(f"**Income and yield** {cite('S1', 'S4')}")
        out.append(f"- Gross rent {eur(L['grossRentAnnual'])} on {eur(L['askingPrice'])} k.k.: BAR **{pc(L['bar'])}**.")
        out.append(f"- Net operating income year 1: {eur(b['noiYear1'] if b else None)} after {_fmt(b['inputs']['vacancy']) if b else '—'}% vacancy and {_fmt(b['inputs']['opexPct']) if b else '—'}% operating costs; NIY on price {pc(b['entryNiy'] if b else None)}.")
        out.append(f"- Total acquisition cost {eur(p['acquisition']['total'])} incl. {_fmt(p['acquisition']['taxRate'])}% transfer tax {cite('S6')}.")
        if b: out.append(f"- With {_fmt(b['inputs']['ltv'])}% LTV at {_fmt(b['inputs']['interest'])}%: cash-on-cash **{pc(b['cocYear1'])}** in year 1, DSCR {b['dscr']}, levered IRR **{pc(b['leveredIrr'])}**, equity multiple {b['equityMultiple']}x.")
    if intents['scenario'] and b:
        if so:
            s = scenario({**p['scenarioInputs'], **so})
            d = lambda a, z: '' if a is None or z is None else f" ({'+' if a - z >= 0 else ''}{a - z:.2f} pts)"
            names = {'interest': 'interest', 'vacancy': 'vacancy', 'exitYield': 'exit yield', 'ltv': 'LTV', 'rentGrowth': 'rent growth', 'years': 'hold'}
            parts = ', '.join(names[k] + ' ' + (_fmt(x) + ' yrs' if k == 'years' else _pct2(x)) for k, x in so.items())
            out.append(f"**Scenario: {parts}** {cite('S4')}")
            out.append(f"- Levered IRR **{pc(s['leveredIrr'])}**{d(s['leveredIrr'], b['leveredIrr'])} vs base {pc(b['leveredIrr'])}; unlevered {pc(s['unleveredIrr'])}.")
            out.append(f"- Year-1 cash-on-cash {pc(s['cocYear1'])} (base {pc(b['cocYear1'])}); DSCR {s['dscr'] if s['dscr'] is not None else '—'} (base {b['dscr'] if b['dscr'] is not None else '—'}){': **below a typical 1.2x bank covenant**' if s['dscr'] is not None and s['dscr'] < 1.2 else ''}.")
            out.append(f"- Exit value after {s['inputs']['years']} years {eur(s['exitValue'])} at a {_fmt(s['inputs']['exitYield'])}% exit yield; equity multiple {s['equityMultiple']}x.")
        else:
            out.append(f"**Stress tests** {cite('S4')}")
            for t in p['stress']: out.append(f"- {t['name']}: levered IRR **{pc(t['leveredIrr'])}**, DSCR {t['dscr'] if t['dscr'] is not None else '—'}, equity multiple {t['equityMultiple'] if t['equityMultiple'] is not None else '—'}x")
            out.append('Ask for a specific case, e.g. "interest 6%", "exit yield 5.5%" or "LTV 40% and 7 years".')
    if intents['regulation']:
        r = p['regulation']
        if not r: out.append(f"The unit-level rent-regulation check needs the rent roll, which opens after verification and the property NDA {cite('S2')}. At property level: {L['energyLabel']} label stock built {L['buildYear']}; under the Wet betaalbare huur, units up to {cfg(ctx['config'], 'wws_mid_points')} WWS points have a maximum rent {cite('S3')}.")
        else:
            th = r['thresholds']
            out.append(f"**Rent regulation (WWS) exposure** {cite('S2', 'S3')}")
            out.append(f"- Indicative segments: {r['segments']['social']} social (≤{th['socialPts']} pts), {r['segments']['mid']} mid-rent ({th['socialPts'] + 1}–{th['midPts']} pts), {r['segments']['free']} free-sector.")
            out.append(f"- {r['affected']} units rent above their points maximum; capping them reduces rent by **{eur(r['annualLoss'])} a year ({_fmt(r['lossPct'])}%)**, from {eur(r['rentNow'])} to {eur(r['rentAfter'])}.")
            cap = next((s for s in p['stress'] if s['name'] == 'WWS cap applied'), None)
            if cap: out.append(f"- If every unit moved to its cap, levered IRR would be **{pc(cap['leveredIrr'])}** vs {pc(b['leveredIrr'] if b else None)} base {cite('S4')}.")
            out.append('- In practice mid-rent caps bite at re-letting; social tenants can ask the Huurcommissie for a reduction. Confirm with a points survey per unit.')
    if intents['risk'] and not summary:
        out.append(f"**Due-diligence watch points** {cite('S2')}")
        for f in [f for f in p['flags'] if f['level'] != 'positive'][:5]: out.append(f"- **{f['title']}** ({f['level']}): {f['detail']} _Source: {f['source']}._")
        pos = [f for f in p['flags'] if f['level'] == 'positive']
        if pos: out.append(f"Mitigants: {', '.join(f['title'] for f in pos)}.")
        if not p['regulation']: out.append('Unit-level flags (vacancy, rent caps, labels per unit) appear after verification and the NDA.')
    if intents['esg']:
        e = p['esg']; out.append(f"**ESG profile** {cite('S7')}")
        out.append(f"- Label mix across {L['units']} units: {', '.join(str(x['label']) + ' ' + str(x['units']) for x in e['distribution'])}; {e['shareAorB']}% of floor area is label A or B." if e['unitLevel'] else f"- Energy label {L['energyLabel']} at property level; the label per unit opens with the rent roll (verification + NDA).")
        out.append(f"- Estimated energy intensity ~{e['energyIntensity']} kWh/m²/yr, ~{_fmt(e['co2PerM2'])} kg CO₂/m²/yr ({e['co2Total']} t a year).")
        out.append(f"- EU Taxonomy: {'**likely aligned**' if e['taxonomyAligned'] else '**not aligned** on the label test'}; SFDR energy-inefficient share {e['sfdrInefficientShare']}%.")
        if e['upgradeCapexToB']: out.append(f"- Bringing everything to label B: about **{eur(e['upgradeCapexToB'])}** ({eur(e['upgradeCapexPerUnit'])} a unit).")
    if intents['valuation'] and not summary:
        out.append(f"**Valuation check** {cite('S5')}")
        out.append(f"- Estimate **{eur(v['point'])}** (range {eur(v['low'])}–{eur(v['high'])}) vs asking {eur(L['askingPrice'])}: {v['verdict'].lower()} ({_signed(v['vsAsking'])}%).")
        out.append(f"- Method: {v['method']}. {L['city']} benchmarks: BAR {_fmt(v['marketBar'])}%, €{v['marketPerM2']:,}/m².")
        comps = '; '.join(_comp(c) for c in p['comparables'][:3])
        out.append(f"- Asking per unit {eur(L['askingPrice'] / L['units'])}; comparables: {comps}.")
    if intents['tax']:
        a = p['acquisition']; out.append(f"**Cost to buy** {cite('S6')}")
        out.append(f"- Transfer tax {_fmt(a['taxRate'])}% (residential, investor; 2026 rate): {eur(a['tax'])}. Notary, valuation and financing ~1%: {eur(a['other'])}. Total **{eur(a['total'])}** ({(a['total'] / L['askingPrice'] - 1) * 100:.1f}% on top of the price).")
        if L['units'] >= 100: out.append('- For a portfolio this size, a share deal can change the transfer-tax position; the anti-abuse rules for real-estate entities still apply. Get a tax opinion.')
    if intents['process']:
        if ctx['process']:
            out.append(f"**Sale process** {cite('S8')}"); out.append(f"- Current stage: **{ctx['process']['current']}**.")
            for st in [x for x in ctx['process']['stages'] if x.get('deadline')][:4]: out.append(f"- {st['label']}: {_date(st['deadline'])}")
            out.append(f"Minimum ticket {eur(ctx['process']['minTicket'])}. Indicative bids are non-binding; the shortlist gets vendor due diligence and site visits.")
        else:
            out.append('This property is sold through a sealed bid round: see the deadline and minimum bid in the sidebar.' if L['dealType'] == 'bid_round' else 'This is a direct sale: offers go through the offer form and are not binding until a purchase agreement is signed.')
    if advice and p['flags']: out.append('The decision depends on your return hurdle, your view on rent regulation and your capex budget.')
    return {'mode': 'engine', 'answer': '\n'.join(out), 'sources': [s for s in ctx['sources'] if s['id'] in used], 'followUps': follow_ups(ctx), 'disclaimer': DISCLAIMER}


def general(ctx: dict, q: str, out: list[str], cite, used: set[str]) -> dict:
    ls = [l for l in ctx['listings'] if l['status'] in ('available', 'coming_soon')]
    city = next((c for c in MARKET if c.lower() in q), None)
    bm = num(q, r'(?:€|eur|euro)?\s*(\d+(?:[.,]\d+)?)\s*(?:m\b|mn|million|mln|miljoen)'); bb = num(q, r'(\d+(?:[.,]\d+)?)\s*(?:bn|billion|b\b|miljard)')
    budget = bb * 1e9 if bb else bm * 1e6 if bm else None
    done = False; c = ctx['config']
    if has(q, r'best|highest|top|which|compare|rank|fit|budget|yield|portfolio|largest|biggest|deploy|allocate') or budget:
        pool = [l for l in ls if l['bar']]
        if budget: pool = [l for l in pool if not l['price'] or l['price'] <= budget]
        by_yield = has(q, r'yield|bar|income|return')
        pool.sort(key=lambda l: -(l['bar'] or 0) if by_yield else -(l['price'] or 0))
        out.append(f"**{'Highest-yielding' if by_yield else 'Largest'} income opportunities you can access{' within ' + eur(budget) if budget else ''}** {cite('S1')}")
        for l in pool[:5]: out.append(f"- **{l['name']}** ({l['city']}, {l['type'].lower()}, {l['units']} units): {eur(l['price']) if l['price'] else l['priceDisplay']}, BAR {pc(l['bar'])}, deal score {l['score']}.")
        if not pool: out.append('- Nothing in your current access level matches. Private deal rooms open to verified institutional investors.')
        if budget and budget >= 1e8:
            total = sum(l['price'] or 0 for l in pool)
            out.append(f"Together these come to {eur(total)}. Deploying {eur(budget)} in Dutch residential usually combines portfolio acquisitions, forward-funding of build-to-rent schemes and a buy-box mandate for off-market deal flow; ask your account manager to set one up.")
        done = True
    if city:
        m = MARKET[city]; out.append(f"**{city} benchmarks** {cite('S5')}: residential BAR ~{_fmt(m['bar'])}%, ~€{m['perM2']:,}/m², market rent ~€{_fmt(m['rentM2'])}/m²/month, rent growth ~{_fmt(m['growth'])}% a year, vacancy ~{_fmt(m['vacancy'])}%."); done = True
    if has(q, r'wws|regulat|points|betaalbare|rent cap|huurcommissie|social|mid.?rent|middenhuur'):
        out.append(f"**Dutch rent regulation** {cite('S3', 'S6')}: since July 2024 the Wet betaalbare huur extends the points system (WWS) to mid-rent. Homes up to {cfg(c, 'wws_social_points')} points are social rent; {cfg(c, 'wws_social_points') + 1}–{cfg(c, 'wws_mid_points')} points are mid-rent with a maximum of roughly €{js_round(cfg(c, 'wws_mid_points') * cfg(c, 'wws_rent_per_point'))} a month; above that is free-sector. Points come mainly from floor area, energy label and WOZ value, so better labels raise the permitted rent. Open a listing's Analysis tab to see the unit-level exposure."); done = True
    if has(q, r'tax|overdracht|transfer|cost(s)? (to|of) buy|belasting|grunderwerb'):
        out.append(f"**Transfer tax** {cite('S6')}: {_fmt(cfg(c, 'transfer_tax_residential_investor'))}% for investors buying residential property (2026), {_fmt(cfg(c, 'transfer_tax_commercial'))}% for commercial, {_fmt(cfg(c, 'transfer_tax_own_home'))}% for an own main residence. Add about {_fmt(cfg(c, 'other_acquisition_costs'))}% for notary, valuation and financing. Prices are k.k. (costs for the buyer)."); done = True
    if has(q, r'foreign|international|non.?resident|how (do|can) (i|we) (invest|buy)|process|start|kyc|kyb'):
        out.append(f"**How institutions buy here** {cite('S1')}: register, complete KYB (company, UBO, source of funds; Wwft), and get access to private deal rooms. Portfolios run as a two-round process: teaser and NDA, information memorandum, indicative bids, shortlist with vendor due diligence, final binding bids, SPA and notary transfer. Set a buy box so new deals reach you first."); done = True
    if not done:
        out.append('I can analyse any property you have access to and the Dutch residential market. Try: "Which portfolio has the highest yield?", "What does it cost to buy €50m as an investor?", "Explain the WWS points system", or open a listing and ask about its risks, rent-regulation exposure or a rate scenario.'); used.add('S1')
    return {'mode': 'engine', 'answer': '\n'.join(out), 'sources': [s for s in ctx['sources'] if s['id'] in used], 'followUps': follow_ups(ctx), 'disclaimer': DISCLAIMER}
