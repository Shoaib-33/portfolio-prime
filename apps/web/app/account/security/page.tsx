import { redirect } from 'next/navigation';
import { getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { TwoFactorSetup } from '@/components/client';
export const metadata = { title: 'Security | Maasland & Partners', robots: { index: false, follow: false } };
export default async function Security({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const me = await getMe(); if (!me.user) redirect('/login?next=/account/security'); const { next } = await searchParams; const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined; const t = tr(await getLang());
  return <><section className="page-heading"><p className="eyebrow">{t('SECURITY')}</p><h1>{t('Two-factor login.')}</h1></section><section className="section">{me.user.twofaEnabled ? <div className="panel auth-card"><h2>{t('Two-factor login is on.')}</h2><p>{t('You will be asked for a code each time you log in.')}</p></div> : <TwoFactorSetup next={safe} />}</section></>;
}
