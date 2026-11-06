'use client';
/* Visitor homepage, interactive parts of the private offering:
   - RgMandate: three choices -> how many live properties fit (counts only, from /api/offering/match), then pre-fills the access form.
   (The closed-deals map lives in dealmap.tsx.) */
import { useEffect, useRef, useState } from 'react';

type Opt = [string, string];

export function RgMandate({ labels, tickets, types, regionLabel }: { labels: Record<string, string>; tickets: Opt[]; types: Opt[]; regionLabel: Record<string, string> }) {
  const [region, setRegion] = useState('any'); const [ticket, setTicket] = useState('any'); const [type, setType] = useState('any');
  const [res, setRes] = useState<{ count: number; total: number; regions: string[] } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctl = new AbortController(); setBusy(true);
    const id = setTimeout(() => fetch(`/api/offering/match?region=${encodeURIComponent(region)}&ticket=${ticket}&type=${type}`, { signal: ctl.signal })
      .then(r => r.json()).then(d => { setRes(d); setBusy(false); }).catch(() => setBusy(false)), 120);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [region, ticket, type]);

  /* Carry the mandate into the request-access form: ticket band, "invest", and a short note. */
  const apply = () => {
    const form = document.querySelector<HTMLFormElement>('#request form'); if (!form) return;
    const sel = form.querySelector<HTMLSelectElement>('select[name=ticket]');
    const map: Record<string, string> = { lt2: '< €2m', '2-10': '€2–10m', '10-50': '€10–50m', '50plus': '€50–250m' };
    if (sel && map[ticket]) sel.value = map[ticket];
    const inv = form.querySelector<HTMLInputElement>('input[name=interest][value=invest]'); if (inv) inv.checked = true;
    const msg = form.querySelector<HTMLTextAreaElement>('textarea[name=message]');
    const parts = [region !== 'any' ? (regionLabel[region] || region) : '', ticket !== 'any' ? tickets.find(x => x[0] === ticket)?.[1] : '', type !== 'any' ? types.find(x => x[0] === type)?.[1] : ''].filter(Boolean);
    if (msg && parts.length && !msg.value) msg.value = `${labels.note}: ${parts.join(' · ')}`;
    const req = document.getElementById('request'); const lenis = (window as any).__lenis;
    if (req) lenis ? lenis.scrollTo(req, { duration: 1.5 }) : req.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => form.querySelector<HTMLInputElement>('input[name=name]')?.focus({ preventScroll: true }), 700);
  };

  const n = res?.count ?? 0;
  return <div className="rg-mandate" aria-live="polite">
    <div className="rg-mandate-q">
      <p className="rg-eyebrow">{labels.title}</p>
      <div className="rg-mandate-fields">
        <label><span>{labels.region}</span><select value={region} onChange={e => setRegion(e.target.value)}><option value="any">{labels.anyRegion}</option>{(res?.regions || []).map(r => <option key={r} value={r}>{regionLabel[r] || r}</option>)}</select></label>
        <label><span>{labels.ticket}</span><select value={ticket} onChange={e => setTicket(e.target.value)}><option value="any">{labels.anyTicket}</option>{tickets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>{labels.type}</span><select value={type} onChange={e => setType(e.target.value)}><option value="any">{labels.anyType}</option>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
    </div>
    <div className={`rg-mandate-a${busy ? ' is-busy' : ''}`}>
      <b key={n}>{res ? n : '–'}</b>
      <p>{res ? (n === 1 ? labels.one : n ? labels.many : labels.none) : labels.loading}</p>
      <button type="button" className="rg-btn rg-btn-accent" onClick={apply}>{n ? labels.cta : labels.ctaNone}<svg className="rg-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
    </div>
  </div>;
}
