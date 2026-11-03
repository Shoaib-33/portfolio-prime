import Link from 'next/link';
import { api, getMe, getLang } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { Analyst } from '@/components/analyst';

export const metadata = { title: 'AI investment analyst for Dutch real estate | Maasland & Partners', description: 'Ask about Dutch residential yields, rent regulation (WWS), transfer tax, ESG and specific portfolios. Answers come from live platform data, with sources.', alternates: { canonical: '/analyst' } };

const CAN: [string, string][] = [['Market questions', 'City yields and prices, transfer tax, the WWS points system and how institutional sales run.'], ['Deal screening', '“Which portfolios fit a €300m mandate at 5% BAR?” ranks what your access level can see.'], ['Per-property analysis', 'Open a property and ask about risks, valuation, rent-regulation exposure or a rate scenario.'], ['Scenarios on demand', '“What if interest is 6% and the exit yield 5.5%?” runs the platform DCF, not a guess.']];

export default async function AnalystPage() {
  const [me, st] = await Promise.all([getMe(), api('/ai/status')]); const u = me.user; const t = tr(await getLang());
  return <>
    <section className="page-heading"><p className="eyebrow">{t('AI INVESTMENT ANALYST')}</p><h1>{t('Ask it what your')}<br /><em>{t('committee will ask.')}</em></h1><p>{t('An analyst for Dutch residential real estate that answers from live platform data: listings you can access, rent rolls after the NDA, market benchmarks and the config table. Every answer lists its sources. It analyses; it never tells you to buy.')}</p></section>
    <section className="section analyst-layout"><div>{u ? <Analyst mode={st.data?.mode} suggestions={['Which portfolio has the highest yield?', 'I want to deploy €500m. What fits?', 'Explain the WWS points system', 'What does it cost to buy as an investor?'].map(s => st.data?.mode === 'claude' ? t(s) : s)} /> : <div className="access-gate"><h2>{t('Join free to ask.')}</h2><p>{t('The analyst is free for members. Verified investors get unit-level answers after the property NDA.')}</p><Link className="btn navy" href="/login?next=/analyst">{t('Join free ↗')}</Link></div>}</div>
      <aside className="analyst-side">{CAN.map(([h, b]) => <div key={h}><b>{t(h)}</b><p>{t(b)}</p></div>)}<div><b>{t('How it stays reliable')}</b><p>{st.data?.mode === 'claude' ? t('Claude ({model}) reads only the data your access level allows and runs scenarios through the platform’s calculators.', { model: st.data.model }) : t('The built-in analyst engine answers from the same data and calculators. Connect Claude (ANTHROPIC_API_KEY) for free-form questions in any language.')}</p></div></aside></section>
  </>;
}
