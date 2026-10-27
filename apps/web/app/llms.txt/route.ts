import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** llms.txt: a plain-text map of the site for AI search engines and assistants (answer-engine optimisation). */
export async function GET() {
  const b = await siteUrl();
  const body = `# Portfolio & Prime

> Dutch residential investment platform for professional and institutional investors: own-stock properties, private deal rooms for portfolios from EUR 25m, structured two-round sale processes, and an AI investment analyst.

## Key pages
- [Invest in Dutch residential real estate (guide, EN)](${b}/invest-in-dutch-real-estate): yields, WWS rent regulation, 8% transfer tax (2026), institutional sale process
- [Immobilien-Investment Niederlande (Leitfaden, DE)](${b}/de/immobilien-investment-niederlande)
- [Beleggingspanden per stad (NL)](${b}/beleggingspanden): investment property by city
- [Market report](${b}/market-report): BAR, price per m2, market rent and rent growth by city; recent portfolio transactions
- [Private deal rooms](${b}/institutional): live institutional processes (codename teasers)
- [Properties](${b}/listings): current offering
- [AI investment analyst](${b}/analyst)

## Facts
- Transfer tax for investors buying Dutch residential property: 8% (2026); commercial 10.4%; own main residence 2%.
- Rent regulation: WWS points system; social rent up to 143 points, mid-rent up to 186 points (Wet betaalbare huur, 2024).
- Buyers are verified under the Wwft (KYB, UBO, source of funds) before accessing deal rooms.
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
