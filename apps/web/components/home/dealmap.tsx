'use client';
/* Track record map in 3D: each city is a champagne column whose height reflects the units sold there (city level only,
   never addresses). The camera tilts in and the columns rise when the map scrolls into view; hovering a column, or a city
   in the side list, highlights it with the deals. Free PDOK base map on MapLibre GL; low-detail tiles (below zoom 6) are skipped, since the tilted view would draw the sea as one flat block. */
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const PDOK = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
type Deal = { city: string; type: string; units: number; band: string; dealLabel: string; days: number; lat?: number; lng?: number };

export function RgDealMap({ deals, labels }: { deals: Deal[]; labels: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ glow: (city: string, on: boolean) => void } | null>(null);
  const pts = deals.filter(d => d.lat != null && d.lng != null);
  const cities = Array.from(pts.reduce((m, d) => m.set(d.city, [...(m.get(d.city) || []), d]), new Map<string, Deal[]>()))
    .map(([city, ds]) => ({ city, ds, n: ds.length, units: ds.reduce((a, d) => a + d.units, 0), days: Math.round(ds.reduce((a, d) => a + d.days, 0) / ds.length), lng: ds[0].lng!, lat: ds[0].lat! }))
    .sort((a, b) => b.units - a.units);
  const glow = (city: string, on: boolean) => api.current?.glow(city, on);
  const key = pts.map(d => d.city + d.units).join('|');

  useEffect(() => {
    let map: any; let cancelled = false; const offs: (() => void)[] = [];
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = () => document.documentElement.dataset.theme === 'dark'
      ? { col: '#D4B98A', hot: '#F2EBDF', bmin: 0.9, bmax: 0.1, sat: -0.85 }
      : { col: '#8A6A3E', hot: '#2A1E16', bmin: 0, bmax: 1, sat: -0.35 };
    const paint = (k: ReturnType<typeof colors>) => ['case', ['boolean', ['feature-state', 'hot'], false], k.hot, k.col];
    // A square footprint (about 7 km) around each city centre, extruded by the units sold
    const square = (lng: number, lat: number) => { const dx = 0.05, dy = 0.032; return [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]]; };
    const geo = { type: 'FeatureCollection', features: cities.map(c => ({ type: 'Feature', properties: { city: c.city, h: 8000 + c.units * 1700 }, geometry: { type: 'Polygon', coordinates: square(c.lng, c.lat) } })) };
    const tipFor = (city: string) => {
      const c = cities.find(x => x.city === city); const el = document.createElement('div'); el.className = 'rg-dm-tip';
      const h = document.createElement('b'); h.textContent = city; el.append(h);
      c?.ds.forEach(d => { const r = document.createElement('span'); r.textContent = `${d.type} · ${d.units} ${d.units === 1 ? labels.unit : labels.units} · ${d.band} · ${d.days} ${labels.days}`; el.append(r); });
      return el;
    };

    // The map library is large, so it loads only when a visitor gets close to the map
    const start = async () => {
      const maplibregl = (await import('maplibre-gl')).default; if (cancelled || !box.current) return;
      const wide = box.current.clientWidth > 560;
      const view = { center: [5.35, 52.15] as [number, number], zoom: wide ? 6.55 : 6.05, pitch: wide ? 52 : 46, bearing: -16 };
      map = new maplibregl.Map({
        container: box.current, attributionControl: { compact: true }, cooperativeGestures: true, maxPitch: 70,
        style: { version: 8, sources: { pdok: { type: 'raster', tiles: [PDOK], tileSize: 256, minzoom: 6, maxzoom: 19, attribution: 'Kaart © <a href="https://www.kadaster.nl" target="_blank" rel="noopener">Kadaster</a> · PDOK' } }, layers: [{ id: 'pdok', type: 'raster', source: 'pdok' }] },
        center: view.center, zoom: still ? view.zoom : view.zoom - 0.5, pitch: still ? view.pitch : 0, bearing: still ? view.bearing : 0, maxBounds: [[-6, 46], [17, 58]],
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
      // Restyle only the base map, so the columns keep their full colour. Dark mode swaps min and max brightness: a night version of the map
      const base = (k: ReturnType<typeof colors>) => { map.setPaintProperty('pdok', 'raster-brightness-min', k.bmin); map.setPaintProperty('pdok', 'raster-brightness-max', k.bmax); map.setPaintProperty('pdok', 'raster-saturation', k.sat); };
      map.on('load', () => {
        const k = colors(); base(k);
        map.addSource('deals', { type: 'geojson', data: geo, promoteId: 'city' });
        map.addLayer({ id: 'deals-3d', type: 'fill-extrusion', source: 'deals', paint: {
          'fill-extrusion-color': paint(k), 'fill-extrusion-height': ['*', ['get', 'h'], still ? 1 : 0],
          'fill-extrusion-height-transition': { duration: 1800, delay: 300 }, 'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true } });

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'rg-dm-pop', maxWidth: '320px' });
        let hot = '';
        const setHot = (city: string) => {
          if (hot === city) return;
          if (hot) map.setFeatureState({ source: 'deals', id: hot }, { hot: false });
          hot = city;
          if (city) { map.setFeatureState({ source: 'deals', id: city }, { hot: true }); const c = cities.find(x => x.city === city); if (c) popup.setLngLat([c.lng, c.lat]).setDOMContent(tipFor(city)).addTo(map); }
          else popup.remove();
          map.getCanvas().style.cursor = city ? 'pointer' : '';
        };
        map.on('mousemove', 'deals-3d', (e: any) => setHot(e.features?.[0]?.properties?.city || ''));
        map.on('mouseleave', 'deals-3d', () => setHot(''));
        map.on('click', 'deals-3d', (e: any) => setHot(e.features?.[0]?.properties?.city || ''));
        api.current = { glow: (city, on) => setHot(on ? city : '') };

        // Rise and tilt in once the map is on screen
        const go = () => { map.setPaintProperty('deals-3d', 'fill-extrusion-height', ['get', 'h']); map.easeTo({ ...view, duration: 2600, easing: (t: number) => 1 - Math.pow(1 - t, 4) }); };
        if (still) map.setPaintProperty('deals-3d', 'fill-extrusion-height', ['get', 'h']);
        else { const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); go(); } }, { threshold: 0.35 }); io.observe(box.current!); offs.push(() => io.disconnect()); }

        // Follow the light/dark switch without reloading the map
        const mo = new MutationObserver(() => { const c = colors(); base(c); map.setPaintProperty('deals-3d', 'fill-extrusion-color', paint(c)); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); offs.push(() => mo.disconnect());
      });
    };
    const near = new IntersectionObserver(([en]) => { if (en.isIntersecting) { near.disconnect(); start(); } }, { rootMargin: '900px 0px' });
    near.observe(box.current!); offs.push(() => near.disconnect());
    return () => { cancelled = true; offs.forEach(f => f()); api.current = null; map?.remove(); };
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
