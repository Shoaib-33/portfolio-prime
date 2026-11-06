/* Visitor homepage: private real estate, dark and cinematic.
   Charcoal, warm off-white and one coral accent; Cormorant Garamond display, Jost text.
   Server-rendered; interactive parts live in register-client.tsx. Styles: app/register.css (scoped to .reg). */
import type { ReactElement } from 'react';
import { RequestAccessForm } from '@/components/access';
import { tr } from '@/lib/i18n';
import { DEAL, pic, picBlur } from '@/lib/format';
import { RgCount, RgRecord, RgHero } from './register-client';
import { RegisterShell, Arrow } from './shell';
import { RgMandate } from './offering';
import { RgDealMap } from './dealmap';
import { RegisterFaq } from './faq';
import { Split } from './split';

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

type Teaser = { codename: string; city: string; province: string | null; propertyType: string; category: string; units: number; priceBand: string; yieldBand: string | null; dealType: string; status: string; isNew: boolean };
const PROVINCE_NL: Record<string, string> = {};
export async function RegisterHome({ stats, sold, teasers, cfg, lang, demo }: { stats: any; sold: any[]; teasers: { items: Teaser[]; total: number }; cfg: any; lang: string; demo: boolean }) {
  const t = tr(lang); const s = stats || {};
  const figures: [string, string][] = [[String(s.dealsClosed ?? '—'), 'deals closed'], [s.volumeM ? `€${s.volumeM}m` : '—', 'transaction volume'], [s.verifiedInvestors?.toLocaleString(lang === 'nl' ? 'nl-NL' : 'en-GB') ?? '—', 'investors in our network'], [String(s.avgDaysToOffer ?? '—'), 'average days to an accepted offer']];
  const deals = sold.map((x, i) => ({ city: x.city, type: t(x.propertyType), units: x.units, band: t(x.priceBand), deal: x.dealType, dealLabel: t(DEAL[x.dealType] || x.dealType), days: x.daysToOffer || 0, img: SHOTS[i % SHOTS.length] , lat: x.lat, lng: x.lng}));
  const dealTypes = [...new Set(sold.map(x => x.dealType))].map(d => [d, t(DEAL[d] || d)] as [string, string]);
  return <RegisterShell lang={lang} demo={demo} home>
    {/* ---------- Hero: full-screen slides (brand first, then placed deals) ---------- */}
    <RgHero slides={[
      { img: '/img/hero.jpg', eyebrow: t('Private offering · By invitation'), title: `${t('Dutch residential property,')} ${t('offered privately.')}`, meta: [t('Amsterdam'), t('Apartment buildings'), t('Portfolios'), t('Mixed-use')] },
      ...deals.slice(0, 4).map(d => ({ img: d.img, eyebrow: d.city, title: t('{type}, placed in {n} days.', { type: d.type, n: d.days }), meta: [d.city, d.band, `${d.units} ${t('units')}`, d.dealLabel] })),
    ]} labels={{ cta: t('Request access'), invite: t('I have an invitation'), tagline: t('Placed privately with our investors'), side: t('Private · Residential · By invitation'), prev: t('Previous'), next: t('Next'), region: t('Featured') }} />

    {/* ---------- Showcase: headline with figures either side, glow, and tilted previews of the platform ---------- */}
    <section className="rg-show" aria-labelledby="rg-show-t">
      <div className="rg-show-glow" aria-hidden="true"><i /></div>
      <div className="rg-show-top">
        <ul className="rg-show-stats rg-show-l" aria-label={t('Track record in numbers')}>{figures.slice(0, 2).map(([v, l]) => <li key={l} data-rv><b><RgCount value={v} /></b><span>{t(l)}</span></li>)}</ul>
        <div className="rg-show-c">
          <p className="rg-eyebrow" data-rv>{t('Inside the platform')}</p>
          <h2 id="rg-show-t" data-split><span><Split text={t('Every number.')} /></span> <em><Split text={t('One private room.')} /></em></h2>
          <p className="rg-show-lead" data-rv>{t('Rent roll, valuation, data room and bidding for each property in your personal selection, from first look to the notary.')}</p>
          <div className="rg-show-ctas" data-rv><a className="rg-btn rg-btn-accent" href="#request">{t('Request access')}<Arrow /></a><a className="rg-btn rg-btn-line" href="#access">{t('How access works')}</a></div>
        </div>
        <ul className="rg-show-stats rg-show-r">{figures.slice(2).map(([v, l]) => <li key={l} data-rv><b><RgCount value={v} /></b><span>{t(l)}</span></li>)}</ul>
      </div>

      <div className="rg-show-cards" aria-label={t('Example views of the platform')}>
        {/* Your selection */}
        <figure className="rg-pv rg-pv-l" data-rv data-depth="0.06">
          <figcaption className="rg-pv-h"><span><i />{t('Your selection')}</span><small>{t('Example')}</small></figcaption>
          <ul className="rg-pv-rows">{([['AMS', 'Project Linde · Amsterdam', 'Available', 'ok'], ['ROT', 'Kralingen apartments · Rotterdam', 'Under offer', 'acc'], ['UTR', 'Oost portfolio · Utrecht', 'NDA signed', 'line'], ['HAA', 'Kleverpark · Haarlem', 'Sold', 'mute']] as const).map(([c, n, s, k], i) =>
            <li key={c} style={{ ['--i' as any]: i }}><span className="rg-pv-av">{c}</span><span className="rg-pv-n">{n}</span><span className={`rg-pv-pill is-${k}`}>{t(s)}</span></li>)}</ul>
        </figure>
        {/* Deal score */}
        <figure className="rg-pv rg-pv-c" data-rv data-depth="-0.04">
          <figcaption className="rg-pv-h"><span><i />{t('Deal score')}</span><small>{t('Example')}</small></figcaption>
          <div className="rg-pv-score"><b>84</b><span>/ 100 · {t('Strong')}</span><em className="rg-pv-pill is-acc">{t('Yield 6.0%')}</em></div>
          <p className="rg-pv-cap"><span>{t('Gross rental income, 2021–2026')}</span><b>+38%</b></p>
          <svg className="rg-pv-chart" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="rg-pv-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
            <path className="rg-pv-area" d="M0 92 L30 84 L60 88 L90 70 L120 74 L150 56 L180 60 L210 42 L240 46 L270 26 L300 18 L300 110 L0 110 Z" fill="url(#rg-pv-fill)" />
            <path className="rg-pv-line" d="M0 92 L30 84 L60 88 L90 70 L120 74 L150 56 L180 60 L210 42 L240 46 L270 26 L300 18" />
          </svg>
          <div className="rg-pv-axis" aria-hidden="true">{['2021', '2022', '2023', '2024', '2025', '2026'].map(y => <span key={y}>{y}</span>)}</div>
        </figure>
        {/* Sale timeline */}
        <figure className="rg-pv rg-pv-r" data-rv data-depth="0.06">
          <figcaption className="rg-pv-h"><span><i />{t('Sale timeline')}</span><small>{t('Example')}</small></figcaption>
          <div className="rg-pv-gantt">
            <div className="rg-pv-weeks" aria-hidden="true">{['W1', 'W2', 'W3', 'W4', 'W5'].map(w => <span key={w}>{w}</span>)}</div>
            {([['NDA', 0, 14, 0], ['Data room', 10, 36, 0], ['Indicative bids', 34, 22, 1], ['Final bids', 58, 22, 0], ['Notary', 82, 18, 0]] as const).map(([l, x, w, on], i) =>
              <div key={l} className="rg-pv-track" style={{ ['--i' as any]: i }}><span>{t(l)}</span><i className={on ? 'on' : ''} style={{ left: `${x}%`, width: `${w}%` }} /></div>)}
            <b className="rg-pv-now" style={{ left: '46%' }} aria-hidden="true" />
          </div>
        </figure>
      </div>
    </section>

    <section className="rg-cities" aria-label={t('Active in')}><span className="rg-eyebrow">{t('Active in')}</span><ul>{CITIES.map(c => <li key={c}>{c}</li>)}</ul></section>

    {/* ---------- In the offering now: locked teasers (anonymised) and a mandate check ---------- */}
    <section className="rg-sec rg-offer" id="offering" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('In the offering now')}</p><h2 data-split><Split text={t('Private, and available today.')} /></h2></div><p className="rg-sub" data-rv>{t('A glimpse of what members see. Names, addresses and figures open once your access is approved.')}</p></header>
      <RgMandate labels={{ title: t('Check your mandate'), region: t('Region'), ticket: t('Ticket size'), type: t('Property type'), anyRegion: t('All of the Netherlands'), anyTicket: t('Any size'), anyType: t('Any type'),
        one: t('property in the private offering fits your mandate right now.'), many: t('properties in the private offering fit your mandate right now.'), none: t('No live match today. Tell us your mandate and we will alert you first.'), loading: t('Checking the offering…'),
        cta: t('Request access to these'), ctaNone: t('Share my mandate'), note: t('Mandate') }}
        tickets={[['lt2', t('Up to €2m')], ['2-10', '€2–10m'], ['10-50', '€10–50m'], ['50plus', '€50m+']]}
        types={[['buildings', t('Apartment buildings')], ['portfolios', t('Residential portfolios')], ['homes', t('Prime homes')]]} regionLabel={PROVINCE_NL} />
      {teasers.items.length > 0 && <ul className="rg-teasers">{teasers.items.map((x, i) => <li key={x.codename + i} className="rg-teaser" data-rv>
        <div className="rg-teaser-img" aria-hidden="true"><img src={picBlur(SHOTS[(i + 2) % SHOTS.length])} alt="" loading="lazy" /><span className="rg-teaser-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></span>
          <span className="rg-tag">{x.status === 'under_offer' ? t('Under offer') : x.isNew ? t('New') : t(DEAL[x.dealType] || x.dealType)}</span></div>
        <div className="rg-teaser-body">
          <p className="rg-teaser-meta">{x.city}{x.province ? ` · ${x.province}` : ''}</p>
          <h3>{x.codename}</h3>
          <p>{t(x.propertyType)} · {x.units} {x.units === 1 ? t('unit') : t('units')}</p>
          <dl><div><dt>{t('Price band')}</dt><dd>{t(x.priceBand)}</dd></div><div><dt>{t('Gross yield')}</dt><dd>{x.yieldBand || '—'}</dd></div></dl>
          <a className="rg-teaser-cta" href="#request">{t('Request access to view')}<Arrow /></a>
        </div>
      </li>)}</ul>}
      {teasers.total > teasers.items.length && <p className="rg-teasers-more" data-rv>{t('+{n} more properties in the private offering', { n: teasers.total - teasers.items.length })}</p>}
    </section>

    {/* ---------- What we do ---------- */}
    <section className="rg-sec" id="approach" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('What we do')}</p><h2 data-split><Split text={t('Three disciplines, one point of contact.')} /></h2></div><p className="rg-sub" data-rv>{t('From acquisition to transfer, every step is handled in-house by one team.')}</p></header>
      <div className="rg-pillars">{PILLARS.map(([h, p, img], i) => <article key={h} className="rg-card rg-pillar" data-rv>
        <div className="rg-media" data-reveal><img {...pic(img)} alt="" loading="lazy" /></div>
        <div className="rg-card-body"><span className="rg-num">0{i + 1}</span><h3>{t(h)}</h3><p>{t(p)}</p></div>
      </article>)}</div>
    </section>

    {/* ---------- How access works ---------- */}
    <section className="rg-sec rg-dark" id="access" data-sec>
      <div className="rg-pin">
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('How access works')}</p><h2 data-split><Split text={t('From introduction to your own selection.')} /></h2></div><a className="rg-btn rg-btn-accent" href="#request" data-rv>{t('Request access')}<Arrow /></a></header>
      <ol className="rg-steps" data-steps>{STEPS.map(([h, p], i) => <li key={h} style={{ ['--i' as any]: i }}><span className="rg-step-dot">{i + 1}</span><p className="rg-step-k">{t('Step {n}', { n: i + 1 })}</p><h3>{t(h)}</h3><p>{t(p)}</p></li>)}</ol>
      </div>
    </section>

    {/* ---------- Platform ---------- */}
    <section className="rg-sec" id="platform" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('INSIDE THE PLATFORM')}</p><h2 data-split><Split text={t('Tools for serious capital.')} /></h2></div><p className="rg-sub" data-rv>{t('Switched on per investor, so every member sees what they need.')}</p></header>
      <ul className="rg-tools">{TOOLS.map(([h, p], i) => <li key={h} className="rg-card rg-tool" data-rv><span className="rg-ico"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[i]}</svg></span><h3>{t(h)}</h3><p>{t(p)}</p></li>)}</ul>
    </section>

    {/* ---------- Track record ---------- */}
    <section className="rg-sec rg-tint" id="record" data-sec>
      <header className="rg-head rg-head-split"><div><p className="rg-eyebrow" data-rv>{t('TRACK RECORD')}</p><h2 data-split><Split text={t('Recently closed.')} /></h2></div><p className="rg-sub" data-rv>{t('Anonymised: city, type and price band only.')}</p></header>
      <RgDealMap deals={deals} labels={{ aria: t('Map of recently closed deals in the Netherlands'), note: t('City level only. Column height shows the units sold; hover a column or a city for the deals.'), deal: t('deal'), deals: t('deals'), unit: t('unit'), units: t('units'), where: t('Where we closed'), cities: t('cities'), days: t('days to offer') }} />
      <RgRecord deals={deals} types={dealTypes} labels={{ all: t('All'), units: t('units'), city: t('City'), type: t('Type'), unitsH: t('Units'), band: t('Price band'), deal: t('Deal'), days: t('Days to offer'), filter: t('Filter by deal type'), daysShort: t('days to offer') }} />
    </section>

    {/* ---------- Sellers ---------- */}
    <section className="rg-sell" aria-labelledby="rg-sell-t">
      <div className="rg-sell-media" aria-hidden="true" data-reveal><img {...pic('/img/r1.jpg', '(max-width: 900px) 100vw, 55vw')} alt="" loading="lazy" /></div>
      <div className="rg-sell-body" data-rv>
        <p className="rg-eyebrow">{t('OWNERS AND FUNDS')}</p>
        <h2 id="rg-sell-t" data-split><Split text={t('Selling a portfolio?')} /></h2>
        <p>{t('We buy directly: a firm offer, certainty of funding and full discretion. Your asset is never advertised.')}</p>
        <ul className="rg-checks">{['Firm offer, own funding', 'Never advertised', 'One partner from first call to notary'].map(x => <li key={x}>{t(x)}</li>)}</ul>
        <a className="rg-btn rg-btn-accent" href="#request">{t('Talk to our acquisition team')}<Arrow /></a>
      </div>
    </section>

    <RegisterFaq cfg={cfg} stats={s} lang={lang} />

    {/* ---------- Request access ---------- */}
    <section className="rg-sec rg-request" id="request" data-sec>
      <div className="rg-req-copy"><p className="rg-eyebrow" data-rv>{t('REQUEST ACCESS')}</p><h2 data-split><Split text={t('Start with a conversation.')} /></h2><p className="rg-sub" data-rv>{t('Tell us briefly what you invest in or want to sell. A partner replies within one working day. Access is personal; we never share your details.')}</p>
        <ul className="rg-checks" data-rv>{['No cost, no obligation', 'Tickets from €1m to €250m+', 'English, Dutch and German'].map(x => <li key={x}>{t(x)}</li>)}</ul></div>
      <div className="rg-form" data-rv><RequestAccessForm /></div>
    </section>
  </RegisterShell>;
}
