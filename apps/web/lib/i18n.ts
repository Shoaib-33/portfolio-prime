/* English text is the key; Dutch maps it. Missing entries fall back to English.
   Each area keeps its own Dutch dictionary in lib/nl/*.ts; they are merged here. */
import PUBLIC from './nl/public';
import LISTINGS from './nl/listings';
import ACCOUNT from './nl/account';
import SHARED from './nl/shared';
import STAFF_ADMIN from './nl/staff-admin';
import STAFF_BUYERS from './nl/staff-buyers';
import STAFF_ACCESS from './nl/staff-access';

const CORE: Record<string, string> = {
  'Properties': 'Aanbod', 'Smart finder': 'Slimme zoeker', 'Membership': 'Lidmaatschap', 'Sell to us': 'Verkoop aan ons', 'Join free': 'Gratis aanmelden', 'Log in': 'Inloggen', 'Log out': 'Uitloggen', 'My account': 'Mijn account', 'Staff workspace': 'Medewerkersomgeving',
  'Exclusive Dutch property deals for verified investors, with every number and document in one place.': 'Exclusief vastgoedaanbod voor geverifieerde beleggers, met alle cijfers en documenten op één plek.',
  'OFF-MARKET FIRST. UNDERWRITTEN IN TEN MINUTES.': 'EERST OFF-MARKET. IN TIEN MINUTEN DOORGEREKEND.', 'Explore the offering': 'Bekijk het aanbod', 'What can my capital buy?': 'Wat kan ik kopen met mijn vermogen?',
  'deals closed': 'deals afgerond', 'transaction volume': 'transactievolume', 'verified investors': 'geverifieerde beleggers', 'average days to accepted offer': 'gemiddelde dagen tot geaccepteerd bod',
  'Featured deals': 'Uitgelichte deals', 'Just listed': 'Net binnen', 'View all': 'Bekijk alles', 'Seen first by Investor Pro.': 'Als eerste gezien door Investor Pro.', 'From interest to the notary, in one place.': 'Van interesse tot notaris, op één plek.',
  'Choose your level of access.': 'Kies uw toegangsniveau.', 'Recently sold': 'Recent verkocht', 'Thinking of selling?': 'Overweegt u te verkopen?', 'Sell your property to us': 'Verkoop uw vastgoed aan ons',
  'Price on request': 'Prijs op aanvraag', 'Address shown to members': 'Adres zichtbaar voor leden', 'Price': 'Prijs', 'Units': 'Eenheden', 'Energy': 'Energie', 'Plot': 'Kavel', 'Deal score': 'Dealscore', 'New': 'Nieuw',
  'Available': 'Beschikbaar', 'Coming soon': 'Binnenkort', 'Under offer': 'Onder bod', 'Sold': 'Verkocht', 'Direct sale': 'Directe verkoop', 'Portfolio': 'Portefeuille', 'Bid round': 'Inschrijving', 'Off-market': 'Off-market',
  'Asking price (k.k.)': 'Vraagprijs (k.k.)', 'Price per m²': 'Prijs per m²', 'WOZ value': 'WOZ-waarde', 'Energy label': 'Energielabel', 'Tenure': 'Eigendom', 'Build year': 'Bouwjaar', 'Occupancy': 'Bezetting', 'Living area': 'Woonoppervlak',
  'Join free to see the full financials, address and floor plans.': 'Meld u gratis aan voor alle cijfers, het adres en de plattegronden.', 'The property': 'Het object', 'Investment': 'Investering', 'Units & rent roll': 'Eenheden & huurlijst', 'Data room': 'Dataroom',
  'YOUR NEXT STEP': 'UW VOLGENDE STAP', 'Make an offer': 'Doe een bod', 'Request a viewing': 'Bezichtiging aanvragen', 'Ask a question': 'Stel een vraag', 'Message your account manager': 'Bericht aan uw accountmanager', 'Messages': 'Berichten', 'Map': 'Kaart', 'Verify to make offers': 'Verifieer om te bieden', 'Submit a sealed bid': 'Doe een gesloten bod',
  'All properties': 'Alle objecten', 'Residential portfolios': 'Woningportefeuilles', 'Apartment buildings': 'Appartementencomplexen', 'Prime homes': 'Toplocatiewoningen', 'Every city': 'Elke stad', 'Search': 'Zoeken', 'Back to the offering': 'Terug naar het aanbod',
};
const NL: Record<string, string> = { ...STAFF_ADMIN, ...STAFF_BUYERS, ...STAFF_ACCESS, ...CORE, ...SHARED, ...PUBLIC, ...LISTINGS, ...ACCOUNT }; // investor-facing wording wins on overlap
export type T = ((s: string, vars?: Record<string, string | number>) => string) & { lang?: string };
/** t('Hello {name}', { name }) : Dutch when the language is nl and a translation exists, else the English text. */
export const tr = (lang: string): T => Object.assign((s: string, vars?: Record<string, string | number>) => {
  let out = (lang === 'nl' && NL[s]) || s.split('||')[0]; // 'Close||deal': text before || is the English, after it tells same-spelled words apart
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}, { lang });
