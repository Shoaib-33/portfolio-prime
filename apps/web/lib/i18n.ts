/* English text is the key; Dutch maps it. Missing entries fall back to English. */
const NL: Record<string, string> = {
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
  'YOUR NEXT STEP': 'UW VOLGENDE STAP', 'Make an offer': 'Doe een bod', 'Request a viewing': 'Bezichtiging aanvragen', 'Ask a question': 'Stel een vraag', 'Verify to make offers': 'Verifieer om te bieden', 'Submit a sealed bid': 'Doe een gesloten bod',
  'All properties': 'Alle objecten', 'Residential portfolios': 'Woningportefeuilles', 'Apartment buildings': 'Appartementencomplexen', 'Prime homes': 'Toplocatiewoningen', 'Every city': 'Elke stad', 'Search': 'Zoeken', 'Back to the offering': 'Terug naar het aanbod',
};
export const tr = (lang: string) => (s: string) => (lang === 'nl' && NL[s]) || s;
