'use client';
/* Map view with PDOK base tiles (BRT Achtergrondkaart, free Dutch government maps) on MapLibre GL.
   Pins are clustered by screen distance and re-clustered on every zoom. Visitors only receive city-centre points,
   shown as an "approximate area" ring instead of a pin. */
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useT } from '@/components/lang';

export type MapPoint = { slug: string; name: string; city: string; district?: string; price: string; bar?: number | null; image: string; lat: number; lng: number; approx: boolean };

const PDOK = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png';
const el = (tag: string, cls: string, text?: string) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function ListingsMap({ points, height = 520, detail = false }: { points: MapPoint[]; height?: number; detail?: boolean }) {
  const box = useRef<HTMLDivElement>(null); const t = useT();
  const key = points.map(p => p.slug + p.lat + p.lng).join('|');
  useEffect(() => {
    let map: any; let markers: any[] = []; let cancelled = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default; if (cancelled || !box.current) return;
      map = new maplibregl.Map({
        container: box.current, attributionControl: { compact: true }, cooperativeGestures: detail,
        locale: { 'CooperativeGesturesHandler.WindowsHelpText': t('Use Ctrl + scroll to zoom the map'), 'CooperativeGesturesHandler.MacHelpText': t('Use ⌘ + scroll to zoom the map'), 'CooperativeGesturesHandler.MobileHelpText': t('Use two fingers to move the map'),
          'NavigationControl.ZoomIn': t('Zoom in'), 'NavigationControl.ZoomOut': t('Zoom out'), 'NavigationControl.ResetBearing': t('Reset bearing to north'), 'FullscreenControl.Enter': t('Enter fullscreen'), 'FullscreenControl.Exit': t('Exit fullscreen'), 'AttributionControl.ToggleAttribution': t('Toggle attribution') },
        style: { version: 8, sources: { pdok: { type: 'raster', tiles: [PDOK], tileSize: 256, maxzoom: 19, attribution: 'Kaart © <a href="https://www.kadaster.nl" target="_blank" rel="noopener">Kadaster</a> · PDOK' } }, layers: [{ id: 'pdok', type: 'raster', source: 'pdok' }] },
        center: [5.3, 52.15], zoom: 6.6, maxBounds: [[2.5, 50.5], [7.9, 53.9]],
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      const popup = new maplibregl.Popup({ closeButton: true, offset: 18, maxWidth: '280px' });
      const card = (p: MapPoint) => {
        const a = el('a', 'map-card') as HTMLAnchorElement; a.href = `/listings/${p.slug}`;
        const img = el('img', '') as HTMLImageElement; img.src = String(p.image).startsWith("https://") ? p.image : `/img/${p.image}.jpg`; img.alt = ''; a.append(img);
        const body = el('span', 'map-card-body'); body.append(el('small', '', `${p.city}${p.district ? ' / ' + p.district : ''}`), el('b', '', p.name), el('span', '', p.price + (p.bar ? ` · BAR ${p.bar.toFixed(1)}%` : '')));
        if (p.approx) body.append(el('em', '', t('Approximate area · exact address for members')));
        a.append(body); return a;
      };
      const draw = () => {
        markers.forEach(m => m.remove()); markers = [];
        const groups: { pts: MapPoint[]; x: number; y: number }[] = [];
        for (const p of points) {
          const px = map.project([p.lng, p.lat]); const g = groups.find(g => Math.hypot(g.x - px.x, g.y - px.y) < 46);
          if (g) { g.pts.push(p); g.x = (g.x * (g.pts.length - 1) + px.x) / g.pts.length; g.y = (g.y * (g.pts.length - 1) + px.y) / g.pts.length; } else groups.push({ pts: [p], x: px.x, y: px.y });
        }
        for (const g of groups) {
          const at = map.unproject([g.x, g.y]);
          if (g.pts.length > 1) {
            const b = el('button', 'map-cluster', String(g.pts.length)); b.setAttribute('aria-label', t('{n} properties here, zoom in', { n: g.pts.length }));
            // Points that share a location (visitors see city centres) cannot be split by zooming: list them instead.
            const same = g.pts.every(p => p.lat === g.pts[0].lat && p.lng === g.pts[0].lng);
            b.onclick = e => {
              e.stopPropagation();
              if (same || map.getZoom() >= 14) { const list = el('div', 'map-list'); g.pts.forEach(p => list.append(card(p))); map.panTo(at, { offset: [0, -map.getContainer().clientHeight * 0.32], duration: 300 }); popup.options.anchor = 'top'; popup.setLngLat(at).setDOMContent(list).addTo(map); return; }
              const bounds = new maplibregl.LngLatBounds(); g.pts.forEach(p => bounds.extend([p.lng, p.lat])); map.fitBounds(bounds, { padding: 90, maxZoom: 14, duration: 600 });
            };
            markers.push(new maplibregl.Marker({ element: b }).setLngLat(at).addTo(map));
          } else {
            const p = g.pts[0]; const b = el('button', p.approx ? 'map-area' : 'map-pin'); b.setAttribute('aria-label', `${p.name}, ${p.city}`);
            if (!p.approx) b.append(el('span', '', p.price.replace(/\s/g, ' ')));
            b.onclick = e => { e.stopPropagation(); popup.options.anchor = undefined; popup.setLngLat([p.lng, p.lat]).setDOMContent(card(p)).addTo(map); };
            markers.push(new maplibregl.Marker({ element: b }).setLngLat([p.lng, p.lat]).addTo(map));
          }
        }
      };
      map.on('load', () => {
        if (points.length === 1) map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: points[0].approx ? 11 : 14.5 });
        else if (points.length > 1) { const b = new maplibregl.LngLatBounds(); points.forEach(p => b.extend([p.lng, p.lat])); map.fitBounds(b, { padding: 70, maxZoom: 12, duration: 0 }); }
        draw(); map.on('moveend', draw);
      });
    })();
    return () => { cancelled = true; markers.forEach(m => m.remove()); map?.remove(); };
  }, [key, detail]);
  return <div className="map-box" style={{ height }}><div ref={box} className="map-canvas" role="region" aria-label={t('Map of properties')} /></div>;
}
