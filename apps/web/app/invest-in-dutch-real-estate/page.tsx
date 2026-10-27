import { Guide, GUIDES, GUIDE_ALTERNATES } from '@/components/guide';

export const metadata = { title: 'Invest in Dutch residential real estate (2026 guide) | Portfolio & Prime', description: 'Yields, rent regulation (WWS), 8% transfer tax and how institutional portfolio sales run in the Netherlands, with live private deal rooms from €25m.', alternates: { ...GUIDE_ALTERNATES, canonical: '/invest-in-dutch-real-estate' } };
export default function Page() { return <Guide g={GUIDES.en} />; }
