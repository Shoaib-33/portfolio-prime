/* Dutch translations, English text is the key. */
const NL: Record<string, string> = {
  // Statuses and roles
  'Paused': 'Gepauzeerd', 'Link expired': 'Link verlopen', 'Link revoked': 'Link ingetrokken', 'Invitation sent': 'Uitnodiging verstuurd', 'Active': 'Actief',
  'Investor||role': 'Belegger', 'Admin||role': 'Beheerder', 'Developer||role': 'Developer',
  'draft': 'concept', 'coming soon': 'binnenkort', 'under offer': 'onder bod', 'sold stc': 'verkocht o.v.', 'sold': 'verkocht', 'withdrawn': 'ingetrokken',

  // Copy field
  'Copy': 'Kopiëren', 'Copied': 'Gekopieerd', 'Copy link': 'Link kopiëren', 'Copy key': 'Sleutel kopiëren',

  // Property picker
  'Which properties': 'Welke objecten', 'Selected properties': 'Geselecteerde objecten', 'Only what you tick below': 'Alleen wat u hieronder aanvinkt',
  'Including future listings': 'Inclusief toekomstige objecten', 'Search by name, city or type': 'Zoek op naam, stad of type', 'Search properties': 'Objecten zoeken',
  '{n} of {total} selected': '{n} van {total} geselecteerd', 'Select shown': 'Getoonde selecteren', 'Select all': 'Alles selecteren', 'Clear': 'Wissen',
  'No properties match “{q}”.': 'Geen objecten gevonden voor “{q}”.',
  'This person sees every live property, including listings the CRM adds later. Use it for partners and senior buyers.': 'Deze persoon ziet elk live object, ook objecten die het CRM later toevoegt. Gebruik dit voor partners en senior kopers.',

  // Feature picker, presets and the feature list from the API
  'Quick start': 'Snelstart', 'Viewer': 'Kijker', 'Buyer': 'Koper', 'Institution': 'Institutioneel', 'Everything': 'Alles',
  'Looks at the shared properties and asks questions.': 'Bekijkt de gedeelde objecten en stelt vragen.',
  'Underwrites, opens the data room and makes offers.': 'Rekent door, opent de dataroom en doet biedingen.',
  'Private deal rooms, analysis, AI and bids.': 'Besloten dealrooms, analyse, AI en biedingen.',
  'Every feature.': 'Alle functies.',
  'Explore': 'Verkennen', 'Underwrite': 'Doorrekenen', 'Transact': 'Transacties', 'Account': 'Account',
  'Map view': 'Kaartweergave', 'Smart finder': 'Slimme zoeker', 'Market report': 'Marktrapport', 'Analysis & IC memo': 'Analyse & IC-memo', 'AI analyst': 'AI-analist',
  'Data room': 'Dataroom', 'Private deal rooms': 'Besloten dealrooms', 'Offers & bids': 'Biedingen', 'Messages': 'Berichten', 'Membership': 'Lidmaatschap', 'Sell to us': 'Verkoop aan ons',
  'See shared properties on a map with exact pins.': 'Bekijk gedeelde objecten op een kaart met exacte locaties.',
  'Match equity and financing to the shared properties.': 'Koppel eigen vermogen en financiering aan de gedeelde objecten.',
  'Yields, prices and transactions per city.': 'Rendementen, prijzen en transacties per stad.',
  'Valuation, comparables, stress tests, ESG and the memo PDF.': 'Waardering, vergelijkbare objecten, stresstests, ESG en de memo als pdf.',
  'Ask questions about a property; answers cite the data.': 'Stel vragen over een object; de antwoorden verwijzen naar de data.',
  'NDA, documents and the unit-level rent roll (after KYC).': 'NDA, documenten en de huurlijst per eenheid (na KYC).',
  'Structured sale process with Q&A for institutions.': 'Gestructureerd verkoopproces met Q&A voor institutionele partijen.',
  'Make offers, sealed bids and process bids (after KYC).': 'Biedingen, gesloten biedingen en biedingen in een verkoopproces (na KYC).',
  'Secure chat with the account manager.': 'Beveiligde chat met de accountmanager.',
  'Investor Pro upgrade and off-market first look.': 'Upgrade naar Investor Pro en als eerste het off-market aanbod zien.',
  'Offer a property or portfolio to our acquisition team.': 'Bied een object of portefeuille aan ons acquisitieteam aan.',
  'Properties are always visible in “My selection”. Data room, offers and bids also need KYC verification; private deal rooms also need a qualified (institutional) investor type.': 'Objecten zijn altijd zichtbaar in “Mijn selectie”. Dataroom en biedingen vereisen daarnaast KYC-verificatie; besloten dealrooms vereisen ook een gekwalificeerd (institutioneel) beleggerstype.',

  // Editor
  'Access for {name} saved. It applies on their next click.': 'Toegang voor {name} opgeslagen. Dit geldt vanaf de volgende klik.',
  'Last seen {when}': 'Laatst gezien {when}', 'Role': 'Rol',
  'Invitation valid until {date}': 'Uitnodiging geldig tot {date}', 'The invitation link no longer works': 'De uitnodigingslink werkt niet meer',
  'Links are personal and work once. Creating a new one stops the old link.': 'Links zijn persoonlijk en werken één keer. Een nieuwe link maakt de oude ongeldig.',
  'Creating…': 'Aanmaken…', 'New invitation link': 'Nieuwe uitnodigingslink', 'Invitation revoked.': 'Uitnodiging ingetrokken.', 'Revoke': 'Intrekken',
  'Share this link with {name} by email or WhatsApp. It is shown once.': 'Deel deze link met {name} via e-mail of WhatsApp. De link wordt één keer getoond.',
  'Developers can do everything: the staff workspace, people & access, and the CRM & API settings.': 'Developers kunnen alles: de medewerkersomgeving, personen & toegang en de CRM- en API-instellingen.',
  'Admins see every property, invite and manage investors, and run the staff workspace.': 'Beheerders zien alle objecten, nodigen beleggers uit en beheren ze, en werken in de medewerkersomgeving.',
  'Only a developer can change this account.': 'Alleen een developer kan dit account wijzigen.',
  'Properties||section': 'Objecten', 'What {name} sees in their selection.': 'Wat {name} ziet in de eigen selectie.', 'Features': 'Functies',
  'Menu items and tools that are switched on. Everything else stays hidden.': 'Menu-items en tools die aanstaan. Al het andere blijft verborgen.',
  'Unsaved changes': 'Niet-opgeslagen wijzigingen', 'All changes saved': 'Alle wijzigingen opgeslagen',
  '{name} can log in again.': '{name} kan weer inloggen.', '{name} is signed out and paused.': '{name} is uitgelogd en gepauzeerd.',
  'Resume access': 'Toegang hervatten', 'Pause access': 'Toegang pauzeren', 'Saving…': 'Opslaan…', 'Save access': 'Toegang opslaan',

  // Invite drawer
  'Choose at least one property, or select “All properties”.': 'Kies minstens één object, of selecteer “Alle objecten”.',
  'Invite someone': 'Iemand uitnodigen', 'INVITATION CREATED': 'UITNODIGING AANGEMAAKT', '{name} can join now.': '{name} kan nu deelnemen.',
  'Send this personal link to {email}. It works once and expires on {date}. A draft email with the link is in the outbox.': 'Stuur deze persoonlijke link naar {email}. De link werkt één keer en verloopt op {date}. Een concept-e-mail met de link staat in de outbox.',
  'Done': 'Klaar', 'Invite someone else': 'Nog iemand uitnodigen', 'NEW INVITATION': 'NIEUWE UITNODIGING', 'Invite someone.': 'Iemand uitnodigen.',
  'They get a personal link, set a password and see only what you choose here.': 'Zij krijgen een persoonlijke link, kiezen een wachtwoord en zien alleen wat u hier kiest.',
  'Who': 'Wie', 'Investor type': 'Beleggerstype', 'Country': 'Land',
  'Netherlands': 'Nederland', 'Belgium': 'België', 'Germany': 'Duitsland', 'United Kingdom': 'Verenigd Koninkrijk', 'France': 'Frankrijk', 'Luxembourg': 'Luxemburg',
  'Denmark': 'Denemarken', 'United Arab Emirates': 'Verenigde Arabische Emiraten', 'United States': 'Verenigde Staten',
  'A developer can do everything, including CRM & API settings.': 'Een developer kan alles, inclusief de CRM- en API-instellingen.',
  'An admin sees every property, invites investors and runs the staff workspace.': 'Een beheerder ziet alle objecten, nodigt beleggers uit en werkt in de medewerkersomgeving.',
  'Properties they see': 'Objecten die zij zien', 'Features they can use': 'Functies die zij kunnen gebruiken', 'Invitation': 'Uitnodiging', 'Link valid for': 'Link geldig voor',
  '{n} days': '{n} dagen', 'Personal note (optional, shown on the invitation page)': 'Persoonlijke notitie (optioneel, zichtbaar op de uitnodigingspagina)',
  'As discussed: three assets that fit your Randstad mandate.': 'Zoals besproken: drie objecten die passen bij uw Randstad-mandaat.',
  'Staff role': 'Medewerkersrol', '{n} property': '{n} object', '{n} properties': '{n} objecten', '{n} feature': '{n} functie', '{n} features': '{n} functies',
  'Create invitation link': 'Uitnodigingslink aanmaken',

  // People & access tab
  'INVITE-ONLY ACCESS': 'TOEGANG OP UITNODIGING', 'People & access.': 'Personen & toegang.',
  'Choose per person which properties and which features they see. Visitors only see the public company pages.': 'Kies per persoon welke objecten en welke functies zij zien. Bezoekers zien alleen de openbare bedrijfspagina’s.',
  'Investors with access': 'Beleggers met toegang', 'Invitations pending': 'Openstaande uitnodigingen', 'Access requests': 'Toegangsaanvragen', 'Properties shared': 'Gedeelde objecten',
  'ACCESS REQUESTS FROM THE WEBSITE': 'TOEGANGSAANVRAGEN VIA DE WEBSITE', 'Invite': 'Uitnodigen', 'Dismiss': 'Negeren', 'Search people': 'Personen zoeken',
  'Investors': 'Beleggers', 'Staff': 'Medewerkers', 'Invited': 'Uitgenodigd', '(you)': '(u)', '{n} prop · {m} tools': '{n} obj. · {m} tools',
  'Nobody matches.': 'Niemand gevonden.', 'Select a person.': 'Selecteer een persoon.',

  // CRM & API keys
  'Key name, e.g. Company CRM (production)': 'Naam van de sleutel, bijv. bedrijfs-CRM (productie)', 'Key name': 'Naam van de sleutel', 'Create API key': 'API-sleutel aanmaken',
  'Store this key in the CRM now. For security it is shown only once.': 'Sla deze sleutel nu op in het CRM. Om veiligheidsredenen wordt hij maar één keer getoond.',

  // Staff header menu (workspace sections)
  'People & access': 'Personen & toegang', 'Buyers': 'Kopers', 'Outreach': 'Outreach', 'Listings': 'Objecten', 'Offers & deals': 'Biedingen & deals', 'Overview': 'Overzicht',
  'Bid rounds': 'Inschrijvingen', 'Deal processes': 'Verkoopprocessen', 'Acquisitions': 'Acquisities', 'Compliance': 'Compliance', 'Automation': 'Automatisering',

  // Staff home and listings
  'STAFF · {role}': 'MEDEWERKER · {role}', 'Every property and every feature. Manage who sees what in People & access.': 'Alle objecten en alle functies. Beheer wie wat ziet in Personen & toegang.',
  'Live properties': 'Live objecten', 'Invite buyers, share properties and switch features on or off per person.': 'Nodig kopers uit, deel objecten en zet functies per persoon aan of uit.',
  'Open||button': 'Openen', 'THE OFFERING': 'HET AANBOD', 'All properties.': 'Alle objecten.', 'Offers, deals, compliance, CRM and access.': 'Biedingen, deals, compliance, CRM en toegang.',
  'Every property.': 'Alle objecten.', 'Open in staff workspace': 'Openen in de medewerkersomgeving',
};
export default NL;
