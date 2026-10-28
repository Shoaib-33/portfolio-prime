'use client';
/* Small client components. Every action goes to the API through /api (proxied), then the page re-renders from the server. */
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, FormEvent, ReactNode } from 'react';
import { money, imgSrc } from '@/lib/format';

async function send(url: string, method: string, body?: BodyInit, json?: unknown) {
  const r = await fetch(url, { method, body: json !== undefined ? JSON.stringify(json) : body, headers: json !== undefined ? { 'content-type': 'application/json' } : undefined });
  const t = await r.text(); let d: any = t; try { d = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error((Array.isArray(d?.message) ? d.message.join(', ') : d?.message) || `Request failed (${r.status})`);
  return d;
}

/** Generic form. multipart=true sends files; otherwise JSON. `arrays` = fields with several values, `bools` = checkboxes sent as true. */
export function ActionForm({ action, method = 'POST', multipart, arrays = [], bools = [], numbers = [], redirect, success, className = 'panel', children, onDone, submitLabel }: { action: string; method?: string; multipart?: boolean; arrays?: string[]; bools?: string[]; numbers?: string[]; redirect?: string; success?: string; className?: string; children: ReactNode; onDone?: (d: any) => void; submitLabel?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = e.currentTarget; if (!f.reportValidity()) return; setBusy(true); setMsg(null);
    try {
      const fd = new FormData(f, ((e.nativeEvent as SubmitEvent).submitter as HTMLElement) || undefined); let d;
      if (multipart) d = await send(action, method, fd);
      else { const o: any = {}; for (const [k, v] of fd.entries()) { if (arrays.includes(k)) (o[k] ||= []).push(v); else o[k] = v; } for (const a of arrays) o[a] ||= []; for (const b of bools) o[b] = fd.get(b) === 'on' || fd.get(b) === 'true'; for (const n of numbers) if (o[n] !== undefined && o[n] !== '') o[n] = Number(o[n]); else if (numbers.includes(n)) delete o[n]; d = await send(action, method, undefined, o); }
      setMsg({ ok: true, text: success || 'Saved.' }); onDone?.(d);
      if (redirect) router.push(redirect); router.refresh();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  }
  return <form className={className} onSubmit={submit}>{children}{submitLabel && <button className="btn navy" type="submit" disabled={busy}>{busy ? 'Working…' : submitLabel}</button>}{msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role="status">{msg.text}</p>}</form>;
}
export function ActionButton({ url, method = 'POST', json, label, className = 'btn outline small', confirmText, redirect, done }: { url: string; method?: string; json?: unknown; label: ReactNode; className?: string; confirmText?: string; redirect?: string; done?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  return <span className="action-wrap"><button className={className} disabled={busy} onClick={async () => { if (confirmText && !window.confirm(confirmText)) return; setBusy(true); setErr(''); try { await send(url, method, undefined, json ?? {}); if (done) setOk(done); if (redirect) router.push(redirect); router.refresh(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>{busy ? '…' : label}</button>{err && <small className="form-error">{err}</small>}{ok && <small className="form-ok">{ok}</small>}</span>;
}
export function PatchSelect({ url, field, value, options, label }: { url: string; field: string; value: string; options: [string, string][]; label: string }) {
  const router = useRouter(); const [err, setErr] = useState('');
  return <><select aria-label={label} defaultValue={value} onChange={async e => { setErr(''); try { await send(url, 'PATCH', undefined, { [field]: e.target.value }); router.refresh(); } catch (x: any) { setErr(x.message); } }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{err && <small className="form-error">{err}</small>}</>;
}
export function Toggle({ url, enabled, label }: { url: string; enabled: boolean; label: string }) {
  const router = useRouter(); return <input className="toggle" type="checkbox" aria-label={label} defaultChecked={enabled} onChange={async e => { await send(url, 'PUT', undefined, { enabled: e.target.checked }); router.refresh(); }} />;
}
export function Countdown({ until, boxes }: { until: string; boxes?: boolean }) {
  const [now, setNow] = useState<number | null>(null); useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now === null) return boxes ? <div className="cd" /> : <b>…</b>;
  const s = Math.max(0, (new Date(until).getTime() - now) / 1000); const u: [number, string][] = [[Math.floor(s / 86400), 'days'], [Math.floor(s % 86400 / 3600), 'hrs'], [Math.floor(s % 3600 / 60), 'min'], [Math.floor(s % 60), 'sec']];
  return boxes ? <div className="cd">{u.map(([v, l]) => <div key={l}><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>)}</div> : <b>{u[0][0] ? u[0][0] + 'd ' : ''}{u[1][0]}h {u[2][0]}m</b>;
}
export function LangToggle({ lang, signedIn }: { lang: string; signedIn: boolean }) {
  const router = useRouter();
  const set = async (l: string) => { document.cookie = `pp_lang=${l};path=/;max-age=31536000;samesite=lax`; if (signedIn) await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: l }) }); router.refresh(); };
  return <span className="lang-toggle" role="group" aria-label="Language">{['nl', 'en'].map(l => <button key={l} aria-pressed={lang === l} onClick={() => set(l)}>{l.toUpperCase()}</button>)}</span>;
}
export function SaveButton({ slug, saved, signedIn }: { slug: string; saved: boolean; signedIn: boolean }) {
  const router = useRouter();
  if (!signedIn) return <a className="save" href={`/login?next=/listings/${slug}`} aria-label="Join free to save">♡</a>;
  return <button className={`save ${saved ? 'selected' : ''}`} aria-pressed={saved} aria-label={saved ? 'Unsave' : 'Save'} onClick={async () => { await send(`/api/favorites/${slug}`, 'POST', undefined, {}); router.refresh(); }}>{saved ? '♥' : '♡'}</button>;
}
/** Opens a data-room document through a 5-minute signed link (the server stamps the watermark). */
export function DocButtons({ id, downloadAllowed }: { id: string; downloadAllowed: boolean }) {
  const [err, setErr] = useState('');
  const open = async (dl: boolean) => { setErr(''); try { const { url } = await send(`/api/documents/${id}/view-url${dl ? '?download=1' : ''}`, 'POST', undefined, {}); if (dl) window.location.href = url; else window.open(url, '_blank', 'noopener'); } catch (e: any) { setErr(e.message); } };
  return <span className="row tight"><button className="btn outline small" onClick={() => open(false)}>View</button>{downloadAllowed ? <button className="btn outline small" onClick={() => open(true)}>Download ↓</button> : <span className="muted-small">View only</span>}{err && <small className="form-error">{err}</small>}</span>;
}
export function Calculator({ slug }: { slug: string }) {
  const [v, setV] = useState({ ltv: 60, interest: 4, expense: 22, vacancy: 3 }); const [r, setR] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(async () => { try { setR(await send('/api/calculations', 'POST', undefined, { slug, ...v })); setErr(''); } catch (e: any) { setErr(e.message); } }, 150); return () => clearTimeout(t); }, [v, slug]);
  const fields: [keyof typeof v, string, number, number, number][] = [['ltv', 'Loan to value (%)', 0, 80, 1], ['interest', 'Interest rate (%)', 0, 12, 0.1], ['expense', 'Operating costs (% of rent)', 0, 60, 1], ['vacancy', 'Vacancy allowance (%)', 0, 25, 1]];
  return <div><div className="finance-fields">{fields.map(([k, l, min, max, step]) => <label key={k}>{l}<span><output>{v[k]}</output></span><input type="range" min={min} max={max} step={step} value={v[k]} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} /></label>)}</div>
    {err ? <p className="form-error">{err}</p> : r && <div className="finance-output four"><div><span>Equity incl. costs</span><b>{money(r.finance.equity)}</b></div><div><span>Annual cash flow</span><b>{money(r.finance.cash)}</b></div><div><span>Cash-on-cash</span><b>{r.finance.coc.toFixed(1)}%</b></div><div><span>DSCR</span><b>{r.finance.dscr.toFixed(2)}</b></div></div>}
    <p className="fine-print">Calculated on the server (POST /api/calculations). Indicative, not investment advice.</p></div>;
}
export function Finder({ cities }: { cities: string[] }) {
  const [v, setV] = useState({ equity: 2500000, ltv: 60, interest: 4, minYield: 5, city: 'all' }); const [r, setR] = useState<any>(null);
  useEffect(() => { const t = setTimeout(async () => setR(await send('/api/finder?' + new URLSearchParams(Object.entries(v).map(([k, x]) => [k, String(x)])), 'GET')), 150); return () => clearTimeout(t); }, [v]);
  const range = (k: 'equity' | 'ltv' | 'interest' | 'minYield', l: string, min: number, max: number, step: number, fmt: (n: number) => string) => <label>{l}<output>{fmt(v[k])}</output><input type="range" min={min} max={max} step={step} value={v[k]} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} /></label>;
  const fits = r?.rows.filter((x: any) => x.fit).length ?? 0;
  return <section className="section finder"><div className="finder-panel"><p className="eyebrow light">YOUR PARAMETERS</p>{range('equity', 'Equity available', 250000, 5000000, 50000, money)}{range('ltv', 'Loan to value', 0, 75, 1, n => n + '%')}{range('interest', 'Interest rate', 2, 7, 0.1, n => n.toFixed(1) + '%')}{range('minYield', 'Minimum BAR', 0, 8, 0.1, n => n.toFixed(1) + '%')}<label>City<select value={v.city} onChange={e => setV({ ...v, city: e.target.value })}><option value="all">Every city</option>{cities.map(c => <option key={c}>{c}</option>)}</select></label><div className="finder-reach">You can reach properties up to<b>{money(r?.maxPrice)}</b></div></div>
    <div><div className="finder-summary"><span><b>{fits}</b> of {r?.rows.length ?? 0} income properties fit</span><span className="muted-small">Costs 9% · vacancy 3% · operating costs 22%</span></div>{r?.rows.map((x: any) => <a key={x.slug} className={`finder-row ${x.fit ? '' : 'miss'}`} href={`/listings/${x.slug}`}><img src={imgSrc(x.image)} alt="" /><div className="fr-main"><p className="eyebrow">{x.city} / {x.district}</p><h3>{x.name} <span className={`fit-pill ${x.fit ? '' : 'no'}`}>{x.fit ? '✓ Fits' : 'Needs ' + money(x.equityNeeded - v.equity) + ' more'}</span></h3><div className="fr-metrics"><div><span>Price</span><b>{x.price ? money(x.price) : x.priceDisplay}</b></div><div><span>Equity needed</span><b>{money(x.equityNeeded)}</b></div><div><span>Annual cash flow</span><b>{money(x.cashFlow)}</b></div><div><span>Cash-on-cash</span><b>{x.coc}%</b></div></div><div className="reach"><i style={{ width: x.reach + '%' }} /></div></div><Ring v={x.score} /></a>)}</div></section>;
}
export function Ring({ v, cls = '' }: { v: number; cls?: string }) { const c = v >= 75 ? '#3f7a5c' : v >= 60 ? '#b68550' : '#a24632'; return <span className={`ring ${cls}`} style={{ ['--v' as any]: v, ['--sc' as any]: c }} role="img" aria-label={`Deal score ${v} of 100`}><b>{v}</b></span>; }

/** Login with optional second step (TOTP). In demo mode the API returns the current code so the demo stays one click. */
export function LoginForm({ next, demo }: { next?: string; demo: [string, string][] }) {
  const router = useRouter(); const [step, setStep] = useState<'pw' | 'code'>('pw'); const [code, setCode] = useState(''); const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [staff, setStaff] = useState(false);
  const go = (isStaff: boolean) => { router.push(next || (isStaff ? '/admin' : '/account')); router.refresh(); };
  const login = async (e?: FormEvent, em = email, p = pw) => { e?.preventDefault(); setErr(''); try { const d = await send('/api/auth/login', 'POST', undefined, { email: em, password: p }); setStaff(d.user.staff); if (d.needs2fa) { setStep('code'); setCode(d.demoCode || ''); setHint(d.demoCode ? `Demo mode: the current code is ${d.demoCode}. Production asks your authenticator app.` : ''); } else go(d.user.staff); } catch (x: any) { setErr(x.message); } };
  const verify = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await send('/api/auth/2fa/verify', 'POST', undefined, { code }); go(staff); } catch (x: any) { setErr(x.message); } };
  return step === 'pw' ? <div className="auth-grid"><form className="panel" onSubmit={login}><h2>Log in</h2><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label><label>Password<input type="password" required value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" /></label><button className="btn navy" type="submit">Log in ↗</button>{err && <p className="form-error">{err}</p>}<p className="fine-print">No account? Portfolio &amp; Prime is by invitation. <a href="/#request">Request access</a>.</p></form>
    <div className="panel demo-logins"><p className="eyebrow">DEMO ACCOUNTS · PASSWORD Demo2026!</p>{demo.map(([em, label]) => <button key={em} className="btn outline small" onClick={() => { setEmail(em); setPw('Demo2026!'); login(undefined, em, 'Demo2026!'); }}>{label}<small>{em}</small></button>)}</div></div>
    : <form className="panel auth-card" onSubmit={verify}><h2>Two-factor login</h2><p>Enter the 6-digit code from your authenticator app.</p>{hint && <div className="note">{hint}</div>}<label>Code<input inputMode="numeric" pattern="\d{6}" required value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" /></label><button className="btn navy" type="submit">Verify ↗</button>{err && <p className="form-error">{err}</p>}</form>;
}
export function TwoFactorSetup({ next }: { next?: string }) {
  const router = useRouter(); const [s, setS] = useState<any>(null); const [code, setCode] = useState(''); const [err, setErr] = useState('');
  return !s ? <div className="panel auth-card"><h2>Set up two-factor login</h2><p>Required for data rooms and all staff accounts. Use any authenticator app (Microsoft, Google, 1Password).</p><button className="btn navy" onClick={async () => { try { const d = await send('/api/auth/2fa/setup', 'POST', undefined, {}); setS(d); setCode(d.demoCode || ''); } catch (e: any) { setErr(e.message); } }}>Start ↗</button>{err && <p className="form-error">{err}</p>}</div>
    : <form className="panel auth-card" onSubmit={async e => { e.preventDefault(); try { await send('/api/auth/2fa/enable', 'POST', undefined, { code }); router.push(next || '/account'); router.refresh(); } catch (x: any) { setErr(x.message); } }}><h2>Add this key to your app</h2><p>Secret key: <code className="secret">{s.secret}</code></p><p className="fine-print">Or open <a href={s.otpauth}>this otpauth link</a> on your phone.</p>{s.demoCode && <div className="note">{s.demoNote} Current code: <b>{s.demoCode}</b></div>}<label>6-digit code<input inputMode="numeric" pattern="\d{6}" required value={code} onChange={e => setCode(e.target.value)} /></label><button className="btn navy" type="submit">Turn on ↗</button>{err && <p className="form-error">{err}</p>}</form>;
}
export function BagCreate() {
  const router = useRouter(); const [bag, setBag] = useState<any>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const lookup = async (f: HTMLFormElement) => { setErr(''); try { const d = await send(`/api/admin/bag?postcode=${encodeURIComponent((f.elements.namedItem('postcode') as HTMLInputElement).value)}&number=${encodeURIComponent((f.elements.namedItem('number') as HTMLInputElement).value)}`, 'GET'); setBag(d); (f.elements.namedItem('units') as HTMLInputElement).value = String(d.units); } catch (e: any) { setErr(e.message); } };
  return <form className="panel" onSubmit={async e => { e.preventDefault(); const f = e.currentTarget; if (!bag) return setErr('Look up the address in BAG first.'); const o: any = Object.fromEntries(new FormData(f)); try { await send('/api/admin/listings', 'POST', undefined, o); setOk('Draft created from BAG data. Publish it below.'); setBag(null); f.reset(); router.refresh(); } catch (x: any) { setErr(x.message); } }}>
    <p className="eyebrow">NEW LISTING · BAG LOOKUP</p><h2>From postcode to listing.</h2><div className="form-grid"><label>Postcode<input name="postcode" required placeholder="3072 AB" /></label><label>House number<input name="number" required placeholder="40" /></label></div>
    <button type="button" className="btn outline small" onClick={e => lookup(e.currentTarget.form!)}>Look up in BAG ↗</button>
    <div className="bag-out">{bag ? <div className="bag-card"><b>{bag.address}, {bag.postcode} {bag.city}</b><span>Build year {bag.buildYear} · {bag.areaM2} m² · {bag.units} units · {bag.use} · label {bag.energyLabel} · {bag.lat}, {bag.lng}</span><small>{bag.source}</small></div> : <p className="muted-small">BAG fills build year, floor area, units, coordinates and energy label.</p>}</div>
    <div className="form-grid"><label>Listing name<input name="name" required minLength={3} placeholder="The Schiedam apartments" /></label><label>Collection<select name="category"><option value="buildings">Apartment buildings</option><option value="portfolios">Residential portfolios</option><option value="homes">Prime homes</option></select></label><label>Deal type<select name="dealType"><option value="direct">Direct sale</option><option value="portfolio">Portfolio</option><option value="off_market">Off-market · Pro first look 48 h</option></select></label><label>Asking price k.k. (€)<input name="askingPrice" type="number" min={100000} defaultValue={3000000} required /></label><label>Annual rent (€)<input name="grossRentAnnual" type="number" min={0} defaultValue={180000} required /></label><label>Units<input name="units" type="number" min={1} defaultValue={12} required /></label></div>
    <button className="btn navy" type="submit">Create draft ↗</button>{err && <p className="form-error">{err}</p>}{ok && <p className="form-ok">{ok}</p>}</form>;
}
/** Phone menu: opens and closes the main navigation; closes again on every page change. */
export function MenuToggle() {
  const [open, setOpen] = useState(false); const path = usePathname(); const sp = useSearchParams();
  useEffect(() => setOpen(false), [path, sp]);
  useEffect(() => { document.getElementById('navigation')?.classList.toggle('open', open); }, [open]);
  return <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="navigation" onClick={() => setOpen(o => !o)}><svg viewBox="0 0 24 24" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>{open ? 'Close' : 'Menu'}</button>;
}
/** Staff top menu: the workspace sections the developer made visible; highlights the open one. */
export function StaffNav({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname(); const sp = useSearchParams(); const cur = path === '/admin' ? sp.get('tab') || 'access' : null;
  return <>{tabs.map(([k, l]) => <Link key={k} href={`/admin?tab=${k}`} aria-current={cur === k ? 'page' : undefined}>{l}</Link>)}</>;
}
