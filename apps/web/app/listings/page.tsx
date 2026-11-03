import Link from 'next/link';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { ListingCard, SoldTable } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { CATEGORY, CITIES, DEAL, PROVINCES, toPoint } from '@/lib/format';
import { ListingsMap, MapPoint } from '@/components/map';
import { can } from '@/lib/access';
export const metadata = { title: 'Properties | Maasland & Partners', robots: { index: false, follow: false } };

export default async function Listings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams; const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v && v !== 'all'));
  const [me, lang, res, sold, place] = await Promise.all([getMe(), getLang(), api('/listings?' + q), api('/listings/sold'), sp.near ? api('/geo/resolve?q=' + encodeURIComponent(sp.near)) : Promise.resolve(null)]);
  const t = tr(lang); const rows = res.ok ? res.data : []; const view = sp.view === 'map' && can(me, 'map') ? 'map' : 'grid';
  const filters: Record<string, string> = Object.fromEntries(['category', 'city', 'province', 'near', 'radius', 'dealType', 'budget', 'minYield', 'minLabel', 'q'].map(k => [k, sp[k] || '']).filter(([, v]) => v && v !== 'all'));
  const points = rows.map(toPoint).filter(Boolean) as MapPoint[]; const near = place?.data?.place;
  const viewHref = (v: string) => `/listings?${new URLSearchParams({ ...filters, ...(sp.sort ? { sort: sp.sort } : {}), ...(v === 'map' ? { view: 'map' } : {}) })}`;
  const sel = (name: string, opts: [string, string][], label: string) => <label>{label}<select name={name} defaultValue={sp[name] || ''}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return <>
    <section className="page-heading"><p className="eyebrow">{me.user?.staff ? t('THE OFFERING') : t('MY SELECTION')}</p><h1>{me.user?.staff ? <>{t('Every property.')}<br /><em>{t('Every number included.')}</em></> : <>{t('Shared with you.')}<br /><em>{t('Every number included.')}</em></>}</h1></section>
    <section className="section collection-section"><form className="filters" action="/listings"><label className="kw">{t('Keyword')}<input name="q" defaultValue={sp.q || ''} placeholder={t('e.g. Rotterdam, canal, portfolio')} /></label>
      {sel('category', Object.entries(CATEGORY).map(([k, v]) => [k === 'all' ? '' : k, t(v)]), t('Property type'))}{sel('city', [['', t('Every city')], ...CITIES.map(c => [c, c] as [string, string])], t('City'))}{sel('province', [['', t('All provinces')], ...PROVINCES.map(c => [c, c] as [string, string])], t('Province'))}
      <label>{t('Near (city or postcode)')}<input name="near" defaultValue={sp.near || ''} placeholder={t('e.g. Delft or 3011')} /></label>{sel('radius', [['', '25 km'], ['5', '5 km'], ['10', '10 km'], ['50', '50 km'], ['100', '100 km']], t('Radius'))}{sel('dealType', [['', t('All deal types')], ...Object.entries(DEAL).map(([k, v]) => [k, t(v)] as [string, string])], t('Deal type'))}
      {sel('budget', [['', t('Any')], ['2000000', '€2m'], ['4000000', '€4m'], ['8000000', '€8m']], t('Max price'))}{sel('minYield', [['', t('Any')], ['5', '5%'], ['6', '6%']], t('Min. BAR'))}{sel('minLabel', [['', t('Any')], ['A', 'A'], ['B', 'B+'], ['C', 'C+'], ['D', 'D+']], t('Energy label'))}
      <input type="hidden" name="sort" value={sp.sort || ''} />{view === 'map' && <input type="hidden" name="view" value="map" />}<button className="btn navy" type="submit">{t('Apply')} ↗</button></form>
      {sp.near && <p className={near ? 'near-note' : 'near-note form-error'}>{near ? <>{t('Within {n} km of', { n: Number(sp.radius) || 25 })} <b>{near.name}</b> · {t('located via {source}', { source: near.source })}{!me.user && ' · ' + t('distances from the city centre until you join')}</> : <>{t('We could not find “{q}”. Try a city name or a 4-digit postcode.', { q: sp.near })}</>}</p>}
      <div className="results-bar"><span><strong>{rows.length}</strong> {t('properties')} <Link className="link-button" href="/listings">{t('Reset')}</Link></span>{can(me, 'map') && <div className="view-toggle" role="group" aria-label={t('View mode')}><Link className={`chip-btn ${view === 'grid' ? 'on' : ''}`} href={viewHref('grid')} scroll={false}>▦ {t('Grid')}</Link><Link className={`chip-btn ${view === 'map' ? 'on' : ''}`} href={viewHref('map')} scroll={false}>◉ {t('Map')}</Link></div>}<div className="row">{[['', t('Featured')], ['newest', t('Newest')], ['price-low', t('Price')], ['bar', 'BAR'], ['score', t('Deal score')]].map(([v, l]) => <Link key={v} className={`chip-btn ${(sp.sort || '') === v ? 'on' : ''}`} href={`/listings?${new URLSearchParams({ ...filters, ...(v ? { sort: v } : {}), ...(view === 'map' ? { view: 'map' } : {}) })}`}>{l}</Link>)}</div></div>
      {view === 'map' && <div className="map-wrap"><ListingsMap points={points} />{!me.user && <p className="fine-print">{t('Visitors see the approximate area. Join free to see exact locations and addresses.')}</p>}</div>}
      <div className="property-grid">{rows.map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn={!!me.user} />)}</div>
      {!rows.length && <div className="empty"><h2>{t('No matches.')}</h2><p>{t('Try a wider location, budget or property type.')}</p><Link className="btn navy" href="/listings">{t('Show everything')}</Link></div>}
      <div className="inline-cta"><div><h3>{t('Save this search')}</h3><p>{me.user ? t('Alerts: {freq} for your tier ({tier}).', { freq: t(me.user.alertFrequency), tier: t(me.user.tierLabel) }) : t('Join free to save searches and receive alerts.')}</p></div>{me.user ? <ActionButton url="/api/saved-searches" json={{ filters }} label={t('Save this search')} className="btn outline" done={t('Saved. Manage it in My account.')} /> : <Link className="btn outline" href="/login?next=/listings">{t('Join free')} ↗</Link>}</div>
      <div className="section-heading" style={{ marginTop: 70 }}><div><p className="eyebrow">{t('TRACK RECORD')}</p><h2>{t('Recently sold')}</h2></div></div><SoldTable rows={sold.data} /></section></>;
}
