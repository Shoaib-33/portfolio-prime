'use client';
/* Buyers & outreach (staff): Excel import with progress, potential buyers for a property with the email composer, unsubscribe page. */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { moneyShort, date } from '@/lib/format';
import { useT, useLang } from '@/components/lang';
import { Icon, PropertyPicker, FeaturePicker, type Listing as AccessListing, type FeatureDef, type Preset } from '@/components/access';

async function call(url: string, method = 'GET', json?: unknown, body?: BodyInit) {
  const r = await fetch(url, { method, headers: json === undefined ? undefined : { 'content-type': 'application/json' }, body: json === undefined ? body : JSON.stringify(json) });
  const t = await r.text(); let d: any = t; try { d = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error((Array.isArray(d?.message) ? d.message.join(', ') : d?.message) || `Request failed (${r.status})`); return d;
}
const KIND: Record<string, string> = { properties: 'Buildings (properties export)', owners: 'Companies (owners export)', holdings: 'Company ↔ building links', contacts: 'Contact persons', pending: 'Reading…' };
const IMPORT_STATUS: Record<string, string> = { queued: 'queued||import', processing: 'processing||import', done: 'done||import', failed: 'failed||import' };
const SKIP: Record<string, string> = { noContact: '{n} without email contact', unsubscribed: '{n} unsubscribed', alreadyEmailed: '{n} already emailed', doNotContact: '{n} marked do-not-contact' };
const STAGE: Record<string, string> = { contacted: 'Contacted||buyer', interested: 'Interested||buyer', in_talks: 'In talks||buyer', customer: 'Customer||buyer', not_interested: 'Not interested||buyer' };

/* ---------- Import ---------- */
export function ImportBox() {
  const t = useT(); const lang = useLang(); const nf = (n: number) => n.toLocaleString(lang === 'nl' ? 'nl-NL' : 'en');
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
    <div className="imp-head"><span className="in-ic"><Icon name="doc" /></span><div><p className="eyebrow">{t('IMPORT')}</p><h2>{t('Add or update data.')}</h2></div></div>
    <p className="muted-small">{t('Drop the Kadaster exports (owners, owner_properties, properties) and contact lists. The type of each file is recognised from its columns; new batches update existing rows by BAG pand id and company name.')}</p>
    <div className={`drop ${drag ? 'on' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}>
      <Icon name="plus" /><b>{t('Drop Excel or CSV files here')}</b><small>{t('or click to choose · up to 25 MB each')}</small>
      <input ref={input} type="file" multiple accept=".xlsx,.xlsm,.csv" hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
    </div>
    {files.length > 0 && !busy && <ul className="imp-files">{files.map(f => <li key={f.name}><Icon name="doc" /><span>{f.name}<small>{(f.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" className="icon-btn" aria-label={t('Remove {name}', { name: f.name })} onClick={() => setFiles(files.filter(x => x !== f))}><Icon name="x" /></button></li>)}</ul>}
    {rows && <ul className="imp-files">{rows.map(r => <li key={r.id} className={r.status}><span className={`imp-dot ${r.status}`} /><span>{r.fileName}<small>{r.status === 'failed' ? r.error : r.status === 'done' ? `${KIND[r.kind] ? t(KIND[r.kind]) : r.kind} · ${t('{n} rows', { n: nf(r.rows) })} · ${t('{n} new||rows', { n: nf(r.created) })} · ${t('{n} updated', { n: nf(r.updated) })}${r.skipped ? ` · ${t('{n} skipped', { n: r.skipped })}` : ''}` : `${KIND[r.kind] ? t(KIND[r.kind]) : r.kind} · ${IMPORT_STATUS[r.status] ? t(IMPORT_STATUS[r.status]) : r.status}${r.rows ? ` · ${t('{n} rows', { n: nf(r.rows) })}` : ''}`}</small>
      {r.report?.problems?.length > 0 && <details><summary>{r.report.problems.length > 1 ? t('{n} problems', { n: r.report.problems.length }) : t('{n} problem', { n: r.report.problems.length })}</summary><ul>{r.report.problems.map((p: string) => <li key={p}>{p}</li>)}</ul></details>}</span></li>)}</ul>}
    <div className="row wrap"><button className="btn navy small" disabled={!files.length || busy} onClick={start}>{busy ? t('Importing…') : `${!files.length ? t('Import files') : files.length === 1 ? t('Import 1 file') : t('Import {n} files', { n: files.length })} ↗`}</button><a className="text-link" href="/api/admin/buyers/template">{t('Contacts template (.xlsx)')}</a></div>
    {err && <p className="form-error">{err}</p>}
  </div>;
}

/* ---------- Potential buyers + composer ---------- */
type Buyer = { id: string; name: string; score: number; reasons: string[]; buildings: number; lastPurchase: string | null; segment: string | null; stage: string; doNotContact: boolean; inCity: number; contacts: number; emailable: number; emailedForThis: string | null; lastEmailAt: string | null };
type Match = { listing: { id: string; name: string; nameNl: string | null; city: string; propertyType: string; units: number; askingPrice: number; priceOnRequest: boolean; status: string; slug: string }; buyers: Buyer[]; total: number; templates: Record<'nl' | 'en', { subject: string; body: string }>; mail: { mode: string; from: string } };
const scoreClass = (s: number) => s >= 75 ? 'hi' : s >= 55 ? 'mid' : 'lo';

export type AccessChoices = { listings: AccessListing[]; features: FeatureDef[]; presets: Preset[] };

export function BuyerFinder({ data, lang, access }: { data: Match; lang: 'nl' | 'en'; access: AccessChoices }) {
  const t = useT(); const router = useRouter();
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
  const emails = (n: number) => n === 1 ? t('1 email') : t('{n} emails', { n });
  const grant = `${scope === 'all' ? t('All properties') : ids.size === 1 ? t('1 property') : t('{n} properties', { n: ids.size })} · ${feat.size === 1 ? t('1 feature') : t('{n} features', { n: feat.size })}`;
  return <div className="finder-grid">
    <div className="bf-list">
      <div className="bf-bar"><label className="search-in"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search companies')} aria-label={t('Search companies')} /></label>
        <label className="check-label"><input type="checkbox" checked={onlyEmail} onChange={e => setOnlyEmail(e.target.checked)} />{t('With email contact')}</label>
        <label className="check-label"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />{t('Hide already emailed')}</label>
        <button type="button" className="link-button" onClick={() => setSel(new Set(shown.filter(b => b.emailable > 0 && !b.doNotContact).slice(0, 25).map(b => b.id)))}>{t('Select top 25 with email')}</button>
        {sel.size > 0 && <button type="button" className="link-button" onClick={() => setSel(new Set())}>{t('Clear||selection')}</button>}</div>
      <p className="muted-small">{t('{n} of {total} companies · ranked by location, property type, deal size, scale and buying activity', { n: shown.length, total: data.total })}</p>
      <ol className="bf-rows">{shown.map((b, i) => { const can = b.emailable > 0 && !b.doNotContact; return <li key={b.id} className={`${sel.has(b.id) ? 'on' : ''} ${b.doNotContact ? 'dnc' : ''}`}>
        <label className="bf-check"><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggle(b.id)} disabled={b.doNotContact} aria-label={t('Select {name}', { name: b.name })} /></label>
        <span className={`score ${scoreClass(b.score)}`} title={t('Match score out of 100')}><b>{b.score}</b><i style={{ width: b.score + '%' }} /></span>
        <div className="bf-main"><div className="bf-name"><span className="rank">{i + 1}</span><Link href={`/admin?tab=buyers&company=${b.id}`}>{b.name}</Link>
          {b.doNotContact ? <span className="status-chip expired"><i />{t('Do not contact')}</span> : b.emailedForThis ? <span className="status-chip pending"><i />{t('Emailed {date}', { date: date(b.emailedForThis, t) })}</span> : null}
          {b.stage !== 'new' && !b.doNotContact && <span className="chip ghost">{STAGE[b.stage] ? t(STAGE[b.stage]) : b.stage.replace('_', ' ')}</span>}</div>
          <ul className="bf-reasons">{b.reasons.map(r => <li key={r}>{r}</li>)}</ul></div>
        <div className="bf-side"><span className={`mail-badge ${can ? 'ok' : ''}`}><Icon name="mail" />{b.emailable ? (b.emailable > 1 ? t('{n} contacts', { n: b.emailable }) : t('{n} contact', { n: b.emailable })) : t('No email yet')}</span>{!b.emailable && <Link className="link-button" href={`/admin?tab=buyers&company=${b.id}#contacts`}>{t('Add contact')}</Link>}</div>
      </li>; })}</ol>
      {!shown.length && <div className="empty"><p>{t('No companies match.')} {data.total ? t('Clear the filters.') : t('Import the ownership exports under Buyers first.')}</p></div>}
    </div>

    {sel.size > 0 && !done && <a className="sel-bar" href="#composer"><b>{sel.size}</b> {t('selected||count')} · {emails(reach)}<span>{t('Write the email ↓')}</span></a>}
    <section className="composer" id="composer" aria-label={t('Email to the selected companies')}>
      <p className="eyebrow">{t('EMAIL')} · {l.name.toUpperCase()}</p>
      {done ? <div className="invite-done"><span className="done-mark"><Icon name="check" /></span><h3>{done.queued === 1 ? t('1 email queued.') : t('{n} emails queued.', { n: done.queued })}</h3>
        <p className="muted-small">{done.mail.mode === 'smtp' ? t('They go out in batches over the next minutes.') : t('No mail server is connected yet, so sending is simulated: the emails appear in the outbox (Automation tab) and the tracking links work.')}{Object.values(done.skip as Record<string, number>).some(Boolean) ? ' ' + t('Skipped: {list}.', { list: Object.entries(done.skip as Record<string, number>).filter(([, n]) => n).map(([k, n]) => SKIP[k] ? t(SKIP[k], { n }) : `${n} ${k}`).join(', ') }) : ''}</p>
        <div className="row wrap"><Link className="btn navy small" href={`/admin?tab=outreach&campaign=${done.id}`}>{t('Follow the results')} ↗</Link><button className="btn outline small" onClick={() => setDone(null)}>{t('Email more buyers')}</button></div></div>
      : <>
        <div className="cmp-sel"><b>{sel.size}</b> {sel.size === 1 ? t('company selected') : t('companies selected')}<span>{emails(reach)}</span></div>
        <div className="scope-seg small" role="radiogroup" aria-label={t('Email language')}>{(['nl', 'en'] as const).map(x => <button key={x} type="button" role="radio" aria-checked={language === x} onClick={() => switchLang(x)}><b>{x === 'nl' ? 'Nederlands' : 'English'}</b></button>)}</div>
        <label>{t('Subject')}<input value={subject} onChange={e => { setSubject(e.target.value); setPreview(null); }} maxLength={200} /></label>
        <label>{t('Message||email')}<textarea value={body} onChange={e => { setBody(e.target.value); setPreview(null); }} rows={13} maxLength={6000} /></label>
        <p className="fine-print tokens">{t('Filled in per company:')} {['{first_name}', '{company}', '{property}', '{city}', '{type}', '{reason}', '{price}', '{sender}', '{link}'].map(k => <code key={k}>{k}</code>)}. <b>{'{link}'}</b> {t('is the personal invitation link. An unsubscribe line is added automatically.')}</p>
        <div className="grant-sum"><div><p className="eyebrow">{t('ACCESS WHEN THEY OPEN THE LINK')}</p><b>{grant}</b>
          <small>{scope === 'all' ? t('Including future listings') : shared.slice(0, 3).map(x => x.name).join(' · ') + (shared.length > 3 ? ` +${shared.length - 3}` : '')}</small></div>
          <button type="button" className="btn outline small" onClick={() => setDrawer(true)}>{t('Choose||access')}</button></div>
        {preview && (preview.sample ? <div className="mail-preview"><p className="eyebrow">{preview.companies === 1 ? t('PREVIEW · 1 OF {count} · 1 COMPANY', { count: preview.count }) : t('PREVIEW · 1 OF {count} · {n} COMPANIES', { count: preview.count, n: preview.companies })}</p><dl><dt>{t('To||recipient')}</dt><dd>{preview.sample.to}</dd><dt>{t('Subject')}</dt><dd><b>{preview.sample.subject}</b></dd></dl><pre>{preview.sample.body}</pre></div>
          : <p className="form-error">{t('Nobody to email in this selection: add contact persons with an email address first.')}</p>)}
        <div className="row wrap"><button className="btn outline small" disabled={!sel.size || busy} onClick={doPreview}>{t('Preview')}</button><button className="btn navy small" disabled={!sel.size || !reach || busy} onClick={queue}>{busy ? t('Working…') : `${!reach ? t('Queue emails') : reach === 1 ? t('Queue 1 email') : t('Queue {n} emails', { n: reach })} ↗`}</button></div>
        {err && <p className="form-error">{err}</p>}
        <p className="fine-print">{data.mail.mode === 'smtp' ? t('Sent from {from} in batches; replies go to you.', { from: data.mail.from }) : t('Sending is simulated until a mail server (SMTP) is connected. Each email carries a personal link: opening it creates the invitation with access to this property only.')} {t('Companies already emailed about this property are skipped.')}</p>
      </>}
    </section>
    {drawer && <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label={t('Access for the email link')} onKeyDown={e => e.key === 'Escape' && setDrawer(false)}><button className="drawer-backdrop" aria-label={t('Close')} onClick={() => setDrawer(false)} />
      <div className="drawer"><div className="drawer-head"><div><p className="eyebrow">{t('ACCESS · SAME AS AN INVITATION')}</p><h2>{t('What they get.')}</h2><p>{t('Opening the link in the email creates their invitation with exactly these properties and features. {name} is always included. Change it later per person under People & access.', { name: l.name })}</p></div><button type="button" className="icon-btn" aria-label={t('Close')} onClick={() => setDrawer(false)}><Icon name="x" /></button></div>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">1</span><div><h4>{t('Properties they see')}</h4></div></div><PropertyPicker listings={access.listings} scope={scope} setScope={setScope} ids={ids} setIds={setIds} /></section>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">2</span><div><h4>{t('Features they can use')}</h4></div></div><FeaturePicker features={access.features} presets={access.presets} on={feat} setOn={setFeat} /></section>
        <div className="drawer-foot"><span className="muted-small">{grant}</span><button type="button" className="btn navy" onClick={() => { setDrawer(false); setPreview(null); }}><Icon name="check" />{t('Use this access')}</button></div></div></div>}
  </div>;
}

export function ListingSwitch({ listings, current }: { listings: { id: string; name: string; city: string }[]; current?: string }) {
  const t = useT(); const router = useRouter();
  return <label className="listing-switch"><span>{t('Property')}</span><select value={current || ''} onChange={e => e.target.value && router.push(`/admin?tab=buyers&find=${e.target.value}`)}><option value="">{t('Choose a property to find buyers…')}</option>{listings.map(l => <option key={l.id} value={l.id}>{l.name} · {l.city}</option>)}</select></label>;
}

export function DoNotContact({ id, on }: { id: string; on: boolean }) {
  const t = useT(); const router = useRouter(); const [busy, setBusy] = useState(false);
  return <label className="switch-row compact"><span><b>{t('Do not contact')}</b><small>{t('Excluded from every email. Queued emails are cancelled.')}</small></span><input className="toggle" type="checkbox" checked={on} disabled={busy} onChange={async e => { setBusy(true); try { await call(`/api/admin/buyers/${id}`, 'PATCH', { doNotContact: e.target.checked }); router.refresh(); } finally { setBusy(false); } }} /></label>;
}

/* ---------- Public: unsubscribe ---------- */
export function Unsubscribe({ token, email, already }: { token: string; email: string; already: boolean }) {
  const t = useT(); const [done, setDone] = useState(already); const [err, setErr] = useState('');
  useEffect(() => setDone(already), [already]);
  return done ? <><h1>{t('You are unsubscribed.')}</h1><p>{t('{email} will not receive further emails from Maasland & Partners about new opportunities.', { email })}</p></>
    : <><h1>{t('Unsubscribe?')}</h1><p>{t('Stop emails about new investment opportunities to {email}.', { email })}</p><div className="row"><button className="btn navy" onClick={async () => { try { await call(`/api/m/${token}/unsubscribe`, 'POST', {}); setDone(true); } catch (e: any) { setErr(e.message); } }}>{t('Unsubscribe')} ↗</button></div>{err && <p className="form-error">{err}</p>}</>;
}

/* ---------- Developer: which workspace sections admins see ---------- */
export function WorkspaceTabs({ tabs }: { tabs: { key: string; label: string; visible: boolean; locked: boolean }[] }) {
  const t = useT(); const router = useRouter(); const [state, setState] = useState(tabs); const [err, setErr] = useState('');
  const set = async (key: string, visible: boolean) => { setErr(''); try { const r = await call(`/api/admin/workspace/tabs/${key}`, 'PUT', { visible }); setState(r.tabs); router.refresh(); } catch (e: any) { setErr(e.message); } };
  return <div className="panel tab-settings">{state.map(x => <label key={x.key} className="switch-row"><span><b>{t(x.label)}</b><small>{TAB_HELP[x.key] ? t(TAB_HELP[x.key]) : ''}</small></span>{x.locked ? <span className="chip ghost">{t('Always on')}</span> : <input className="toggle" type="checkbox" checked={x.visible} onChange={e => set(x.key, e.target.checked)} aria-label={t('Show {tab} to admins', { tab: t(x.label) })} />}</label>)}{err && <p className="form-error">{err}</p>}</div>;
}
const TAB_HELP: Record<string, string> = {
  access: 'Invite investors and choose their properties and features.', buyers: 'Kadaster import, company profiles, contact persons, potential buyers.', outreach: 'Emails to buyers and their results; simulated outbox.',
  listings: 'Properties, status and prices; Find buyers.', messages: 'Chat with invited investors.', offers: 'Offers, deals and viewing requests.', overview: 'KPIs and funnel statistics.',
  investors: 'Lead scores and activity per investor.', bids: 'Sealed bid rounds with a deadline.', processes: 'Structured institutional sales with Q&A.', acquisitions: 'Pipeline of properties the company buys.',
  compliance: 'KYC checks (Wwft), unusual transactions, audit log.', automation: 'Background rules, job queue, all outgoing email drafts.' };

export const fmt = { moneyShort };
