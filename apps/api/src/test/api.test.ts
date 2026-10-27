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
/** Admin invites someone with the given properties and features; returns a logged-in client for them. */
async function invited(email: string, slugs: string[], features: string[]) {
  const a = new Client(); await a.login('admin@demo.nl'); const ov = (await a.req('/admin/access')).body;
  const r = await a.req('/admin/access/invites', { method: 'POST', json: { name: 'Invited Person', email, listingIds: slugs.map(x => ov.listings.find((l: any) => l.slug === x).id), features } });
  const c = new Client(); await c.req(`/invites/${r.body.path.split('/').pop()}/accept`, { method: 'POST', json: { password: 'a-long-password', acceptTerms: true } }); return c;
}
const pdf = () => new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' });

test('visitors see only the public site: the offering, details, map and market report need an invitation', async () => {
  const v = new Client();
  for (const path of ['/listings', '/listings/rotterdam-zuid', '/listings/map', '/market/report', '/institutional/deals', '/finder']) assert.equal((await v.req(path)).status, 401, path);
  assert.equal((await v.req('/calculations', { method: 'POST', json: { slug: 'rotterdam-zuid' } })).status, 403);
  assert.equal((await v.req('/stats')).status, 200); assert.equal((await v.req('/listings/sold')).status, 200, 'anonymised track record stays public');
  assert.equal((await v.req('/auth/register', { method: 'POST', json: { name: 'Test Investor', email: 'new@example.com', password: 'longpassword', investorType: 'Private person', country: 'NL', acceptTerms: true } })).status, 403, 'no self-registration');
  assert.equal((await v.req('/access-requests', { method: 'POST', json: { name: 'Lena', email: 'lena@example.com', interest: 'invest', consent: true } })).status, 201);
});
test('an invited person sees exactly the properties and features shared with them', async () => {
  const c = new Client(); await c.login('free@demo.nl');
  const mine = (await c.req('/listings')).body; assert.deepEqual(mine.map((l: any) => l.slug).sort(), ['amsterdam-canal-house', 'rotterdam-zuid', 'utrecht-oost']);
  const d = (await c.req('/listings/rotterdam-zuid')).body; assert.equal(d.askingPrice, 4260000); assert.ok(d.address); assert.ok(d.nar > 0);
  assert.equal((await c.req('/listings/eindhoven-collection')).status, 404, 'not shared: indistinguishable from not existing');
  assert.equal((await c.req('/listings/eindhoven-collection/analysis')).status, 404); assert.equal((await c.req('/favorites/eindhoven-collection', { method: 'POST' })).status, 404);
  assert.equal((await c.req('/finder')).status, 403, 'smart finder not switched on'); assert.equal((await c.req('/ai/ask', { method: 'POST', json: { question: 'Hello?' } })).status, 403);
  assert.equal((await c.req('/listings/map')).body.features.length, 3);
  assert.equal((await c.req('/listings/rotterdam-zuid/dataroom')).status, 403);
  const fd = new FormData(); fd.append('amount', '4000000'); assert.equal((await c.req('/listings/rotterdam-zuid/offers', { method: 'POST', body: fd })).status, 403);
  const me = (await c.req('/me')).body.user; assert.deepEqual(me.features, ['map', 'analysis', 'messages']); assert.equal(me.listings, 3);
  assert.equal((await c.req('/admin/overview')).status, 403); assert.equal((await c.req('/admin/access')).status, 403);
});
test('invitation: admin shares two properties and chosen features; the link activates the account once; admin can change and pause access', async () => {
  const a = new Client(); await a.login('admin@demo.nl'); const sales = new Client(); await sales.login('sales@demo.nl');
  const ov = (await a.req('/admin/access')).body; const id = (slug: string) => ov.listings.find((l: any) => l.slug === slug).id;
  assert.equal((await sales.req('/admin/access')).status, 403, 'only admin and developer manage access');
  assert.equal((await a.req('/admin/access/invites', { method: 'POST', json: { name: 'X', email: 'nope' } })).status, 400);
  const inv = await a.req('/admin/access/invites', { method: 'POST', json: { name: 'Bea Buyer', email: 'bea@example.com', companyName: 'Bea Capital BV', investorType: 'Private BV', listingIds: [id('utrecht-oost'), id('den-haag-building')], features: ['messages', 'analysis'] } });
  assert.equal(inv.status, 201); assert.match(inv.body.path, /^\/invite\/[\w-]{20,}$/); const token = inv.body.path.split('/').pop();
  assert.equal((await a.req('/admin/access/invites', { method: 'POST', json: { name: 'Bea Buyer', email: 'bea@example.com' } })).status, 409);
  assert.equal((await new Client().req('/auth/login', { method: 'POST', json: { email: 'bea@example.com', password: 'whatever12' } })).status, 401, 'cannot log in before accepting');
  const info = (await new Client().req(`/invites/${token}`)).body; assert.equal(info.name, 'Bea Buyer'); assert.equal(info.listings, 2); assert.deepEqual(info.features.map((f: any) => f.key), ['analysis', 'messages']);
  assert.equal((await new Client().req('/invites/forged-token')).status, 404);
  const bea = new Client(); assert.equal((await bea.req(`/invites/${token}/accept`, { method: 'POST', json: { password: 'short', acceptTerms: true } })).status, 400);
  assert.equal((await bea.req(`/invites/${token}/accept`, { method: 'POST', json: { password: 'a-long-password', acceptTerms: true } })).status, 201);
  assert.equal((await new Client().req(`/invites/${token}/accept`, { method: 'POST', json: { password: 'another-password', acceptTerms: true } })).status, 404, 'single use');
  assert.deepEqual((await bea.req('/listings')).body.map((l: any) => l.slug).sort(), ['den-haag-building', 'utrecht-oost']);
  assert.ok((await bea.req('/listings/utrecht-oost/analysis')).body.valuation, 'analysis switched on'); assert.equal((await bea.req('/listings/map')).status, 403, 'map not switched on');
  const uid = (await a.req('/admin/access')).body.users.find((u: any) => u.email === 'bea@example.com').id;
  const upd = (await a.req(`/admin/access/users/${uid}`, { method: 'PUT', json: { listingScope: 'selected', listingIds: [id('utrecht-oost'), id('rotterdam-zuid')], features: ['messages', 'map'] } })).body; assert.equal(upd.added, 1);
  assert.deepEqual((await bea.req('/listings')).body.map((l: any) => l.slug).sort(), ['rotterdam-zuid', 'utrecht-oost'], 'changes apply on the next request');
  assert.equal((await bea.req('/listings/map')).status, 200); assert.equal((await bea.req('/listings/utrecht-oost/analysis')).status, 403);
  assert.ok((await bea.req('/me/dashboard')).body.notifications.some((n: any) => n.type === 'share' && /shared/.test(n.title)));
  assert.equal((await a.req(`/admin/access/users/${uid}/status`, { method: 'POST', json: { status: 'suspended' } })).status, 201);
  assert.equal((await bea.req('/listings')).status, 401, 'paused access signs the person out'); assert.equal((await bea.req('/auth/login', { method: 'POST', json: { email: 'bea@example.com', password: 'a-long-password' } })).status, 403);
  const dev = new Client(); await dev.login('developer@demo.nl'); assert.equal((await dev.req('/admin/access')).status, 200, 'developer manages access too');
  assert.equal((await dev.req('/admin/access/users/' + uid + '/status', { method: 'POST', json: { status: 'active' } })).status, 201); assert.equal((await bea.req('/auth/login', { method: 'POST', json: { email: 'bea@example.com', password: 'a-long-password' } })).status, 201);
  const pieter = (await new Client().req('/invites/demo-invite-pieter')).body; assert.equal(pieter.listings, 3, 'seeded demo invitation');
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
test('map and location filters: exact pins for shared properties; province and radius filter on the server', async () => {
  process.env.PP_OFFLINE = '1';
  const m = new Client(); await m.login('free@demo.nl'); const fc = (await m.req('/listings/map')).body; assert.equal(fc.type, 'FeatureCollection');
  const exact = fc.features.find((f: any) => f.properties.slug === 'rotterdam-zuid'); assert.equal(exact.properties.approx, false); assert.deepEqual(exact.geometry.coordinates, [4.49, 51.9]);
  const v = new Client(); await v.login('pro@demo.nl');
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
test('private deal rooms: shared with selected institutions; codename teaser until qualified; details and the process only for qualified institutions', async () => {
  const priv = new Client(); await priv.login('verified@demo.nl'); assert.ok(!(await priv.req('/listings')).body.some((l: any) => l.slug === 'project-tulip'), 'not shared, not listed');
  assert.equal((await priv.req('/listings/project-tulip')).status, 404); assert.equal((await priv.req('/listings/project-tulip/process')).status, 403);
  const bw = await invited('teaser@example.com', ['project-tulip'], ['institutional']); const t = (await bw.req('/listings/project-tulip')).body;
  assert.equal(t.locked, true, 'shared but not KYB-verified: codename teaser only'); assert.equal(t.name, 'Project Tulip'); assert.equal(t.askingPrice, undefined); assert.equal(t.address, undefined); assert.match(t.priceDisplay, /^€\d+–\d+m$/);
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
  const free = await invited('analyst@example.com', ['rotterdam-zuid', 'utrecht-oost'], ['analysis', 'analyst']); const a = (await free.req('/listings/rotterdam-zuid/analysis')).body;
  assert.ok(a.valuation.point > 0 && a.comparables.length > 0 && a.stress.length >= 5); assert.equal(a.regulation, null, 'rent-roll analysis needs verification + NDA');
  const s = (await free.req('/analysis/scenario', { method: 'POST', json: { slug: 'rotterdam-zuid', interest: 6 } })).body; assert.ok(s.scenario.leveredIrr < s.base.leveredIrr);
  assert.equal((await free.req('/listings/rotterdam-zuid/memo')).status, 403);
  const ans = (await free.req('/ai/ask', { method: 'POST', json: { slug: 'rotterdam-zuid', question: 'What happens if interest rises 200 bp?' } })).body;
  assert.equal(ans.mode, 'engine'); assert.match(ans.answer, /IRR/); assert.ok(ans.sources.some((x: any) => x.id === 'S4'));
  assert.equal((await free.req('/ai/ask', { method: 'POST', json: { slug: 'project-tulip', question: 'Summary?' } })).status, 404, 'the AI cannot open a deal that was not shared');
  const advice = (await free.req('/ai/ask', { method: 'POST', json: { slug: 'utrecht-oost', question: 'Should I buy this?' } })).body; assert.match(advice.answer, /can't tell you whether to buy/);
  const fund = new Client(); await fund.login('fund@demo.nl'); const t = (await fund.req('/listings/project-tulip/analysis')).body;
  assert.ok(t.regulation && t.regulation.units === 860, 'unit-level after NDA'); assert.ok(t.flags.some((f: any) => /regulation/i.test(f.title)));
  const reg = (await fund.req('/ai/ask', { method: 'POST', json: { slug: 'project-tulip', question: 'How exposed is the rent roll to the WWS caps?' } })).body; assert.match(reg.answer, /units rent above/);
  const memo = await fund.req('/listings/project-tulip/memo'); assert.equal(memo.status, 200); assert.equal(memo.headers.get('content-type'), 'application/pdf');
  const m = (await fund.req('/me/mandate')).body; assert.equal(m.hasBox, true); assert.equal(m.matches[0].score, 100); assert.ok(m.matches.slice(0, 2).some((x: any) => x.slug === 'project-tulip'));
  const gen = (await fund.req('/ai/ask', { method: 'POST', json: { question: 'Which portfolio has the highest yield within €500m?' } })).body; assert.match(gen.answer, /Project/);
  assert.ok((await fund.req('/market/report')).body.cities.length >= 6); assert.equal((await free.req('/market/report')).status, 403);
});

test('CRM integration: API key required; upsert by CRM id, share with invited people, withdraw', async () => {
  const dev = new Client(); await dev.login('developer@demo.nl');
  const key = (await dev.req('/admin/integrations/keys', { method: 'POST', json: { name: 'Company CRM' } })).body.key; assert.match(key, /^pp_live_/);
  const crm = (path: string, init: any = {}, k = key) => new Client().req(path, { ...init, headers: { 'x-api-key': k } });
  assert.equal((await crm('/integrations/crm/ping', {}, 'pp_live_wrong')).status, 401); assert.equal((await new Client().req('/integrations/crm/ping')).status, 401);
  const body = { externalId: 'CRM-777', name: 'Delft canal portfolio', status: 'available', dealType: 'portfolio', askingPrice: 5200000, grossRentAnnual: 290000, shareWith: ['free@demo.nl'],
    property: { address: 'Sample Oude Delft 10', postcode: '2611 BB', city: 'Delft', areaM2: 1400, buildYear: 1890, category: 'portfolios', propertyType: 'Residential portfolio', energyLabel: 'D' },
    units: [{ ref: '01', areaM2: 70, rentMonthly: 1200 }, { ref: '02', areaM2: 70, rentMonthly: 1215, rentType: 'mid' }] };
  assert.equal((await crm('/integrations/crm/listings', { method: 'POST', json: { ...body, askingPrice: 'x' } })).status, 400);
  const r = (await crm('/integrations/crm/listings', { method: 'POST', json: body })).body; assert.equal(r.created, true); assert.equal(r.shared, 1);
  const again = (await crm('/integrations/crm/listings', { method: 'POST', json: { ...body, askingPrice: 4990000 } })).body; assert.equal(again.created, false); assert.equal(again.slug, r.slug, 'same CRM id updates the same listing');
  const free = new Client(); await free.login('free@demo.nl'); const l = (await free.req(`/listings/${r.slug}`)).body; assert.equal(l.askingPrice, 4990000); assert.equal(l.unitsCount, 2);
  const other = new Client(); await other.login('verified@demo.nl'); assert.equal((await other.req(`/listings/${r.slug}`)).status, 404, 'not shared with everyone');
  assert.equal((await crm('/integrations/crm/listings/CRM-777', { method: 'DELETE' })).status, 200); assert.equal((await free.req(`/listings/${r.slug}`)).status, 404, 'withdrawn');
  const sales = new Client(); await sales.login('sales@demo.nl'); assert.equal((await sales.req('/admin/integrations')).status, 403);
  assert.ok((await dev.req('/admin/integrations')).body.log.some((x: any) => /CRM-777/.test(x.text)));
});
