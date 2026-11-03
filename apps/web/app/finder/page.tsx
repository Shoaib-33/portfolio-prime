import { Finder } from '@/components/client';
import { CITIES } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { getLang } from '@/lib/api';
export const metadata = { title: 'Smart finder | Maasland & Partners', robots: { index: false, follow: false } };
export default async function FinderPage() {
  const t = tr(await getLang());
  return <><section className="page-heading"><p className="eyebrow">{t('SMART FINDER')}</p><h1>{t('What can your')}<br /><em>{t('capital')}</em> {t('buy?')}</h1><p>{t('Set your equity and financing. Available income properties are ranked on the server by whether you can reach them, their cash flow and their deal score.')}</p></section><Finder cities={CITIES} /></>;
}
