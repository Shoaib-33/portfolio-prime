import { Gate } from '@/components/gate';
export const metadata = { title: 'Sell to us | Maasland & Partners', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <Gate feature="sell">{children}</Gate>; }
