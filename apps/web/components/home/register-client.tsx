'use client';
/* Interactive parts of the visitor pages: navigation, count-up figures, the filterable track record and scroll reveals.
   Every effect is skipped for people who prefer reduced motion; content never depends on it. */
import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Navigation: transparent over the hero, solid once scrolled; active section; full-screen menu on phones ---------- */
export function RgNav({ index, labels, lang, demo, base = '', current, over = false, mark }: { index: [string, string][]; labels: Record<string, string>; lang: ReactNode; demo: boolean; base?: string; current?: string; over?: boolean; mark: ReactNode }) {
  const [open, setOpen] = useState(false); const [active, setActive] = useState(''); const [scrolled, setScrolled] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => { const on = () => setScrolled(scrollY > 24); addEventListener('scroll', on, { passive: true }); on(); return () => removeEventListener('scroll', on); }, []);

  useEffect(() => { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-sec]').forEach(s => io.observe(s)); return () => io.disconnect(); }, []);

  useEffect(() => { const h = document.documentElement; h.classList.toggle('rg-menu-open', open);
    if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } }; addEventListener('keydown', esc);
    return () => { removeEventListener('keydown', esc); h.classList.remove('rg-menu-open'); }; }, [open]);

  const solid = scrolled || open || !over;
  return <header className={`rg-nav${solid ? ' is-solid' : ' is-over'}${open ? ' is-open' : ''}`}>
    {demo && <div className="rg-demo"><span>{labels.demo}</span><Link href="/login">{labels.demoLink} →</Link></div>}
    <div className="rg-nav-bar">
      <a className="rg-home" href={base || '#main'} aria-label="Maasland & Partners">{mark}</a>
      <nav className="rg-index" aria-label={labels.nav}>{index.map(([id, l]) => <a key={id} href={`${base}#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>{l}</a>)}</nav>
      <div className="rg-nav-end">{lang}<Link className={`rg-nav-login${current === 'login' ? ' on' : ''}`} href="/login" aria-current={current === 'login' ? 'page' : undefined}>{labels.login}</Link><a className="rg-btn rg-btn-s rg-btn-primary" href={`${base}#request`}>{labels.request}</a>
        <button ref={btn} type="button" className="rg-burger" aria-expanded={open} aria-controls="rg-menu" aria-label={open ? labels.close : labels.menu} onClick={() => setOpen(o => !o)}><i /><i /></button></div>
    </div>
    <div id="rg-menu" className="rg-menu" hidden={!open}>
      <nav aria-label={labels.nav}>{index.map(([id, l], i) => <a key={id} href={`${base}#${id}`} style={{ ['--i' as any]: i }} onClick={() => setOpen(false)}>{l}</a>)}<Link href="/login" style={{ ['--i' as any]: index.length }}>{labels.login}</Link></nav>
      <div className="rg-menu-foot"><a className="rg-btn rg-btn-primary" href={`${base}#request`} onClick={() => setOpen(false)}>{labels.request}</a>{lang}</div>
    </div>
  </header>;
}

/* ---------- Figure that counts up the first time it is seen; ends on the exact original text ---------- */
export function RgCount({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const el = ref.current; const m = value.match(/^(\D*)([\d.,]+)(\D*)$/); if (!el || !m || reduced()) return;
    const [, pre, num, post] = m; const sep = /\.\d{3}$/.test(num) ? '.' : num.includes(',') ? ',' : ''; const target = Number(num.replace(/[.,]/g, '')); if (!target) return;
    const fmt = (v: number) => pre + (sep ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(Math.round(v))) + post;
    let raf = 0; const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) return; io.disconnect(); const t0 = performance.now();
      const step = (n: number) => { const p = Math.min(1, (n - t0) / 1600); el.textContent = p < 1 ? fmt(target * (1 - Math.pow(1 - p, 4))) : value; if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); }, { threshold: 0.6 });
    io.observe(el); return () => { io.disconnect(); cancelAnimationFrame(raf); }; }, [value]);
  return <span ref={ref}>{value}</span>;
}

/* ---------- Track record: featured photo cards plus a ledger, filterable by deal type ---------- */
type Deal = { city: string; type: string; units: number; band: string; deal: string; dealLabel: string; days: number; img: string };
export function RgRecord({ deals, types, labels }: { deals: Deal[]; types: [string, string][]; labels: Record<string, string> }) {
  const [f, setF] = useState('all');
  const rows = f === 'all' ? deals : deals.filter(d => d.deal === f); const max = Math.max(1, ...deals.map(d => d.days));
  return <div className="rg-record">
    <div className="rg-chips" role="group" aria-label={labels.filter}>{[['all', labels.all] as [string, string], ...types].map(([k, l]) => <button key={k} type="button" className={f === k ? 'on' : ''} aria-pressed={f === k} onClick={() => setF(k)}>{l}<small>{k === 'all' ? deals.length : deals.filter(d => d.deal === k).length}</small></button>)}</div>
    <div className="rg-deals" key={f}>{rows.slice(0, 4).map((d, i) => <article key={d.city + i} className="rg-card rg-deal" style={{ ['--i' as any]: i }}>
      <div className="rg-media"><img src={d.img} alt="" loading="lazy" /><span className="rg-tag">{d.dealLabel}</span></div>
      <div className="rg-card-body"><h3>{d.city}</h3><p>{d.type} · {d.units} {labels.units}</p><div className="rg-deal-foot"><b>{d.band}</b><span>{d.days} {labels.daysShort}</span></div></div>
    </article>)}</div>
    <div className="rg-table" role="table" aria-label={labels.filter}>
      <div className="rg-tr rg-th" role="row">{[labels.city, labels.type, labels.unitsH, labels.band, labels.deal, labels.days].map(h => <span key={h} role="columnheader">{h}</span>)}</div>
      {rows.map((d, i) => <div key={d.city + i} className="rg-tr" role="row"><span role="cell" className="rg-city">{d.city}</span><span role="cell">{d.type}</span><span role="cell" className="rg-n">{d.units}</span><span role="cell" className="rg-n">{d.band}</span><span role="cell"><span className="rg-tag rg-tag-soft">{d.dealLabel}</span></span><span role="cell" className="rg-days"><i style={{ ['--w' as any]: d.days / max }} /><span className="rg-n">{d.days}</span></span></div>)}
    </div>
  </div>;
}

/* ---------- Scroll reveals (staggered among siblings) and hero settle ---------- */
export function RgMotion() {
  useEffect(() => {
    const h = document.documentElement; const root = document.querySelector<HTMLElement>('.reg'); if (!root) return;
    h.classList.add('rg-ready');
    if (reduced()) { h.classList.remove('rg-motion'); return; }
    h.classList.add('rg-motion');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    root.querySelectorAll<HTMLElement>('[data-rv]').forEach(el => { const sib = Array.from(el.parentElement?.children || []).filter(c => c.hasAttribute('data-rv')); el.style.setProperty('--d', `${Math.min(Math.max(0, sib.indexOf(el)), 5) * 90}ms`); io.observe(el); });
    // Gentle parallax on the hero photo
    const media = root.querySelector<HTMLElement>('.rg-hero-media'); let raf = 0;
    const onScroll = () => { if (raf || !media) return; raf = requestAnimationFrame(() => { raf = 0; const y = Math.min(scrollY, innerHeight); media.style.setProperty('--py', `${(y * 0.18).toFixed(1)}px`); }); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => { io.disconnect(); removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); h.classList.remove('rg-ready'); };
  }, []);
  return null;
}

/* ---------- Hero: full-screen slides with counter, progress, arrows, autoplay, keyboard and swipe ---------- */
type Slide = { img: string; eyebrow: string; title: string; meta: string[] };
export function RgHero({ slides, labels }: { slides: Slide[]; labels: Record<string, string> }) {
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false); const n = slides.length; const DUR = 7000;
  const go = (k: number) => setI(((k % n) + n) % n);
  useEffect(() => { if (paused || reduced() || n < 2) return; const id = setTimeout(() => go(i + 1), DUR); return () => clearTimeout(id); }, [i, paused, n]);
  const touch = useRef(0);
  const s = slides[i]; const pad = (v: number) => String(v).padStart(2, '0');
  return <section className="rg-hero" aria-roledescription="carousel" aria-label={labels.region}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onKeyDown={e => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}
    onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }}>
    <div className="rg-hero-media" aria-hidden="true">{slides.map((x, k) => <img key={k} src={x.img} alt="" className={k === i ? 'on' : ''} fetchPriority={k === 0 ? 'high' : 'low'} loading={k === 0 ? 'eager' : 'lazy'} />)}</div>
    <p className="rg-hero-side" aria-hidden="true">{labels.side.split(' · ').map(w => <span key={w}>{w}</span>)}</p>
    <div className="rg-hero-in" key={i} aria-live="polite">
      <p className="rg-hero-eyebrow">{s.eyebrow}</p>
      {i === 0 ? <h1 className="rg-hero-title">{s.title}</h1> : <h2 className="rg-hero-title">{s.title}</h2>}
      <ul className="rg-hero-meta">{s.meta.map(m => <li key={m}>{m}</li>)}</ul>
      <div className="rg-ctas"><a className="rg-btn rg-btn-accent" href="#request">{labels.cta}<svg className="rg-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a><Link className="rg-btn rg-btn-line" href="/login">{labels.invite}</Link></div>
    </div>
    <div className="rg-hero-bar">
      <div className="rg-hero-count"><span className="rg-hero-prog"><i key={`${i}-${paused}`} style={{ animationDuration: `${DUR}ms`, animationPlayState: paused ? 'paused' : 'running' }} /></span><span>{pad(i + 1)} / {pad(n)}</span></div>
      <p className="rg-hero-tag">{labels.tagline}</p>
      <div className="rg-hero-arrows"><button type="button" onClick={() => go(i - 1)} aria-label={labels.prev}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button><button type="button" onClick={() => go(i + 1)} aria-label={labels.next}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button></div>
    </div>
  </section>;
}
