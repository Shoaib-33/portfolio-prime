import './globals.css';
import './web.css';
import { headers } from 'next/headers';
import { getMe, getLang } from '@/lib/api';
import { Header, Footer } from '@/components/ui';

export const metadata = { title: 'Portfolio & Prime | Exclusive Dutch property deals for verified investors', description: 'Exclusive Dutch property deals for verified investors, with every number and document in one place.', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([getMe(), getLang()]);
  const page = (await headers()).get('x-pp-page') || '';
  return <html lang={lang}><body><a className="skip" href="#main">Skip to content</a><Header me={me} lang={lang} page={page} /><main id="main">{children}</main><Footer lang={lang} /></body></html>;
}
