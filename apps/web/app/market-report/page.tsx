import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { money, moneyShort } from '@/lib/format';
import { JsonLd, siteUrl } from '@/lib/seo';

export const metadata = { title: 'Dutch residential investment market report Q3 2026 | Portfolio & Prime', description: 'Residential yields (BAR), prices per m², market rents and rent growth for Amsterdam, Utrecht, Rotterdam, Den Haag, Eindhoven and Haarlem, plus recent portfolio transactions, transfer tax and WWS thresholds.', alternates: { canonical: '/market-report' } };

export default async function MarketReport() {
  const [me, r] = await Promise.all([getMe(), api('/market/report')]); const d = r.data; const base = await siteUrl();
  if (!r.ok) return <section className="section empty"><h1>Report unavailable.</h1></section>;
  return <>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Dataset', name: `Dutch residential investment benchmarks ${d.asOf}`, description: metadata.description, url: `${base}/market-report`, creator: { '@type': 'Organization', name: 'Portfolio & Prime' }, spatialCoverage: 'Netherlands', variableMeasured: ['Gross initial yield (BAR)', 'Price per m²', 'Market rent per m²', 'Rent growth', 'Vacancy'], isAccessibleForFree: true }} />
    <section className="page-heading"><p className="eyebrow">MARKET REPORT · {d.asOf.toUpperCase()}</p><h1>Dutch residential,<br /><em>in numbers.</em></h1><p>Benchmarks for the six cities where institutional capital concentrates, recent portfolio transactions and the rules that move returns: transfer tax and the WWS points system. Members get the full quarterly PDF and alerts.</p></section>
    <section className="section">
      <div className="table-wrap" tabIndex={0}><table><thead><tr><th>City</th><th>BAR (gross initial yield)</th><th>Price per m²</th><th>Market rent per m² / month</th><th>Rent growth / year</th><th>Vacancy</th></tr></thead><tbody>{d.cities.map((c: any) => <tr key={c.city}><td><b>{c.city}</b></td><td>{c.bar}%</td><td>{money(c.perM2)}</td><td>€{c.rentM2}</td><td>{c.growth}%</td><td>{c.vacancy}%</td></tr>)}</tbody></table></div>
      <div className="two-panels"><div className="panel"><p className="eyebrow">TRANSFER TAX 2026</p><h2>{d.transferTax}%</h2><p>Residential property bought by investors. Own main residence 2%; commercial property 10.4%. Prices are k.k.: the buyer pays transfer tax and notary costs.</p></div>
        <div className="panel"><p className="eyebrow">RENT REGULATION · WET BETAALBARE HUUR</p><h2>{d.wws.social} / {d.wws.mid} points</h2><p>Up to {d.wws.social} WWS points is social rent, up to {d.wws.mid} points mid-rent with a maximum of about €{Math.round(d.wws.mid * d.wws.perPoint)} a month; above that is free-sector. Floor area, energy label and WOZ value drive the points.</p></div></div>
      <div className="section-heading" style={{ marginTop: 50 }}><div><p className="eyebrow">RECENT TRANSACTIONS</p><h2>Who bought what.</h2></div></div>
      <div className="table-wrap" tabIndex={0}><table><thead><tr><th>Transaction</th><th>City</th><th>Units</th><th>Price</th><th>BAR</th><th>Label</th><th>Date</th><th>Buyer type</th></tr></thead><tbody>{d.transactions.map((t: any) => <tr key={t.name}><td>{t.name}</td><td>{t.city}</td><td>{t.units.toLocaleString('en-GB')}</td><td>{moneyShort(t.price)}</td><td>{t.bar}%</td><td>{t.label}</td><td>{t.date}</td><td>{t.buyerType}</td></tr>)}</tbody></table></div>
      <p className="fine-print">Demo benchmarks and fictional transactions for this build; production uses a transaction-data feed. Live on the platform now: {d.platform.liveDeals} deals, {moneyShort(d.platform.liveVolume)} guide volume.</p>
      <div className="inline-cta"><div><h3>Get the full quarterly report.</h3><p>City deep-dives, regulation updates and the deal pipeline, by email every quarter.</p></div>{me.user ? <Link className="btn navy" href="/account#buybox">Set your buy box ↗</Link> : <Link className="btn navy" href="/login?next=/market-report">Join free ↗</Link>}</div></section>
  </>;
}
