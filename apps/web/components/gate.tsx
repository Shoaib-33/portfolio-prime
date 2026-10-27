import Link from 'next/link';
import { headers } from 'next/headers';
import { getMe } from '@/lib/api';
import { can } from '@/lib/access';
import { Icon } from './access';

const LABEL: Record<string, string> = { institutional: 'Private deal rooms', analyst: 'The AI analyst', finder: 'The smart finder', market: 'The market report', membership: 'Membership', sell: '“Sell to us”', messages: 'Messages' };
/** Interface gate for a section. The API enforces the same rules; this decides what to show instead of an error. */
export async function Gate({ feature, children }: { feature?: string; children: React.ReactNode }) {
  const me = await getMe(); const path = (await headers()).get('x-pp-path') || '/';
  if (!me.user) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">PRIVATE OFFERING</p><h1>This part is by invitation.</h1>
    <p>Portfolio &amp; Prime shares properties personally. Investors receive an invitation with their own selection, after a short introduction.</p>
    <div className="row"><Link className="btn navy" href={`/login?next=${encodeURIComponent(path)}`}>Log in ↗</Link><Link className="btn outline" href="/#request">Request access</Link></div></div></section>;
  if (feature && !can(me, feature)) return <section className="gate-screen"><div className="gate-card"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">NOT IN YOUR ACCESS YET</p><h1>{LABEL[feature] || 'This feature'} is not switched on for you.</h1>
    <p>Your account manager{me.user.accountManager ? `, ${me.user.accountManager},` : ''} decides which tools are part of your access. Ask them and it can be switched on today.</p>
    <div className="row">{can(me, 'messages') && <Link className="btn navy" href="/account/messages?listing=general">Message your account manager ↗</Link>}<Link className="btn outline" href="/">Back to my selection</Link></div></div></section>;
  return <>{children}</>;
}
