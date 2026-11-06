/* Visitor homepage: frequently asked questions. Rates and thresholds come from the platform settings (/api/config/public),
   so the answers follow the configuration. Native <details> panels: keyboard friendly and they work without JavaScript.
   Also emits schema.org FAQPage data for search engines. Styles: app/faq.css. */
import { tr } from '@/lib/i18n';
import { Arrow } from './shell';
import { Split } from './split';

export function RegisterFaq({ cfg, stats, lang }: { cfg: any; stats: any; lang: string }) {
  const t = tr(lang); const nl = lang === 'nl';
  const pct = (v: number | undefined, d: number) => String(v ?? d).replace('.', nl ? ',' : '.');
  const eur = (v: number | undefined, d: number) => `€${((v ?? d) / 1e6).toLocaleString(nl ? 'nl-NL' : 'en-GB')}m`;
  const v = {
    fee: pct(cfg?.buyerFee, 0), res: pct(cfg?.transferTaxResidential, 8), own: pct(cfg?.transferTaxOwnHome, 2), com: pct(cfg?.transferTaxCommercial, 10.4),
    other: pct(cfg?.otherAcquisitionCosts, 1), sof: eur(cfg?.sourceOfFundsThreshold, 1e6), days: String(stats?.avgDaysToOffer ?? 23),
  };
  const groups: [string, [string, string][]][] = [
    ['Access', [
      ['Who can join Maasland & Partners?', 'Private investors, investment companies (BVs), family offices, funds and institutional investors buying Dutch residential property. Access is by invitation: request access, a partner calls you within one working day to understand your mandate, and you receive a personal invitation link.'],
      ['What does access cost?', 'Access is free. On our own stock you pay no buyer’s fee (currently {fee}%). An optional Investor Pro membership adds extra analysis tools.'],
      ['Which properties do you offer?', 'Dutch residential property: apartment buildings, residential portfolios, mixed-use buildings and prime homes, across the Netherlands. Tickets range from €1m to €250m and more.'],
    ]],
    ['Buying', [
      ['How does a purchase work?', 'Properties that fit your mandate are shared with you. You sign an NDA, review the data room, then make an offer or join a structured bid round. After agreement, the transfer takes place at a Dutch civil-law notary. On average an offer is accepted within {days} days.'],
      ['What is a bid round?', 'For larger portfolios we run a structured sale: indicative bids, a shortlist, then final binding bids. Every bidder receives the same information, and questions are answered anonymously for all.'],
      ['What costs do I pay on top of the price?', 'Dutch transfer tax: {res}% for residential investment property, {own}% for a home you will live in yourself, and {com}% for non-residential property. Allow about {other}% for notary, valuation and financing costs. Every property shows the full acquisition cost.'],
      ['Can I buy with financing?', 'Yes. Offers can be made subject to financing, inspection or board approval, and you can attach proof of funds to your offer.'],
      ['How do you handle rent regulation?', 'Each property shows its rent roll split into social, mid-rent and free-sector units under the Dutch points system (WWS), with the rent-regulation exposure included in the analysis.'],
    ]],
    ['Trust and privacy', [
      ['Which checks do you carry out?', 'As required by the Dutch Anti-Money Laundering Act (Wwft), we verify your identity, your company and its ultimate beneficial owners before a transaction. Above {sof} we also check the source of funds.'],
      ['Is my information confidential?', 'Yes. Login uses two-factor authentication, data-room documents are watermarked with your name, and we never share your details. Your data is stored in the EU.'],
    ]],
    ['Selling', [
      ['I want to sell a property or portfolio. How does that work?', 'We buy directly: a firm offer, certainty of funding and full discretion. Your asset is never advertised. Request access and choose “Sell a property”, and our acquisition team contacts you.'],
    ]],
  ];
  const fill = (s: string) => t(s, v);
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: groups.flatMap(([, qs]) => qs.map(([q, a]) => ({ '@type': 'Question', name: t(q), acceptedAnswer: { '@type': 'Answer', text: fill(a) } }))) };
  let n = 0;
  return <section className="rg-sec rg-faq" id="faq" data-sec aria-labelledby="rg-faq-t">
    <div className="rg-faq-side">
      <p className="rg-eyebrow" data-rv>{t('Questions')}</p>
      <h2 id="rg-faq-t" data-split><Split text={t('Frequently asked.')} /></h2>
      <p className="rg-sub" data-rv>{t('The short answers. A partner will happily go through the details with you.')}</p>
      <a className="rg-btn rg-btn-line" href="#request" data-rv>{t('Ask a partner')}<Arrow /></a>
    </div>
    <div className="rg-faq-list">{groups.map(([g, qs]) => <div key={g} className="rg-faq-group" data-rv>
      <p className="rg-faq-g">{t(g)}</p>
      {qs.map(([q, a]) => { const i = n++; return <details key={q} className="rg-faq-item" name="rg-faq" open={i === 0}>
        <summary><span className="rg-faq-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span className="rg-faq-q">{t(q)}</span><i aria-hidden="true" /></summary>
        <div className="rg-faq-a"><p>{fill(a)}</p></div>
      </details>; })}
    </div>)}</div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
  </section>;
}
