'use client';
/* Cinematic motion for the visitor pages (home, log in), built on GSAP + ScrollTrigger and Lenis:
   - smooth inertia scrolling, with anchor links and the phone menu handled,
   - headlines rising word by word ([data-split]), photos unmasking with a slow zoom ([data-reveal]),
   - a pinned "How access works" chapter where the steps light up in turn ([data-steps], wide screens),
   - the hero drifting away on scroll and cards that tilt in 3D.
   The libraries load after the page has appeared, so they never delay the first screen (the intro is pure CSS, see cinema.css).
   Everything is skipped for people who prefer reduced motion; the page is complete without it. */
import { useEffect } from 'react';

const TILT = '.rg-teaser, .rg-pillar, .rg-deal';

export function RgCinema() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let dead = false; let dispose: (() => void) | undefined;
    const run = async () => {
      const [g, st, l] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')]);
      if (!dead) dispose = setup(g.default, st.ScrollTrigger, l.default);
    };
    const idle = (window as any).requestIdleCallback as undefined | ((f: () => void, o: object) => number);
    idle ? idle(run, { timeout: 700 }) : setTimeout(run, 200);
    return () => { dead = true; dispose?.(); };
  }, []);
  return null;
}

function setup(gsap: any, ScrollTrigger: any, Lenis: any): (() => void) | undefined {
    const html = document.documentElement; const root = document.querySelector<HTMLElement>('.reg'); if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    html.classList.add('rg-cine');
    const cleanups: (() => void)[] = [];
    const ctx = gsap.context(() => {}, root);

    /* ---------- Smooth scrolling ---------- */
    const lenis = new Lenis({ lerp: 0.17, wheelMultiplier: 1 });
    (window as any).__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0);
    cleanups.push(() => { gsap.ticker.remove(tick); lenis.destroy(); delete (window as any).__lenis; });
    // In-page links glide instead of jumping (the page's scroll-padding keeps them clear of the fixed header)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const url = new URL(a.href, location.href); if (url.pathname !== location.pathname || !url.hash) return;
      const target = document.querySelector(url.hash === '#main' ? 'body' : url.hash); if (!target) return;
      e.preventDefault(); lenis.scrollTo(target as HTMLElement, { duration: 1.1 }); history.replaceState(null, '', url.hash);
    };
    document.addEventListener('click', onClick); cleanups.push(() => document.removeEventListener('click', onClick));
    // Phone menu open: hold the page still
    // The CSS intro is playing: hold scrolling until it lifts
    if (html.classList.contains('rg-intro-on')) { lenis.stop(); const id = setTimeout(() => { lenis.start(); ScrollTrigger.refresh(); }, 1800); cleanups.push(() => clearTimeout(id)); }
    const mo = new MutationObserver(() => { if (html.classList.contains('rg-intro-on')) return; html.classList.contains('rg-menu-open') ? lenis.stop() : lenis.start(); });
    mo.observe(html, { attributes: true, attributeFilter: ['class'] }); cleanups.push(() => mo.disconnect());

    ctx.add(() => {
      /* ---------- Headlines rise word by word ---------- */
      (gsap.utils.toArray('[data-split]') as HTMLElement[]).forEach(h => {
        const words = h.querySelectorAll('.rg-sw > span'); if (!words.length) return;
        gsap.set(words, { yPercent: 115 });
        ScrollTrigger.create({ trigger: h, start: 'top 88%', once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: 0.055 }) });
      });

      /* ---------- Photos unmask with a slow zoom ---------- */
      (gsap.utils.toArray('[data-reveal]') as HTMLElement[]).forEach(box => {
        const img = box.querySelector('img');
        gsap.fromTo(box, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: box, start: 'top 85%', once: true } });
        if (img) gsap.fromTo(img, { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: box, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      /* ---------- Hero drifts away on scroll ---------- */
      const hero = document.querySelector<HTMLElement>('.rg-hero');
      if (hero) {
        gsap.to('.rg-hero-fx', { yPercent: -18, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 35%', scrub: true } });
        gsap.to('.rg-hero-bar', { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: '40% top', scrub: true } });
      }

      /* ---------- "How access works": pinned, steps light up in turn (wide screens) ---------- */
      const steps = document.querySelector<HTMLElement>('[data-steps]'); const sec = steps?.closest<HTMLElement>('section');
      if (steps && sec) {
        const items = Array.from(steps.querySelectorAll('li'));
        const mm = gsap.matchMedia(); cleanups.push(() => mm.revert());
        mm.add('(min-width: 1081px) and (min-height: 640px)', () => {
            sec.classList.add('is-pinned');
            const st = ScrollTrigger.create({ trigger: sec, start: 'top top', end: 'bottom bottom', scrub: true,
              onUpdate: (s: any) => { const p = s.progress; steps.style.setProperty('--p', p.toFixed(3)); const n = Math.min(items.length - 1, Math.floor(p * items.length * 0.999)); items.forEach((li, k) => li.classList.toggle('on', k <= n)); } });
            return () => { st.kill(); sec.classList.remove('is-pinned'); steps.style.removeProperty('--p'); items.forEach(li => li.classList.remove('on')); };
        });
      }
    });

    // Pinning changes the page height: recompute every trigger position once everything is set up
    ScrollTrigger.refresh();

    /* ---------- 3D tilt: cards lean toward the pointer, with a soft light that follows it (mouse only) ---------- */
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let cur: HTMLElement | null = null;
      const release = () => { if (!cur) return; cur.classList.remove('is-tilt'); ['--rx', '--ry'].forEach(v => cur!.style.setProperty(v, '0deg')); cur = null; };
      const tilt = (e: PointerEvent) => {
        const card = (e.target as HTMLElement).closest?.<HTMLElement>(TILT) || null;
        if (card !== cur) { release(); cur = card; card?.classList.add('is-tilt'); }
        if (!card) return;
        const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', `${((0.5 - y) * 7).toFixed(2)}deg`); card.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`); card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      };
      addEventListener('pointermove', tilt, { passive: true }); document.addEventListener('pointerleave', release);
      cleanups.push(() => { removeEventListener('pointermove', tilt); document.removeEventListener('pointerleave', release); release(); });
    }

    // Layout changes (FAQ answers opening, images loading) move trigger positions: keep them in sync
    let rt = 0; const ro = new ResizeObserver(() => { clearTimeout(rt); rt = window.setTimeout(() => ScrollTrigger.refresh(), 200); });
    ro.observe(document.body); cleanups.push(() => { ro.disconnect(); clearTimeout(rt); });

    return () => { ctx.revert(); ScrollTrigger.getAll().forEach((s: any) => s.kill()); cleanups.forEach(f => f()); html.classList.remove('rg-cine'); };
}
