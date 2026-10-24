import Link from 'next/link';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { ListingCard, SoldTable } from '@/components/ui';
import { ActionButton } from '@/components/client';
import { CATEGORY, CITIES, DEAL } from '@/lib/format';

export default async function Listings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams; const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v && v !== 'all'));
  const [me, lang, res, sold] = await Promise.all([getMe(), getLang(), api('/listings?' + q), api('/listings/sold')]);
  const t = tr(lang); const rows = res.ok ? res.data : [];
  const filters: Record<string, string> = Object.fromEntries(['category', 'city', 'dealType', 'budget', 'minYield', 'minLabel', 'q'].map(k => [k, sp[k] || '']).filter(([, v]) => v && v !== 'all'));
  const sel = (name: string, opts: [string, string][], label: string) => <label>{label}<select name={name} defaultValue={sp[name] || ''}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return <>
    <section className="page-heading"><p className="eyebrow">OUR OFFERING</p><h1>Exclusive stock.<br /><em>Every number included.</em></h1></section>
    <section className="section collection-section"><form className="filters" action="/listings"><label className="kw">Keyword<input name="q" defaultValue={sp.q || ''} placeholder="e.g. Rotterdam, canal, portfolio" /></label>
      {sel('category', Object.entries(CATEGORY).map(([k, v]) => [k === 'all' ? '' : k, t(v)]), 'Property type')}{sel('city', [['', t('Every city')], ...CITIES.map(c => [c, c] as [string, string])], 'City')}{sel('dealType', [['', 'All deal types'], ...Object.entries(DEAL)], 'Deal type')}
      {sel('budget', [['', 'Any'], ['2000000', '€2m'], ['4000000', '€4m'], ['8000000', '€8m']], 'Max price')}{sel('minYield', [['', 'Any'], ['5', '5%'], ['6', '6%']], 'Min. BAR')}{sel('minLabel', [['', 'Any'], ['A', 'A'], ['B', 'B+'], ['C', 'C+'], ['D', 'D+']], 'Energy label')}
      <input type="hidden" name="sort" value={sp.sort || ''} /><button className="btn navy" type="submit">Apply ↗</button></form>
      <div className="results-bar"><span><strong>{rows.length}</strong> properties <Link className="link-button" href="/listings">Reset</Link></span><div className="row">{[['', 'Featured'], ['newest', 'Newest'], ['price-low', 'Price'], ['bar', 'BAR'], ['score', 'Deal score']].map(([v, l]) => <Link key={v} className={`chip-btn ${(sp.sort || '') === v ? 'on' : ''}`} href={`/listings?${new URLSearchParams({ ...filters, ...(v ? { sort: v } : {}) })}`}>{l}</Link>)}</div></div>
      <div className="property-grid">{rows.map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn={!!me.user} />)}</div>
      {!rows.length && <div className="empty"><h2>No matches.</h2><p>Try a wider location, budget or property type.</p><Link className="btn navy" href="/listings">Show everything</Link></div>}
      <div className="inline-cta"><div><h3>Save this search</h3><p>{me.user ? `Alerts: ${me.user.alertFrequency} for your tier (${me.user.tierLabel}).` : 'Join free to save searches and receive alerts.'}</p></div>{me.user ? <ActionButton url="/api/saved-searches" json={{ filters }} label="Save this search" className="btn outline" done="Saved. Manage it in My account." /> : <Link className="btn outline" href="/register?next=/listings">Join free ↗</Link>}</div>
      <div className="section-heading" style={{ marginTop: 70 }}><div><p className="eyebrow">TRACK RECORD</p><h2>{t('Recently sold')}</h2></div></div><SoldTable rows={sold.data} /></section></>;
}
