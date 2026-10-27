/* Institutional analytics: valuation and comparables, Dutch rent regulation (WWS), ESG, due-diligence flags, scenarios and
   mandate fit. Pure functions, no database access, so every number the AI analyst quotes comes from here and is testable.
   Market benchmarks and comparables below are fictional demo data; production plugs in a transaction-data provider. */
import { ConfigMap, cfg } from './domain';
export { INSTITUTIONAL_TYPES, isQualified } from './domain';

/* ---------- Market benchmarks (demo) ---------- */
export const MARKET: Record<string, { bar: number; perM2: number; rentM2: number; growth: number; vacancy: number }> = {
  Amsterdam: { bar: 4.3, perM2: 7400, rentM2: 27.5, growth: 3.1, vacancy: 1.2 }, Utrecht: { bar: 4.9, perM2: 5600, rentM2: 22.8, growth: 3.4, vacancy: 1.5 },
  Rotterdam: { bar: 5.6, perM2: 4200, rentM2: 19.6, growth: 3.6, vacancy: 2.1 }, 'Den Haag': { bar: 5.3, perM2: 4700, rentM2: 20.4, growth: 3.0, vacancy: 1.8 },
  Eindhoven: { bar: 5.8, perM2: 4100, rentM2: 18.9, growth: 3.3, vacancy: 2.0 }, Haarlem: { bar: 4.8, perM2: 6200, rentM2: 23.1, growth: 2.9, vacancy: 1.3 },
  Wassenaar: { bar: 3.8, perM2: 6900, rentM2: 21.0, growth: 2.4, vacancy: 1.0 },
};
const mk = (c: string) => MARKET[c] || { bar: 5.4, perM2: 4300, rentM2: 19, growth: 3, vacancy: 2 };
export const MARKET_ASOF = 'Q3 2026 (demo benchmarks)';

/** Fictional comparable transactions, labelled as such everywhere they appear. */
export const COMPS = [
  { city: 'Amsterdam', name: 'Nieuw-West residential block', units: 64, price: 21400000, bar: 4.5, label: 'B', date: '2026-06', buyer: 'Dutch pension fund' },
  { city: 'Amsterdam', name: 'Oost mid-rent portfolio', units: 118, price: 39800000, bar: 4.4, label: 'A', date: '2026-03', buyer: 'German insurer' },
  { city: 'Utrecht', name: 'Leidsche Rijn BTR scheme', units: 210, price: 71200000, bar: 4.8, label: 'A', date: '2026-05', buyer: 'Nordic fund' },
  { city: 'Utrecht', name: 'Zuilen apartment building', units: 26, price: 6900000, bar: 5.2, label: 'C', date: '2025-12', buyer: 'Family office' },
  { city: 'Rotterdam', name: 'Kralingen residential portfolio', units: 96, price: 24100000, bar: 5.5, label: 'C', date: '2026-04', buyer: 'UK fund' },
  { city: 'Rotterdam', name: 'Feijenoord mixed portfolio', units: 152, price: 33600000, bar: 6.0, label: 'D', date: '2025-11', buyer: 'Private equity' },
  { city: 'Den Haag', name: 'Statenkwartier apartments', units: 31, price: 9100000, bar: 5.1, label: 'C', date: '2026-02', buyer: 'Family office' },
  { city: 'Eindhoven', name: 'Strijp-S rental tower', units: 180, price: 48500000, bar: 5.6, label: 'A', date: '2026-07', buyer: 'Dutch insurer' },
  { city: 'Haarlem', name: 'Schalkwijk residential estate', units: 74, price: 19800000, bar: 5.0, label: 'B', date: '2026-01', buyer: 'Housing fund' },
  { city: 'Randstad', name: 'Multi-city residential portfolio (1,050 units)', units: 1050, price: 342000000, bar: 5.2, label: 'B', date: '2026-05', buyer: 'Global asset manager' },
];

export type UnitIn = { ref: string; areaM2: number; rentMonthly: number; rentType: string; energyLabel: string | null; occupancy: string };
export type PropIn = { city: string; areaM2: number; buildYear: number; energyLabel: string; tenure: string; wozValue: number | null; category: string; district?: string | null };
export type ListIn = { askingPrice: number; grossRentAnnual: number; operatingCostsAnnual: number | null; occupancy: number | null; dealType: string };
const r0 = (n: number) => Math.round(n), r1 = (n: number) => Math.round(n * 10) / 10, r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- Automated valuation ---------- */
export function valuation(l: ListIn, p: PropIn, unitsCount: number) {
  const m0 = mk(p.city); const big = unitsCount > 100;
  // Large portfolios trade at a yield premium (+40 bp) and below single-asset prices per m² (multi-city, mixed stock).
  const m = { ...m0, bar: r2(big ? m0.bar + 0.4 : m0.bar), perM2: Math.round(m0.perM2 * (big ? 0.82 : unitsCount > 40 ? 0.93 : 1)) };
  const labelAdj = ({ A: 1.06, B: 1.03, C: 1, D: 0.96, E: 0.92, F: 0.89, G: 0.86 } as Record<string, number>)[p.energyLabel] ?? 1;
  const income = l.grossRentAnnual ? l.grossRentAnnual / (m.bar / 100) : 0;
  const comparison = p.areaM2 * m.perM2 * labelAdj; const wIncome = big ? 0.8 : 0.7;
  const point = income ? income * wIncome + comparison * (1 - wIncome) : comparison;
  const low = point * 0.94, high = point * 1.06; const vsAsking = (l.askingPrice - point) / point * 100;
  return { point: r0(point / 1e4) * 1e4, low: r0(low / 1e4) * 1e4, high: r0(high / 1e4) * 1e4, income: r0(income), comparison: r0(comparison), marketBar: m.bar, marketPerM2: m.perM2,
    vsAsking: r1(vsAsking), verdict: vsAsking > 6 ? 'Above the estimated range' : vsAsking < -6 ? 'Below the estimated range' : 'Within the estimated range',
    method: income ? `${wIncome * 100}% income approach (rent ÷ market BAR${big ? ' + 40 bp portfolio premium' : ''}) + ${100 - wIncome * 100}% comparison approach (m² × market price, energy-label adjusted)` :'Comparison approach (m² × market price, energy-label adjusted)', asOf: MARKET_ASOF };
}
export function comparables(p: PropIn, unitsCount: number) {
  const big = unitsCount >= 200; const pool = COMPS.filter(c => c.city === p.city || (big && c.units >= 150));
  return (pool.length ? pool : COMPS).slice(0, 5).map(c => ({ ...c, perUnit: r0(c.price / c.units) }));
}

/* ---------- Dutch rent regulation: WWS points (Wet betaalbare huur, 2024) ---------- */
const ENERGY_PTS: Record<string, number> = { A: 37, B: 33, C: 22, D: 14, E: 8, F: 4, G: 0 };
/** Indicative WWS points for one unit. A real assessment needs a points survey per unit (kitchen, sanitary, outdoor space). */
export function wwsPoints(u: UnitIn, unitWoz: number) {
  const area = u.areaM2; const energy = ENERGY_PTS[u.energyLabel || 'C'] ?? 22; const fixtures = 34;
  let woz = unitWoz / 14543 + (unitWoz / Math.max(1, area)) / 229; const base = area + energy + fixtures;
  woz = Math.min(woz, (base + woz) * 0.33); // WOZ points capped at a third of the total
  return r0(base + woz);
}
export function rentRegulation(units: UnitIn[], p: PropIn, c: ConfigMap) {
  const socialPts = cfg(c, 'wws_social_points'), midPts = cfg(c, 'wws_mid_points'), perPt = cfg(c, 'wws_rent_per_point');
  const totalArea = units.reduce((a, u) => a + u.areaM2, 0) || 1;
  let now = 0, after = 0; const seg = { social: 0, mid: 0, free: 0 }; const rows = [];
  for (const u of units) {
    const woz = (p.wozValue || 0) * u.areaM2 / totalArea; const pts = wwsPoints(u, woz);
    const segment = pts <= socialPts ? 'social' : pts <= midPts ? 'mid' : 'free'; seg[segment]++;
    const cap = segment === 'free' ? null : r0(pts * perPt); const rent = u.occupancy === 'vacant' ? 0 : u.rentMonthly;
    const capped = cap !== null && rent > cap ? cap : rent; now += rent * 12; after += capped * 12;
    rows.push({ ref: u.ref, areaM2: u.areaM2, label: u.energyLabel, points: pts, segment, rent, maxRent: cap, excess: Math.max(0, rent - capped) });
  }
  const loss = now - after;
  return { units: units.length, segments: seg, rentNow: r0(now), rentAfter: r0(after), annualLoss: r0(loss), lossPct: now ? r1(loss / now * 100) : 0,
    affected: rows.filter(r => r.excess > 0).length, worst: rows.sort((a, b) => b.excess - a.excess).slice(0, 8),
    thresholds: { socialPts, midPts, perPt, socialMax: r0(socialPts * perPt), midMax: r0(midPts * perPt) },
    note: 'Indicative points estimate (area, energy label, WOZ, standard fixtures). Mid-rent caps apply to new leases; social-rent tenants can ask the Huurcommissie for a reduction. Thresholds come from the config table and change every 1 July.' };
}

/* ---------- ESG ---------- */
const KWH: Record<string, number> = { A: 105, B: 150, C: 190, D: 240, E: 290, F: 340, G: 400 };
export function esg(units: UnitIn[], p: PropIn) {
  const list = units.length ? units : [{ ref: '1', areaM2: p.areaM2, rentMonthly: 0, rentType: 'none', energyLabel: p.energyLabel, occupancy: 'let' }];
  const area = list.reduce((a, u) => a + u.areaM2, 0) || 1; const dist: Record<string, number> = {};
  let kwh = 0, capex = 0, aOrB = 0;
  const nzeb = p.buildYear >= 2021; // new builds (BENG/NZEB) sit well below the label-A average
  for (const u of list) { const lb = u.energyLabel || p.energyLabel; dist[lb] = (dist[lb] || 0) + 1; kwh += (nzeb && lb === 'A' ? 55 : KWH[lb] ?? 200) * u.areaM2; const steps = Math.max(0, 'ABCDEFG'.indexOf(lb) - 1); capex += steps * 65 * u.areaM2; if ('AB'.includes(lb)) aOrB += u.areaM2; }
  const intensity = kwh / area; const co2 = intensity * 0.21; const newBuild = p.buildYear >= 2021;
  const taxonomy = newBuild ? intensity <= 95 : aOrB / area >= 0.99 && (dist.A || 0) / list.length >= 0.85;
  return { unitLevel: units.length > 0, distribution: 'ABCDEFG'.split('').filter(k => dist[k]).map(k => ({ label: k, units: dist[k] })), energyIntensity: r0(intensity), co2PerM2: r1(co2), co2Total: r0(co2 * area / 1000),
    upgradeCapexToB: r0(capex / 1000) * 1000, upgradeCapexPerUnit: r0(capex / list.length), shareAorB: r0(aOrB / area * 100), taxonomyAligned: taxonomy,
    sfdrInefficientShare: newBuild ? 0 : r0((1 - aOrB / area) * 100),
    note: 'Energy intensity and CO₂ are estimated from the energy labels (gas-heated stock). EU Taxonomy test: label A for pre-2021 buildings, NZEB −10% for newer. Capex assumes about €65 per m² per label step up to label B.' };
}

/* ---------- Due-diligence red flags ---------- */
export type Flag = { level: 'high' | 'medium' | 'low' | 'positive'; title: string; detail: string; source: string };
export function ddFlags(l: ListIn, p: PropIn, units: UnitIn[], reg?: ReturnType<typeof rentRegulation> | null): Flag[] {
  const f: Flag[] = []; const year = new Date().getFullYear(); const n = units.length || 1;
  if (p.buildYear > year) f.push({ level: 'medium', title: 'Forward funding: delivery and lease-up risk', detail: `Completion expected in ${p.buildYear}. Check the developer guarantee, fixed-price construction contract, penalty clauses and the lease-up assumption.`, source: 'Legal › Turnkey agreement (forward funding)' });
  if (p.buildYear < 1994 && p.buildYear <= year) f.push({ level: 'medium', title: 'Built before 1994: asbestos inventory needed', detail: `Build year ${p.buildYear}. Budget for an asbestos survey and possible removal before renovation.`, source: 'Technical › Asbestos inventory' });
  if (/erfpacht|ground lease/i.test(p.tenure)) f.push({ level: /perpetual|prepaid|eeuwigdurend/i.test(p.tenure) ? 'low' : 'medium', title: 'Ground lease (erfpacht)', detail: `${p.tenure}. Check the canon revision date and the conditions for conversion to perpetual.`, source: 'Legal › Ground lease conditions' });
  const vacant = units.filter(u => u.occupancy === 'vacant').length;
  if (units.length && vacant / n > 0.03 && p.buildYear <= year) f.push({ level: 'medium', title: `Vacancy ${r1(vacant / n * 100)}%`, detail: `${vacant} of ${n} units vacant in the rent roll. Check letting history and reasons.`, source: 'Financial › Rent roll' });
  const poor = units.filter(u => 'EFG'.includes(u.energyLabel || p.energyLabel)).length;
  if (poor) f.push({ level: poor / n > 0.2 ? 'high' : 'medium', title: `${poor} unit${poor === 1 ? '' : 's'} with energy label E–G`, detail: 'Lower WWS points, higher capex and weaker ESG reporting. Plan sustainability works.', source: 'Technical › Energy labels per unit' });
  if (reg && reg.lossPct > 2) f.push({ level: reg.lossPct > 8 ? 'high' : 'medium', title: `Rent regulation: ${reg.lossPct}% of rent above the points cap`, detail: `${reg.affected} units rent above their indicative WWS maximum. Exposure: €${reg.annualLoss.toLocaleString('en-GB')} a year at re-letting or on tenant request.`, source: 'Financial › Rent roll + WWS points estimate' });
  const age = year - p.buildYear;
  if (age > 40) f.push({ level: age > 80 ? 'medium' : 'low', title: 'Major maintenance cycle', detail: `Average building age ${age} years. Expect roofs, façades and installations within the MJOP horizon; estimate ~€${age > 80 ? 38 : 28} per m² a year.`, source: 'Technical › Building inspection 2025' });
  const opexShare = l.grossRentAnnual ? (l.operatingCostsAnnual ?? l.grossRentAnnual * 0.22) / l.grossRentAnnual : 0;
  if (opexShare > 0.25) f.push({ level: 'low', title: `Operating costs ${r0(opexShare * 100)}% of rent`, detail: 'Above the 20–24% typical for Dutch residential. Review the service-cost statement and management fees.', source: 'Financial › Service-cost statement 2025' });
  if (l.occupancy && l.occupancy >= 97) f.push({ level: 'positive', title: `Occupancy ${l.occupancy}%`, detail: 'Stable income profile.', source: 'Financial › Rent roll' });
  if ('AB'.includes(p.energyLabel)) f.push({ level: 'positive', title: `Energy label ${p.energyLabel}`, detail: 'Strong points position and lower capex need.', source: 'Technical › Energy labels per unit' });
  if (/^freehold|eigen grond|mostly freehold/i.test(p.tenure)) f.push({ level: 'positive', title: /^mostly/i.test(p.tenure) ? 'Mostly freehold' : 'Freehold',detail: 'No ground-lease canon (or only a small share of the stock).', source: 'Legal › Kadaster ownership extract' });
  const order = { high: 0, medium: 1, low: 2, positive: 3 }; return f.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---------- Scenario and stress testing ---------- */
export type ScenarioIn = { price: number; rent: number; opexPct?: number; vacancy?: number; ltv?: number; interest?: number; rentGrowth?: number; exitYield?: number; years?: number; costsPct?: number };
export function irr(flows: number[]) {
  const npv = (r: number) => flows.reduce((a, v, i) => a + v / (1 + r) ** i, 0);
  let lo = -0.99, hi = 1; if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
export function scenario(s: ScenarioIn) {
  const opexPct = s.opexPct ?? 22, vac = s.vacancy ?? 3, ltv = s.ltv ?? 50, rate = s.interest ?? 4, g = s.rentGrowth ?? 2.5, years = Math.max(1, Math.min(20, Math.round(s.years ?? 10))), costs = s.costsPct ?? 9;
  const noi1 = s.rent * (1 - vac / 100) * (1 - opexPct / 100); const entryNiy = s.price ? noi1 / s.price * 100 : 0; const exitY = s.exitYield ?? r2(entryNiy || 4);
  const loan = s.price * ltv / 100, equity = s.price * (1 + costs / 100) - loan, debt = loan * rate / 100;
  const cash: number[] = [], noi: number[] = [];
  for (let t = 1; t <= years + 1; t++) noi.push(noi1 * (1 + g / 100) ** (t - 1));
  for (let t = 0; t < years; t++) cash.push(noi[t] - debt);
  const exitValue = exitY > 0 ? noi[years] / (exitY / 100) * (1 - 0.015) : 0; const proceeds = exitValue - loan;
  const lev = irr([-equity, ...cash.slice(0, -1), cash[years - 1] + proceeds]); const unlev = irr([-s.price * (1 + costs / 100), ...noi.slice(0, years - 1), noi[years - 1] + exitValue]);
  const totalIn = cash.reduce((a, v) => a + v, 0) + proceeds;
  return { inputs: { opexPct, vacancy: vac, ltv, interest: rate, rentGrowth: g, exitYield: exitY, years, costsPct: costs }, equity: r0(equity), loan: r0(loan), noiYear1: r0(noi1), entryNiy: r2(entryNiy),
    cashYear1: r0(cash[0]), cocYear1: equity ? r2(cash[0] / equity * 100) : 0, dscr: debt ? r2(noi1 / debt) : null, exitValue: r0(exitValue),
    leveredIrr: lev === null ? null : r2(lev * 100), unleveredIrr: unlev === null ? null : r2(unlev * 100), equityMultiple: equity ? r2(totalIn / equity) : null, cashFlows: cash.map(r0) };
}
/** Standard stress set an investment committee asks for. `regulatedRent` (WWS-capped) adds a regulation case. */
export function stressTests(base: ScenarioIn, regulatedRent?: number | null) {
  const b = scenario(base); const ey = b.inputs.exitYield;
  const cases: [string, string, ScenarioIn][] = [
    ['Base case', 'Your inputs', base],
    ['Rates +200 bp', 'Refinancing at higher interest', { ...base, interest: (base.interest ?? 4) + 2 }],
    ['Exit yield +100 bp', 'Weaker market at sale', { ...base, exitYield: ey + 1 }],
    ['Rent freeze + 8% vacancy', 'No indexation, weaker letting', { ...base, rentGrowth: 0, vacancy: 8 }],
  ];
  if (regulatedRent && regulatedRent < base.rent) cases.push(['WWS cap applied', 'All units at their indicative points maximum', { ...base, rent: regulatedRent }]);
  cases.push(['Combined downside', 'Rates +200 bp, exit +100 bp, rent freeze', { ...base, interest: (base.interest ?? 4) + 2, exitYield: ey + 1, rentGrowth: 0, vacancy: 6 }]);
  return cases.map(([name, detail, s]) => { const r = scenario(s); return { name, detail, leveredIrr: r.leveredIrr, unleveredIrr: r.unleveredIrr, cocYear1: r.cocYear1, dscr: r.dscr, equityMultiple: r.equityMultiple, exitValue: r.exitValue }; });
}

/* ---------- Mandate (buy box) fit ---------- */
export function mandateFit(x: { city: string; category: string; askingPrice: number; bar: number; energyLabel: string; dealType: string }, box: { regions?: string[]; types?: string[]; ticketMin?: number | null; ticketMax?: number | null; targetBar?: number | null } | null) {
  if (!box) return { score: 0, reasons: [] as { ok: boolean; text: string }[] };
  const reasons: { ok: boolean; text: string }[] = []; let pts = 0, max = 0;
  const add = (w: number, ok: boolean, text: string) => { max += w; if (ok) pts += w; reasons.push({ ok, text }); };
  if (box.regions?.length) add(25, box.regions.includes(x.city),box.regions.includes(x.city) ? `In your region (${x.city})` : `Outside your regions (${x.city})`);
  if (box.types?.length) add(20, box.types.includes(x.category), box.types.includes(x.category) ? 'Matches your property types' : 'Different property type');
  if (box.ticketMin || box.ticketMax) { const ok = (!box.ticketMin || x.askingPrice >= box.ticketMin) && (!box.ticketMax || x.askingPrice <= box.ticketMax); add(30, ok, ok ? 'Within your ticket size' : x.askingPrice > (box.ticketMax || Infinity) ? 'Above your maximum ticket' : 'Below your minimum ticket'); }
  if (box.targetBar) add(15, x.bar >= box.targetBar, x.bar ? `BAR ${x.bar.toFixed(2)}% vs your target ${box.targetBar}%` : 'No rental income');
  add(10, 'ABC'.includes(x.energyLabel), 'ABC'.includes(x.energyLabel) ? `Energy label ${x.energyLabel}` : `Energy label ${x.energyLabel}: capex needed`);
  return { score: max ? r0(pts / max * 100) : 0, reasons };
}
