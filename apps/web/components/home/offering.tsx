'use client';
/* Visitor homepage, interactive parts of the private offering:
   - RgMandate: three choices -> how many live properties fit (counts only, from /api/offering/match), then pre-fills the access form.
   - RgDealMap: closed deals on a map of the Netherlands (city centres only), on the free PDOK base map. */
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

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
    document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' });
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

const PDOK = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
type Deal = { city: string; type: string; units: number; band: string; dealLabel: string; days: number; lat?: number; lng?: number };

export function RgDealMap({ deals, labels }: { deals: Deal[]; labels: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null); const pins = useRef(new Map<string, HTMLElement>());
  const pts = deals.filter(d => d.lat != null && d.lng != null);
  const cities = Array.from(pts.reduce((m, d) => m.set(d.city, [...(m.get(d.city) || []), d]), new Map<string, Deal[]>())).map(([city, ds]) => ({ city, n: ds.length, units: ds.reduce((a, d) => a + d.units, 0), days: Math.round(ds.reduce((a, d) => a + d.days, 0) / ds.length) })).sort((a, b) => b.units - a.units);
  const glow = (city: string, on: boolean) => pins.current.get(city)?.classList.toggle('on', on);
  const key = pts.map(d => d.city + d.units).join('|');
  useEffect(() => {
    let map: any; let cancelled = false; const markers: any[] = [];
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default; if (cancelled || !box.current) return;
      map = new maplibregl.Map({
        container: box.current, attributionControl: { compact: true }, cooperativeGestures: true, interactive: true,
        style: { version: 8, sources: { pdok: { type: 'raster', tiles: [PDOK], tileSize: 256, maxzoom: 19, attribution: 'Kaart © <a href="https://www.kadaster.nl" target="_blank" rel="noopener">Kadaster</a> · PDOK' } }, layers: [{ id: 'pdok', type: 'raster', source: 'pdok' }] },
        bounds: [[3.3, 50.72], [7.25, 53.56]], fitBoundsOptions: { padding: 24 }, maxBounds: [[-6, 46], [17, 58]],
      });
      const fit = () => map.fitBounds([[3.3, 50.72], [7.25, 53.56]], { padding: 24, duration: 0 }); map.on('resize', fit); map.once('load', fit);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      // Several deals in one city share one marker; size grows with the number of units
      const byCity = new Map<string, Deal[]>(); pts.forEach(d => byCity.set(d.city, [...(byCity.get(d.city) || []), d]));
      let i = 0;
      byCity.forEach((ds, city) => {
        const units = ds.reduce((a, d) => a + d.units, 0);
        const wrap = document.createElement('div'); wrap.className = 'rg-dm-m'; pins.current.set(city, wrap);
        const m = document.createElement('button'); m.type = 'button'; m.className = 'rg-dm-pin'; wrap.append(m); m.style.setProperty('--s', String(Math.min(1.9, 0.9 + units / 40))); m.style.setProperty('--i', String(i++));
        m.setAttribute('aria-label', `${city}: ${ds.length} ${ds.length === 1 ? labels.deal : labels.deals}`);
        const tip = document.createElement('span'); tip.className = 'rg-dm-tip';
        const h = document.createElement('b'); h.textContent = city; tip.append(h);
        ds.forEach(d => { const r = document.createElement('span'); r.textContent = `${d.type} · ${d.units} ${d.units === 1 ? labels.unit : labels.units} · ${d.band} · ${d.days} ${labels.days}`; tip.append(r); });
        m.append(tip);
        markers.push(new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([ds[0].lng!, ds[0].lat!]).addTo(map));
      });
    })();
    return () => { cancelled = true; markers.forEach(m => m.remove()); map?.remove(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="rg-dealmap">
    <div className="rg-dealmap-map"><div ref={box} className="rg-dealmap-canvas" role="img" aria-label={labels.aria} /><p className="rg-dealmap-note">{labels.note}</p></div>
    <aside className="rg-dealmap-side">
      <p className="rg-eyebrow">{labels.where}</p>
      <div className="rg-dealmap-sum"><div><b>{cities.length}</b><span>{labels.cities}</span></div><div><b>{cities.reduce((a, c) => a + c.units, 0)}</b><span>{labels.units}</span></div></div>
      <ul>{cities.map(c => <li key={c.city} tabIndex={0} onMouseEnter={() => glow(c.city, true)} onMouseLeave={() => glow(c.city, false)} onFocus={() => glow(c.city, true)} onBlur={() => glow(c.city, false)}>
        <span className="rg-dm-city">{c.city}</span><span>{c.n} {c.n === 1 ? labels.deal : labels.deals} · {c.units} {c.units === 1 ? labels.unit : labels.units}</span><span className="rg-dm-days">{c.days} {labels.days}</span></li>)}</ul>
    </aside>
  </div>;
}
