'use client';
/* Buyers & outreach (staff): Excel import with progress, potential buyers for a property with the email composer, unsubscribe page. */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { moneyShort, date } from '@/lib/format';
import { Icon, PropertyPicker, FeaturePicker, type Listing as AccessListing, type FeatureDef, type Preset } from '@/components/access';

async function call(url: string, method = 'GET', json?: unknown, body?: BodyInit) {
  const r = await fetch(url, { method, headers: json === undefined ? undefined : { 'content-type': 'application/json' }, body: json === undefined ? body : JSON.stringify(json) });
  const t = await r.text(); let d: any = t; try { d = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error((Array.isArray(d?.message) ? d.message.join(', ') : d?.message) || `Request failed (${r.status})`); return d;
}
const KIND: Record<string, string> = { properties: 'Buildings (properties export)', owners: 'Companies (owners export)', holdings: 'Company ↔ building links', contacts: 'Contact persons', pending: 'Reading…' };

/* ---------- Import ---------- */
export function ImportBox() {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]); const [drag, setDrag] = useState(false); const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const add = (list: FileList | null) => { if (list) setFiles(f => [...f, ...Array.from(list).filter(x => /\.(xlsx|xlsm|csv)$/i.test(x.name) && !f.some(y => y.name === x.name))]); };
  async function start() {
    setBusy(true); setErr(''); setRows(null);
    try {
      const fd = new FormData(); files.forEach(f => fd.append('files', f));
      const r = await call('/api/admin/buyers/import', 'POST', undefined, fd); setRows(r.files.map((f: any) => ({ id: f.id, fileName: f.file, status: 'queued', kind: 'pending' })));
      for (let i = 0; i < 600; i++) {
        await new Promise(res => setTimeout(res, 1200));
        const s = await call(`/api/admin/buyers/imports?batch=${r.batch}`); setRows(s.imports);
        if (s.done) break;
      }
      setFiles([]); router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return <div className="panel imp">
    <div className="imp-head"><span className="in-ic"><Icon name="doc" /></span><div><p className="eyebrow">IMPORT</p><h2>Add or update data.</h2></div></div>
    <p className="muted-small">Drop the Kadaster exports (owners, owner_properties, properties) and contact lists. The type of each file is recognised from its columns; new batches update existing rows by BAG pand id and company name.</p>
    <div className={`drop ${drag ? 'on' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}>
      <Icon name="plus" /><b>Drop Excel or CSV files here</b><small>or click to choose · up to 25 MB each</small>
      <input ref={input} type="file" multiple accept=".xlsx,.xlsm,.csv" hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
    </div>
    {files.length > 0 && !busy && <ul className="imp-files">{files.map(f => <li key={f.name}><Icon name="doc" /><span>{f.name}<small>{(f.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter(x => x !== f))}><Icon name="x" /></button></li>)}</ul>}
    {rows && <ul className="imp-files">{rows.map(r => <li key={r.id} className={r.status}><span className={`imp-dot ${r.status}`} /><span>{r.fileName}<small>{r.status === 'failed' ? r.error : r.status === 'done' ? `${KIND[r.kind] || r.kind} · ${r.rows.toLocaleString('en')} rows · ${r.created.toLocaleString('en')} new · ${r.updated.toLocaleString('en')} updated${r.skipped ? ` · ${r.skipped} skipped` : ''}` : `${KIND[r.kind] || r.kind} · ${r.status}${r.rows ? ` · ${r.rows.toLocaleString('en')} rows` : ''}`}</small>
      {r.report?.problems?.length > 0 && <details><summary>{r.report.problems.length} problem{r.report.problems.length > 1 ? 's' : ''}</summary><ul>{r.report.problems.map((p: string) => <li key={p}>{p}</li>)}</ul></details>}</span></li>)}</ul>}
    <div className="row wrap"><button className="btn navy small" disabled={!files.length || busy} onClick={start}>{busy ? 'Importing…' : `Import ${files.length || ''} file${files.length === 1 ? '' : 's'} ↗`}</button><a className="text-link" href="/api/admin/buyers/template">Contacts template (.xlsx)</a></div>
    {err && <p className="form-error">{err}</p>}
  </div>;
}

/* ---------- Potential buyers + composer ---------- */
type Buyer = { id: string; name: string; score: number; reasons: string[]; buildings: number; lastPurchase: string | null; segment: string | null; stage: string; doNotContact: boolean; inCity: number; contacts: number; emailable: number; emailedForThis: string | null; lastEmailAt: string | null };
type Match = { listing: { id: string; name: string; nameNl: string | null; city: string; propertyType: string; units: number; askingPrice: number; priceOnRequest: boolean; status: string; slug: string }; buyers: Buyer[]; total: number; templates: Record<'nl' | 'en', { subject: string; body: string }>; mail: { mode: string; from: string } };
const scoreClass = (s: number) => s >= 75 ? 'hi' : s >= 55 ? 'mid' : 'lo';

export type AccessChoices = { listings: AccessListing[]; features: FeatureDef[]; presets: Preset[] };

export function BuyerFinder({ data, lang, access }: { data: Match; lang: 'nl' | 'en'; access: AccessChoices }) {
  const router = useRouter();
  const [q, setQ] = useState(''); const [onlyEmail, setOnlyEmail] = useState(false); const [hideDone, setHideDone] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [language, setLanguage] = useState<'nl' | 'en'>(lang);
  const [subject, setSubject] = useState(data.templates[lang].subject); const [body, setBody] = useState(data.templates[lang].body); const [scope, setScope] = useState('selected'); const [ids, setIdsRaw] = useState<Set<string>>(new Set([data.listing.id]));
  const [feat, setFeat] = useState<Set<string>>(new Set(access.presets.find(p => p.key === 'institution')?.features)); const [drawer, setDrawer] = useState(false);
  const setIds = (n: Set<string>) => setIdsRaw(new Set([data.listing.id, ...n])); // the property in the email is always included
  const shared = access.listings.filter(x => ids.has(x.id));
  const [preview, setPreview] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<any>(null);
  const shown = useMemo(() => data.buyers.filter(b => (!q || b.name.toLowerCase().includes(q.toLowerCase())) && (!onlyEmail || b.emailable > 0) && (!hideDone || !b.emailedForThis)), [data.buyers, q, onlyEmail, hideDone]);
  const chosen = data.buyers.filter(b => sel.has(b.id)); const reach = chosen.reduce((n, b) => n + (b.doNotContact ? 0 : b.emailable), 0);
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); setPreview(null); };
  const switchLang = (l: 'nl' | 'en') => {
    if (subject === data.templates[language].subject) setSubject(data.templates[l].subject);
    if (body === data.templates[language].body) setBody(data.templates[l].body);
    setLanguage(l); setPreview(null); router.replace(`/admin?tab=buyers&find=${data.listing.id}&lang=${l}`, { scroll: false });
  };
  const payload = () => ({ listingId: data.listing.id, companyIds: [...sel], language, subject, body, listingScope: scope, listingIds: [...ids], features: [...feat] });
  async function doPreview() { setErr(''); setBusy(true); try { setPreview(await call('/api/admin/outreach/preview', 'POST', payload())); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function queue() { setErr(''); setBusy(true); try { const r = await call('/api/admin/outreach/campaigns', 'POST', payload()); setDone(r); setSel(new Set()); setPreview(null); router.refresh(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  const l = data.listing;
  return <div className="finder-grid">
    <div className="bf-list">
      <div className="bf-bar"><label className="search-in"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies" aria-label="Search companies" /></label>
        <label className="check-label"><input type="checkbox" checked={onlyEmail} onChange={e => setOnlyEmail(e.target.checked)} />With email contact</label>
        <label className="check-label"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Hide already emailed</label>
        <button type="button" className="link-button" onClick={() => setSel(new Set(shown.filter(b => b.emailable > 0 && !b.doNotContact).slice(0, 25).map(b => b.id)))}>Select top 25 with email</button>
        {sel.size > 0 && <button type="button" className="link-button" onClick={() => setSel(new Set())}>Clear</button>}</div>
      <p className="muted-small">{shown.length} of {data.total} companies · ranked by location, property type, deal size, scale and buying activity</p>
      <ol className="bf-rows">{shown.map((b, i) => { const can = b.emailable > 0 && !b.doNotContact; return <li key={b.id} className={`${sel.has(b.id) ? 'on' : ''} ${b.doNotContact ? 'dnc' : ''}`}>
        <label className="bf-check"><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} disabled={b.doNotContact} aria-label={`Select ${b.name}`} /></label>
        <span className={`score ${scoreClass(b.score)}`} title="Match score out of 100"><b>{b.score}</b><i style={{ width: b.score + '%' }} /></span>
        <div className="bf-main"><div className="bf-name"><span className="rank">{i + 1}</span><Link href={`/admin?tab=buyers&company=${b.id}`}>{b.name}</Link>
          {b.doNotContact ? <span className="status-chip expired"><i />Do not contact</span> : b.emailedForThis ? <span className="status-chip pending"><i />Emailed {date(b.emailedForThis)}</span> : null}
          {b.stage !== 'new' && !b.doNotContact && <span className="chip ghost">{b.stage.replace('_', ' ')}</span>}</div>
          <ul className="bf-reasons">{b.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>
        <div className="bf-side"><span className={`mail-badge ${can ? 'ok' : ''}`}><Icon name="mail" />{b.emailable ? `${b.emailable} contact${b.emailable > 1 ? 's' : ''}` : 'No email yet'}</span>{!b.emailable && <Link className="link-button" href={`/admin?tab=buyers&company=${b.id}#contacts`}>Add contact</Link>}</div>
      </li>; })}</ol>
      {!shown.length && <div className="empty"><p>No companies match. {data.total ? 'Clear the filters.' : 'Import the ownership exports under Buyers first.'}</p></div>}
    </div>

    {sel.size > 0 && !done && <a className="sel-bar" href="#composer"><b>{sel.size}</b> selected · {reach} email{reach === 1 ? '' : 's'}<span>Write the email ↓</span></a>}
    <section className="composer" id="composer" aria-label="Email to the selected companies">
      <p className="eyebrow">EMAIL · {l.name.toUpperCase()}</p>
      {done ? <div className="invite-done"><span className="done-mark"><Icon name="check" /></span><h3>{done.queued} email{done.queued === 1 ? '' : 's'} queued.</h3>
        <p className="muted-small">{done.mail.mode === 'smtp' ? 'They go out in batches over the next minutes.' : 'No mail server is connected yet, so sending is simulated: the emails appear in the outbox (Automation tab) and the tracking links work.'}{Object.values(done.skip as Record<string, number>).some(Boolean) ? ` Skipped: ${Object.entries(done.skip as Record<string, number>).filter(([, n]) => n).map(([k, n]) => `${n} ${({ noContact: 'without email contact', unsubscribed: 'unsubscribed', alreadyEmailed: 'already emailed', doNotContact: 'marked do-not-contact' } as any)[k]}`).join(', ')}.` : ''}</p>
        <div className="row wrap"><Link className="btn navy small" href={`/admin?tab=outreach&campaign=${done.id}`}>Follow the results ↗</Link><button className="btn outline small" onClick={() => setDone(null)}>Email more buyers</button></div></div>
      : <>
        <div className="cmp-sel"><b>{sel.size}</b> compan{sel.size === 1 ? 'y' : 'ies'} selected<span>{reach} email{reach === 1 ? '' : 's'}</span></div>
        <div className="scope-seg small" role="radiogroup" aria-label="Language">{(['nl', 'en'] as const).map(x => <button key={x} type="button" role="radio" aria-checked={language === x} onClick={() => switchLang(x)}><b>{x === 'nl' ? 'Nederlands' : 'English'}</b></button>)}</div>
        <label>Subject<input value={subject} onChange={e => { setSubject(e.target.value); setPreview(null); }} maxLength={200} /></label>
        <label>Message<textarea value={body} onChange={e => { setBody(e.target.value); setPreview(null); }} rows={13} maxLength={6000} /></label>
        <p className="fine-print tokens">Filled in per company: {['{first_name}', '{company}', '{property}', '{city}', '{type}', '{reason}', '{price}', '{sender}', '{link}'].map(t => <code key={t}>{t}</code>)}. <b>{'{link}'}</b> is the personal invitation link. An unsubscribe line is added automatically.</p>
        <div className="grant-sum"><div><p className="eyebrow">ACCESS WHEN THEY OPEN THE LINK</p><b>{scope === 'all' ? 'All properties' : `${ids.size} propert${ids.size === 1 ? 'y' : 'ies'}`} · {feat.size} feature{feat.size === 1 ? '' : 's'}</b>
          <small>{scope === 'all' ? 'Including future listings' : shared.slice(0, 3).map(x => x.name).join(' · ') + (shared.length > 3 ? ` +${shared.length - 3}` : '')}</small></div>
          <button type="button" className="btn outline small" onClick={() => setDrawer(true)}>Choose</button></div>
        {preview && (preview.sample ? <div className="mail-preview"><p className="eyebrow">PREVIEW · 1 OF {preview.count} · {preview.companies} COMPAN{preview.companies === 1 ? 'Y' : 'IES'}</p><dl><dt>To</dt><dd>{preview.sample.to}</dd><dt>Subject</dt><dd><b>{preview.sample.subject}</b></dd></dl><pre>{preview.sample.body}</pre></div>
          : <p className="form-error">Nobody to email in this selection: add contact persons with an email address first.</p>)}
        <div className="row wrap"><button className="btn outline small" disabled={!sel.size || busy} onClick={doPreview}>Preview</button><button className="btn navy small" disabled={!sel.size || !reach || busy} onClick={queue}>{busy ? 'Working…' : `Queue ${reach || ''} email${reach === 1 ? '' : 's'} ↗`}</button></div>
        {err && <p className="form-error">{err}</p>}
        <p className="fine-print">{data.mail.mode === 'smtp' ? `Sent from ${data.mail.from} in batches; replies go to you.` : 'Sending is simulated until a mail server (SMTP) is connected. Each email carries a personal link: opening it creates the invitation with access to this property only.'} Companies already emailed about this property are skipped.</p>
      </>}
    </section>
    {drawer && <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Access for the email link" onKeyDown={e => e.key === 'Escape' && setDrawer(false)}><button className="drawer-backdrop" aria-label="Close" onClick={() => setDrawer(false)} />
      <div className="drawer"><div className="drawer-head"><div><p className="eyebrow">ACCESS · SAME AS AN INVITATION</p><h2>What they get.</h2><p>Opening the link in the email creates their invitation with exactly these properties and features. {l.name} is always included. Change it later per person under People &amp; access.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={() => setDrawer(false)}><Icon name="x" /></button></div>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">1</span><div><h4>Properties they see</h4></div></div><PropertyPicker listings={access.listings} scope={scope} setScope={setScope} ids={ids} setIds={setIds} /></section>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">2</span><div><h4>Features they can use</h4></div></div><FeaturePicker features={access.features} presets={access.presets} on={feat} setOn={setFeat} /></section>
        <div className="drawer-foot"><span className="muted-small">{scope === 'all' ? 'All properties' : `${ids.size} propert${ids.size === 1 ? 'y' : 'ies'}`} · {feat.size} feature{feat.size === 1 ? '' : 's'}</span><button type="button" className="btn navy" onClick={() => { setDrawer(false); setPreview(null); }}><Icon name="check" />Use this access</button></div></div></div>}
  </div>;
}

export function ListingSwitch({ listings, current }: { listings: { id: string; name: string; city: string }[]; current?: string }) {
  const router = useRouter();
  return <label className="listing-switch"><span>Property</span><select value={current || ''} onChange={e => e.target.value && router.push(`/admin?tab=buyers&find=${e.target.value}`)}><option value="">Choose a property to find buyers…</option>{listings.map(l => <option key={l.id} value={l.id}>{l.name} · {l.city}</option>)}</select></label>;
}

export function DoNotContact({ id, on }: { id: string; on: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return <label className="switch-row compact"><span><b>Do not contact</b><small>Excluded from every email. Queued emails are cancelled.</small></span><input className="toggle" type="checkbox" checked={on} disabled={busy} onChange={async e => { setBusy(true); try { await call(`/api/admin/buyers/${id}`, 'PATCH', { doNotContact: e.target.checked }); router.refresh(); } finally { setBusy(false); } }} /></label>;
}

/* ---------- Public: unsubscribe ---------- */
export function Unsubscribe({ token, email, already }: { token: string; email: string; already: boolean }) {
  const [done, setDone] = useState(already); const [err, setErr] = useState('');
  useEffect(() => setDone(already), [already]);
  return done ? <><h1>You are unsubscribed.</h1><p>{email} will not receive further emails from Portfolio &amp; Prime about new opportunities.</p></>
    : <><h1>Unsubscribe?</h1><p>Stop emails about new investment opportunities to {email}.</p><div className="row"><button className="btn navy" onClick={async () => { try { await call(`/api/m/${token}/unsubscribe`, 'POST', {}); setDone(true); } catch (e: any) { setErr(e.message); } }}>Unsubscribe ↗</button></div>{err && <p className="form-error">{err}</p>}</>;
}

/* ---------- Developer: which workspace sections admins see ---------- */
export function WorkspaceTabs({ tabs }: { tabs: { key: string; label: string; visible: boolean; locked: boolean }[] }) {
  const router = useRouter(); const [state, setState] = useState(tabs); const [err, setErr] = useState('');
  const set = async (key: string, visible: boolean) => { setErr(''); try { const r = await call(`/api/admin/workspace/tabs/${key}`, 'PUT', { visible }); setState(r.tabs); router.refresh(); } catch (e: any) { setErr(e.message); } };
  return <div className="panel tab-settings">{state.map(t => <label key={t.key} className="switch-row"><span><b>{t.label}</b><small>{TAB_HELP[t.key]}</small></span>{t.locked ? <span className="chip ghost">Always on</span> : <input className="toggle" type="checkbox" checked={t.visible} onChange={e => set(t.key, e.target.checked)} aria-label={`Show ${t.label} to admins`} />}</label>)}{err && <p className="form-error">{err}</p>}</div>;
}
const TAB_HELP: Record<string, string> = {
  access: 'Invite investors and choose their properties and features.', buyers: 'Kadaster import, company profiles, contact persons, potential buyers.', outreach: 'Emails to buyers and their results; simulated outbox.',
  listings: 'Properties, status and prices; Find buyers.', messages: 'Chat with invited investors.', offers: 'Offers, deals and viewing requests.', overview: 'KPIs and funnel statistics.',
  investors: 'Lead scores and activity per investor.', bids: 'Sealed bid rounds with a deadline.', processes: 'Structured institutional sales with Q&A.', acquisitions: 'Pipeline of properties the company buys.',
  compliance: 'KYC checks (Wwft), unusual transactions, audit log.', automation: 'Background rules, job queue, all outgoing email drafts.' };

export const fmt = { moneyShort };
