import { createElement } from 'react';
import { headers } from 'next/headers';

/** Public base URL: SITE_URL, else Render's external URL, else the request host. */
export async function siteUrl() {
  const env = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL; if (env) return env.replace(/\/$/, '');
  const h = await headers(); const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  return `${h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}
/** Search engines may index the site only when PP_INDEX=1 (off for the demo). */
export const indexable = () => process.env.PP_INDEX === '1';

/** SEO landing pages per city and type (plan: "beleggingspanden Rotterdam", "kamerverhuurpand Utrecht"). */
export const SEO_CITIES: Record<string, { name: string; province: string; nl: string; en: string }> = {
  amsterdam: { name: 'Amsterdam', province: 'Noord-Holland', nl: 'Amsterdam combineert de laagste aanvangsrendementen van Nederland met de sterkste waardegroei. Beleggers kijken naar grachtenpanden, gesplitste complexen en erfpachtvoorwaarden.', en: 'Amsterdam pairs the lowest initial yields in the Netherlands with the strongest value growth. Investors focus on canal houses, split buildings and ground-lease terms.' },
  rotterdam: { name: 'Rotterdam', province: 'Zuid-Holland', nl: 'Rotterdam biedt hogere bruto aanvangsrendementen dan de andere grote steden, met veel vooroorlogse portefeuilles in Zuid en West en sterke huurvraag door de groei van de stad.', en: 'Rotterdam offers higher gross yields than the other big cities, with many pre-war portfolios in Zuid and West and strong rental demand from a growing city.' },
  utrecht: { name: 'Utrecht', province: 'Utrecht', nl: 'Utrecht heeft een structureel woningtekort, een jonge bevolking en een sterke studentenmarkt. Appartementencomplexen en kamerverhuurpanden verhuren hier snel.', en: 'Utrecht has a structural housing shortage, a young population and a strong student market. Apartment buildings and room-rental properties let quickly.' },
  'den-haag': { name: 'Den Haag', province: 'Zuid-Holland', nl: 'Den Haag trekt internationale huurders door overheid, ambassades en organisaties. Beleggers vinden hier gemengde complexen en monumentale panden.', en: 'Den Haag draws international tenants through government, embassies and institutions. Investors find mixed-use buildings and listed properties here.' },
  eindhoven: { name: 'Eindhoven', province: 'Noord-Brabant', nl: 'Eindhoven groeit met de Brainport-regio. Kennismigranten zorgen voor vraag naar middenhuur en vrije sector, met rendementen boven de Randstad.', en: 'Eindhoven grows with the Brainport region. Knowledge workers drive demand for mid-rent and free-sector homes, at yields above the Randstad.' },
  wassenaar: { name: 'Wassenaar', province: 'Zuid-Holland', nl: 'Wassenaar is een exclusieve woonmarkt tussen Den Haag en Leiden, met villa’s op grote kavels en een beperkt aanbod.', en: 'Wassenaar is an exclusive residential market between Den Haag and Leiden, with villas on large plots and limited supply.' },
};
export const SEO_TYPES: Record<string, { category: string; nl: string; en: string }> = {
  woningportefeuilles: { category: 'portfolios', nl: 'Woningportefeuilles', en: 'Residential portfolios' },
  appartementencomplexen: { category: 'buildings', nl: 'Appartementencomplexen', en: 'Apartment buildings' },
  woonhuizen: { category: 'homes', nl: 'Toplocatiewoningen', en: 'Prime homes' },
};
export const citySlug = (city: string) => Object.keys(SEO_CITIES).find(k => SEO_CITIES[k].name === city) || city.toLowerCase().replace(/\s+/g, '-');

/** schema.org RealEstateListing. The price is only included when the API returned it to this viewer (never for crawlers, who are visitors). */
export function listingJsonLd(l: any, base: string) {
  return {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: l.name, url: `${base}/listings/${l.slug}`, image: `${base}/img/${l.image}.jpg`,
    description: l.description, datePosted: l.publishedAt, inLanguage: 'nl-NL',
    contentLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: l.city, addressRegion: l.province || undefined, addressCountry: 'NL' } },
    about: { '@type': 'Accommodation', floorSize: { '@type': 'QuantitativeValue', value: l.areaM2, unitCode: 'MTK' } },
    ...(l.askingPrice ? { offers: { '@type': 'Offer', price: l.askingPrice, priceCurrency: 'EUR', availability: l.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability' } } : {}),
  };
}
export function JsonLd({ data }: { data: unknown }) {
  return createElement('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') } });
}
