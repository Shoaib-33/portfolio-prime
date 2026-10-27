/* AI investment analyst.
   - With ANTHROPIC_API_KEY set: Claude answers from the viewer's analysis pack only, cites sources [S1].., and runs scenarios
     through a tool, so every figure comes from the server's calculators (never from the model's memory).
   - Without a key (demo default): a built-in analyst engine answers the common investor questions from the same pack.
   Both modes analyse; neither recommends buying or selling (investment advice is regulated). */
import { eq } from 'drizzle-orm';
import { DB, schema as S } from './db/client';
import { Viewer, cfg, ConfigMap } from './domain';
import { MARKET, MARKET_ASOF, scenario, ScenarioIn } from './analytics';
import { analysisPack, Pack } from './modules/analysis.service';
import { listListings } from './modules/listings.service';
import { getConfig } from './common';

export type Source = { id: string; label: string };
export type AiAnswer = { mode: 'claude' | 'engine'; answer: string; sources: Source[]; followUps: string[]; disclaimer: string; model?: string };
const DISCLAIMER = 'AI analysis from platform data. Not investment, tax or legal advice; verify in the data room and with your advisers.';
const eur = (n?: number | null) => n === null || n === undefined ? '—' : Math.abs(n) >= 1e9 ? `€${trim((n / 1e9).toFixed(2))}bn` : Math.abs(n) >= 1e6 ? `€${trim((n / 1e6).toFixed(Math.abs(n) >= 1e8 ? 0 : 2))}m` : `€${Math.round(n).toLocaleString('en-GB')}`;
const trim = (s: string) => s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const pc = (n?: number | null, d = 2) => n === null || n === undefined ? '—' : `${n.toFixed(d)}%`;

type Ctx = { pack: Pack | null; process: any; listings: any[]; config: ConfigMap; sources: Source[] };
function sourcesFor(pack: Pack | null, process: any): Source[] {
  const s: Source[] = [];
  if (pack) {
    s.push({ id: 'S1', label: `Listing figures · ${pack.listing.name}` });
    s.push({ id: 'S2', label: pack.regulation ? `Rent roll (${pack.listing.units} units) · data room › Financial` : 'Property file (rent roll needs verification + NDA)' });
    s.push({ id: 'S3', label: 'WWS points estimate · Wet betaalbare huur (2024), thresholds from the config table' });
    s.push({ id: 'S4', label: 'Scenario engine · server calculation (10-year DCF, interest-only debt)' });
    s.push({ id: 'S5', label: `Market benchmarks and comparable transactions · ${MARKET_ASOF}` });
    s.push({ id: 'S6', label: 'Config table · transfer tax and acquisition costs (2026)' });
    s.push({ id: 'S7', label: 'ESG estimate from energy labels · data room › Technical' });
    if (process) s.push({ id: 'S8', label: 'Sale process letter and Q&A log · data room › Process' });
  } else {
    s.push({ id: 'S1', label: 'Live offering · listings you can access' }, { id: 'S5', label: `Market benchmarks · ${MARKET_ASOF}` }, { id: 'S6', label: 'Config table · transfer tax, WWS thresholds (2026)' }, { id: 'S3', label: 'Wet betaalbare huur (2024) · WWS points system' });
  }
  return s;
}

export async function askAnalyst(db: DB, v: Viewer | null, q: { question: string; slug?: string; history?: { role: 'user' | 'assistant'; text: string }[] }): Promise<AiAnswer | { error: number; message: string }> {
  let pack: Pack | null = null; let proc: any = null;
  if (q.slug) {
    const r = await analysisPack(db, q.slug, v); if (r.status !== 200) return { error: r.status, message: (r as any).message || 'Listing not found' };
    pack = r.pack;
    if (r.l.dealType === 'institutional') { const pr = (await db.select().from(S.saleProcesses).where(eq(S.saleProcesses.listingId, r.l.id)))[0]; if (pr) proc = { current: pr.stages[pr.stage]?.label, stages: pr.stages, minTicket: pr.minTicket }; }
  }
  const listings = pack ? [] : (await listListings(db, v, {})).filter((l: any) => !l.locked).map((l: any) => ({ slug: l.slug, name: l.name, city: l.city, type: l.propertyType, dealType: l.dealType, status: l.status, price: l.askingPrice ?? null, priceDisplay: l.priceDisplay, bar: l.bar, units: l.unitsCount, score: l.dealScore?.total, label: l.energyLabel }));
  const ctx: Ctx = { pack, process: proc, listings, config: await getConfig(db), sources: sourcesFor(pack, proc) };
  if (process.env.ANTHROPIC_API_KEY) { try { return await claude(ctx, q); } catch (e: any) { const a = engine(ctx, q.question); a.answer = `_(Claude unavailable: ${String(e.message).slice(0, 80)}. Built-in analyst answered.)_\n\n` + a.answer; return a; } }
  return engine(ctx, q.question);
}

/* ---------------- Claude ---------------- */
async function claude(ctx: Ctx, q: { question: string; history?: { role: 'user' | 'assistant'; text: string }[] }): Promise<AiAnswer> {
  const model = process.env.PP_AI_MODEL || 'claude-opus-5-5';
  const system = `You are the senior investment analyst of Portfolio & Prime, a Dutch residential investment platform for professional and institutional investors.
Answer like an experienced acquisitions analyst: precise, quantified, concise (under 220 words unless asked for more), structured with short paragraphs or "- " bullets, **bold** for key figures.
Rules:
- Use ONLY the data in CONTEXT and results of the run_scenario tool. Never invent figures, addresses, tenants or market data. If something is not in the context, say what is missing and where it would be (data room folder, Q&A).
- Cite sources inline with their ids, e.g. [S1], [S4]. Only cite ids listed in SOURCES.
- For any "what if" on rates, leverage, vacancy, rent growth, exit yield, hold period or rent, call run_scenario; do not compute IRR yourself.
- You analyse; you do not advise. Never say "buy", "you should invest" or similar. If asked for a recommendation, give the evidence for and against and say the decision is the investor's.
- Reply in the language of the question (Dutch, English or German).
SOURCES: ${JSON.stringify(ctx.sources)}
CONTEXT: ${JSON.stringify({ pack: ctx.pack, process: ctx.process, listings: ctx.listings, market: MARKET, transferTaxInvestorPct: cfg(ctx.config, 'transfer_tax_residential_investor') })}`;
  const tools = [{ name: 'run_scenario', description: 'Run the platform DCF for the current listing with changed assumptions. Returns levered/unlevered IRR, cash-on-cash, DSCR, equity multiple and exit value, plus the base case for comparison.',
    input_schema: { type: 'object', properties: { interest: { type: 'number', description: 'interest rate %' }, ltv: { type: 'number' }, vacancy: { type: 'number' }, rentGrowth: { type: 'number' }, exitYield: { type: 'number', description: 'exit net initial yield %' }, years: { type: 'number' }, rent: { type: 'number', description: 'annual gross rent €' } } } }];
  const messages: any[] = [...(q.history || []).slice(-6).map(h => ({ role: h.role, content: h.text })), { role: 'user', content: q.question }];
  for (let turn = 0; turn < 4; turn++) {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 45000);
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-api-key': String(process.env.ANTHROPIC_API_KEY), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1200, system, tools: ctx.pack?.scenarioBase ? tools : [], messages }) }).finally(() => clearTimeout(timer));
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d: any = await r.json(); messages.push({ role: 'assistant', content: d.content });
    const calls = (d.content || []).filter((b: any) => b.type === 'tool_use');
    if (d.stop_reason !== 'tool_use' || !calls.length) {
      const text = (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
      const cited = new Set([...text.matchAll(/\[(S\d)\]/g)].map(m => m[1]));
      return { mode: 'claude', model, answer: text, sources: ctx.sources.filter(s => cited.has(s.id)), followUps: followUps(ctx), disclaimer: DISCLAIMER };
    }
    messages.push({ role: 'user', content: calls.map((c: any) => ({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(runScenario(ctx, c.input || {})) })) });
  }
  throw new Error('too many tool calls');
}
function runScenario(ctx: Ctx, o: Partial<ScenarioIn>) {
  const base = ctx.pack!.scenarioInputs; const clean: any = {}; for (const k of ['interest', 'ltv', 'vacancy', 'rentGrowth', 'exitYield', 'years', 'rent']) if (typeof (o as any)[k] === 'number' && isFinite((o as any)[k])) clean[k] = (o as any)[k];
  return { base: scenario(base), scenario: scenario({ ...base, ...clean }), changed: clean };
}
function followUps(ctx: Ctx) {
  if (!ctx.pack) return ['Which portfolio has the highest yield?', 'How does Dutch rent regulation affect returns?', 'What does it cost to buy as an investor?'];
  const f = ['What are the biggest risks?', 'What happens if rates rise 200 bp?', 'Is the asking price in line with the market?'];
  if (ctx.pack.regulation) f.splice(1, 0, 'How exposed is the rent roll to the WWS caps?'); else f.push('How sustainable is it (ESG)?');
  if (ctx.process) f.push('Where are we in the sale process?');
  return f.slice(0, 4);
}

/* ---------------- Built-in analyst engine ---------------- */
const has = (q: string, re: RegExp) => re.test(q);
function num(q: string, re: RegExp) { const m = q.match(re); return m ? Number(m[m.length - 1].replace(',', '.')) : undefined; }
function overrides(q: string, base: ScenarioIn): Partial<ScenarioIn> {
  const o: Partial<ScenarioIn> = {};
  const bp = num(q, /(\d+)\s*(?:bp|bps|basis points?)/); const up = num(q, /(?:rates?|interest|rente)\s*(?:rise|rises|go(?:es)? up|increase[sd]?|up|stijgt|\+)\s*(?:by\s*)?(\d+(?:[.,]\d+)?)\s*%/);
  const abs = num(q, /(?:interest|rate|rente)[^0-9%]{0,20}?(?:of|at|to|is|=)?\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (bp !== undefined) o.interest = (base.interest ?? 4) + bp / 100; else if (up !== undefined) o.interest = (base.interest ?? 4) + up; else if (abs !== undefined) o.interest = abs;
  const vac = num(q, /vacan\w*[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/); if (vac !== undefined) o.vacancy = vac;
  const ex = num(q, /exit[^0-9]{0,25}(\d+(?:[.,]\d+)?)\s*%/); if (ex !== undefined) o.exitYield = ex;
  const ltv = num(q, /(?:ltv|leverage|loan.to.value|gearing)[^0-9]{0,20}(\d+(?:[.,]\d+)?)\s*%/); if (ltv !== undefined) o.ltv = ltv;
  const g = num(q, /(?:rent growth|indexation|growth|indexatie)[^0-9-]{0,20}(-?\d+(?:[.,]\d+)?)\s*%/); if (g !== undefined) o.rentGrowth = g;
  if (has(q, /rent freeze|no indexation|huurbevriezing/)) o.rentGrowth = 0;
  const yrs = num(q, /(\d{1,2})\s*(?:-?\s*years?|yrs?|jaar)/); if (yrs !== undefined && yrs >= 1 && yrs <= 20) o.years = yrs;
  return o;
}
function engine(ctx: Ctx, question: string): AiAnswer {
  const q = question.toLowerCase(); const out: string[] = []; const used = new Set<string>();
  const cite = (...ids: string[]) => { ids.forEach(i => used.add(i)); return ids.map(i => `[${i}]`).join(''); };
  const p = ctx.pack;
  const advice = has(q, /should (i|we) (buy|invest|bid)|is (it|this) a good (deal|investment|buy)|recommend|worth (buying|it)|moet ik|soll(te)? ich/);
  if (advice) out.push(`I can't tell you whether to buy: that is your investment committee's decision. Here is the evidence on both sides.`);

  if (!p) return general(ctx, q, out, cite, used);
  const L = p.listing; const b = p.scenarioBase; const v = p.valuation;
  const intents = {
    scenario: has(q, /interest|rate|rente|ltv|leverage|gearing|exit|irr|hold|vacan|growth|indexation|stress|downside|what if|scenario|freeze|bp\b|basis point|refinanc|wat als/),
    regulation: has(q, /wws|regulat|points|punten|betaalbare|rent cap|huurcommissie|social|mid.?rent|middenhuur|liberali|huurprijs/),
    risk: has(q, /risk|red flag|due diligence|\bdd\b|issue|problem|maintenance|mjop|asbestos|ground lease|erfpacht|watch out|concern|weak|downside|risico/),
    esg: has(q, /esg|energy|label|sustainab|taxonomy|sfdr|co2|carbon|green|paris|duurzaam|gresb|nzeb/),
    valuation: has(q, /valu|worth|fair|overpriced|cheap|expensive|comparable|comps|benchmark|market price|per m|per unit|discount|premium|asking|waarde/),
    tax: has(q, /tax|overdracht|transfer|cost(s)? (to|of) buy|acquisition cost|notary|k\.k\.|belasting|grunderwerb/),
    yield: has(q, /yield|\bbar\b|\bnar\b|return|income|cash.?flow|cash-on-cash|\bcoc\b|dscr|rendement|niy/),
    process: has(q, /process|deadline|stage|round|timeline|shortlist|indicative|binding|bid|q&a|spa|closing/),
  };
  let any = Object.values(intents).some(Boolean);
  const summary = !any || has(q, /summar|overview|tell me|explain|memo|key points|thesis|in short|samenvatting|highlights/);

  if (summary || advice) {
    out.push(`**${L.name}** is ${an(L.propertyType.toLowerCase())} in ${L.city}${L.district ? ` (${L.district})` : ''}: ${L.units} unit${L.units === 1 ? '' : 's'}, ${L.areaM2.toLocaleString('en-GB')} m², built ${L.buildYear}, energy label ${L.energyLabel} ${cite('S1')}.`);
    if (L.bar) out.push(`- Asking **${eur(L.askingPrice)}** k.k. for **${eur(L.grossRentAnnual)}** gross rent: BAR **${pc(L.bar)}**, entry NIY ${pc(b?.entryNiy)} ${cite('S1', 'S4')}.`);
    else out.push(`- Asking **${eur(L.askingPrice)}** k.k.; no rental income (owner-occupier asset) ${cite('S1')}.`);
    out.push(`- Estimated value **${eur(v.low)}–${eur(v.high)}**; asking is ${v.vsAsking >= 0 ? v.vsAsking + '% above' : Math.abs(v.vsAsking) + '% below'} the midpoint (${v.verdict.toLowerCase()}) ${cite('S5')}.`);
    if (b) out.push(`- Base case (LTV ${b.inputs.ltv}%, ${b.inputs.interest}% interest, ${b.inputs.rentGrowth}% rent growth, ${b.inputs.years} years): levered IRR **${pc(b.leveredIrr)}**, unlevered ${pc(b.unleveredIrr)}, DSCR ${b.dscr ?? '—'} ${cite('S4')}.`);
    const top = p.flags.filter(f => f.level === 'high' || f.level === 'medium').slice(0, 2); if (top.length) out.push(`- Main watch points: ${top.map(f => f.title).join('; ')} ${cite('S2')}.`);
    const plus = p.flags.filter(f => f.level === 'positive').slice(0, 3); if (plus.length) out.push(`- Strengths: ${plus.map(f => f.title).join('; ')} ${cite('S2')}.`);
  }
  const scenarioOverrides = b ? overrides(q, p.scenarioInputs) : {};
  if (intents.yield && !summary && L.bar && !(intents.scenario && Object.keys(scenarioOverrides).length)) {
    out.push(`**Income and yield** ${cite('S1', 'S4')}`);
    out.push(`- Gross rent ${eur(L.grossRentAnnual)} on ${eur(L.askingPrice)} k.k.: BAR **${pc(L.bar)}**.`);
    out.push(`- Net operating income year 1: ${eur(b?.noiYear1)} after ${b?.inputs.vacancy}% vacancy and ${b?.inputs.opexPct}% operating costs; NIY on price ${pc(b?.entryNiy)}.`);
    out.push(`- Total acquisition cost ${eur(p.acquisition.total)} incl. ${p.acquisition.taxRate}% transfer tax ${cite('S6')}.`);
    if (b) out.push(`- With ${b.inputs.ltv}% LTV at ${b.inputs.interest}%: cash-on-cash **${pc(b.cocYear1)}** in year 1, DSCR ${b.dscr}, levered IRR **${pc(b.leveredIrr)}**, equity multiple ${b.equityMultiple}x.`);
  }
  if (intents.scenario && b) {
    const o = scenarioOverrides;
    if (Object.keys(o).length) {
      const s = scenario({ ...p.scenarioInputs, ...o }); const d = (a: number | null, z: number | null) => a === null || z === null ? '' : ` (${a - z >= 0 ? '+' : ''}${(a - z).toFixed(2)} pts)`;
      out.push(`**Scenario: ${Object.entries(o).map(([k, x]) => `${({ interest: 'interest', vacancy: 'vacancy', exitYield: 'exit yield', ltv: 'LTV', rentGrowth: 'rent growth', years: 'hold' } as any)[k]} ${k === 'years' ? x + ' yrs' : (x as number).toFixed(2).replace(/\.?0+$/, '') + '%'}`).join(', ')}** ${cite('S4')}`);
      out.push(`- Levered IRR **${pc(s.leveredIrr)}**${d(s.leveredIrr, b.leveredIrr)} vs base ${pc(b.leveredIrr)}; unlevered ${pc(s.unleveredIrr)}.`);
      out.push(`- Year-1 cash-on-cash ${pc(s.cocYear1)} (base ${pc(b.cocYear1)}); DSCR ${s.dscr ?? '—'} (base ${b.dscr ?? '—'})${s.dscr !== null && s.dscr < 1.2 ? ': **below a typical 1.2x bank covenant**' : ''}.`);
      out.push(`- Exit value after ${s.inputs.years} years ${eur(s.exitValue)} at a ${s.inputs.exitYield}% exit yield; equity multiple ${s.equityMultiple}x.`);
    } else {
      out.push(`**Stress tests** ${cite('S4')}`);
      for (const t of p.stress) out.push(`- ${t.name}: levered IRR **${pc(t.leveredIrr)}**, DSCR ${t.dscr ?? '—'}, equity multiple ${t.equityMultiple ?? '—'}x`);
      out.push(`Ask for a specific case, e.g. "interest 6%", "exit yield 5.5%" or "LTV 40% and 7 years".`);
    }
  }
  if (intents.regulation) {
    const r = p.regulation;
    if (!r) out.push(`The unit-level rent-regulation check needs the rent roll, which opens after verification and the property NDA ${cite('S2')}. At property level: ${L.energyLabel} label stock built ${L.buildYear}; under the Wet betaalbare huur, units up to ${cfg(ctx.config, 'wws_mid_points')} WWS points have a maximum rent ${cite('S3')}.`);
    else {
      out.push(`**Rent regulation (WWS) exposure** ${cite('S2', 'S3')}`);
      out.push(`- Indicative segments: ${r.segments.social} social (≤${r.thresholds.socialPts} pts), ${r.segments.mid} mid-rent (${r.thresholds.socialPts + 1}–${r.thresholds.midPts} pts), ${r.segments.free} free-sector.`);
      out.push(`- ${r.affected} units rent above their points maximum; capping them reduces rent by **${eur(r.annualLoss)} a year (${r.lossPct}%)**, from ${eur(r.rentNow)} to ${eur(r.rentAfter)}.`);
      const cap = p.stress.find(s => s.name === 'WWS cap applied'); if (cap) out.push(`- If every unit moved to its cap, levered IRR would be **${pc(cap.leveredIrr)}** vs ${pc(b?.leveredIrr)} base ${cite('S4')}.`);
      out.push(`- In practice mid-rent caps bite at re-letting; social tenants can ask the Huurcommissie for a reduction. Confirm with a points survey per unit.`);
    }
  }
  if (intents.risk && !summary) {
    out.push(`**Due-diligence watch points** ${cite('S2')}`);
    for (const f of p.flags.filter(f => f.level !== 'positive').slice(0, 5)) out.push(`- **${f.title}** (${f.level}): ${f.detail} _Source: ${f.source}._`);
    const pos = p.flags.filter(f => f.level === 'positive'); if (pos.length) out.push(`Mitigants: ${pos.map(f => f.title).join(', ')}.`);
    if (!p.regulation) out.push(`Unit-level flags (vacancy, rent caps, labels per unit) appear after verification and the NDA.`);
  }
  if (intents.esg) {
    const e = p.esg; out.push(`**ESG profile** ${cite('S7')}`);
    out.push(e.unitLevel ? `- Label mix across ${L.units} units: ${e.distribution.map(d => `${d.label} ${d.units}`).join(', ')}; ${e.shareAorB}% of floor area is label A or B.` : `- Energy label ${L.energyLabel} at property level; the label per unit opens with the rent roll (verification + NDA).`);
    out.push(`- Estimated energy intensity ~${e.energyIntensity} kWh/m²/yr, ~${e.co2PerM2} kg CO₂/m²/yr (${e.co2Total} t a year).`);
    out.push(`- EU Taxonomy: ${e.taxonomyAligned ? '**likely aligned**' : '**not aligned** on the label test'}; SFDR energy-inefficient share ${e.sfdrInefficientShare}%.`);
    if (e.upgradeCapexToB) out.push(`- Bringing everything to label B: about **${eur(e.upgradeCapexToB)}** (${eur(e.upgradeCapexPerUnit)} a unit).`);
  }
  if (intents.valuation && !summary) {
    out.push(`**Valuation check** ${cite('S5')}`);
    out.push(`- Estimate **${eur(v.point)}** (range ${eur(v.low)}–${eur(v.high)}) vs asking ${eur(L.askingPrice)}: ${v.verdict.toLowerCase()} (${v.vsAsking >= 0 ? '+' : ''}${v.vsAsking}%).`);
    out.push(`- Method: ${v.method}. ${L.city} benchmarks: BAR ${v.marketBar}%, €${v.marketPerM2.toLocaleString('en-GB')}/m².`);
    out.push(`- Asking per unit ${eur(L.askingPrice / L.units)}; comparables: ${p.comparables.slice(0, 3).map(c => `${c.name} (${c.units} units, BAR ${c.bar}%, ${eur(c.perUnit)}/unit, ${c.date})`).join('; ')}.`);
  }
  if (intents.tax) {
    const a = p.acquisition; out.push(`**Cost to buy** ${cite('S6')}`);
    out.push(`- Transfer tax ${a.taxRate}% (residential, investor; 2026 rate): ${eur(a.tax)}. Notary, valuation and financing ~1%: ${eur(a.other)}. Total **${eur(a.total)}** (${((a.total / L.askingPrice - 1) * 100).toFixed(1)}% on top of the price).`);
    if (L.units >= 100) out.push(`- For a portfolio this size, a share deal can change the transfer-tax position; the anti-abuse rules for real-estate entities still apply. Get a tax opinion.`);
  }
  if (intents.process) {
    if (ctx.process) { out.push(`**Sale process** ${cite('S8')}`); out.push(`- Current stage: **${ctx.process.current}**.`); for (const st of ctx.process.stages.filter((x: any) => x.deadline).slice(0, 4)) out.push(`- ${st.label}: ${new Date(st.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`); out.push(`Minimum ticket ${eur(ctx.process.minTicket)}. Indicative bids are non-binding; the shortlist gets vendor due diligence and site visits.`); }
    else out.push(L.dealType === 'bid_round' ? 'This property is sold through a sealed bid round: see the deadline and minimum bid in the sidebar.' : 'This is a direct sale: offers go through the offer form and are not binding until a purchase agreement is signed.');
  }
  if (advice && p.flags.length) out.push(`The decision depends on your return hurdle, your view on rent regulation and your capex budget.`);
  return { mode: 'engine', answer: out.join('\n'), sources: ctx.sources.filter(s => used.has(s.id)), followUps: followUps(ctx), disclaimer: DISCLAIMER };
}
function general(ctx: Ctx, q: string, out: string[], cite: (...i: string[]) => string, used: Set<string>): AiAnswer {
  const ls = ctx.listings.filter(l => l.status === 'available' || l.status === 'coming_soon');
  const city = Object.keys(MARKET).find(c => q.includes(c.toLowerCase()));
  const budgetM = num(q, /(?:€|eur|euro)?\s*(\d+(?:[.,]\d+)?)\s*(?:m\b|mn|million|mln|miljoen)/); const budgetB = num(q, /(\d+(?:[.,]\d+)?)\s*(?:bn|billion|b\b|miljard)/);
  const budget = budgetB ? budgetB * 1e9 : budgetM ? budgetM * 1e6 : undefined;
  let done = false;
  if (has(q, /best|highest|top|which|compare|rank|fit|budget|yield|portfolio|largest|biggest|deploy|allocate/) || budget) {
    let pool = ls.filter(l => l.bar); if (budget) pool = pool.filter(l => !l.price || l.price <= budget);
    const byYield = has(q, /yield|bar|income|return/); pool.sort((a, b) => byYield ? (b.bar ?? 0) - (a.bar ?? 0) : (b.price ?? 0) - (a.price ?? 0));
    out.push(`**${byYield ? 'Highest-yielding' : 'Largest'} income opportunities you can access${budget ? ` within ${eur(budget)}` : ''}** ${cite('S1')}`);
    for (const l of pool.slice(0, 5)) out.push(`- **${l.name}** (${l.city}, ${l.type.toLowerCase()}, ${l.units} units): ${l.price ? eur(l.price) : l.priceDisplay}, BAR ${pc(l.bar)}, deal score ${l.score}.`);
    if (!pool.length) out.push('- Nothing in your current access level matches. Private deal rooms open to verified institutional investors.');
    if (budget && budget >= 1e8) { const total = pool.reduce((a, l) => a + (l.price || 0), 0); out.push(`Together these come to ${eur(total)}. Deploying ${eur(budget)} in Dutch residential usually combines portfolio acquisitions, forward-funding of build-to-rent schemes and a buy-box mandate for off-market deal flow; ask your account manager to set one up.`); }
    done = true;
  }
  if (city) { const m = MARKET[city]; out.push(`**${city} benchmarks** ${cite('S5')}: residential BAR ~${m.bar}%, ~€${m.perM2.toLocaleString('en-GB')}/m², market rent ~€${m.rentM2}/m²/month, rent growth ~${m.growth}% a year, vacancy ~${m.vacancy}%.`); done = true; }
  if (has(q, /wws|regulat|points|betaalbare|rent cap|huurcommissie|social|mid.?rent|middenhuur/)) {
    out.push(`**Dutch rent regulation** ${cite('S3', 'S6')}: since July 2024 the Wet betaalbare huur extends the points system (WWS) to mid-rent. Homes up to ${cfg(ctx.config, 'wws_social_points')} points are social rent; ${cfg(ctx.config, 'wws_social_points') + 1}–${cfg(ctx.config, 'wws_mid_points')} points are mid-rent with a maximum of roughly €${Math.round(cfg(ctx.config, 'wws_mid_points') * cfg(ctx.config, 'wws_rent_per_point'))} a month; above that is free-sector. Points come mainly from floor area, energy label and WOZ value, so better labels raise the permitted rent. Open a listing's Analysis tab to see the unit-level exposure.`); done = true;
  }
  if (has(q, /tax|overdracht|transfer|cost(s)? (to|of) buy|belasting|grunderwerb/)) { out.push(`**Transfer tax** ${cite('S6')}: ${cfg(ctx.config, 'transfer_tax_residential_investor')}% for investors buying residential property (2026), ${cfg(ctx.config, 'transfer_tax_commercial')}% for commercial, ${cfg(ctx.config, 'transfer_tax_own_home')}% for an own main residence. Add about ${cfg(ctx.config, 'other_acquisition_costs')}% for notary, valuation and financing. Prices are k.k. (costs for the buyer).`); done = true; }
  if (has(q, /foreign|international|non.?resident|how (do|can) (i|we) (invest|buy)|process|start|kyc|kyb/)) { out.push(`**How institutions buy here** ${cite('S1')}: register, complete KYB (company, UBO, source of funds; Wwft), and get access to private deal rooms. Portfolios run as a two-round process: teaser and NDA, information memorandum, indicative bids, shortlist with vendor due diligence, final binding bids, SPA and notary transfer. Set a buy box so new deals reach you first.`); done = true; }
  if (!done) { out.push(`I can analyse any property you have access to and the Dutch residential market. Try: "Which portfolio has the highest yield?", "What does it cost to buy €50m as an investor?", "Explain the WWS points system", or open a listing and ask about its risks, rent-regulation exposure or a rate scenario.`); used.add('S1'); }
  return { mode: 'engine', answer: out.join('\n'), sources: ctx.sources.filter(s => used.has(s.id)), followUps: followUps(ctx), disclaimer: DISCLAIMER };
}
