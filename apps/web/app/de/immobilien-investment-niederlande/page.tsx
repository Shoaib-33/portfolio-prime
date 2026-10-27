import { Guide, GUIDES, GUIDE_ALTERNATES } from '@/components/guide';

export const metadata = { title: 'Immobilien-Investment Niederlande: Wohnportfolios (Leitfaden 2026) | Portfolio & Prime', description: 'Renditen, Mietregulierung (WWS), 8% Grunderwerbsteuer und der Ablauf institutioneller Portfoliotransaktionen in den Niederlanden, mit privaten Deal Rooms ab 25 Mio. €.', alternates: { ...GUIDE_ALTERNATES, canonical: '/de/immobilien-investment-niederlande' } };
export default function Page() { return <Guide g={GUIDES.de} />; }
