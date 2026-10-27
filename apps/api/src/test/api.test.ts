/* End-to-end API tests against a fresh in-memory database: access control is enforced on the server, not in the browser. */
process.env.PP_MEMORY_DB = '1'; process.env.PP_NO_JOBS = '1'; process.env.PP_STORAGE_DIR = require('path').resolve(require('os').tmpdir(), 'pp-test-storage');
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../main';
import { closeDb } from '../db/client';
import { totp } from '../domain';
let app: any, base = '';
before(async () => { app = await createApp(); await app.listen(0, '127.0.0.1'); base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`; });
after(async () => { await app.close(); await closeDb(); });

class Client { cookie = ''; constructor() {}
  async req(path: string, init: any = {}) { const headers: any = { ...(init.headers || {}) }; if (this.cookie) headers.cookie = this.cookie; if (init.json !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(init.json); }
    const r = await fetch(base + path, { ...init, headers, redirect: 'manual' }); const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0]; const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch {} return { status: r.status, body, headers: r.headers }; }
  async login(email: string) { const r = await this.req('/auth/login', { method: 'POST', json: { email, password: 'Demo2026!' } }); if (r.body.needs2fa) await this.req('/auth/2fa/verify', { method: 'POST', json: { code: r.body.demoCode } }); return r; } }
const pdf = () => new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' });

test('visitor receives no address, exact price or financials; off-market is locked', async () => {
  const v = new Client(); const d = (await v.req('/listings/rotterdam-zuid')).body;
  assert.equal(d.full, false); assert.equal(d.address, undefined); assert.equal(d.askingPrice, undefined); assert.equal(d.nar, undefined); assert.equal(d.priceDisplay, '€4–4.5m');
  const villa = (await v.req('/listings')).body.find((l: any) => l.slug === 'wassenaar-villa'); assert.equal(villa.locked, true); assert.equal(villa.name, undefined);
  assert.equal((await v.req('/listings/rotterdam-zuid/units')).status, 403); assert.equal((await v.req('/calculations', { method: 'POST', json: { slug: 'rotterdam-zuid' } })).status, 403);
});
test('free member sees details but cannot open the data room or make offers', async () => {
  const c = new Client(); await c.login('free@demo.nl'); const d = (await c.req('/listings/rotterdam-zuid')).body;
  assert.equal(d.askingPrice, 4260000); assert.ok(d.address); assert.ok(d.nar > 0);
  assert.equal((await c.req('/listings/rotterdam-zuid/dataroom')).status, 403);
  const fd = new FormData(); fd.append('amount', '4000000'); assert.equal((await c.req('/listings/rotterdam-zuid/offers', { method: 'POST', body: fd })).status, 403);
  assert.equal((await c.req('/admin/overview')).status, 403);
});
test('register validates input and rejects duplicates', async () => {
  const c = new Client(); assert.equal((await c.req('/auth/register', { method: 'POST', json: { name: 'X', email: 'nope', password: '1' } })).status, 400);
  const ok = await c.req('/auth/register', { method: 'POST', json: { name: 'Test Investor', email: 'new@example.com', password: 'longpassword', investorType: 'Private person', country: 'NL', acceptTerms: true } }); assert.equal(ok.status, 201); assert.equal(ok.body.user.tier, 'free');
  assert.equal((await new Client().req('/auth/register', { method: 'POST', json: { name: 'Test Investor', email: 'new@example.com', password: 'longpassword', investorType: 'Private person', country: 'NL', acceptTerms: true } })).status, 409);
  assert.equal((await new Client().req('/auth/login', { method: 'POST', json: { email: 'new@example.com', password: 'wrong' } })).status, 401);
});
test('verified investor: NDA + 2FA open the data room; documents are watermarked PDFs behind expiring links', async () => {
  const c = new Client(); await c.login('verified@demo.nl');
  assert.equal((await c.req('/listings/utrecht-oost/dataroom')).status, 403, 'NDA required');
  assert.equal((await c.req('/listings/utrecht-oost/nda', { method: 'POST', json: { signedName: 'Victor Verified', accept: true } })).status, 201);
  const room = (await c.req('/listings/utrecht-oost/dataroom')).body; assert.ok(room.folders.length >= 3);
  const legal = room.folders.find((f: any) => f.name === 'Legal').files[0];
  assert.equal((await c.req(`/documents/${legal.id}/view-url?download=1`, { method: 'POST' })).status, 403, 'legal folder is view-only');
  const { url } = (await c.req(`/documents/${legal.id}/view-url`, { method: 'POST' })).body; const file = await fetch(base.replace('/api', '') + url, { headers: { cookie: c.cookie } });
  assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'application/pdf'); assert.ok((await file.arrayBuffer()).byteLength > 1000);
  const other = new Client(); await other.login('pro@demo.nl'); assert.equal((await fetch(base.replace('/api', '') + url, { headers: { cookie: other.cookie } })).status, 403, 'link is bound to the user');
  assert.equal((await fetch(base + '/documents/file/forged.token', { headers: { cookie: c.cookie } })).status, 403);
});
test('offer → admin accepts → deal timeline; bid round enforces minimum and closes', async () => {
  const c = new Client(); await c.login('verified@demo.nl');
  const fd = new FormData(); fd.append('amount', '3100000'); fd.append('transferDate', '2030-01-15'); fd.append('financingType', 'Mortgage'); fd.append('conditions', 'Financing'); fd.append('proof', pdf(), 'proof.pdf');
  const o = await c.req('/listings/utrecht-oost/offers', { method: 'POST', body: fd }); assert.equal(o.status, 201); assert.equal(o.body.lead.band, 'Hot');
  const staff = new Client(); await staff.login('sales@demo.nl');
  assert.equal((await staff.req(`/admin/offers/${o.body.id}/decision`, { method: 'POST', json: { decision: 'accepted' } })).status, 201);
  assert.equal((await staff.req(`/admin/offers/${o.body.id}/decision`, { method: 'POST', json: { decision: 'rejected' } })).status, 400, 'cannot decide twice');
  const dash = (await c.req('/me/dashboard')).body; assert.equal(dash.deals.length, 1); assert.equal(dash.deals[0].stage, 0);
  const round = (await c.req('/listings/eindhoven-collection')).body.bidRound; const low = new FormData(); low.append('amount', '1000'); low.append('conditions', 'No conditions'); low.append('acceptRules', 'on'); low.append('proof', pdf(), 'p.pdf');
  assert.equal((await c.req(`/bid-rounds/${round.id}/bids`, { method: 'POST', body: low })).status, 400);
  const bid = new FormData(); bid.append('amount', '7500000'); bid.append('conditions', 'No conditions'); bid.append('acceptRules', 'on'); bid.append('proof', pdf(), 'p.pdf');
  assert.equal((await c.req(`/bid-rounds/${round.id}/bids`, { method: 'POST', body: bid })).status, 201);
  assert.equal((await staff.req(`/admin/bid-rounds/${round.id}/close`, { method: 'POST' })).status, 201);
  assert.equal((await c.req(`/bid-rounds/${round.id}/bids`, { method: 'POST', body: bid })).status, 400, 'closed round rejects bids');
  const award = await staff.req(`/admin/bid-rounds/${round.id}/award`, { method: 'POST' }); assert.equal(award.body.amount, 7500000);
});
test('roles: sales cannot approve KYC; compliance cannot approve high risk without notes', async () => {
  const sales = new Client(); await sales.login('sales@demo.nl'); assert.equal((await sales.req('/admin/kyc')).status, 403);
  const comp = new Client(); await comp.login('compliance@demo.nl'); const cases = (await comp.req('/admin/kyc')).body; const high = cases.find((k: any) => k.risk === 'high');
  assert.equal((await comp.req(`/admin/kyc/${high.id}/decision`, { method: 'POST', json: { decision: 'approved' } })).status, 400);
  assert.equal((await comp.req(`/admin/kyc/${high.id}/decision`, { method: 'POST', json: { decision: 'approved', notes: 'EDD: source of funds verified' } })).status, 201);
  assert.equal((await comp.req('/admin/config', { method: 'PUT', json: { buyer_fee: 1 } })).status, 403, 'only admin edits config');
});
test('staff need two-factor login; price drop alerts savers', async () => {
  const a = new Client(); const r = await a.req('/auth/login', { method: 'POST', json: { email: 'admin@demo.nl', password: 'Demo2026!' } }); assert.equal(r.body.needs2fa, true);
  assert.equal((await a.req('/admin/overview')).status, 403); await a.req('/auth/2fa/verify', { method: 'POST', json: { code: r.body.demoCode } }); assert.equal((await a.req('/admin/overview')).status, 200);
  const f = new Client(); await f.login('free@demo.nl'); await f.req('/favorites/rotterdam-zuid', { method: 'POST' });
  const id = (await a.req('/admin/listings')).body.find((l: any) => l.slug === 'rotterdam-zuid').id;
  assert.equal((await a.req(`/admin/listings/${id}`, { method: 'PATCH', json: { askingPrice: 4000000 } })).body.alerts, 1);
  assert.ok((await f.req('/me/dashboard')).body.notifications.some((n: any) => /Price reduced/.test(n.title)));
});
test('KYC submission with files creates a pending case; approval verifies the investor', async () => {
  const c = new Client(); await c.login('free@demo.nl'); const fd = new FormData(); fd.append('liveness', 'on'); fd.append('ticket', '1000000'); fd.append('pep', 'no'); fd.append('idDoc', pdf(), 'id.pdf'); fd.append('proof', pdf(), 'pof.pdf');
  const k = await c.req('/kyc/cases', { method: 'POST', body: fd }); assert.equal(k.status, 201); assert.equal(k.body.risk, 'low');
  const bad = new FormData(); bad.append('liveness', 'on'); bad.append('ticket', '1'); bad.append('pep', 'no'); bad.append('idDoc', new Blob(['x'], { type: 'text/plain' }), 'x.txt'); bad.append('proof', pdf(), 'p.pdf');
  assert.equal((await c.req('/kyc/cases', { method: 'POST', body: bad })).status, 400);
  const comp = new Client(); await comp.login('compliance@demo.nl'); await comp.req(`/admin/kyc/${k.body.id}/decision`, { method: 'POST', json: { decision: 'approved' } });
  assert.equal((await c.req('/me')).body.user.verified, true);
});
test('map and location filters: visitors get city-centre points only; province and radius filter on the server', async () => {
  process.env.PP_OFFLINE = '1';
  const v = new Client(); const fc = (await v.req('/listings/map')).body; assert.equal(fc.type, 'FeatureCollection');
  const rz = fc.features.find((f: any) => f.properties.slug === 'rotterdam-zuid'); assert.equal(rz.properties.approx, true); assert.deepEqual(rz.geometry.coordinates, [4.4792, 51.9225]); assert.equal(rz.properties.price, null);
  assert.ok(!fc.features.some((f: any) => f.properties.slug === 'wassenaar-villa'), 'locked off-market listings are not on the map');
  const m = new Client(); await m.login('free@demo.nl'); const exact = (await m.req('/listings/map')).body.features.find((f: any) => f.properties.slug === 'rotterdam-zuid');
  assert.equal(exact.properties.approx, false); assert.deepEqual(exact.geometry.coordinates, [4.49, 51.9]);
  const zh = (await v.req('/listings?province=Zuid-Holland')).body; assert.ok(zh.length > 0 && zh.every((l: any) => l.province === 'Zuid-Holland'));
  const near = (await v.req('/listings?near=Rotterdam&radius=10')).body; assert.ok(near.every((l: any) => l.city === 'Rotterdam') && near.length > 0);
  assert.ok((await v.req('/listings?near=Rotterdam&radius=50')).body.some((l: any) => l.city === 'Den Haag' || l.city === 'Utrecht'));
  assert.equal((await v.req('/geo/resolve?q=Utrecht')).body.place.name, 'Utrecht');
});
test('messaging: investor writes about a listing, sales replies, investor is alerted; other investors and compliance cannot interfere', async () => {
  const inv = new Client(); await inv.login('free@demo.nl');
  assert.equal((await new Client().req('/messages', { method: 'POST', json: { listing: 'utrecht-oost', body: 'Hello' } })).status, 401);
  assert.equal((await inv.req('/messages', { method: 'POST', json: { listing: 'utrecht-oost', body: 'Is the roof recently renewed?' } })).status, 201);
  const sales = new Client(); await sales.login('sales@demo.nl'); const list = (await sales.req('/admin/messages')).body;
  const t = list.threads.find((x: any) => x.slug === 'utrecht-oost' && x.investorEmail === 'free@demo.nl'); assert.ok(t); assert.equal(t.unreadForStaff, 1);
  assert.equal((await sales.req('/admin/messages', { method: 'POST', json: { investorId: t.investorId, listing: 'utrecht-oost', body: 'Yes, in 2021. The inspection report is in the data room.' } })).status, 201);
  const mine = (await inv.req('/messages')).body.threads.find((x: any) => x.slug === 'utrecht-oost'); assert.equal(mine.unreadForInvestor, 1);
  const th = (await inv.req('/messages/thread?listing=utrecht-oost')).body; assert.equal(th.messages.length, 2); assert.equal(th.messages[1].fromStaff, true);
  assert.equal((await inv.req('/messages')).body.threads.find((x: any) => x.slug === 'utrecht-oost').unreadForInvestor, 0, 'opening the thread marks it read');
  assert.ok((await inv.req('/me/dashboard')).body.notifications.some((n: any) => n.type === 'message'));
  const other = new Client(); await other.login('pro@demo.nl'); assert.ok(!(await other.req('/messages')).body.threads.some((x: any) => x.slug === 'utrecht-oost'), 'threads are private');
  const comp = new Client(); await comp.login('compliance@demo.nl'); assert.equal((await comp.req('/admin/messages')).status, 200);
  assert.equal((await comp.req('/admin/messages', { method: 'POST', json: { investorId: t.investorId, listing: 'utrecht-oost', body: 'Hi' } })).status, 403);
  assert.equal((await inv.req('/admin/messages')).status, 403);
});
test('private deal rooms: codename teaser for everyone, details and the process only for qualified institutions', async () => {
  const v = new Client(); const t = (await v.req('/listings')).body.find((l: any) => l.slug === 'project-tulip');
  assert.equal(t.locked, true); assert.equal(t.name, 'Project Tulip'); assert.equal(t.askingPrice, undefined); assert.equal(t.address, undefined); assert.match(t.priceDisplay, /^€\d+–\d+m$/);
  assert.equal((await v.req('/listings/project-tulip/analysis')).status, 403);
  const priv = new Client(); await priv.login('verified@demo.nl'); assert.equal((await priv.req('/listings/project-tulip')).body.locked, true, 'a private BV is not qualified');
  assert.equal((await priv.req('/listings/project-tulip/process')).status, 403);
  const fund = new Client(); await fund.login('fund@demo.nl'); const d = (await fund.req('/listings/project-tulip')).body;
  assert.equal(d.locked, false); assert.ok(d.askingPrice > 1e8); assert.equal(d.unitsCount, 860);
  const pr = (await fund.req('/listings/project-tulip/process')).body; assert.equal(pr.stageKey, 'indicative'); assert.equal(pr.nda, false); assert.equal(pr.qa.length, 0, 'Q&A needs the NDA');
  assert.equal((await fund.req('/listings/project-tulip/process/bids', { method: 'POST', json: { amount: 3e8, financingType: 'Cash', structure: 'Share deal', acceptRules: true } })).status, 403);
  assert.equal((await fund.req('/listings/project-tulip/nda', { method: 'POST', json: { signedName: 'Ingrid Lund', accept: true } })).status, 201);
  const pr2 = (await fund.req('/listings/project-tulip/process')).body; assert.ok(pr2.qa.length >= 4 && pr2.qa.every((q: any) => q.answer), 'answered Q&A only (others’ open questions hidden)');
  assert.equal((await fund.req('/listings/project-tulip/process/bids', { method: 'POST', json: { amount: 1e6, financingType: 'Cash', structure: 'Share deal', acceptRules: true } })).status, 400, 'minimum ticket');
  assert.equal((await fund.req('/listings/project-tulip/process/bids', { method: 'POST', json: { amount: Math.round(d.askingPrice * 0.99), financingType: 'Cash', structure: 'Share deal', acceptRules: true } })).status, 201);
  assert.equal((await fund.req('/listings/project-tulip/qa', { method: 'POST', json: { category: 'Tax', question: 'Is the SPV part of a fiscal unity today?' } })).status, 201);
  assert.equal((await fund.req('/listings/project-tulip/offers', { method: 'POST', body: new FormData() })).status, 400, 'no ordinary offers on a process deal');
  const sales = new Client(); await sales.login('sales@demo.nl'); const ps = (await sales.req('/admin/processes')).body; const tp = ps.find((p: any) => p.slug === 'project-tulip');
  assert.equal(tp.bids.length, 3); assert.ok(tp.openQuestions.length >= 2);
  assert.equal((await sales.req(`/admin/qa/${tp.openQuestions.find((q: any) => /fiscal unity/.test(q.question)).id}/answer`, { method: 'POST', json: { answer: 'Yes; it ends at closing.' } })).status, 201);
  const adv = (await sales.req(`/admin/processes/${tp.id}/advance`, { method: 'POST', json: {} })).body; assert.equal(adv.shortlist, 3);
  assert.equal((await fund.req('/listings/project-tulip/process')).body.shortlisted, true);
  const comp = new Client(); await comp.login('compliance@demo.nl'); assert.equal((await comp.req('/admin/processes')).body.find((p: any) => p.slug === 'project-tulip').bids[0].amount, null, 'compliance does not see bid amounts');
});
test('analysis pack, scenarios, memo and AI analyst respect access levels', async () => {
  assert.equal((await new Client().req('/ai/ask', { method: 'POST', json: { question: 'What is the yield?' } })).status, 401);
  const free = new Client(); await free.req('/auth/register', { method: 'POST', json: { name: 'Analyst Test', email: 'analyst@example.com', password: 'longpassword', investorType: 'Private person', country: 'NL', acceptTerms: true } }); const a =(await free.req('/listings/rotterdam-zuid/analysis')).body;
  assert.ok(a.valuation.point > 0 && a.comparables.length > 0 && a.stress.length >= 5); assert.equal(a.regulation, null, 'rent-roll analysis needs verification + NDA');
  const s = (await free.req('/analysis/scenario', { method: 'POST', json: { slug: 'rotterdam-zuid', interest: 6 } })).body; assert.ok(s.scenario.leveredIrr < s.base.leveredIrr);
  assert.equal((await free.req('/listings/rotterdam-zuid/memo')).status, 403);
  const ans = (await free.req('/ai/ask', { method: 'POST', json: { slug: 'rotterdam-zuid', question: 'What happens if interest rises 200 bp?' } })).body;
  assert.equal(ans.mode, 'engine'); assert.match(ans.answer, /IRR/); assert.ok(ans.sources.some((x: any) => x.id === 'S4'));
  assert.equal((await free.req('/ai/ask', { method: 'POST', json: { slug: 'project-tulip', question: 'Summary?' } })).status, 403, 'the AI cannot open a locked deal');
  const advice = (await free.req('/ai/ask', { method: 'POST', json: { slug: 'utrecht-oost', question: 'Should I buy this?' } })).body; assert.match(advice.answer, /can't tell you whether to buy/);
  const fund = new Client(); await fund.login('fund@demo.nl'); const t = (await fund.req('/listings/project-tulip/analysis')).body;
  assert.ok(t.regulation && t.regulation.units === 860, 'unit-level after NDA'); assert.ok(t.flags.some((f: any) => /regulation/i.test(f.title)));
  const reg = (await fund.req('/ai/ask', { method: 'POST', json: { slug: 'project-tulip', question: 'How exposed is the rent roll to the WWS caps?' } })).body; assert.match(reg.answer, /units rent above/);
  const memo = await fund.req('/listings/project-tulip/memo'); assert.equal(memo.status, 200); assert.equal(memo.headers.get('content-type'), 'application/pdf');
  const m = (await fund.req('/me/mandate')).body; assert.equal(m.hasBox, true); assert.equal(m.matches[0].score, 100); assert.ok(m.matches.slice(0, 2).some((x: any) => x.slug === 'project-tulip'));
  const gen = (await fund.req('/ai/ask', { method: 'POST', json: { question: 'Which portfolio has the highest yield within €500m?' } })).body; assert.match(gen.answer, /Project/);
  assert.ok((await new Client().req('/market/report')).body.cities.length >= 6);
});
