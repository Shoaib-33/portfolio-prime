import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, getMe, getLang } from '@/lib/api';
import { pct, toPoint } from '@/lib/format';
import { ListingCard, SoldTable } from './ui';
import { ListingsMap, MapPoint } from './map';
import { SEO_CITIES, SEO_TYPES, siteUrl, JsonLd } from '@/lib/seo';

export function landingMeta(city: string, type?: string) {
  const c = SEO_CITIES[city]; const t = type ? SEO_TYPES[type] : null; if (!c || (type && !t)) return { title: 'Not found | Portfolio & Prime' };
  const what = t ? t.nl : 'Beleggingspanden';
  return {
    title: `${what} ${c.name} te koop | Portfolio & Prime`,
    description: `${what} in ${c.name} (${c.province}) voor geverifieerde beleggers: BAR, NAR, WOZ, energielabel en huurlijst bij elk object. ${t ? t.en : 'Investment property'} in ${c.name}.`,
    alternates: { canonical: `/beleggingspanden/${city}${type ? '/' + type : ''}` },
  };
}

/** SEO landing page per city (and optionally property type): server-rendered, with schema.org breadcrumbs and an item list. */
export async function Landing({ city, type }: { city: string; type?: string }) {
  const c = SEO_CITIES[city]; const ty = type ? SEO_TYPES[type] : null; if (!c || (type && !ty)) notFound();
  const q = new URLSearchParams({ city: c.name, ...(ty ? { category: ty.category } : {}) });
  const [me, lang, res, all, sold, base] = await Promise.all([getMe(), getLang(), api('/listings?' + q), api('/listings?city=' + encodeURIComponent(c.name)), api('/listings/sold'), siteUrl()]);
  const rows: any[] = res.ok ? res.data : []; const open = rows.filter(l => !l.locked); const nl = lang === 'nl';
  const bars = open.map(l => l.bar).filter(Boolean) as number[]; const avgBar = bars.length ? bars.reduce((a, b) => a + b, 0) / bars.length : null;
  const typesHere = Object.entries(SEO_TYPES).filter(([, t]) => (all.data || []).some((l: any) => l.category === t.category));
  const soldHere = (sold.data || []).filter((s: any) => s.city === c.name);
  const title = ty ? `${ty.nl} in ${c.name}` : `Beleggingspanden in ${c.name}`;
  const crumbs: [string, string][] = [['Home', '/'], ['Beleggingspanden', '/beleggingspanden'], [c.name, `/beleggingspanden/${city}`], ...(ty ? [[ty.nl, `/beleggingspanden/${city}/${type}`] as [string, string]] : [])];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + href })) },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: title, numberOfItems: open.length, itemListElement: open.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/listings/${l.slug}`, name: l.name })) },
  ];
  return <>
    <JsonLd data={ld} />
    <section className="page-heading seo-heading"><nav className="crumbs" aria-label="Breadcrumb">{crumbs.map(([name, href], i) => <span key={href}>{i > 0 && ' / '}{i < crumbs.length - 1 ? <Link href={href}>{name}</Link> : name}</span>)}</nav>
      <p className="eyebrow">{c.province.toUpperCase()} · {ty ? ty.en.toUpperCase() : 'INVESTMENT PROPERTY'} {c.name.toUpperCase()}</p><h1>{title}<span>.</span></h1><p className="seo-intro">{nl ? c.nl : c.en}</p>
      <dl className="seo-stats"><div><dt>{nl ? 'Objecten nu' : 'Listed now'}</dt><dd>{rows.length}</dd></div><div><dt>{nl ? 'Gem. BAR' : 'Avg. gross yield (BAR)'}</dt><dd>{avgBar ? pct(avgBar) : '—'}</dd></div><div><dt>{nl ? 'Verkocht (archief)' : 'Sold (archive)'}</dt><dd>{soldHere.length}</dd></div><div><dt>{nl ? 'Provincie' : 'Province'}</dt><dd>{c.province}</dd></div></dl></section>
    <section className="section collection-section">
      {typesHere.length > 0 && <div className="row chips-row seo-types"><Link className={`chip-btn ${!ty ? 'on' : ''}`} href={`/beleggingspanden/${city}`}>{nl ? 'Alles in' : 'All of'} {c.name}</Link>{typesHere.map(([k, t]) => <Link key={k} className={`chip-btn ${type === k ? 'on' : ''}`} href={`/beleggingspanden/${city}/${k}`}>{nl ? t.nl : t.en}</Link>)}</div>}
      {open.length > 0 && <div className="map-wrap"><ListingsMap points={open.map(toPoint).filter(Boolean) as MapPoint[]} height={380} /></div>}
      {rows.length ? <div className="property-grid">{rows.map(l => <ListingCard key={l.slug} l={l} lang={lang} signedIn={!!me.user} />)}</div>
        : <div className="empty"><h2>{nl ? 'Nu geen aanbod.' : 'Nothing listed right now.'}</h2><p>{nl ? 'Nieuw aanbod gaat eerst naar leden met een passende zoekopdracht.' : 'New stock goes to members with a matching saved search first.'}</p><Link className="btn navy" href={me.user ? `/listings?city=${encodeURIComponent(c.name)}` : '/#request'}>{me.user ? 'Save a search' : nl ? 'Gratis lid worden' : 'Join free'} ↗</Link></div>}
      {soldHere.length > 0 && <><div className="section-heading" style={{ marginTop: 60 }}><div><p className="eyebrow">TRACK RECORD</p><h2>{nl ? `Verkocht in ${c.name}` : `Sold in ${c.name}`}</h2></div></div><SoldTable rows={soldHere} /></>}
      <div className="seo-cities"><p className="eyebrow">{nl ? 'ANDERE STEDEN' : 'OTHER CITIES'}</p><div className="row">{Object.entries(SEO_CITIES).filter(([k]) => k !== city).map(([k, x]) => <Link key={k} className="text-link" href={`/beleggingspanden/${k}`}>Beleggingspanden {x.name}</Link>)}</div></div>
    </section></>;
}
