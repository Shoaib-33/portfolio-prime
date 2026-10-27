import Link from 'next/link';
import { RequestAccessForm, Icon } from '@/components/access';
/* Self-registration is closed: accounts are created by an admin and activated through a personal invitation link. */
export default function Register() {
  return <section className="section request solo"><div className="req-copy"><span className="gate-icon"><Icon name="lock" /></span><p className="eyebrow">BY INVITATION</p><h1>Accounts are personal.</h1>
    <p>Portfolio &amp; Prime does not have open sign-up. Every investor receives a personal invitation with their own selection of properties after a short introduction.</p>
    <p>Already invited? Open the link in your invitation email, or <Link className="text-link" href="/login">log in</Link>.</p></div>
    <div className="req-card"><RequestAccessForm /></div></section>;
}
