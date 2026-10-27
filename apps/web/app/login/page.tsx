import { LoginForm } from '@/components/client';
const DEMO: [string, string][] = [['free@demo.nl', 'Free member'], ['verified@demo.nl', 'Verified investor'], ['pro@demo.nl', 'Investor Pro'], ['fund@demo.nl', 'Institutional · pension fund'],['admin@demo.nl', 'Staff · admin'], ['compliance@demo.nl', 'Staff · compliance'], ['sales@demo.nl', 'Staff · sales'], ['acquisition@demo.nl', 'Staff · acquisition']];
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams; const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined;
  return <><section className="page-heading"><p className="eyebrow">LOG IN</p><h1>Welcome back.</h1><p>Investors and staff use the same login. Staff and data-room access always need two-factor login.</p></section><section className="section"><LoginForm next={safeNext} demo={DEMO} /></section></>;
}
