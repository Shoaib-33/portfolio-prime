/* Dutch translations, English text is the key. */
const NL: Record<string, string> = {
  // Workspace heading and tabs (app/admin/page.tsx)
  'STAFF WORKSPACE': 'MEDEWERKERSOMGEVING', 'Staff only.': 'Alleen voor medewerkers.',
  'Log in with a staff account (for example admin@demo.nl). Staff accounts always use two-factor login.': 'Log in met een medewerkersaccount (bijvoorbeeld admin@demo.nl). Medewerkersaccounts gebruiken altijd tweestapsverificatie.',
  'Log in ↗': 'Inloggen ↗', 'Behind the': 'Achter het', 'offering.': 'aanbod.',
  'Admins run the workspace and invite investors, deciding per person which properties and tools they see. Developers can also create admin accounts and manage the CRM & API connection.': 'Beheerders beheren de omgeving en nodigen beleggers uit, en bepalen per persoon welke objecten en tools zij zien. Ontwikkelaars kunnen daarnaast beheerdersaccounts aanmaken en de CRM- en API-koppeling beheren.',
  'admin||role': 'beheerder', 'developer||role': 'ontwikkelaar', 'sales||role': 'sales', 'compliance||role': 'compliance', 'investor||role': 'belegger',
  'Hidden for admins': 'Verborgen voor beheerders', 'This section is switched off for admins. A developer can switch it on under Settings.': 'Dit onderdeel is uitgeschakeld voor beheerders. Een ontwikkelaar kan het inschakelen onder Instellingen.',
  'People & access': 'Personen & toegang', 'Buyers': 'Kopers', 'Outreach': 'Benadering', 'Listings': 'Objecten', 'Offers & deals': 'Biedingen & deals', 'Overview': 'Overzicht', 'Investors': 'Beleggers',
  'Bid rounds': 'Inschrijvingen', 'Deal processes': 'Verkoopprocessen', 'Acquisitions': 'Acquisities', 'Compliance': 'Compliance', 'Automation': 'Automatisering', 'Settings': 'Instellingen', 'CRM & API': 'CRM & API',
  'Not allowed for your role.': 'Niet toegestaan voor uw rol.',

  // Overview
  'Target: {v}': 'Doel: {v}', 'Verified investors': 'Geverifieerde beleggers', 'Paid conversion': 'Conversie naar betaald', 'Listing → NDA rate': 'Conversie object → NDA', 'NDA → offer rate': 'Conversie NDA → bod',
  'Deals in progress': 'Lopende deals', 'Active seller leads': 'Actieve verkoperleads', 'Pending KYC reviews': 'Openstaande KYC-beoordelingen', 'Open offers': 'Openstaande biedingen',
  '4+ closed / month': '4+ afgerond / maand', '60+ new / month': '60+ nieuw / maand', '< 1 working day': '< 1 werkdag', 'reply < 24 h': 'reactie < 24 u',
  'Live counts from the database.': 'Actuele aantallen uit de database.',
  'FUNNEL': 'TRECHTER', 'Views to deals.': 'Van weergave tot deal.', 'Listing detail views': 'Weergaven van objectpagina’s', 'NDAs signed': 'NDA’s getekend', 'Offers & bids': 'Biedingen', 'Deals': 'Deals',
  'ACQUISITION PIPELINE': 'ACQUISITIEPIJPLIJN', 'Estimated value of active seller leads.': 'Geschatte waarde van actieve verkoperleads.',
  'new||lead': 'nieuw', 'contacted||lead': 'benaderd', 'valuation||lead': 'taxatie', 'offer made||lead': 'bod uitgebracht', 'under contract||lead': 'onder contract', 'acquired||lead': 'aangekocht', 'lost||lead': 'verloren',

  // Investors
  'BUY-SIDE CRM': 'CRM KOOPZIJDE', 'Investors.': 'Beleggers.', 'Lead score grows with views, downloads, NDAs, offers and bids': 'De leadscore stijgt met weergaven, downloads, NDA’s, biedingen en inschrijvingen',
  'Investor': 'Belegger', 'Country': 'Land', 'Tier': 'Niveau', 'Risk': 'Risico', 'Lead score': 'Leadscore', 'Last activity': 'Laatste activiteit', 'Manager': 'Accountmanager',
  'pending||kyc': 'in afwachting', 'approved||kyc': 'goedgekeurd', 'rejected||kyc': 'afgewezen', 'none||kyc': 'geen',
  'low||risk': 'laag', 'medium||risk': 'gemiddeld', 'high||risk': 'hoog',

  // Offers & deals
  'ADMIN DEAL ROOM': 'DEALROOM BEHEER', 'Offers to review.': 'Te beoordelen biedingen.', 'vs asking': 't.o.v. vraagprijs', 'Transfer': 'Overdracht', 'Proof': 'Bewijs', 'Decision': 'Besluit',
  'Hot||band': 'Heet', 'Warm||band': 'Warm', 'Cold||band': 'Koud', 'Seller||band': 'Verkoper', 'Investor||band': 'Belegger',
  'Follow up {date}': 'Opvolgen {date}', 'counter {amount}': 'tegenbod {amount}', 'Accept': 'Accepteren', 'Counter {amount}': 'Tegenbod {amount}', 'Reject': 'Afwijzen',
  'No offers yet. Log in as verified@demo.nl and make one.': 'Nog geen biedingen. Log in als verified@demo.nl en doe een bod.',
  'DEALS': 'DEALS', 'Deal timelines.': 'Verloop van deals.', 'Advance to next stage ↗': 'Naar de volgende fase ↗',
  'VIEWINGS & QUESTIONS': 'BEZICHTIGINGEN & VRAGEN', 'Requests.': 'Aanvragen.', 'From': 'Van', 'Details': 'Details', 'Lead': 'Lead', 'Follow up': 'Opvolgen',
  'viewing||enquiry': 'Bezichtiging', 'question||enquiry': 'Vraag', 'access||enquiry': 'Toegangsaanvraag',
  'Contacted': 'Benaderd', 'Viewing scheduled': 'Bezichtiging gepland', 'Closed||enquiry': 'Afgehandeld', 'No viewing requests or questions yet.': 'Nog geen bezichtigingsverzoeken of vragen.',
  'in_review': 'in beoordeling', 'countered': 'tegenbod',

  // Bid rounds
  'BID ROUND': 'INSCHRIJVING', 'Closes {date} · minimum {min} · {n} bids': 'Sluit {date} · minimum {min} · {n} biedingen',
  'open||round': 'open', 'closed||round': 'gesloten', 'awarded||round': 'gegund',
  'Bids stay sealed: nobody, including staff, sees amounts until the deadline. A background job closes the round automatically at the deadline.': 'Biedingen blijven gesloten: niemand, ook geen medewerker, ziet bedragen vóór de deadline. Een achtergrondtaak sluit de inschrijving automatisch op de deadline.',
  'Close the round now (demo) ↗': 'Inschrijving nu sluiten (demo) ↗', 'Close this bid round now? Bids will be locked.': 'Deze inschrijving nu sluiten? De biedingen worden vergrendeld.',
  'Rank': 'Positie', 'Bidder': 'Bieder', 'vs minimum': 't.o.v. minimum', 'Award to the highest bidder and notify all ↗': 'Gunnen aan de hoogste bieder en iedereen informeren ↗',
  'Awarded.': 'Gegund.', 'Winner and unsuccessful bidders were notified.': 'De winnaar en de overige bieders zijn geïnformeerd.',

  // Deal processes
  'PRIVATE DEAL ROOM · STAGE {a}/{b}': 'BESLOTEN DEALROOM · FASE {a}/{b}', 'Guide {amount}': 'Richtprijs {amount}', 'shortlist {n}': 'shortlist {n}', 'Move to “{stage}” ↗': 'Naar “{stage}” ↗',
  'Close indicative bids and shortlist the top 3? All bidders are notified.': 'Indicatieve biedingen sluiten en de top 3 op de shortlist zetten? Alle bieders worden geïnformeerd.',
  'Move the process to the next stage?': 'Het proces naar de volgende fase zetten?',
  'vs guide': 't.o.v. richtprijs', 'Terms': 'Voorwaarden', 'Received': 'Ontvangen', 'Hidden for your role': 'Verborgen voor uw rol', 'No bids yet.': 'Nog geen biedingen.',
  'OPEN Q&A · {n}': 'OPENSTAANDE VRAGEN · {n}', 'Tax': 'Fiscaal', 'Process': 'Proces', 'General': 'Algemeen',
  'Answered. All parties see it, anonymised.': 'Beantwoord. Alle partijen zien het antwoord, geanonimiseerd.', 'Publish answer ↗': 'Antwoord publiceren ↗', 'Answer for all parties in the deal room': 'Antwoord voor alle partijen in de dealroom',

  // Acquisitions
  'SELL-SIDE PIPELINE': 'PIJPLIJN VERKOOPZIJDE', 'Acquisitions.': 'Acquisities.', 'Leads from “Sell to us”, brokers, lists and referrals': 'Leads via “Verkoop aan ons”, makelaars, lijsten en doorverwijzingen',
  'Valuation': 'Taxatie', 'Offer made': 'Bod uitgebracht', 'Under contract': 'Onder contract', 'Acquired': 'Aangekocht', 'Lost': 'Verloren',
  'Broker': 'Makelaar', 'Referral': 'Doorverwijzing', 'List · box 3 landlords': 'Lijst · verhuurders box 3', 'Direct mail': 'Direct mail', 'Website': 'Website', 'Website · access request': 'Website · toegangsaanvraag',
  'Canal house': 'Grachtenpand', 'To be discussed': 'Nader te bespreken',
  'Asking {amount}': 'Vraagprijs {amount}', 'est. {amount}': 'geschat {amount}', 'Stage': 'Fase', 'Lead added.': 'Lead toegevoegd.', 'Add to pipeline ↗': 'Toevoegen aan pijplijn ↗',
  'ADD A LEAD': 'LEAD TOEVOEGEN', 'Address': 'Adres', 'Asking (€)': 'Vraagprijs (€)',
  'Contact private owners by direct mail; cold calls and e-mails to consumers are restricted under Dutch telecom law.': 'Benader particuliere eigenaren per post; ongevraagd bellen en e-mailen naar consumenten is beperkt door de Telecommunicatiewet.',

  // Listings
  'DRAFTS & PUBLISHING': 'CONCEPTEN & PUBLICATIE', 'Ready to go live.': 'Klaar voor publicatie.', 'Publish & match ↗': 'Publiceren & matchen ↗',
  'No drafts. Create one with the BAG lookup. Publishing runs buy-box matching.': 'Geen concepten. Maak er een aan met de BAG-zoekfunctie. Bij publicatie wordt het object gematcht met zoekprofielen.',
  'INVENTORY': 'VOORRAAD', 'Status and pricing.': 'Status en prijzen.', 'Listing': 'Object', 'Published': 'Gepubliceerd', 'Price k.k.': 'Prijs k.k.', 'New price': 'Nieuwe prijs',
  'Find buyers': 'Kopers zoeken', 'Price updated; alerts sent.': 'Prijs bijgewerkt; meldingen verstuurd.', 'Update': 'Bijwerken',
  'Config saved. Calculators use the new values.': 'Configuratie opgeslagen. De rekentools gebruiken de nieuwe waarden.', 'Save config ↗': 'Configuratie opslaan ↗',
  'CONFIG TABLE · ADMIN ONLY': 'CONFIGURATIETABEL · ALLEEN BEHEERDERS', 'Rates and fees.': 'Tarieven en kosten.', 'Calculators read these values; change them when the law changes.': 'De rekentools gebruiken deze waarden; pas ze aan wanneer de wet verandert.',
  'valid from {date}': 'geldig vanaf {date}', 'pts||unit': 'ptn',
  'Transfer tax · residential, investor': 'Overdrachtsbelasting · woning, belegger', 'Transfer tax · own main residence': 'Overdrachtsbelasting · eigen hoofdverblijf', 'Transfer tax · commercial property': 'Overdrachtsbelasting · commercieel vastgoed',
  'Notary, valuation and financing fees': 'Notaris-, taxatie- en financieringskosten', 'Buyer’s fee on own stock (open question in plan)': 'Kopersprovisie op eigen voorraad (open vraag in plan)',
  'Investor Pro · monthly': 'Investor Pro · per maand', 'Investor Pro · yearly': 'Investor Pro · per jaar', 'Source-of-funds check above': 'Controle herkomst van middelen vanaf',
  'WWS · social rent up to (points)': 'WWS · sociale huur tot (punten)', 'WWS · mid rent up to (points)': 'WWS · middenhuur tot (punten)', 'WWS · maximum rent per point (approx.)': 'WWS · maximale huur per punt (circa)',
  'Private deal room · minimum ticket': 'Besloten dealroom · minimale ticket',
  'draft||listing': 'concept', 'coming soon||listing': 'binnenkort', 'available||listing': 'beschikbaar', 'under offer||listing': 'onder bod', 'sold stc||listing': 'verkocht o.v.', 'sold||listing': 'verkocht', 'withdrawn||listing': 'ingetrokken',

  // Compliance
  'WWFT · CUSTOMER DUE DILIGENCE': 'WWFT · CLIËNTENONDERZOEK', 'Verification queue.': 'Verificatiewachtrij.',
  'High risk needs enhanced due diligence notes before approval': 'Bij hoog risico zijn notities van verscherpt cliëntenonderzoek vereist vóór goedkeuring',
  'submitted {date}': 'ingediend {date}', 'PEP: yes': 'PEP: ja', 'ticket {amount}': 'ticket {amount}', 'Decision recorded.': 'Besluit vastgelegd.', 'Notes': 'Notities',
  ' (required for approval)': ' (verplicht voor goedkeuring)', 'EDD: source of funds verified…': 'EDD: herkomst van middelen geverifieerd…', 'Optional': 'Optioneel', 'Approve': 'Goedkeuren',
  'The queue is empty.': 'De wachtrij is leeg.', 'UNUSUAL TRANSACTIONS': 'ONGEBRUIKELIJKE TRANSACTIES', 'Flag for review.': 'Markeren voor beoordeling.', 'Flagged ✓': 'Gemarkeerd ✓', 'Flag': 'Markeren',
  'Supports reporting to FIU-Nederland within the legal deadline.': 'Ondersteunt melding aan FIU-Nederland binnen de wettelijke termijn.',
  'AUDIT LOG · APPEND-ONLY': 'AUDITLOG · ALLEEN TOEVOEGEN', 'Who did what.': 'Wie deed wat.',

  // Messages
  'No conversations yet.': 'Nog geen gesprekken.',
  '{n} unread · investors write from a listing or My account. Sales and admin reply; compliance can read.': '{n} ongelezen · beleggers schrijven vanuit een object of Mijn account. Sales en beheerders antwoorden; compliance kan meelezen.',
  'VERIFIED INVESTOR': 'GEVERIFIEERDE BELEGGER', 'FREE MEMBER': 'GRATIS LID',
  'Reply sent. The investor gets an alert.': 'Antwoord verzonden. De belegger ontvangt een melding.', 'Reply ↗': 'Antwoorden ↗', 'Reply': 'Antwoord', 'Reply to {name}…': 'Antwoord aan {name}…',
  'Read-only for your role.': 'Alleen-lezen voor uw rol.',

  // Automation
  'AUTOMATION RULES · ADMIN ONLY': 'AUTOMATISERINGSREGELS · ALLEEN BEHEERDERS', 'Less manual work.': 'Minder handwerk.',
  'Score every new lead': 'Elke nieuwe lead scoren', 'Rates each request 0–100 from type, verification, offer level and detail.': 'Beoordeelt elke aanvraag van 0–100 op type, verificatie, biedingsniveau en detail.',
  'Schedule follow-ups': 'Opvolging inplannen', 'Due within 4 hours for hot leads, next day for others.': 'Binnen 4 uur voor hete leads, de volgende dag voor andere.',
  'Draft confirmation emails': 'Bevestigingsmails opstellen', 'Writes to the outbox; an email provider sends them in production.': 'Schrijft naar het postvak uit; in productie verstuurt een e-mailprovider ze.',
  'Match new listings to buy boxes': 'Nieuwe objecten matchen met zoekprofielen', 'On publish; Investor Pro first for off-market, verified 48 h later (scheduled job).': 'Bij publicatie; bij off-market eerst Investor Pro, geverifieerde beleggers 48 uur later (geplande taak).',
  'Alert buyers to price drops': 'Kopers attenderen op prijsdalingen', 'Savers and newly fitting saved searches get an alert.': 'Wie het object bewaarde en nieuw passende zoekopdrachten krijgen een melding.',
  '{n} runs': '{n} keer uitgevoerd', 'Run due background jobs now': 'Openstaande achtergrondtaken nu uitvoeren', 'Jobs checked.': 'Taken gecontroleerd.',
  'ACTIVITY LOG': 'ACTIVITEITENLOG', 'What ran, and when.': 'Wat er is uitgevoerd, en wanneer.', 'OUTBOX · DRAFTS, NOT SENT': 'POSTVAK UIT · CONCEPTEN, NIET VERZONDEN', 'Emails.': 'E-mails.',
  'To {email} · {date}': 'Aan {email} · {date}', 'SCHEDULED JOBS': 'GEPLANDE TAKEN', 'Background queue.': 'Achtergrondwachtrij.', 'run at {date} · {status}': 'uitvoeren op {date} · {status}',
  'queued||job': 'in de wachtrij', 'processing||job': 'bezig', 'done||job': 'gereed', 'failed||job': 'mislukt', 'cancelled||job': 'geannuleerd',
  'Bid-round closing runs every 30 seconds. Off-market releases appear here when an off-market listing is published.': 'Het sluiten van inschrijvingen draait elke 30 seconden. Off-market vrijgaven verschijnen hier zodra een off-market object wordt gepubliceerd.',

  // CRM & API
  'CRM INTEGRATION': 'CRM-KOPPELING', 'Listings come from the CRM.': 'Objecten komen uit het CRM.',
  'The company CRM pushes every property it buys. The same CRM id updates the same listing; withdrawing removes it from every selection.': 'Het CRM van het bedrijf stuurt elk aangekocht object door. Hetzelfde CRM-id werkt hetzelfde object bij; intrekken verwijdert het uit elke selectie.',
  'Send a sample listing': 'Voorbeeldobject versturen', 'Sample listing created from a CRM payload. See it under Listings and in People & access.': 'Voorbeeldobject aangemaakt vanuit een CRM-payload. U vindt het onder Objecten en bij Personen & toegang.',
  'Listings from the CRM': 'Objecten uit het CRM', 'Last sync': 'Laatste synchronisatie', 'Active API keys': 'Actieve API-sleutels', 'On': 'Aan', 'Off': 'Uit', 'Bootstrap key (PP_CRM_API_KEY)': 'Startsleutel (PP_CRM_API_KEY)',
  'API KEYS': 'API-SLEUTELS', 'Who may push.': 'Wie mag versturen.', 'created {date}': 'aangemaakt {date}', 'last used {date}': 'laatst gebruikt {date}', 'never used': 'nooit gebruikt',
  'Revoked': 'Ingetrokken', 'Revoke': 'Intrekken', 'Revoke this key? The CRM can no longer push listings with it.': 'Deze sleutel intrekken? Het CRM kan er dan geen objecten meer mee versturen.',
  'No keys yet. Create one and paste it into the CRM’s webhook settings.': 'Nog geen sleutels. Maak er een aan en plak deze in de webhookinstellingen van het CRM.',
  'ENDPOINTS': 'ENDPOINTS', 'Three calls.': 'Drie aanroepen.', 'Create or update one listing (or an array of up to 200). Upsert by': 'Eén object aanmaken of bijwerken (of een array van maximaal 200). Upsert op',
  'Withdraw a listing everywhere.': 'Een object overal intrekken.', 'Check the key.': 'De sleutel controleren.',
  'emails of invited people who should see the listing at once. Publishing runs buy-box matching for people who can see it.': 'e-mailadressen van uitgenodigde personen die het object direct moeten zien. Bij publicatie wordt het object gematcht met de zoekprofielen van wie het kan zien.',
  'PAYLOAD': 'PAYLOAD', 'Example listing.json': 'Voorbeeld listing.json', 'SYNC LOG': 'SYNCHRONISATIELOG', 'Recent pushes.': 'Recent ontvangen.', 'Nothing received yet. Try “Send a sample listing”.': 'Nog niets ontvangen. Probeer “Voorbeeldobject versturen”.',

  // Buyers
  'BUY SIDE · POTENTIAL BUYERS': 'KOOPZIJDE · POTENTIËLE KOPERS', 'Who buys what we sell.': 'Wie koopt wat wij verkopen.',
  'Companies from the Kadaster ownership exports, with their portfolios and buying activity. Pick a property to see the best-matching buyers and email them a personal invitation.': 'Bedrijven uit de eigendomsexports van het Kadaster, met hun portefeuilles en aankoopactiviteit. Kies een object om de best passende kopers te zien en hun per e-mail een persoonlijke uitnodiging te sturen.',
  'Companies': 'Bedrijven', 'Buildings in the data': 'Gebouwen in de data', 'Companies with an email contact': 'Bedrijven met een e-mailcontactpersoon', 'Emails sent': 'E-mails verzonden', '{n} queued': '{n} in de wachtrij',
  'Registered via email': 'Geregistreerd via e-mail', 'RECENT IMPORTS': 'RECENTE IMPORTS', 'failed: {error}': 'mislukt: {error}', '{rows} rows, {created} new, {updated} updated': '{rows} rijen, {created} nieuw, {updated} bijgewerkt',
  'properties||import': 'objecten', 'owners||import': 'eigenaren', 'holdings||import': 'eigendommen', 'contacts||import': 'contactpersonen', 'pending||import': 'in afwachting', 'queued||import': 'in de wachtrij', 'processing||import': 'bezig met importeren',
  'Nothing imported yet. Start with the three exports: properties, owners and owner_properties. Then add contact persons (company, name, email) with the contacts template.': 'Nog niets geïmporteerd. Begin met de drie exports: properties, owners en owner_properties. Voeg daarna contactpersonen toe (bedrijf, naam, e-mail) met het sjabloon voor contactpersonen.',
  'Natural persons stay anonymous in the exports and are never imported as buyers. Contact persons are personal data (AVG): keep only business contacts, honour every unsubscribe and delete a person on request.': 'Natuurlijke personen blijven anoniem in de exports en worden nooit als koper geïmporteerd. Contactpersonen zijn persoonsgegevens (AVG): bewaar alleen zakelijke contacten, respecteer elke afmelding en verwijder een persoon op verzoek.',
  'Company, legal entity or city': 'Bedrijf, rechtspersoon of plaats', 'Every segment': 'Elk segment', 'Every stage': 'Elke fase', 'Contacts': 'Contactpersonen',
  'With or without contact': 'Met of zonder contactpersoon', 'With email contact': 'Met e-mailcontactpersoon', 'Without email contact': 'Zonder e-mailcontactpersoon', 'Sort': 'Sorteren',
  'Most buildings': 'Meeste gebouwen', 'Latest purchase': 'Laatste aankoop', 'Most m²': 'Meeste m²', 'Name': 'Naam', 'Filter': 'Filteren',
  'Recent buyer||segment': 'Recente koper', 'Long-term holder||segment': 'Lang in bezit', 'Mixed||segment': 'Gemengd', 'Middle||segment': 'Midden',
  'Buildings': 'Gebouwen', 'Floor area': 'Vloeroppervlak', 'Residential': 'Wonen', 'Largest deal': 'Grootste deal', '{n} in last 5 yrs': '{n} in afgelopen 5 jaar', '{n} in last 12 months': '{n} in afgelopen 12 maanden',
  'Do not contact': 'Niet benaderen', '{n} email': '{n} e-mailadres', '{n} emails': '{n} e-mailadressen', 'Add contact': 'Contactpersoon toevoegen', 'Emailed {date}': 'Gemaild {date}',
  'Interested': 'Geïnteresseerd', 'In talks': 'In gesprek', 'Customer': 'Klant', 'Not interested': 'Niet geïnteresseerd',
  'No company matches these filters.': 'Geen bedrijf voldoet aan deze filters.', 'No buyers yet. Import the ownership exports above.': 'Nog geen kopers. Importeer hierboven de eigendomsexports.',
  'Company added. Open it to add contact persons.': 'Bedrijf toegevoegd. Open het om contactpersonen toe te voegen.', 'Add company ↗': 'Bedrijf toevoegen ↗',
  'A BUYER THAT IS NOT IN THE EXPORTS': 'EEN KOPER DIE NIET IN DE EXPORTS STAAT', 'Company name': 'Bedrijfsnaam', 'For example a fund you met at an event': 'Bijvoorbeeld een fonds dat u op een evenement hebt ontmoet',

  // Find buyers
  'BUYERS': 'KOPERS', 'POTENTIAL BUYERS': 'POTENTIËLE KOPERS', 'price on request': 'prijs op aanvraag', 'open listing ↗': 'object openen ↗',

  // Buyer company
  'COMPANY': 'BEDRIJF', 'No Kadaster entities recorded': 'Geen Kadaster-rechtspersonen geregistreerd', 'Bought in the last 5 years': 'Gekocht in de afgelopen 5 jaar',
  'Largest deal · typical {amount}': 'Grootste deal · doorgaans {amount}', 'WHERE THEY OWN': 'WAAR ZIJ BEZIT HEBBEN', 'No buildings linked yet.': 'Nog geen gebouwen gekoppeld.',
  'BOUGHT IN THE LAST 5 YEARS': 'GEKOCHT IN DE AFGELOPEN 5 JAAR', 'WHAT THEY OWN': 'WAT ZIJ BEZITTEN', 'No building data linked.': 'Geen gebouwgegevens gekoppeld.',
  'Residential||use': 'Wonen', 'Retail||use': 'Winkel', 'Office||use': 'Kantoor', 'Industrial||use': 'Industrie', 'Hotel & lodging||use': 'Hotel & logies', 'Healthcare||use': 'Zorg', 'Education||use': 'Onderwijs', 'Assembly||use': 'Bijeenkomst', 'Other||use': 'Overig',
  'Typical floor area': 'Gangbaar vloeroppervlak', 'Typical build year': 'Gangbaar bouwjaar', 'Investment purchases': 'Beleggingsaankopen', 'Development · forward funding': 'Ontwikkeling · forward funding',
  'CONTACT PERSONS': 'CONTACTPERSONEN', 'Unsubscribed {date}': 'Afgemeld {date}', 'Resubscribe': 'Opnieuw aanmelden', 'Only resubscribe when this person asked for it. Continue?': 'Meld deze persoon alleen opnieuw aan als hij of zij daarom heeft gevraagd. Doorgaan?',
  'Delete': 'Verwijderen', 'Delete {name} and their email history? Use this for erasure requests.': '{name} en de bijbehorende e-mailhistorie verwijderen? Gebruik dit bij verzoeken om verwijdering.',
  'No contact person yet. Add one to email this company.': 'Nog geen contactpersoon. Voeg er een toe om dit bedrijf te e-mailen.', 'Contact added.': 'Contactpersoon toegevoegd.', 'Add contact ↗': 'Contactpersoon toevoegen ↗',
  'Role': 'Functie', 'Head of Acquisitions': 'Hoofd Acquisities', 'Phone': 'Telefoon', 'Notes saved.': 'Notities opgeslagen.', 'Save notes': 'Notities opslaan', 'NOTES': 'NOTITIES',
  'What they buy, who decides, last conversation…': 'Wat zij kopen, wie beslist, laatste gesprek…', 'EMAILS': 'E-MAILS', 'Outreach history.': 'Benaderingshistorie.',
  'To': 'Aan', 'Sent': 'Verzonden', 'Opened': 'Geopend', 'Clicked': 'Geklikt', 'Registered': 'Geregistreerd',
  'queued||mail': 'in de wachtrij', 'sent||mail': 'verzonden', 'opened||mail': 'geopend', 'clicked||mail': 'geklikt', 'registered||mail': 'geregistreerd', 'failed||mail': 'mislukt', 'cancelled||mail': 'geannuleerd', 'unsubscribed||mail': 'afgemeld', 'simulated||mail': 'gesimuleerd',
  'PORTFOLIO · LATEST {n} OF {total}': 'PORTEFEUILLE · LAATSTE {n} VAN {total}', 'Buildings.': 'Gebouwen.', 'Source: {file}': 'Bron: {file}',
  'Use': 'Gebruik', 'Built': 'Bouwjaar', 'Bought': 'Gekocht', 'Transaction': 'Transactie', 'Factsheet': 'Factsheet', 'Several addresses': 'Meerdere adressen', 'Factsheet ↗': 'Factsheet ↗',
  'No buildings linked. Import the owner_properties export.': 'Geen gebouwen gekoppeld. Importeer de export owner_properties.',

  // Outreach and campaign
  'EMAIL OUTREACH': 'BENADERING PER E-MAIL', 'Who opened, who came in.': 'Wie opende, wie kwam binnen.',
  'Each email carries a personal link. Opening it creates that person’s invitation with access to the property in the email only.': 'Elke e-mail bevat een persoonlijke link. Wie deze opent, krijgt een uitnodiging met toegang tot uitsluitend het object uit de e-mail.',
  'Send {n} queued now': '{n} uit de wachtrij nu versturen', 'Find buyers ↗': 'Kopers zoeken ↗', 'Connected to': 'Verbonden met', 'sending as {from} · {n} emails every 30 seconds.': 'verstuurt als {from} · {n} e-mails per 30 seconden.',
  'Simulated sending.': 'Gesimuleerde verzending.',
  'No mail server is connected, so emails go to the outbox (Automation tab) instead of the inbox. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM on the server to send for real.': 'Er is geen mailserver gekoppeld, dus e-mails gaan naar het postvak uit (tabblad Automatisering) in plaats van naar de inbox. Stel SMTP_HOST, SMTP_USER, SMTP_PASSWORD en MAIL_FROM in op de server om echt te versturen.',
  'Clicked the link': 'Op de link geklikt', 'Created an account': 'Account aangemaakt', 'Unsubscribed': 'Afgemeld', '{n} failed': '{n} mislukt', 'emails': 'e-mails',
  'No emails yet. Open Buyers, choose a property and select the companies to email.': 'Nog geen e-mails. Open Kopers, kies een object en selecteer de bedrijven die u wilt e-mailen.',
  'OUTBOX · SIMULATED, NOT DELIVERED': 'POSTVAK UIT · GESIMULEERD, NIET AFGELEVERD', 'What the buyers would receive.': 'Wat de kopers zouden ontvangen.',
  'Open an email to read it. The links in it work: open one in a private window to see the buyer’s side.': 'Open een e-mail om deze te lezen. De links werken: open er een in een privévenster om de kant van de koper te zien.',
  'OUTREACH': 'BENADERING', 'by {name}': 'door {name}', 'Send queued now': 'Wachtrij nu versturen', 'Cancel queued': 'Wachtrij annuleren',
  'Cancel every email of this campaign that has not been sent yet?': 'Alle nog niet verzonden e-mails van deze campagne annuleren?', 'Retry {n} failed': '{n} mislukte opnieuw proberen',
  'THE LINK IN THESE EMAILS GIVES': 'DE LINK IN DEZE E-MAILS GEEFT', '{n} feature: {list}': '{n} functie: {list}', '{n} features: {list}': '{n} functies: {list}', 'none||features': 'geen',
  'Contact': 'Contactpersoon', 'Match': 'Match', 'Viewed · offers': 'Bekeken · biedingen', 'TEMPLATE': 'SJABLOON', 'The message as written.': 'Het bericht zoals geschreven.',

  // Settings
  'DEVELOPER · WORKSPACE': 'ONTWIKKELAAR · OMGEVING', 'Which sections admins see.': 'Welke onderdelen beheerders zien.',
  'Switch off what the team does not use yet. Nothing is deleted: switch a section back on and everything in it is still there. You always see every section; hidden ones are dimmed in the tab bar.': 'Schakel uit wat het team nog niet gebruikt. Er wordt niets verwijderd: schakel een onderdeel weer in en alles staat er nog. U ziet zelf altijd elk onderdeel; verborgen onderdelen zijn gedimd in de tabbalk.',
  'General||listing': 'Algemeen',
  'hidden': 'verborgen',
};
export default NL;
