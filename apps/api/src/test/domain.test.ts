import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, canDetails, canOffer, offMarketState, priceBand, acquisition, figures, finance, dealScore, leadScore, kycRisk, bagLookup, matchesSearch, totp, verifyTotp, newTotpSecret, alertFrequency, isStaff, maxPrice, isQualified } from '../domain';
import { irr, scenario, stressTests, wwsPoints, rentRegulation, esg, valuation, ddFlags, mandateFit } from '../analytics';

test('tiers: visitor < free < verified < pro; staff are not investors', () => {
  assert.equal(tierOf(null), 'visitor'); assert.equal(tierOf({ id: 'a' }), 'free'); assert.equal(tierOf({ id: 'a', verified: true }), 'verified'); assert.equal(tierOf({ id: 'a', verified: true, pro: true }), 'pro');
  assert.equal(tierOf({ id: 'a', pro: true }), 'free', 'Pro without verification is not Pro');
  assert.equal(canDetails(null), false); assert.equal(canDetails({ id: 'a' }), true); assert.equal(canOffer({ id: 'a' }), false); assert.equal(canOffer({ id: 'a', verified: true }), true);
  assert.equal(isStaff({ id: 's', role: 'compliance' }), true); assert.equal(isStaff({ id: 'i', role: 'investor' }), false); assert.equal(canDetails({ id: 's', role: 'admin' }), true);
  assert.deepEqual([null, { id: 'a' }, { id: 'a', verified: true }, { id: 'a', verified: true, pro: true }].map(alertFrequency), [null, 'weekly', 'daily', 'instant']);
});
test('off-market: Pro first, verified after the window, others locked, staff always', () => {
  const until = new Date('2026-10-26T09:00:00Z'), before = until.getTime() - 1, after = until.getTime() + 1;
  assert.equal(offMarketState('off_market', until, null, before), 'locked'); assert.equal(offMarketState('off_market', until, { id: 'a' }, before), 'locked');
  assert.equal(offMarketState('off_market', until, { id: 'a', verified: true }, before), 'pro-window'); assert.equal(offMarketState('off_market', until, { id: 'a', verified: true }, after), 'open');
  assert.equal(offMarketState('off_market', until, { id: 'a', verified: true, pro: true }, before), 'open'); assert.equal(offMarketState('off_market', until, { id: 's', role: 'sales' }, before), 'open');
  assert.equal(offMarketState('direct', null, null), 'open');
});
test('price band hides the exact price', () => { assert.equal(priceBand(4260000), '€4–4.5m'); assert.equal(priceBand(1650000), '€1.5–1.75m'); assert.equal(priceBand(2950000, true), 'Price on request'); });
test('BAR, NAR and acquisition costs follow the plan and the config table', () => {
  const l = { askingPrice: 4260000, grossRentAnnual: 255600, operatingCostsAnnual: 56200, areaM2: 1788, unitsCount: 24 };
  const f = figures(l, {}); assert.ok(Math.abs(f.bar - 6) < 1e-9); assert.ok(Math.abs(f.nar - (255600 - 56200) / (4260000 * 1.09) * 100) < 1e-9);
  assert.equal(acquisition(1e6, { transfer_tax_residential_investor: 10.4 }).taxRate, 10.4); assert.equal(acquisition(1e6, {}, { ownHome: true, homes: true }).taxRate, 2); assert.equal(acquisition(1e6, {}, { ownHome: true, homes: false }).taxRate, 8);
  assert.equal(acquisition(1e6, { buyer_fee: 1 }).fee, 10000);
});
test('finance: cash flow, cash-on-cash and DSCR', () => { const f = finance(1e6, 1e5, { ltv: 60, interest: 4, expense: 20, vacancy: 10 }); assert.equal(f.net, 72000); assert.equal(f.cash, 48000); assert.equal(f.equity, 490000); assert.equal(f.dscr, 3); assert.equal(finance(1e6, 1e5, { ltv: 0 }).dscr, 0); assert.ok(maxPrice(1e6, 60) > 2e6); });
test('deal score and lead score are bounded and ordered', () => {
  const s = dealScore({ askingPrice: 7240000, grossRentAnnual: 456120, energyLabel: 'A', demand: 14, occupancy: 97, areaM2: 2690, buildYear: 2008 }); assert.ok(s.total >= 0 && s.total <= 100); assert.equal(s.parts.length, 4);
  assert.equal(dealScore({ askingPrice: 1e6, grossRentAnnual: 0, energyLabel: 'Z', areaM2: 100, buildYear: 1900 }).parts[1][1], 50);
  assert.equal(leadScore({ kind: 'offer', amount: 1e6 }, true, 1e6).band, 'Hot'); assert.equal(leadScore({ kind: 'question' }, false).band, 'Cold'); assert.equal(leadScore({ kind: 'viewing', message: 'x'.repeat(90) }, true).band, 'Warm');
});
test('KYC risk: country, structure, ticket and PEP', () => {
  assert.equal(kycRisk({}), 'low'); assert.equal(kycRisk({ investorType: 'Fund', country: 'GB' }), 'medium'); assert.equal(kycRisk({ investorType: 'Fund', country: 'AE', ticket: 2e7 }), 'high'); assert.equal(kycRisk({ pep: true }), 'medium'); assert.equal(kycRisk({ pep: true, country: 'US' }), 'high');
});
test('BAG lookup validates postcodes and is deterministic', () => { assert.equal(bagLookup('bad', '1'), null); assert.equal(bagLookup('3011AB', ''), null); const a = bagLookup('3011 ab', '12'); assert.equal(a!.city, 'Rotterdam'); assert.deepEqual(bagLookup('3011AB', '12'), a); });
test('search matching: status, city, budget, yield, buy box', () => {
  const l = { city: 'Rotterdam', category: 'portfolios', askingPrice: 4260000, grossRentAnnual: 255600, dealType: 'portfolio', status: 'available' };
  assert.equal(matchesSearch(l, { city: 'Rotterdam', budget: 5e6, minYield: 5 }), true); assert.equal(matchesSearch(l, { city: 'Utrecht' }), false); assert.equal(matchesSearch(l, { budget: 4e6 }), false);
  assert.equal(matchesSearch({ ...l, status: 'under_offer' }, {}), false); assert.equal(matchesSearch(l, { regions: ['Utrecht'] }), false); assert.equal(matchesSearch(l, { regions: ['Rotterdam'], types: ['portfolios'], ticketMin: 1e6, ticketMax: 5e6, targetBar: 5.5 }), true); assert.equal(matchesSearch(l, { targetBar: 7 }), false);
});
test('institutional deal rooms: only verified institutions and staff', () => {
  assert.equal(isQualified({ id: 'a', verified: true, investorType: 'Pension fund' }), true); assert.equal(isQualified({ id: 'a', verified: false, investorType: 'Fund' }), false);
  assert.equal(isQualified({ id: 'a', verified: true, investorType: 'Private BV' }), false); assert.equal(offMarketState('institutional', null, { id: 's', role: 'sales' }), 'open'); assert.equal(offMarketState('institutional', null, null), 'locked');
  assert.equal(priceBand(298500000), '€250–300m');
});
test('IRR and scenarios: higher rates and exit yields lower returns; IRR solves a known cash flow', () => {
  assert.ok(Math.abs(irr([-100, 10, 110])! - 0.1) < 1e-6); assert.equal(irr([100, 10]), null);
  const base = { price: 1e7, rent: 6e5, ltv: 50, interest: 4 }; const b = scenario(base);
  assert.ok(scenario({ ...base, interest: 6 }).leveredIrr! < b.leveredIrr!); assert.ok(scenario({ ...base, exitYield: b.inputs.exitYield + 1 }).leveredIrr! < b.leveredIrr!);
  assert.equal(scenario({ ...base, ltv: 0 }).dscr, null); const st = stressTests(base, 5e5); assert.equal(st.length, 6); assert.ok(st.find(s => s.name === 'WWS cap applied')!.leveredIrr! < b.leveredIrr!);
});
test('WWS: bigger, better-labelled homes get more points; rents above the cap count as exposure', () => {
  const u = (a: number, label: string, rent: number) => ({ ref: '1', areaM2: a, rentMonthly: rent, rentType: 'mid', energyLabel: label, occupancy: 'let' });
  assert.ok(wwsPoints(u(80, 'A', 0), 300000) > wwsPoints(u(50, 'F', 0), 300000));
  const p = { city: 'Utrecht', areaM2: 100, buildYear: 1970, energyLabel: 'D', tenure: 'Freehold', wozValue: 250000, category: 'buildings' };
  const r = rentRegulation([u(50, 'E', 1600), u(50, 'E', 600)], p, {}); assert.equal(r.affected, 1); assert.ok(r.annualLoss > 0 && r.rentAfter < r.rentNow);
  assert.equal(rentRegulation([u(140, 'A', 2400)], { ...p, wozValue: 900000 }, {}).segments.free, 1);
});
test('ESG, valuation, flags and mandate fit', () => {
  const p = { city: 'Rotterdam', areaM2: 1000, buildYear: 1936, energyLabel: 'C', tenure: 'Ground lease (erfpacht)', wozValue: 4e6, category: 'portfolios' };
  const e = esg([], p); assert.equal(e.taxonomyAligned, false); assert.ok(e.upgradeCapexToB > 0); assert.equal(esg([], { ...p, energyLabel: 'A', buildYear: 1990 }).taxonomyAligned, true);
  const l = { askingPrice: 4e6, grossRentAnnual: 24e4, operatingCostsAnnual: 5e4, occupancy: 96, dealType: 'portfolio' }; const v = valuation(l, p, 20); assert.ok(v.low < v.point && v.point < v.high);
  const f = ddFlags(l, p, []); assert.ok(f.some(x => /asbestos/.test(x.title)) && f.some(x => /Ground lease/.test(x.title))); assert.equal(f[f.length - 1].level === 'positive' || f.every(x => x.level !== 'positive'), true);
  assert.ok(ddFlags(l, { ...p, buildYear: 2099 }, []).some(x => /Forward funding/.test(x.title)));
  const fit = mandateFit({ city: 'Rotterdam', category: 'portfolios', askingPrice: 4e6, bar: 6, energyLabel: 'C', dealType: 'portfolio' }, { regions: ['Rotterdam'], types: ['portfolios'], ticketMin: 1e6, ticketMax: 5e6, targetBar: 5 }); assert.equal(fit.score, 100);
  assert.ok(mandateFit({ city: 'Amsterdam', category: 'homes', askingPrice: 9e6, bar: 0, energyLabel: 'F', dealType: 'direct' }, { regions: ['Rotterdam'], ticketMax: 5e6 }).score < 20); assert.equal(mandateFit({ city: 'x', category: 'x', askingPrice: 1, bar: 0, energyLabel: 'A', dealType: 'direct' }, null).score, 0);
});
test('TOTP: RFC 6238 test vector and ±1 step window', () => {
  const rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; assert.equal(totp(rfc, 59000), '287082'); assert.equal(totp(rfc, 1111111109000), '081804');
  const s = newTotpSecret(), now = Date.now(); assert.equal(verifyTotp(s, totp(s, now - 30000), now), true); assert.equal(verifyTotp(s, totp(s, now - 120000), now), false);
});
