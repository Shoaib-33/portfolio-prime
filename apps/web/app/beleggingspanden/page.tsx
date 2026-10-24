import Link from 'next/link';
import { api } from '@/lib/api';
import { SEO_CITIES, SEO_TYPES } from '@/lib/seo';

export const metadata = { title: 'Beleggingspanden te koop per stad | Portfolio & Prime', description: 'Beleggingspanden in Amsterdam, Rotterdam, Utrecht, Den Haag en Eindhoven voor geverifieerde beleggers, met BAR, NAR en WOZ bij elk object.', alternates: { canonical: '/beleggingspanden' } };

export default async function SeoIndex() {
  const all: any[] = (await api('/listings')).data || [];
  return <><section className="page-heading seo-heading"><p className="eyebrow">INVESTMENT PROPERTY BY CITY</p><h1>Beleggingspanden<br /><em>per stad.</em></h1><p className="seo-intro">Exclusief aanbod uit onze eigen aankooppijplijn, met alle cijfers en documenten op één plek.</p></section>
    <section className="section"><div className="seo-grid">{Object.entries(SEO_CITIES).map(([k, c]) => { const here = all.filter(l => l.city === c.name); return <div key={k} className="panel"><p className="eyebrow">{c.province.toUpperCase()}</p><h2><Link href={`/beleggingspanden/${k}`}>Beleggingspanden {c.name} ↗</Link></h2><p className="muted-small">{here.length} {here.length === 1 ? 'object' : 'objecten'} nu</p><div className="row">{Object.entries(SEO_TYPES).filter(([, t]) => here.some(l => l.category === t.category)).map(([tk, t]) => <Link key={tk} className="chip-btn" href={`/beleggingspanden/${k}/${tk}`}>{t.nl}</Link>)}</div></div>; })}</div></section></>;
}
