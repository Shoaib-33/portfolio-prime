import { Gate } from '@/components/gate';
export default function Layout({ children }: { children: React.ReactNode }) { return <Gate feature="membership">{children}</Gate>; }
