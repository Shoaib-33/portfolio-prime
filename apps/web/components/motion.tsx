'use client';
/* Motion layer: scroll reveals, count-up figures, header glass on scroll, hero parallax, card spotlight, page fade.
   Progressive: nothing is hidden unless this runs, and it does nothing for people who prefer reduced motion. */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const REVEAL = ['.section-heading', '.pillar', '.steps4 li', '.inside', '.sold-table tbody tr', '.sell-band', '.req-copy', '.req-card', '.footer-top', '.property-grid > *', '.tool-grid > .tool', '.skyline', '.empty-state'].join(',');
const SPOT = '.inside, .pillar, .tool, .steps4 li';

/** Animates "€206m", "1.242", "38" up from zero on the existing text node, then restores the exact original text. */
function countUp(el: HTMLElement) {
  const node = el.firstChild; const text = node?.nodeValue || '';
  const m = text.match(/^(\D*)([\d.,]+)(\D*)$/); if (!node || !m) return;
  const [, pre, num, post] = m; const sep = num.includes('.') && /\.\d{3}$/.test(num) ? '.' : num.includes(',') ? ',' : '';
  const target = Number(num.replace(/[.,]/g, '')); if (!target) return;
  const fmt = (v: number) => pre + (sep ? Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(Math.round(v))) + post;
  const t0 = performance.now(), dur = 1400;
  const step = (now: number) => { const p = Math.min(1, (now - t0) / dur); node.nodeValue = p < 1 ? fmt(target * (1 - Math.pow(1 - p, 4))) : text; if (p < 1) requestAnimationFrame(step); };
  node.nodeValue = fmt(0); requestAnimationFrame(step);
}

export function Motion() {
  const path = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('motion');

    // Page fade on client navigation
    const main = document.getElementById('main');
    main?.classList.remove('page-in'); void main?.offsetWidth; main?.classList.add('page-in');

    // Reveal on scroll: only things below the fold get hidden first, so nothing visible ever blinks.
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    document.querySelectorAll<HTMLElement>(REVEAL).forEach(el => {
      if (el.classList.contains('rv')) return;
      if (el.getBoundingClientRect().top < innerHeight * 0.92) { el.classList.add('rv', 'in'); return; }
      const sibs = Array.from(el.parentElement?.children || []); const i = Math.min(sibs.indexOf(el), 6);
      el.style.setProperty('--d', `${i * 90}ms`); el.classList.add('rv'); io.observe(el);
    });

    // Count-up figures when the stats strip comes into view
    const cio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.querySelectorAll<HTMLElement>('b').forEach(countUp); cio.unobserve(e.target); } }), { threshold: 0.4 });
    document.querySelectorAll('.pub-stats, .mh-stats').forEach(el => cio.observe(el));

    // Header glass, scroll progress and hero parallax, batched per frame
    const header = document.getElementById('site-header'); const hero = document.querySelector<HTMLElement>('.pub-hero');
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const y = scrollY; const max = root.scrollHeight - innerHeight;
      header?.classList.toggle('scrolled', y > 40);
      root.style.setProperty('--sp', String(max > 0 ? y / max : 0));
      if (hero && y < hero.offsetHeight + 200) hero.style.setProperty('--py', `${y * 0.25}px`);
    }); };
    onScroll(); addEventListener('scroll', onScroll, { passive: true });

    // Spotlight that follows the pointer across cards
    const onMove = (e: PointerEvent) => { const c = (e.target as HTMLElement).closest?.<HTMLElement>(SPOT); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); };
    addEventListener('pointermove', onMove, { passive: true });

    return () => { io.disconnect(); cio.disconnect(); removeEventListener('scroll', onScroll); removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [path]);
  return <div className="scroll-progress" aria-hidden="true" />;
}
