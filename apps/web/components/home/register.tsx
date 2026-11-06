/* Visitor homepage: private real estate, dark and cinematic.
   Charcoal, warm off-white and one coral accent; Cormorant Garamond display, Jost text.
   Server-rendered; interactive parts live in register-client.tsx. Styles: app/register.css (scoped to .reg). */
import type { ReactElement } from 'react';
import { RequestAccessForm } from '@/components/access';
import { tr } from '@/lib/i18n';
import { DEAL } from '@/lib/format';
import { RgCount, RgRecord, RgHero } from './register-client';
import { RegisterShell, Arrow } from './shell';

const PILLARS: [string, string, string][] = [['Acquire', 'Our acquisition team buys residential portfolios, apartment buildings and mixed-use assets directly from owners, funds and developers.', '/img/p1.jpg'], ['Curate', 'Each investor receives a selection that fits their mandate: region, size, yield and risk. Nothing is published on the open market.', '/img/r2.jpg'], ['Close||deal', 'NDA, data room, offers or a structured bid process, through to the notary. One account manager from first look to transfer.', '/img/p2.jpg']];
const STEPS: [string, string][] = [['Request access', 'Tell us what you invest in. Takes one minute.'], ['Introduction', 'A partner calls to understand your mandate; KYC follows for transactions.'], ['Your invitation', 'A personal link with the properties selected for you and the tools you need.'], ['Review and bid', 'Underwrite, open the data room, make an offer or join a structured sale.']];
const TOOLS: [string, string][] = [['Private deal rooms', 'Codename teasers, staged sale processes and anonymised Q&A for portfolio sales.'], ['AI analyst', 'Questions answered from the data of each property, with sources and scenarios.'], ['Valuation & stress tests', 'Comparables, 10-year DCF, rent-regulation exposure and ESG per asset.'], ['Secure data room', 'NDA, two-factor login and documents watermarked with your name.'], ['Smart finder', 'What your equity and financing can buy, ranked by deal score.'], ['Market intelligence', 'Yields, prices and transactions per city, updated quarterly.']];
/* 24px line icons for the platform tools. */
const ICONS: ReactElement[] = [
  <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
  <><path d="M4 5h11v8H8l-4 3z" /><path d="M9 16v1h7l4 3V11h-3" /></>,
  <><path d="M4 20V4M4 20h16" /><path d="M7 15l4-4 3 3 5-6" /></>,
  <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
];
/* Colour photography for closed deals (reference imagery in the demo). */
const SHOTS = ['/img/p2.jpg', '/img/p1.jpg', '/img/r3.jpg', '/img/p4.jpg', '/img/p3.jpg', '/img/r1.jpg'];
const CITIES = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Den Haag', 'Haarlem', 'Zwolle', 'Delft', 'Amersfoort', 'Groningen', 'Eindhoven'];

export async function RegisterHome({ stats, sold, lang, demo }: { stats: any; sold: any[]; lang: string; demo: boolean }) {
  const t = tr(lang); const s = stats || {};
  const figures: [string, string][] = [[String(s.dealsClosed ?? '—'), 'deals closed'], [s.volumeM ? `€${s.volumeM}m` : '—', 'transaction volume'], [s.verifiedInvestors?.toLocaleString(lang === 'nl' ? 'nl-NL' : 'en-GB') ?? '—', 'investors in our network'], [String(s.avgDaysToOffer ?? '—'), 'average days to an accepted offer']];
  const deals = sold.map((x, i) => ({ city: x.city, type: t(x.propertyType), units: x.units, band: t(x.priceBand), deal: x.dealType, dealLabel: t(DEAL[x.dealType] || x.dealType), days: x.daysToOffer || 0, img: SHOTS[i % SHOTS.length] }));
  const dealTypes = [...new Set(sold.map(x => x.dealType))].map(d => [d, t(DEAL[d] || d)] as [string, string]);
  return <RegisterShell lang={lang} demo={demo} home>
    {/* ---------- Hero: full-screen slides (brand first, then placed deals) ---------- */}
    <RgHero slides={[
      { img: '/img/hero.jpg', eyebrow: t('Private offering · By invitation'), title: `${t('Dutch residential property,')} ${t('offered privately.')}`, meta: [t('Amsterdam'), t('Apartment buildings'), t('Portfolios'), t('Mixed-use')] },
      ...deals.slice(0, 4).map(d => ({ img: d.img, eyebrow: d.city, title: t('{type}, placed in {n} days.', { type: d.type, n: d.days }), meta: [d.city, d.band, `${d.units} ${t('units')}`, d.dealLabel] })),
    ]} labels={{ cta: t('Request access'), invite: t('I have an invitation'), tagline: t('Placed privately with our investors'), side: t('Private · Residential · By invitation'), prev: t('Previous'), next: t('Next'), region: t('Featured') }} />

    <section className="rg-kpis" aria-label={t('Track record in numbers')}>{figures.map(([v, l]) => <div key={l} data-rv><b><RgCount value={v} /></b><span>{t(l)}</span></div>)}</section>

    <section className="rg-cities" aria-label={t('Active in')}><span className="rg-eyebrow">{t('Active in')}</span><ul>{CITIES.map(c => <li key={c}>{c}</li>)}</ul></section>

    {/* ---------- What we do ---------- */}
    <section className="rg-sec" id="approach" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('What we do')}</p><h2 data-rv>{t('Three disciplines, one point of contact.')}</h2></div><p className="rg-sub" data-rv>{t('From acquisition to transfer, every step is handled in-house by one team.')}</p></header>
      <div className="rg-pillars">{PILLARS.map(([h, p, img], i) => <article key={h} className="rg-card rg-pillar" data-rv>
        <div className="rg-media"><img src={img} alt="" loading="lazy" /></div>
        <div className="rg-card-body"><span className="rg-num">0{i + 1}</span><h3>{t(h)}</h3><p>{t(p)}</p></div>
      </article>)}</div>
    </section>

    {/* ---------- How access works ---------- */}
    <section className="rg-sec rg-dark" id="access" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('How access works')}</p><h2 data-rv>{t('From introduction to your own selection.')}</h2></div><a className="rg-btn rg-btn-accent" href="#request" data-rv>{t('Request access')}<Arrow /></a></header>
      <ol className="rg-steps" data-rv>{STEPS.map(([h, p], i) => <li key={h} style={{ ['--i' as any]: i }}><span className="rg-step-dot">{i + 1}</span><p className="rg-step-k">{t('Step {n}', { n: i + 1 })}</p><h3>{t(h)}</h3><p>{t(p)}</p></li>)}</ol>
    </section>

    {/* ---------- Platform ---------- */}
    <section className="rg-sec" id="platform" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('INSIDE THE PLATFORM')}</p><h2 data-rv>{t('Tools for serious capital.')}</h2></div><p className="rg-sub" data-rv>{t('Switched on per investor, so every member sees what they need.')}</p></header>
      <ul className="rg-tools">{TOOLS.map(([h, p], i) => <li key={h} className="rg-card rg-tool" data-rv><span className="rg-ico"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[i]}</svg></span><h3>{t(h)}</h3><p>{t(p)}</p></li>)}</ul>
    </section>

    {/* ---------- Track record ---------- */}
    <section className="rg-sec rg-tint" id="record" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('TRACK RECORD')}</p><h2 data-rv>{t('Recently closed.')}</h2></div><p className="rg-sub" data-rv>{t('Anonymised: city, type and price band only.')}</p></header>
      <RgRecord deals={deals} types={dealTypes} labels={{ all: t('All'), units: t('units'), city: t('City'), type: t('Type'), unitsH: t('Units'), band: t('Price band'), deal: t('Deal'), days: t('Days to offer'), filter: t('Filter by deal type'), daysShort: t('days to offer') }} />
    </section>

    {/* ---------- Sellers ---------- */}
    <section className="rg-sell" aria-labelledby="rg-sell-t">
      <div className="rg-sell-media" aria-hidden="true"><img src="/img/r1.jpg" alt="" loading="lazy" /></div>
      <div className="rg-sell-body" data-rv>
        <p className="rg-eyebrow">{t('OWNERS AND FUNDS')}</p>
        <h2 id="rg-sell-t">{t('Selling a portfolio?')}</h2>
        <p>{t('We buy directly: a firm offer, certainty of funding and full discretion. Your asset is never advertised.')}</p>
        <ul className="rg-checks">{['Firm offer, own funding', 'Never advertised', 'One partner from first call to notary'].map(x => <li key={x}>{t(x)}</li>)}</ul>
        <a className="rg-btn rg-btn-accent" href="#request">{t('Talk to our acquisition team')}<Arrow /></a>
      </div>
    </section>

    {/* ---------- Request access ---------- */}
    <section className="rg-sec rg-request" id="request" data-sec>
      <div className="rg-req-copy"><p className="rg-eyebrow" data-rv>{t('REQUEST ACCESS')}</p><h2 data-rv>{t('Start with a conversation.')}</h2><p className="rg-sub" data-rv>{t('Tell us briefly what you invest in or want to sell. A partner replies within one working day. Access is personal; we never share your details.')}</p>
        <ul className="rg-checks" data-rv>{['No cost, no obligation', 'Tickets from €1m to €250m+', 'English, Dutch and German'].map(x => <li key={x}>{t(x)}</li>)}</ul></div>
      <div className="rg-form" data-rv><RequestAccessForm /></div>
    </section>
  </RegisterShell>;
}
