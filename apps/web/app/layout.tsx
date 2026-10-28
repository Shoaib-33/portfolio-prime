import './globals.css';
import './web.css';
import './access.css';
import './buyers.css';
import { headers } from 'next/headers';
import { getMe, getLang } from '@/lib/api';
import { Header, Footer } from '@/components/ui';
import { indexable } from '@/lib/seo';

export const metadata = { title: 'Portfolio & Prime | Dutch residential property, offered privately', description: 'We buy Dutch residential and mixed-use property and portfolios, and offer them privately to invited investors: a personal selection, with every number and document in one place.', metadataBase: new URL(process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'), robots: indexable() ? { index: true, follow: true } : { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([getMe(), getLang()]);
  const page = (await headers()).get('x-pp-page') || '';
  return <html lang={lang}><body><a className="skip" href="#main">Skip to content</a><Header me={me} lang={lang} page={page} /><main id="main">{children}</main><Footer lang={lang} me={me} /></body></html>;
}
