import type { Me } from './api';
/* What a signed-in person may see. The API enforces the same rules; this only decides what the interface shows. */
export type Feature = { key: string; label: string; href: string; icon: string; blurb: string };
export const NAV_FEATURES: Feature[] = [
  { key: 'institutional', label: 'Institutional', href: '/institutional', icon: 'vault', blurb: 'Private deal rooms with a structured sale process.' },
  { key: 'analyst', label: 'AI analyst', href: '/analyst', icon: 'spark', blurb: 'Ask questions about your properties; answers cite the data.' },
  { key: 'finder', label: 'Smart finder', href: '/finder', icon: 'target', blurb: 'Match your equity and financing to your selection.' },
  { key: 'market', label: 'Market report', href: '/market-report', icon: 'chart', blurb: 'Yields, prices and transactions per city.' },
  { key: 'membership', label: 'Membership', href: '/membership', icon: 'star', blurb: 'Investor Pro and the off-market first look.' },
  { key: 'sell', label: 'Sell to us', href: '/sell', icon: 'key', blurb: 'Offer a property or portfolio to our acquisition team.' },
];
export const can = (me: Me, key: string) => !!me.user && (me.user.staff || me.user.features?.includes(key));
export const navFor = (me: Me) => NAV_FEATURES.filter(f => can(me, f.key));
