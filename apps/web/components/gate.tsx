import Link from 'next/link';
import { headers } from 'next/headers';
import { getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { can } from '@/lib/access';
import { Icon } from './access';

const LABEL: Record<string, string> = { institutional: 'Private deal rooms', analyst: 'The AI analyst', finder: 'The smart finder', market: 'The market report', membership: 'Membership', sell: '“Sell to us”', messages: 'Messages' };
/** Interface gate for a section. The API enforces the same rules; this decides what to show instead of an error. */
export async function Gate({ feature, children }: { feature?: string; children: React.ReactNode }) {
  const me = await getMe(); const t = tr(await getLang()); const path = (await headers()).get('x-pp-path') || '/';
  if (!me.user) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">{t('PRIVATE OFFERING')}</p><h1>{t('This part is by invitation.')}</h1>
    <p>{t('Maasland & Partners shares properties personally. Investors receive an invitation with their own selection, after a short introduction.')}</p>
    <div className="row"><Link className="btn navy" href={`/login?next=${encodeURIComponent(path)}`}>{t('Log in')} ↗</Link><Link className="btn outline" href="/#request">{t('Request access')}</Link></div></div></section>;
  if (feature && !can(me, feature)) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">{t('NOT IN YOUR ACCESS YET')}</p><h1>{t('{feature} is not switched on for you.', { feature: t(LABEL[feature] || 'This feature') })}</h1>
    <p>{me.user.accountManager ? t('Your account manager, {name}, decides which tools are part of your access. Ask them and it can be switched on today.', { name: me.user.accountManager }) : t('Your account manager decides which tools are part of your access. Ask them and it can be switched on today.')}</p>
    <div className="row">{can(me, 'messages') && <Link className="btn navy" href="/account/messages?listing=general">{t('Message your account manager')} ↗</Link>}<Link className="btn outline" href="/">{t('Back to my selection')}</Link></div></div></section>;
  return <>{children}</>;
}
