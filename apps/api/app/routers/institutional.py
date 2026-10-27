"""Institutional layer: private deal rooms with a structured sale process, Q&A log, analysis pack, scenario engine,
investment-committee memo, mandate matching, the AI analyst and the market report."""
from __future__ import annotations
import time
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, StringConstraints

from .. import db
from ..db import T, and_, desc, func, select
from ..ai import ask_analyst
from ..analytics import COMPS, MARKET, MARKET_ASOF, mandate_fit, scenario, stress_tests
from ..common import (ApiError, audit, bad, draft_email, eur_nl, forbidden, get_config, json_body, not_found, notify, now, parse, require_feature, require_staff,
                      require_user, serialize_listing, viewer_of)
from ..domain import can_see_listing, cfg, is_qualified, is_staff, off_market_state
from ..pdf import memo_pdf, watermark
from ..services.analysis import analysis_pack
from ..services.listings import get_listing, has_nda, list_listings, listing_rows, unit_counts

router = APIRouter()
def post(path): return router.post(path, status_code=201)

_hits: dict[str, list[float]] = {}


def rate_limit(key: str, mx: int = 30, window: float = 3600):
    t = time.time(); a = [x for x in _hits.get(key, []) if t - x < window]
    if len(a) >= mx: raise ApiError(429, 'You have reached the hourly limit for the AI analyst. Try again later.')
    a.append(t); _hits[key] = a


def _eur(n) -> str: return '€' + eur_nl(n)


def _process(listing_id: str): return db.get(T.sale_processes, listing_id=listing_id)


def _summary(pr: dict) -> dict:
    st = pr['stages']; cur = st[pr['stage']] if pr['stage'] < len(st) else None; nxt = next((s for s in st[pr['stage']:] if s.get('deadline')), None)
    return {'stage': pr['stage'], 'stageLabel': cur and cur['label'], 'stageKey': cur and cur['key'], 'nextDeadline': {'label': nxt['label'], 'at': nxt['deadline']} if nxt else None, 'stages': len(st), 'minTicket': pr['min_ticket']}


def _pack_or_raise(slug: str, v) -> dict:
    r = analysis_pack(slug, v)
    if r['status'] == 404: raise not_found('Listing not found')
    if r['status'] != 200: raise ApiError(r['status'], r.get('message') or 'Not allowed')
    return r


@router.get('/institutional/deals')
def deals(request: Request):
    """Private deal rooms shared with this person: codename teaser and process stage; details for qualified investors."""
    require_feature(request, 'institutional'); v = viewer_of(request); c = get_config()
    rs = listing_rows(T.listings.c.deal_type == 'institutional', order=[desc(T.listings.c.asking_price)]); counts = unit_counts([p['id'] for _, p in rs]); out = []
    for l, p in rs:
        if l['status'] in ('draft', 'withdrawn', 'sold') or not can_see_listing(v, l['id']): continue
        pr = _process(l['id']); parties = db.count(T.nda_signatures, T.nda_signatures.c.listing_id == l['id'])
        out.append({**serialize_listing(l, p, v, c), 'unitsCount': counts.get(p['id'], 1), 'process': _summary(pr) if pr else None, 'parties': parties})
    return {'qualified': is_qualified(v), 'minTicket': cfg(c, 'institutional_min_ticket'), 'deals': out}


@router.get('/listings/{slug}/analysis')
def analysis(request: Request, slug: str):
    require_feature(request, 'analysis'); return _pack_or_raise(slug, viewer_of(request))['pack']


class ScenarioIn(BaseModel):
    slug: str
    interest: Optional[float] = Field(None, ge=0, le=15)
    ltv: Optional[float] = Field(None, ge=0, le=85)
    vacancy: Optional[float] = Field(None, ge=0, le=50)
    rentGrowth: Optional[float] = Field(None, ge=-5, le=10)
    exitYield: Optional[float] = Field(None, ge=1, le=15)
    years: Optional[int] = Field(None, ge=1, le=20)


@post('/analysis/scenario')
def scenario_run(request: Request, body=Depends(json_body)):
    require_feature(request, 'analysis'); b = parse(ScenarioIn, body)
    r = _pack_or_raise(b.slug, viewer_of(request))
    if not r['pack']['scenarioInputs']['rent']: raise bad('This property has no rental income to model.')
    inputs = {**r['pack']['scenarioInputs'], **{k: v for k, v in b.model_dump(exclude={'slug'}).items() if v is not None}}
    reg = r['pack']['regulation']
    return {'scenario': scenario(inputs), 'base': r['pack']['scenarioBase'], 'stress': stress_tests(inputs, reg['rentAfter'] if reg else None)}


def _pct(n) -> str: return '—' if n is None else f'{n:.2f}%'


@router.get('/listings/{slug}/memo')
def memo(request: Request, slug: str):
    """Draft investment-committee memo as a watermarked PDF. Verified investors and staff."""
    u = require_feature(request, 'analysis')
    if not u['verified'] and not is_staff(u): raise forbidden('The memo generator is for verified investors.')
    r = _pack_or_raise(slug, viewer_of(request)); k = r['pack']; L = k['listing']; b = k['scenarioBase']; v = k['valuation']
    dist = ' (' + L['district'] + ')' if L['district'] else ''
    sections = [
        {'heading': '1. Summary', 'lines': [f"{L['name']}: {L['propertyType']} in {L['city']}{dist}. {L['units']} units, {eur_nl(L['areaM2'])} m², built {L['buildYear']}, energy label {L['energyLabel']}, {L['tenure']}.",
                                           f"Asking price {_eur(L['askingPrice'])} k.k.; total acquisition cost {_eur(k['acquisition']['total'])} including {k['acquisition']['taxRate']}% transfer tax.",
                                           *([f"Gross rent {_eur(L['grossRentAnnual'])} a year: BAR {_pct(L['bar'])}, NIY {_pct(b['entryNiy'] if b else None)}. Occupancy {L['occupancy'] if L['occupancy'] is not None else '—'}%."] if L['bar'] else [])]},
        {'heading': '2. Valuation', 'lines': [f"Automated estimate {_eur(v['point'])} (range {_eur(v['low'])} – {_eur(v['high'])}); asking is {'+' if v['vsAsking'] >= 0 else ''}{v['vsAsking']}% vs the midpoint: {v['verdict'].lower()}.",
                                             f"Method: {v['method']}. Benchmarks {v['asOf']}.",
                                             *[f"- {c['name']}, {c['city']}: {c['units']} units, {_eur(c['price'])}, BAR {c['bar']}%, {_eur(c['perUnit'])} per unit ({c['date']}, {c['buyer']})." for c in k['comparables']]]},
        *([{'heading': '3. Returns and stress tests', 'lines': [f"Base case: LTV {b['inputs']['ltv']}%, interest {b['inputs']['interest']}%, rent growth {b['inputs']['rentGrowth']}%, {b['inputs']['years']}-year hold, exit yield {b['inputs']['exitYield']}%.",
                                                               f"Levered IRR {_pct(b['leveredIrr'])}, unlevered IRR {_pct(b['unleveredIrr'])}, year-1 cash-on-cash {_pct(b['cocYear1'])}, DSCR {b['dscr'] if b['dscr'] is not None else '—'}, equity multiple {b['equityMultiple']}x, equity {_eur(b['equity'])}.",
                                                               *[f"- {s['name']}: levered IRR {_pct(s['leveredIrr'])}, DSCR {s['dscr'] if s['dscr'] is not None else '—'}, multiple {s['equityMultiple'] if s['equityMultiple'] is not None else '—'}x." for s in k['stress']]]}] if b else []),
        {'heading': '4. Rent regulation (WWS)', 'lines': [f"Indicative segments: {k['regulation']['segments']['social']} social, {k['regulation']['segments']['mid']} mid-rent, {k['regulation']['segments']['free']} free-sector.",
                                                         f"{k['regulation']['affected']} units above their points maximum; exposure {_eur(k['regulation']['annualLoss'])} a year ({k['regulation']['lossPct']}% of rent).", k['regulation']['note']]
                                                        if k['regulation'] else ['Unit-level assessment requires the rent roll (verification and the property NDA).']},
        {'heading': '5. ESG', 'lines': [f"Label mix: {', '.join(d['label'] + ' ' + str(d['units']) for d in k['esg']['distribution'])}; {k['esg']['shareAorB']}% of floor area label A/B.",
                                       f"Energy intensity ~{k['esg']['energyIntensity']} kWh/m²/yr; ~{k['esg']['co2PerM2']} kg CO2/m²/yr. EU Taxonomy: {'likely aligned' if k['esg']['taxonomyAligned'] else 'not aligned on the label test'}. Upgrade capex to label B ~{_eur(k['esg']['upgradeCapexToB'])}."]},
        {'heading': '6. Risks and mitigants', 'lines': [f"- [{f['level'].upper()}] {f['title']}: {f['detail']} ({f['source']})" for f in k['flags']]},
        {'heading': '7. Open points for the committee', 'lines': ['- Confirm the rent roll against lease agreements and the WWS points survey per unit.', '- Technical due diligence: MJOP capex, asbestos, installations.',
                                                                  '- Tax structuring (asset vs share deal) and financing terms.', '- Decision requested: approval to submit an indicative / binding bid within the stated range.']},
    ]
    pdf = memo_pdf(f"Investment memo · {L['name']}", f"Prepared {now().strftime('%Y-%m-%d')} for {u['companyName'] or u['name']} · access: {k['access']}", sections,
                   'Draft generated from platform data. Not investment advice. Figures indicative; verify in the data room. Portfolio & Prime demo.')
    stamped = watermark(pdf, f"{u['name']} · {u['email']} · {now().strftime('%Y-%m-%d %H:%M')} UTC")
    audit(request, 'memo_generated', 'listing', r['l']['id'], {'slug': slug})
    return Response(stamped, media_type='application/pdf', headers={'Content-Disposition': f'inline; filename="IC-memo-{slug}.pdf"', 'Cache-Control': 'no-store'})


# ---------- Structured sale process ----------
def _proc_gate(request: Request, slug: str):
    u = require_feature(request, 'institutional'); v = viewer_of(request)
    if not is_qualified(v): raise forbidden('Private deal rooms are open to verified institutional investors.')
    x = get_listing(slug)
    if not x or not can_see_listing(v, x['l']['id']) or x['l']['deal_type'] != 'institutional' or off_market_state(x['l']['deal_type'], None, v) != 'open': raise not_found()
    pr = _process(x['l']['id'])
    if not pr: raise not_found('No sale process for this listing.')
    return u, x, pr


@router.get('/listings/{slug}/process')
def get_process(request: Request, slug: str):
    u, x, pr = _proc_gate(request, slug); lid = x['l']['id']; nda = is_staff(u) or has_nda(u['id'], lid)
    bids = db.all_(T.offers, T.offers.c.listing_id == lid, T.offers.c.status.in_(['indicative', 'final']))
    qa = db.all_(T.qa_items, T.qa_items.c.listing_id == lid, order=desc(T.qa_items.c.created_at)) if nda else []
    mine = [{'id': b['id'], 'amount': b['amount'], 'status': b['status'], 'financingType': b['financing_type'], 'conditions': b['conditions'], 'at': b['created_at']} for b in bids if b['user_id'] == u['id']]
    return {**_summary(pr), 'stagesList': [{**s, 'state': 'done' if i < pr['stage'] else 'current' if i == pr['stage'] else 'next'} for i, s in enumerate(pr['stages'])], 'advisor': pr['advisor'], 'nda': nda,
            'shortlisted': u['id'] in pr['shortlist'], 'bidsReceived': {'indicative': len([b for b in bids if b['status'] == 'indicative']), 'final': len([b for b in bids if b['status'] == 'final'])}, 'myBids': mine,
            'qa': [{'id': q['id'], 'category': q['category'], 'question': q['question'], 'answer': q['answer'], 'answeredAt': q['answered_at'], 'at': q['created_at'], 'mine': q['user_id'] == u['id']}
                   for q in qa if q['answer'] or q['user_id'] == u['id'] or is_staff(u)]}


class ProcessBidIn(BaseModel):
    amount: int = Field(le=5_000_000_000)
    financingType: Literal['Cash', 'Mixed', 'Debt-financed']
    structure: Literal['Share deal', 'Asset deal', 'Either']
    conditions: Optional[Annotated[str, StringConstraints(max_length=400)]] = None
    message: Optional[Annotated[str, StringConstraints(max_length=2000)]] = None
    acceptRules: Literal[True]


@post('/listings/{slug}/process/bids')
def process_bid(request: Request, slug: str, body=Depends(json_body)):
    u, x, pr = _proc_gate(request, slug); require_feature(request, 'offers'); l = x['l']
    if is_staff(u): raise forbidden('Staff cannot bid.')
    if not has_nda(u['id'], l['id']): raise forbidden('Sign the NDA for this deal room first.')
    key = pr['stages'][pr['stage']]['key'] if pr['stage'] < len(pr['stages']) else None
    if key not in ('indicative', 'final'): raise bad(f"Bids are not open in the current stage ({pr['stages'][pr['stage']]['label']}).")
    if key == 'final' and u['id'] not in pr['shortlist']: raise forbidden('Final bids are open to shortlisted parties only.')
    b = parse(ProcessBidIn, body)
    if b.amount < (pr['min_ticket'] or 1): raise bad(f"amount: The minimum ticket is {_eur(pr['min_ticket'] or 0)}")
    status = 'final' if key == 'final' else 'indicative'
    conditions = ['Final binding bid' if status == 'final' else 'Indicative bid', b.structure, *([b.conditions] if b.conditions else [])]
    mine = db.get(T.offers, listing_id=l['id'], user_id=u['id'], status=status)
    if mine: db.upd(T.offers, T.offers.c.id == mine['id'], {'amount': b.amount, 'financing_type': b.financingType, 'conditions': conditions, 'message': b.message})
    else: db.ins(T.offers, {'listing_id': l['id'], 'user_id': u['id'], 'bidder_label': u['companyName'] or u['name'], 'amount': b.amount, 'financing_type': b.financingType, 'conditions': conditions, 'message': b.message, 'status': status, 'lead_score': 85, 'lead_band': 'Hot'}, returning=False)
    audit(request, 'process_bid', 'listing', l['id'], {'amount': b.amount, 'status': status, 'updated': bool(mine)})
    notify(u['id'], 'bid', 'Final bid received' if status == 'final' else 'Indicative bid received', f"{l['name']} · {_eur(b.amount)}. {'Binding subject to the SPA.' if status == 'final' else 'Non-binding. The shortlist follows after the deadline.'}", l['slug'])
    draft_email(u['email'], f"{l['name']}: bid received", f"Dear {u['name']}, we received your {status} bid of {_eur(b.amount)} for {l['name']}. Bids stay confidential.", 'bid')
    return {'ok': True, 'status': status, 'updated': bool(mine)}


class QaIn(BaseModel):
    category: Literal['Financial', 'Legal', 'Technical', 'Tax', 'Process', 'General']
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=1500)]


@post('/listings/{slug}/qa')
def ask(request: Request, slug: str, body=Depends(json_body)):
    u, x, _ = _proc_gate(request, slug)
    if not is_staff(u) and not has_nda(u['id'], x['l']['id']): raise forbidden('Sign the NDA for this deal room first.')
    b = parse(QaIn, body)
    q = db.ins(T.qa_items, {'listing_id': x['l']['id'], 'user_id': u['id'], 'category': b.category, 'question': b.question})
    audit(request, 'qa_question', 'listing', x['l']['id'], {'category': b.category}); return {'id': q['id']}


# ---------- Staff: processes and Q&A ----------
@router.get('/admin/processes')
def admin_processes(request: Request):
    u = require_staff(request); see = True; out = []
    for pr in db.all_(T.sale_processes):
        l = db.get(T.listings, id=pr['listing_id'])
        bids = db.all_(T.offers, T.offers.c.listing_id == l['id'], T.offers.c.status.in_(['indicative', 'final']), order=desc(T.offers.c.amount))
        open_q = db.all_(T.qa_items, T.qa_items.c.listing_id == l['id'], T.qa_items.c.answer.is_(None))
        out.append({'id': pr['id'], 'slug': l['slug'], 'name': l['name'], 'askingPrice': l['asking_price'], **_summary(pr), 'stagesList': pr['stages'], 'shortlist': len(pr['shortlist']),
                    'bids': [{'id': b['id'], 'bidder': b['bidder_label'], 'amount': b['amount'] if see else None, 'vsGuide': round(b['amount'] / l['asking_price'] * 1000) / 10 if see else None, 'status': b['status'],
                              'financing': b['financing_type'], 'conditions': b['conditions'], 'at': b['created_at']} for b in bids],
                    'openQuestions': [{'id': q['id'], 'category': q['category'], 'question': q['question'], 'at': q['created_at']} for q in open_q]})
    return out


@post('/admin/processes/{id}/advance')
def advance(request: Request, id: str):
    require_staff(request); pr = db.get(T.sale_processes, id=id)
    if not pr: raise not_found()
    if pr['stage'] >= len(pr['stages']) - 1: raise bad('The process is already at its last stage.')
    stage = pr['stage'] + 1; key = pr['stages'][stage]['key']; shortlist = pr['shortlist']; l = db.get(T.listings, id=pr['listing_id'])
    if key == 'shortlist':  # shortlist = the best indicative bids (top 3)
        bids = db.all_(T.offers, T.offers.c.listing_id == pr['listing_id'], T.offers.c.status == 'indicative', order=desc(T.offers.c.amount))
        shortlist = [b['user_id'] for b in bids[:3] if b['user_id']]
        for b in bids:
            if b['user_id']:
                on = b['user_id'] in shortlist
                notify(b['user_id'], 'bid', 'You are on the shortlist' if on else 'Shortlist update', f"{l['name']}: you are invited to management presentations and the full data room." if on else f"{l['name']}: thank you for your indicative bid; you were not shortlisted this time.", l['slug'])
    db.upd(T.sale_processes, T.sale_processes.c.id == id, {'stage': stage, 'shortlist': shortlist})
    audit(request, 'process_advance', 'listing', pr['listing_id'], {'stage': pr['stages'][stage]['label']}); return {'ok': True, 'stage': pr['stages'][stage]['label'], 'shortlist': len(shortlist)}


class AnswerIn(BaseModel):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=4000)]


@post('/admin/qa/{id}/answer')
def answer(request: Request, id: str, body=Depends(json_body)):
    u = require_staff(request); b = parse(AnswerIn, body); q = db.get(T.qa_items, id=id)
    if not q: raise not_found()
    db.upd(T.qa_items, T.qa_items.c.id == id, {'answer': b.answer, 'answered_by': 'Capital Markets team', 'answered_at': now()})
    l = db.get(T.listings, id=q['listing_id'])
    if q['user_id']: notify(q['user_id'], 'qa', 'Your Q&A question was answered', f"{l['name']} · {q['category']}", l['slug'])
    audit(request, 'qa_answer', 'qa', id, {'by': u['email']}); return {'ok': True}


# ---------- Mandate matching ----------
@router.get('/me/mandate')
def mandate(request: Request):
    u = require_user(request); bx = db.get(T.buy_boxes, user_id=u['id'])
    box = {'regions': bx['regions'], 'types': bx['types'], 'ticketMin': bx['ticket_min'], 'ticketMax': bx['ticket_max'], 'targetBar': bx['target_bar']} if bx else None
    ls = [l for l in list_listings(viewer_of(request), {}) if not l['locked'] and l['status'] in ('available', 'coming_soon')]
    matches = [{'slug': l['slug'], 'name': l['name'], 'city': l['city'], 'image': l['image'], 'dealType': l['dealType'], 'price': l.get('askingPrice'), 'priceDisplay': l['priceDisplay'], 'bar': l['bar'], 'units': l['unitsCount'],
                **mandate_fit({'city': l['city'], 'category': l['category'], 'askingPrice': l.get('askingPrice') or 0, 'bar': l['bar'] or 0, 'energyLabel': l.get('energyLabel') or 'C', 'dealType': l['dealType']}, box)} for l in ls]
    matches.sort(key=lambda m: -m['score'])
    return {'hasBox': bool(bx), 'matches': matches}


# ---------- AI analyst ----------
class Turn(BaseModel):
    role: Literal['user', 'assistant']
    text: Annotated[str, StringConstraints(max_length=4000)]


class AskIn(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]
    slug: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    history: Optional[list[Turn]] = Field(None, max_length=12)


@post('/ai/ask')
def ai(request: Request, body=Depends(json_body)):
    u = require_feature(request, 'analyst'); rate_limit(u['id']); b = parse(AskIn, body)
    a = ask_analyst(viewer_of(request), b.question, b.slug, [h.model_dump() for h in b.history or []])
    if 'error' in a: raise ApiError(a['error'], a['message'])
    db.ins(T.ai_logs, {'user_id': u['id'], 'listing_slug': b.slug, 'question': b.question, 'mode': a['mode']}, returning=False)
    return a


@router.get('/ai/status')
def ai_status():
    import os
    key = os.environ.get('ANTHROPIC_API_KEY')
    return {'mode': 'claude' if key else 'engine', 'model': (os.environ.get('PP_AI_MODEL') or 'claude-opus-5-5') if key else None}


# ---------- Market report (members with the feature) ----------
@router.get('/market/report')
def report(request: Request):
    require_feature(request, 'market'); c = get_config()
    live = db.one(select(func.count().label('n'), func.coalesce(func.sum(T.listings.c.asking_price), 0).label('v')).where(T.listings.c.status.in_(['available', 'coming_soon', 'under_offer'])))
    return {'asOf': MARKET_ASOF, 'cities': [{'city': k, **m} for k, m in MARKET.items()], 'transactions': [{**{k: v for k, v in x.items() if k != 'buyer'}, 'buyerType': x['buyer']} for x in COMPS],
            'transferTax': cfg(c, 'transfer_tax_residential_investor'), 'wws': {'social': cfg(c, 'wws_social_points'), 'mid': cfg(c, 'wws_mid_points'), 'perPoint': cfg(c, 'wws_rent_per_point')},
            'platform': {'liveDeals': int(live['n']), 'liveVolume': int(live['v'])}}
