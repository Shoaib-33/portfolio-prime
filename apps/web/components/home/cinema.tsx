'use client';
/* Cinematic motion for the visitor pages (home, log in), built on GSAP + ScrollTrigger and Lenis:
   - first-visit intro (name rises, champagne line draws, curtain lifts),
   - smooth inertia scrolling, with anchor links and the phone menu handled,
   - headlines rising word by word ([data-split]), photos unmasking with a slow zoom ([data-reveal]),
   - a pinned "How access works" chapter where the steps light up in turn ([data-steps], wide screens),
   - the hero drifting away on scroll and cards that tilt in 3D.
   Everything is skipped for people who prefer reduced motion; the page is complete without it. */
import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

const TILT = '.rg-teaser, .rg-pillar, .rg-deal';

export function RgCinema({ home }: { home: boolean }) {
  useEffect(() => {
    const html = document.documentElement; const root = document.querySelector<HTMLElement>('.reg');
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) { html.classList.remove('rg-intro-on'); return; }
    gsap.registerPlugin(ScrollTrigger);
    html.classList.add('rg-cine');
    const cleanups: (() => void)[] = [];
    const ctx = gsap.context(() => {}, root);

    /* ---------- Smooth scrolling ---------- */
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
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
      e.preventDefault(); lenis.scrollTo(target as HTMLElement, { duration: 1.5 }); history.replaceState(null, '', url.hash);
    };
    document.addEventListener('click', onClick); cleanups.push(() => document.removeEventListener('click', onClick));
    // Phone menu open: hold the page still
    const mo = new MutationObserver(() => html.classList.contains('rg-menu-open') ? lenis.stop() : lenis.start());
    mo.observe(html, { attributes: true, attributeFilter: ['class'] }); cleanups.push(() => mo.disconnect());

    ctx.add(() => {
      /* ---------- Intro (first visit per session, homepage) ---------- */
      const intro = document.querySelector<HTMLElement>('.rg-intro');
      if (home && intro && html.classList.contains('rg-intro-on')) {
        lenis.stop();
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => { html.classList.remove('rg-intro-on'); lenis.start(); ScrollTrigger.refresh(); } });
        // Start states come from CSS (hidden before this script runs, so nothing flashes)
        tl.to(intro.querySelectorAll('.rg-intro-ch'), { y: 0, yPercent: 0, duration: 1.1, stagger: 0.035 })
          .to(intro.querySelector('.rg-intro-line'), { scaleX: 1, duration: 1.1, ease: 'expo.inOut' }, 0.35)
          .to(intro.querySelector('.rg-intro-meta'), { autoAlpha: 1, y: 0, duration: 0.8 }, 0.8)
          .to(intro.querySelector('.rg-intro-in'), { yPercent: -30, autoAlpha: 0, duration: 0.9, ease: 'expo.in' }, 1.75)
          .to(intro, { yPercent: -100, duration: 1.15, ease: 'expo.inOut' }, 1.95)
          .from('.rg-hero-media', { scale: 1.22, duration: 2.2, ease: 'expo.out', clearProps: 'transform' }, 2.15)
          .add(() => html.classList.remove('rg-intro-on'), 2.3);
      } else html.classList.remove('rg-intro-on');

      /* ---------- Headlines rise word by word ---------- */
      gsap.utils.toArray<HTMLElement>('[data-split]').forEach(h => {
        const words = h.querySelectorAll('.rg-sw > span'); if (!words.length) return;
        gsap.set(words, { yPercent: 115 });
        ScrollTrigger.create({ trigger: h, start: 'top 88%', once: true, onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: 0.055 }) });
      });

      /* ---------- Photos unmask with a slow zoom ---------- */
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(box => {
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
              onUpdate: s => { const p = s.progress; steps.style.setProperty('--p', p.toFixed(3)); const n = Math.min(items.length - 1, Math.floor(p * items.length * 0.999)); items.forEach((li, k) => li.classList.toggle('on', k <= n)); } });
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

    return () => { ctx.revert(); ScrollTrigger.getAll().forEach(s => s.kill()); cleanups.forEach(f => f()); html.classList.remove('rg-cine', 'rg-intro-on'); };
  }, [home]);
  return null;
}
