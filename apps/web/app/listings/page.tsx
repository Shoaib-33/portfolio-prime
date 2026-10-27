import Link from 'next/link';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { ListingCard, SoldTable } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { CATEGORY, CITIES, DEAL, PROVINCES, toPoint } from '@/lib/format';
import { ListingsMap, MapPoint } from '@/components/map';
import { can } from '@/lib/access';

export default async function Listings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams; const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v && v !== 'all'));
  const [me, lang, res, sold, place] = await Promise.all([getMe(), getLang(), api('/listings?' + q), api('/listings/sold'), sp.near ? api('/geo/resolve?q=' + encodeURIComponent(sp.near)) : Promise.resolve(null)]);
  const t = tr(lang); const rows = res.ok ? res.data : []; const view = sp.view === 'map' && can(me, 'map') ? 'map' : 'grid';
  const filters: Record<string, string> = Object.fromEntries(['category', 'city', 'province', 'near', 'radius', 'dealType', 'budget', 'minYield', 'minLabel', 'q'].map(k => [k, sp[k] || '']).filter(([, v]) => v && v !== 'all'));
  const points = rows.map(toPoint).filter(Boolean) as MapPoint[]; const near = place?.data?.place;
  const viewHref = (v: string) => `/listings?${new URLSearchParams({ ...filters, ...(sp.sort ? { sort: sp.sort } : {}), ...(v === 'map' ? { view: 'map' } : {}) })}`;
  const sel = (name: string, opts: [string, string][], label: string) => <label>{label}<select name={name} defaultValue={sp[name] || ''}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return <>
    <section className="page-heading"><p className="eyebrow">{me.user?.staff ? 'THE OFFERING' : 'MY SELECTION'}</p><h1>{me.user?.staff ? <>Every property.<br /><em>Every number included.</em></> : <>Shared with you.<br /><em>Every number included.</em></>}</h1></section>
    <section className="section collection-section"><form className="filters" action="/listings"><label className="kw">Keyword<input name="q" defaultValue={sp.q || ''} placeholder="e.g. Rotterdam, canal, portfolio" /></label>
      {sel('category', Object.entries(CATEGORY).map(([k, v]) => [k === 'all' ? '' : k, t(v)]), 'Property type')}{sel('city', [['', t('Every city')], ...CITIES.map(c => [c, c] as [string, string])], 'City')}{sel('province', [['', 'All provinces'], ...PROVINCES.map(c => [c, c] as [string, string])], 'Province')}
      <label>Near (city or postcode)<input name="near" defaultValue={sp.near || ''} placeholder="e.g. Delft or 3011" /></label>{sel('radius', [['', '25 km'], ['5', '5 km'], ['10', '10 km'], ['50', '50 km'], ['100', '100 km']], 'Radius')}{sel('dealType', [['', 'All deal types'], ...Object.entries(DEAL)], 'Deal type')}
      {sel('budget', [['', 'Any'], ['2000000', '€2m'], ['4000000', '€4m'], ['8000000', '€8m']], 'Max price')}{sel('minYield', [['', 'Any'], ['5', '5%'], ['6', '6%']], 'Min. BAR')}{sel('minLabel', [['', 'Any'], ['A', 'A'], ['B', 'B+'], ['C', 'C+'], ['D', 'D+']], 'Energy label')}
      <input type="hidden" name="sort" value={sp.sort || ''} />{view === 'map' && <input type="hidden" name="view" value="map" />}<button className="btn navy" type="submit">Apply ↗</button></form>
      {sp.near && <p className={near ? 'near-note' : 'near-note form-error'}>{near ? <>Within {Number(sp.radius) || 25} km of <b>{near.name}</b> · located via {near.source}{!me.user && ' · distances from the city centre until you join'}</> : <>We could not find “{sp.near}”. Try a city name or a 4-digit postcode.</>}</p>}
      <div className="results-bar"><span><strong>{rows.length}</strong> properties <Link className="link-button" href="/listings">Reset</Link></span>{can(me, 'map') && <div className="view-toggle" role="group" aria-label="View"><Link className={`chip-btn ${view === 'grid' ? 'on' : ''}`} href={viewHref('grid')} scroll={false}>▦ Grid</Link><Link className={`chip-btn ${view === 'map' ? 'on' : ''}`} href={viewHref('map')} scroll={false}>◉ Map</Link></div>}<div className="row">{[['', 'Featured'], ['newest', 'Newest'], ['price-low', 'Price'], ['bar', 'BAR'], ['score', 'Deal score']].map(([v, l]) => <Link key={v} className={`chip-btn ${(sp.sort || '') === v ? 'on' : ''}`} href={`/listings?${new URLSearchParams({ ...filters, ...(v ? { sort: v } : {}), ...(view === 'map' ? { view: 'map' } : {}) })}`}>{l}</Link>)}</div></div>
      {view === 'map' && <div className="map-wrap"><ListingsMap points={points} />{!me.user && <p className="fine-print">Visitors see the approximate area. Join free to see exact locations and addresses.</p>}</div>}
      <div className="property-grid">{rows.map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn={!!me.user} />)}</div>
      {!rows.length && <div className="empty"><h2>No matches.</h2><p>Try a wider location, budget or property type.</p><Link className="btn navy" href="/listings">Show everything</Link></div>}
      <div className="inline-cta"><div><h3>Save this search</h3><p>{me.user ? `Alerts: ${me.user.alertFrequency} for your tier (${me.user.tierLabel}).` : 'Join free to save searches and receive alerts.'}</p></div>{me.user ? <ActionButton url="/api/saved-searches" json={{ filters }} label="Save this search" className="btn outline" done="Saved. Manage it in My account." /> : <Link className="btn outline" href="/login?next=/listings">Join free ↗</Link>}</div>
      <div className="section-heading" style={{ marginTop: 70 }}><div><p className="eyebrow">TRACK RECORD</p><h2>{t('Recently sold')}</h2></div></div><SoldTable rows={sold.data} /></section></>;
}
