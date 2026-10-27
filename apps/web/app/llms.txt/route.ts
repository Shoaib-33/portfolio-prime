import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** llms.txt: a plain-text map of the site for AI search engines and assistants (answer-engine optimisation). */
export async function GET() {
  const b = await siteUrl();
  const body = `# Portfolio & Prime

> Private, invitation-only platform for Dutch residential property. Portfolio & Prime buys apartment buildings, mixed-use assets and portfolios and offers them to invited professional and institutional investors: each investor sees a personal selection, with private deal rooms for portfolios from EUR 25m and an AI investment analyst. Investors and sellers can request access on the home page.

## Key pages
- [About and request access](${b}/): what we do, how access works, track record
- [Invest in Dutch residential real estate (guide, EN)](${b}/invest-in-dutch-real-estate): yields, WWS rent regulation, 8% transfer tax (2026), institutional sale process
- [Immobilien-Investment Niederlande (Leitfaden, DE)](${b}/de/immobilien-investment-niederlande)

## Facts
- Transfer tax for investors buying Dutch residential property: 8% (2026); commercial 10.4%; own main residence 2%.
- Rent regulation: WWS points system; social rent up to 143 points, mid-rent up to 186 points (Wet betaalbare huur, 2024).
- Buyers are verified under the Wwft (KYB, UBO, source of funds) before accessing deal rooms.
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
