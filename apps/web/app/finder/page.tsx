import { Finder } from '@/components/client';
import { CITIES } from '@/lib/format';
export const metadata = { title: 'Smart finder | Portfolio & Prime', robots: { index: false, follow: false } };
export default function FinderPage() {
  return <><section className="page-heading"><p className="eyebrow">SMART FINDER</p><h1>What can your<br /><em>capital</em> buy?</h1><p>Set your equity and financing. Available income properties are ranked on the server by whether you can reach them, their cash flow and their deal score.</p></section><Finder cities={CITIES} /></>;
}
