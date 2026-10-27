'use client';
/* People & access (admin and developer): invite people, choose which properties and which features each person sees.
   Every change goes to the API, which enforces it on the next request. */
import { useEffect, useMemo, useState, ReactNode, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { imgSrc, moneyShort, DEAL, dateTime, date } from '@/lib/format';

type Listing = { id: string; slug: string; name: string; city: string; district?: string; image: string; dealType: string; status: string; askingPrice: number; units: number; propertyType: string; source: string; sharedWith: number };
type FeatureDef = { key: string; label: string; desc: string; group: string };
type Preset = { key: string; label: string; desc: string; features: string[] };
type Person = { id: string; name: string; email: string; companyName: string | null; investorType: string; role: string; roleLabel: string; staff: boolean; status: string; listingScope: string; listingCount: number | null; features: string[]; verified: boolean; tierLabel: string | null; twofaEnabled: boolean; lastLoginAt: string | null; createdAt: string; invite: null | { state: string; expiresAt: string } };
type Request = { id: string; name: string; email: string; message: string | null; status: string; createdAt: string; invited: boolean };
export type AccessData = { users: Person[]; listings: Listing[]; features: FeatureDef[]; presets: Preset[]; roles: { key: string; label: string; staff: boolean; assignable: boolean }[]; me: { role: string }; investorTypes: string[]; requests: Request[] };

async function call(url: string, method: string, json?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: json === undefined ? undefined : JSON.stringify(json) });
  const t = await r.text(); let d: any = t; try { d = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error((Array.isArray(d?.message) ? d.message.join(', ') : d?.message) || `Request failed (${r.status})`); return d;
}
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const statusOf = (p: Person) => p.status === 'suspended' ? ['Paused', 'paused'] : p.status === 'invited' ? (p.invite?.state === 'expired' ? ['Link expired', 'expired'] : p.invite?.state === 'revoked' ? ['Link revoked', 'expired'] : ['Invitation sent', 'pending']) : ['Active', 'active'];

/* ---------- Small building blocks ---------- */
export function Icon({ name }: { name: string }) {
  const d: Record<string, ReactNode> = {
    vault: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9v-1M15 12h1" /></>,
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></>,
    chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />, star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
    key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>, map: <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" />,
    doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>, chat: <path d="M4 5h16v11H9l-5 4z" />, check: <path d="M5 12l5 5 9-10" />,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>, home: <path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />,
    plus: <path d="M12 5v14M5 12h14" />, search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>, copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></>,
    link: <path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1" />, x: <path d="M6 6l12 12M18 6L6 18" />, users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6" /></>,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />, pause: <path d="M8 5v14M16 5v14" />, play: <path d="M7 4l13 8-13 8z" />, plug: <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0zM12 17v5" />, mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  };
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{d[name] || d.check}</svg>;
}
const FEATURE_ICON: Record<string, string> = { map: 'map', finder: 'target', market: 'chart', analysis: 'doc', analyst: 'spark', dataroom: 'lock', institutional: 'vault', offers: 'key', messages: 'chat', membership: 'star', sell: 'home' };

export function CopyField({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.parentElement?.querySelector('input'); try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { input?.select(); }
  };
  return <div className="copy-field"><input readOnly value={value} onFocus={e => e.currentTarget.select()} aria-label="Link" /><button type="button" className="btn small navy" onClick={copy}><Icon name={done ? 'check' : 'copy'} />{done ? 'Copied' : label}</button></div>;
}

function PropertyPicker({ listings, scope, setScope, ids, setIds }: { listings: Listing[]; scope: string; setScope: (s: string) => void; ids: Set<string>; setIds: (s: Set<string>) => void }) {
  const [q, setQ] = useState(''); const shown = listings.filter(l => !q || `${l.name} ${l.city} ${l.district || ''} ${l.propertyType} ${DEAL[l.dealType]}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => { const n = new Set(ids); n.has(id) ? n.delete(id) : n.add(id); setIds(n); };
  return <div className="picker">
    <div className="scope-seg" role="radiogroup" aria-label="Which properties">
      <button type="button" role="radio" aria-checked={scope === 'selected'} onClick={() => setScope('selected')}><b>Selected properties</b><small>Only what you tick below</small></button>
      <button type="button" role="radio" aria-checked={scope === 'all'} onClick={() => setScope('all')}><b>All properties</b><small>Including future listings</small></button>
    </div>
    {scope === 'selected' ? <>
      <div className="picker-bar"><label className="search-in"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, city or type" aria-label="Search properties" /></label>
        <span className="count-chip">{ids.size} of {listings.length} selected</span>
        <button type="button" className="link-button" onClick={() => setIds(new Set([...ids, ...shown.map(l => l.id)]))}>Select {q ? 'shown' : 'all'}</button><button type="button" className="link-button" onClick={() => setIds(new Set())}>Clear</button></div>
      <div className="prop-grid">{shown.map(l => { const on = ids.has(l.id); return <button type="button" key={l.id} className={`prop-tile ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(l.id)}>
        <span className="pt-img"><img src={imgSrc(l.image)} alt="" /><i className="pt-check"><Icon name="check" /></i></span>
        <span className="pt-body"><b>{l.name}</b><small>{l.city}{l.district ? ` · ${l.district}` : ''}</small><span className="pt-meta"><em>{moneyShort(l.askingPrice)}</em>{l.units > 1 ? <em>{l.units} units</em> : null}<em className={`deal-${l.dealType}`}>{DEAL[l.dealType]}</em>{l.source === 'crm' && <em className="crm">CRM</em>}{l.status !== 'available' && <em className="muted">{l.status.replace('_', ' ')}</em>}</span></span></button>; })}
        {!shown.length && <p className="muted-small">No properties match “{q}”.</p>}</div></>
      : <div className="note soft"><Icon name="bolt" /> This person sees every live property, including listings the CRM adds later. Use it for partners and senior buyers.</div>}
  </div>;
}

function FeaturePicker({ features, presets, on, setOn }: { features: FeatureDef[]; presets: Preset[]; on: Set<string>; setOn: (s: Set<string>) => void }) {
  const groups = [...new Set(features.map(f => f.group))]; const active = presets.find(p => p.features.length === on.size && p.features.every(k => on.has(k)))?.key;
  const toggle = (k: string) => { const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); setOn(n); };
  return <div className="fpick">
    <div className="presets"><span>Quick start</span>{presets.map(p => <button type="button" key={p.key} className={`preset ${active === p.key ? 'on' : ''}`} title={p.desc} onClick={() => setOn(new Set(p.features))}>{p.label}</button>)}<button type="button" className="preset ghost" onClick={() => setOn(new Set())}>None</button></div>
    {groups.map(g => <div key={g} className="fgroup"><p className="eyebrow">{g}</p><div className="fgrid">{features.filter(f => f.group === g).map(f => <label key={f.key} className={`ftoggle ${on.has(f.key) ? 'on' : ''}`}>
      <span className="fi"><Icon name={FEATURE_ICON[f.key] || 'check'} /></span><span className="ft"><b>{f.label}</b><small>{f.desc}</small></span>
      <input type="checkbox" className="switch" checked={on.has(f.key)} onChange={() => toggle(f.key)} aria-label={f.label} /></label>)}</div></div>)}
    <p className="fine-print">Properties are always visible in “My selection”. Data room, offers and bids also need KYC verification; private deal rooms also need a qualified (institutional) investor type.</p>
  </div>;
}

/* ---------- Editor for one person ---------- */
function Editor({ p, data, onSaved }: { p: Person; data: AccessData; onSaved: (msg: string) => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<{ listingIds: string[] } | null>(null);
  const [scope, setScope] = useState(p.listingScope); const [ids, setIds] = useState<Set<string>>(new Set()); const [feat, setFeat] = useState<Set<string>>(new Set(p.features)); const [role, setRole] = useState(p.role);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [link, setLink] = useState('');
  useEffect(() => { // the editor is keyed by person, so this loads their current grants once
    call(`/api/admin/access/users/${p.id}`, 'GET').then(d => { setDetail(d); setIds(new Set(d.listingIds)); setScope(d.listingScope); setFeat(new Set(d.staff ? [] : d.features)); }).catch(e => setErr(e.message));
  }, [p.id]);
  const staffRole = data.roles.find(r => r.key === role)?.staff;
  const locked = data.me.role !== 'developer' && p.role !== 'investor'; // admins manage investors; developers manage everyone
  const dirty = !!detail && (scope !== (detail as any).listingScope || role !== p.role || !same(ids, new Set(detail.listingIds)) || !same(feat, new Set((detail as any).staff ? [] : (detail as any).features)));
  const run = async (key: string, fn: () => Promise<any>, msg?: string) => { setBusy(key); setErr(''); try { const r = await fn(); if (msg) onSaved(msg); router.refresh(); return r; } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  const save = () => run('save', async () => { await call(`/api/admin/access/users/${p.id}`, 'PUT', { role, listingScope: scope, listingIds: [...ids], features: [...feat] }); setDetail({ ...(detail as any), listingIds: [...ids], listingScope: scope, features: [...feat], staff: staffRole }); }, `Access for ${p.name} saved. It applies on their next click.`);
  const [label, cls] = statusOf(p);
  return <div className="editor">
    <div className="ed-head"><span className={`avatar-lg ${p.staff ? 'staff' : ''}`}>{initials(p.name)}</span><div className="ed-id"><h3>{p.name}</h3><p>{p.companyName ? `${p.companyName} · ` : ''}{p.email}</p>
      <div className="row tight wrap"><span className={`status-chip ${cls}`}><i />{label}</span>{!p.staff && p.tierLabel && <span className="chip">{p.tierLabel}</span>}{!p.staff && <span className="chip">{p.investorType}</span>}{p.lastLoginAt && <span className="chip ghost">Last seen {dateTime(p.lastLoginAt)}</span>}</div></div>
      <label className="role-select">Role<select value={role} disabled={locked} onChange={e => setRole(e.target.value)}>{data.roles.map(r => <option key={r.key} value={r.key} disabled={!r.assignable}>{r.label}</option>)}</select></label></div>

    {p.status === 'invited' && <div className="invite-box"><div><b><Icon name="mail" /> {p.invite?.state === 'pending' ? `Invitation valid until ${date(p.invite.expiresAt)}` : 'The invitation link no longer works'}</b><small>Links are personal and work once. Creating a new one stops the old link.</small></div>
      <div className="row tight"><button type="button" className="btn small navy" disabled={!!busy} onClick={() => run('link', async () => { const r = await call(`/api/admin/access/users/${p.id}/invite`, 'POST', {}); setLink(window.location.origin + r.path); })}><Icon name="link" />{busy === 'link' ? 'Creating…' : 'New invitation link'}</button>
        {p.invite?.state === 'pending' && <button type="button" className="btn small outline" disabled={!!busy} onClick={() => run('revoke', () => call(`/api/admin/access/users/${p.id}/revoke-invite`, 'POST'), 'Invitation revoked.')}>Revoke</button>}</div>
      {link && <div className="link-out"><CopyField value={link} label="Copy link" /><small>Share this link with {p.name.split(' ')[0]} by email or WhatsApp. It is shown once.</small></div>}</div>}

    {staffRole ? <div className="note soft"><Icon name="users" /> {role === 'developer' ? 'Developers can do everything: the staff workspace, people & access, and the CRM & API settings.' : 'Admins see every property, invite and manage investors, and run the staff workspace.'}{locked ? ' Only a developer can change this account.' : ''}</div>
      : !detail ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div> : <>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">1</span><div><h4>Properties</h4><p>What {p.name.split(' ')[0]} sees in their selection.</p></div></div><PropertyPicker listings={data.listings} scope={scope} setScope={setScope} ids={ids} setIds={setIds} /></section>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">2</span><div><h4>Features</h4><p>Menu items and tools that are switched on. Everything else stays hidden.</p></div></div><FeaturePicker features={data.features} presets={data.presets} on={feat} setOn={setFeat} /></section></>}

    {!locked && <div className={`save-bar ${dirty ? 'dirty' : ''}`}><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>{err && <small className="form-error">{err}</small>}
      <div className="row tight">{p.status !== 'invited' && p.id && <button type="button" className="btn small outline" disabled={!!busy} onClick={() => run('status', () => call(`/api/admin/access/users/${p.id}/status`, 'POST', { status: p.status === 'suspended' ? 'active' : 'suspended' }), p.status === 'suspended' ? `${p.name} can log in again.` : `${p.name} is signed out and paused.`)}><Icon name={p.status === 'suspended' ? 'play' : 'pause'} />{p.status === 'suspended' ? 'Resume access' : 'Pause access'}</button>}
        <button type="button" className="btn small navy" disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save access'}</button></div></div>}
  </div>;
}
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

/* ---------- Invite drawer ---------- */
function InviteDrawer({ data, prefill, onClose }: { data: AccessData; prefill?: Partial<{ name: string; email: string; companyName: string }>; onClose: () => void }) {
  const router = useRouter();
  const [role, setRole] = useState('investor'); const [scope, setScope] = useState('selected'); const [ids, setIds] = useState<Set<string>>(new Set()); const [feat, setFeat] = useState<Set<string>>(new Set(data.presets.find(p => p.key === 'buyer')?.features));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<null | { link: string; expiresAt: string; name: string; email: string }>(null);
  const staffRole = data.roles.find(r => r.key === role)?.staff;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = e.currentTarget; if (!f.reportValidity()) return; const fd = new FormData(f); setBusy(true); setErr('');
    if (!staffRole && scope === 'selected' && !ids.size) { setErr('Choose at least one property, or select “All properties”.'); setBusy(false); return; }
    try { const r = await call('/api/admin/access/invites', 'POST', { ...Object.fromEntries(fd), role, listingScope: staffRole ? 'all' : scope, listingIds: [...ids], features: staffRole ? [] : [...feat] });
      setDone({ link: window.location.origin + r.path, expiresAt: r.expiresAt, name: String(fd.get('name')), email: String(fd.get('email')) }); router.refresh(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return <div className="drawer-wrap" role="dialog" aria-modal="true" aria-label="Invite someone" onKeyDown={e => e.key === 'Escape' && onClose()}><button className="drawer-backdrop" aria-label="Close" onClick={onClose} />
    <div className="drawer">{done ? <div className="invite-done"><span className="done-mark"><Icon name="check" /></span><p className="eyebrow">INVITATION CREATED</p><h2>{done.name} can join now.</h2>
      <p>Send this personal link to {done.email}. It works once and expires on {date(done.expiresAt)}. A draft email with the link is in the outbox.</p><CopyField value={done.link} label="Copy link" />
      <div className="row"><button className="btn navy" onClick={onClose}>Done</button><button className="btn outline" onClick={() => { setDone(null); setIds(new Set()); }}>Invite someone else</button></div></div>
      : <form onSubmit={submit} noValidate={false}><div className="drawer-head"><div><p className="eyebrow">NEW INVITATION</p><h2>Invite someone.</h2><p>They get a personal link, set a password and see only what you choose here.</p></div><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">1</span><div><h4>Who</h4></div></div>
          <div className="form-grid"><label>Full name<input name="name" required minLength={2} defaultValue={prefill?.name} autoFocus /></label><label>Email<input name="email" type="email" required defaultValue={prefill?.email} /></label>
            <label>Company<input name="companyName" maxLength={120} defaultValue={prefill?.companyName} /></label><label>Role<select value={role} onChange={e => setRole(e.target.value)}>{data.roles.filter(r => r.assignable).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
            {!staffRole && <><label>Investor type<select name="investorType" defaultValue="Private BV">{data.investorTypes.map(t => <option key={t}>{t}</option>)}</select></label><label>Country<select name="country" defaultValue="NL">{[['NL', 'Netherlands'], ['BE', 'Belgium'], ['DE', 'Germany'], ['GB', 'United Kingdom'], ['FR', 'France'], ['LU', 'Luxembourg'], ['DK', 'Denmark'], ['AE', 'United Arab Emirates'], ['US', 'United States']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}</div></section>
        {staffRole ? <div className="note soft"><Icon name="users" /> {role === 'developer' ? 'A developer can do everything, including CRM & API settings.' : 'An admin sees every property, invites investors and runs the staff workspace.'}</div> : <>
          <section className="ed-sec"><div className="ed-sec-h"><span className="num">2</span><div><h4>Properties they see</h4></div></div><PropertyPicker listings={data.listings} scope={scope} setScope={setScope} ids={ids} setIds={setIds} /></section>
          <section className="ed-sec"><div className="ed-sec-h"><span className="num">3</span><div><h4>Features they can use</h4></div></div><FeaturePicker features={data.features} presets={data.presets} on={feat} setOn={setFeat} /></section></>}
        <section className="ed-sec"><div className="ed-sec-h"><span className="num">{staffRole ? 2 : 4}</span><div><h4>Invitation</h4></div></div>
          <div className="form-grid"><label>Link valid for<select name="expiresDays" defaultValue="14"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
            <label className="span2">Personal note (optional, shown on the invitation page)<textarea name="message" maxLength={1000} placeholder="As discussed: three assets that fit your Randstad mandate." /></label></div></section>
        <div className="drawer-foot">{err && <p className="form-error">{err}</p>}<span className="muted-small">{staffRole ? 'Staff role' : scope === 'all' ? 'All properties' : `${ids.size} propert${ids.size === 1 ? 'y' : 'ies'}`}{!staffRole && ` · ${feat.size} feature${feat.size === 1 ? '' : 's'}`}</span><button type="submit" className="btn navy" disabled={busy}><Icon name="link" />{busy ? 'Creating…' : 'Create invitation link'}</button></div></form>}</div></div>;
}

/* ---------- The tab ---------- */
export function AccessManager({ data, meId }: { data: AccessData; meId: string }) {
  const router = useRouter();
  const [q, setQ] = useState(''); const [filter, setFilter] = useState('all'); const [sel, setSel] = useState<string>(() => data.users.find(u => !u.staff)?.id || data.users[0]?.id);
  const [drawer, setDrawer] = useState<null | Partial<{ name: string; email: string; companyName: string }>>(null); const [toast, setToast] = useState('');
  const counts = { all: data.users.length, investors: data.users.filter(u => !u.staff).length, staff: data.users.filter(u => u.staff).length, invited: data.users.filter(u => u.status === 'invited').length, paused: data.users.filter(u => u.status === 'suspended').length };
  const list = useMemo(() => data.users.filter(u => (filter === 'all' || (filter === 'investors' && !u.staff) || (filter === 'staff' && u.staff) || (filter === 'invited' && u.status === 'invited') || (filter === 'paused' && u.status === 'suspended'))
    && (!q || `${u.name} ${u.email} ${u.companyName || ''}`.toLowerCase().includes(q.toLowerCase()))), [data.users, q, filter]);
  const person = data.users.find(u => u.id === sel); const openReq = data.requests.filter(r => r.status === 'new' && !r.invited);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  return <div className="access">
    <div className="access-top"><div><p className="eyebrow">INVITE-ONLY ACCESS</p><h2>People &amp; access.</h2><p className="muted-small">Choose per person which properties and which features they see. Visitors only see the public company pages.</p></div>
      <button className="btn navy" onClick={() => setDrawer({})}><Icon name="plus" />Invite someone</button></div>
    <div className="stat-row"><div><b>{data.users.filter(u => !u.staff && u.status === 'active').length}</b><span>Investors with access</span></div><div><b>{counts.invited}</b><span>Invitations pending</span></div><div><b>{openReq.length}</b><span>Access requests</span></div><div><b>{data.listings.filter(l => l.sharedWith > 0).length}<small>/{data.listings.length}</small></b><span>Properties shared</span></div></div>

    {openReq.length > 0 && <div className="requests"><p className="eyebrow">ACCESS REQUESTS FROM THE WEBSITE</p>{openReq.map(r => <div key={r.id} className="req"><span className="avatar">{initials(r.name)}</span><div><b>{r.name}</b><small>{r.email} · {dateTime(r.createdAt)}</small><p>{r.message}</p></div>
      <div className="row tight"><button className="btn small navy" onClick={() => setDrawer({ name: r.name, email: r.email, companyName: (r.message || '').split(' · ')[0] })}>Invite</button><button className="btn small outline" onClick={async () => { await call(`/api/admin/access/requests/${r.id}/status`, 'POST', { status: 'closed' }); router.refresh(); }}>Dismiss</button></div></div>)}</div>}

    <div className="access-grid"><div className="people">
      <label className="search-in"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" /></label>
      <div className="filters-pills" role="tablist">{(['all', 'investors', 'staff', 'invited', 'paused'] as const).map(k => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)} <span>{counts[k]}</span></button>)}</div>
      <ul className="people-list">{list.map(u => { const [label, cls] = statusOf(u); return <li key={u.id}><button className={sel === u.id ? 'on' : ''} onClick={() => setSel(u.id)}>
        <span className={`avatar ${u.staff ? 'staff' : ''}`}>{initials(u.name)}</span><span className="pl-main"><b>{u.name}{u.id === meId ? ' (you)' : ''}</b><small>{u.companyName || u.email}</small></span>
        <span className="pl-side"><span className={`status-dot ${cls}`} title={label} />{u.staff ? <em>{u.roleLabel}</em> : <em>{u.listingScope === 'all' ? 'All' : u.listingCount} prop · {u.features.length} tools</em>}</span></button></li>; })}
        {!list.length && <li className="muted-small pad">Nobody matches.</li>}</ul></div>
      <div className="editor-col">{person ? <Editor key={person.id} p={person} data={data} onSaved={say} /> : <div className="empty"><p>Select a person.</p></div>}</div></div>
    {drawer && <InviteDrawer data={data} prefill={drawer} onClose={() => setDrawer(null)} />}
    {toast && <div className="ok-toast" role="status"><Icon name="check" />{toast}</div>}
  </div>;
}

/* ---------- CRM & API ---------- */
export function CreateApiKey() {
  const router = useRouter(); const [key, setKey] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="key-form" onSubmit={async e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get('name') || ''); setBusy(true); setErr(''); try { const r = await call('/api/admin/integrations/keys', 'POST', { name }); setKey(r.key); router.refresh(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } }}>
    <div className="row tight"><input name="name" required minLength={2} placeholder="Key name, e.g. Company CRM (production)" aria-label="Key name" /><button className="btn small navy" disabled={busy}><Icon name="plus" />{busy ? 'Creating…' : 'Create API key'}</button></div>
    {err && <p className="form-error">{err}</p>}{key && <div className="link-out"><CopyField value={key} label="Copy key" /><small>Store this key in the CRM now. For security it is shown only once.</small></div>}</form>;
}

/* ---------- Public: request access, accept invitation ---------- */
export function RequestAccessForm({ defaultInterest = 'invest' }: { defaultInterest?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle'); const [err, setErr] = useState(''); const [ref, setRef] = useState('');
  if (state === 'done') return <div className="ra-done"><span className="done-mark"><Icon name="check" /></span><h3>Thank you.</h3><p>A partner will contact you within one working day to discuss your mandate. Reference <b>{ref}</b>.</p></div>;
  return <form className="ra-form" onSubmit={async e => { e.preventDefault(); const f = e.currentTarget; if (!f.reportValidity()) return; const o: any = Object.fromEntries(new FormData(f)); o.consent = o.consent === 'on'; setState('busy'); setErr('');
    try { const r = await call('/api/access-requests', 'POST', o); setRef(r.reference); setState('done'); } catch (x: any) { setErr(x.message); setState('idle'); } }}>
    <fieldset className="interest"><legend>I would like to</legend>{[['invest', 'Invest'], ['sell', 'Sell a property'], ['both', 'Both']].map(([v, l]) => <label key={v}><input type="radio" name="interest" value={v} defaultChecked={v === defaultInterest} /><span>{l}</span></label>)}</fieldset>
    <div className="form-grid"><label>Full name<input name="name" required minLength={2} autoComplete="name" /></label><label>Work email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Company<input name="companyName" maxLength={120} autoComplete="organization" /></label><label>You are<select name="investorType" defaultValue="Private BV">{['Private person', 'Private BV', 'Fund', 'Family office', 'Pension fund', 'Insurer', 'Institutional investor', 'Developer'].map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Typical ticket<select name="ticket" defaultValue="">{[['', 'Prefer not to say'], ['< €2m', 'Up to €2m'], ['€2–10m', '€2–10m'], ['€10–50m', '€10–50m'], ['€50–250m', '€50–250m'], ['€250m+', '€250m+']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="span2">What are you looking for? (optional)<textarea name="message" maxLength={2000} placeholder="Regions, property types, size, timing" /></label></div>
    <label className="check-label"><input type="checkbox" name="consent" required /><span>I agree that Portfolio &amp; Prime contacts me about my request (privacy statement).</span></label>
    <button className="btn navy wide-btn" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Request access'} <span>↗</span></button>{err && <p className="form-error">{err}</p>}</form>;
}

export function AcceptInvite({ token, staff, email }: { token: string; staff: boolean; email: string }) {
  const router = useRouter(); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const strength = Math.min(4, (pw.length >= 10 ? 1 : 0) + (/[A-Z]/.test(pw) && /[a-z]/.test(pw) ? 1 : 0) + (/\d/.test(pw) ? 1 : 0) + (/[^\w]/.test(pw) || pw.length >= 16 ? 1 : 0));
  return <form className="accept-form" onSubmit={async e => { e.preventDefault(); if (!e.currentTarget.reportValidity()) return; if (pw !== pw2) return setErr('The two passwords are not the same.'); setBusy(true); setErr('');
    try { await call(`/api/invites/${encodeURIComponent(token)}/accept`, 'POST', { password: pw, acceptTerms: true }); router.push(staff ? '/admin' : '/'); router.refresh(); } catch (x: any) { setErr(x.message); setBusy(false); } }}>
    <label>Email<input value={email} readOnly autoComplete="username" /></label>
    <label>Choose a password<span className="pw"><input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} minLength={10} required autoComplete="new-password" /><button type="button" className="link-button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></span></label>
    <div className={`strength s${strength}`} aria-hidden="true"><i /><i /><i /><i /></div><small className="muted-small">At least 10 characters. A passphrase works well.</small>
    <label>Repeat password<input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} minLength={10} required autoComplete="new-password" /></label>
    <label className="check-label"><input type="checkbox" required /><span>I accept the terms, the privacy statement and that information I receive is confidential.</span></label>
    <button className="btn navy wide-btn" disabled={busy}>{busy ? 'Activating…' : 'Activate my access'} <span>↗</span></button>{err && <p className="form-error">{err}</p>}</form>;
}
