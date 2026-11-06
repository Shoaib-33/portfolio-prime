import './globals.css';
import './web.css';
import './access.css';
import './buyers.css';
import './polish.css';
import './motion.css';
import './theme-dark.css';
import './theme-dark-extra.css';
import './register.css';
import './showcase.css';
import './offering.css';
import './faq.css';
import './readability.css';
import './theme-brass.css';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import { Motion } from '@/components/motion';
import { headers } from 'next/headers';
import { getMe, getLang, getTheme } from '@/lib/api';
import { Header, Footer } from '@/components/ui';
import { LangProvider } from '@/components/lang';
import { indexable } from '@/lib/seo';

export const metadata = { title: 'Maasland & Partners | Dutch residential property, offered privately', description: 'We buy Dutch residential and mixed-use property and portfolios, and offer them privately to invited investors: a personal selection, with every number and document in one place.', metadataBase: new URL(process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'), robots: indexable() ? { index: true, follow: true } : { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const mpDisplay = Cormorant_Garamond({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--mp-display', display: 'swap' });
const mpSans = Jost({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--mp-sans', display: 'swap' });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang, theme] = await Promise.all([getMe(), getLang(), getTheme()]);
  const page = (await headers()).get('x-pp-page') || '';
  return <html lang={lang} data-theme={theme} suppressHydrationWarning><body className={`${mpDisplay.variable} ${mpSans.variable}`}><LangProvider lang={lang}><a className="skip" href="#main">{lang === 'nl' ? 'Naar de inhoud' : 'Skip to content'}</a><Header me={me} lang={lang} page={page} /><main id="main">{children}</main><Footer lang={lang} me={me} page={page} /><Motion /></LangProvider></body></html>;
}
