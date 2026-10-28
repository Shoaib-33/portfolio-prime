import { Gate } from '@/components/gate';
export const metadata = { title: 'Sell to us | Portfolio & Prime', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <Gate feature="sell">{children}</Gate>; }
