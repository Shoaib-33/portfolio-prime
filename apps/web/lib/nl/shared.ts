/* Dutch translations, English text is the key. */
const NL: Record<string, string> = {
  // Generic forms and buttons (components/client.tsx)
  'Saved.': 'Opgeslagen.', 'Working…': 'Bezig…', 'Language': 'Taal', 'Menu': 'Menu', 'Close': 'Sluiten',
  'Join free to save': 'Meld u gratis aan om te bewaren', 'Save': 'Bewaren', 'Remove from saved': 'Verwijderen uit bewaard',
  'View': 'Bekijken', 'Download': 'Downloaden', 'View only': 'Alleen inzien',
  // Countdown
  'days': 'dagen', 'hrs': 'uur', 'min': 'min', 'sec': 'sec', '{d}d': '{d}d', '{h}h {m}m': '{h}u {m}m',
  // Calculator and smart finder
  'Loan to value (%)': 'Financieringsratio (LTV, %)', 'Interest rate (%)': 'Rente (%)', 'Operating costs (% of rent)': 'Exploitatiekosten (% van de huur)', 'Vacancy allowance (%)': 'Leegstandsreservering (%)',
  'Equity incl. costs': 'Eigen vermogen incl. kosten', 'Annual cash flow': 'Jaarlijkse kasstroom', 'Cash-on-cash': 'Cash-on-cash-rendement', 'DSCR': 'DSCR',
  'Calculated on the server (POST /api/calculations). Indicative, not investment advice.': 'Berekend op de server (POST /api/calculations). Indicatief, geen beleggingsadvies.',
  'YOUR PARAMETERS': 'UW UITGANGSPUNTEN', 'Equity available': 'Beschikbaar eigen vermogen', 'Loan to value': 'Financieringsratio (LTV)', 'Interest rate': 'Rente', 'Minimum BAR': 'Minimale BAR', 'City': 'Stad',
  'You can reach properties up to': 'U kunt objecten aankopen tot', 'of {n} income properties fit': 'van {n} beleggingsobjecten passen', 'Costs 9% · vacancy 3% · operating costs 22%': 'Kosten 9% · leegstand 3% · exploitatiekosten 22%',
  'Fits': 'Past', 'Needs {amount} more': 'Nog {amount} nodig', 'Equity needed': 'Benodigd eigen vermogen', 'Deal score {v} of 100': 'Dealscore {v} van 100',
  // Login and two-factor
  'Email': 'E-mailadres', 'Password': 'Wachtwoord', 'No account? Maasland & Partners is by invitation.': 'Geen account? Maasland & Partners werkt uitsluitend op uitnodiging.', 'Request access': 'Toegang aanvragen',
  'DEMO ACCOUNTS · PASSWORD': 'DEMO-ACCOUNTS · WACHTWOORD',
  'Demo mode: the current code is {code}. Production asks your authenticator app.': 'Demomodus: de huidige code is {code}. In productie vraagt u de code op in uw authenticator-app.',
  'Two-factor login': 'Inloggen met tweestapsverificatie', 'Enter the 6-digit code from your authenticator app.': 'Voer de 6-cijferige verificatiecode uit uw authenticator-app in.', 'Code': 'Verificatiecode', 'Verify': 'Verifiëren',
  'Set up two-factor login': 'Tweestapsverificatie instellen', 'Required for data rooms and all staff accounts. Use any authenticator app (Microsoft, Google, 1Password).': 'Verplicht voor datarooms en alle medewerkersaccounts. U kunt elke authenticator-app gebruiken (Microsoft, Google, 1Password).',
  'Start': 'Starten', 'Add this key to your app': 'Voeg deze sleutel toe aan uw app', 'Secret key:': 'Geheime sleutel:', 'Or open': 'Of open', 'this otpauth link': 'deze otpauth-link', 'on your phone.': 'op uw telefoon.',
  'Current code:': 'Huidige code:', '6-digit code': '6-cijferige code', 'Turn on': 'Inschakelen',
  // Request access form (components/access.tsx)
  'Thank you.': 'Dank u wel.', 'A partner will contact you within one working day to discuss your mandate.': 'Een partner neemt binnen één werkdag contact met u op om uw zoekopdracht te bespreken.', 'Reference': 'Referentie',
  'I would like to': 'Ik wil graag', 'Invest': 'Beleggen', 'Sell a property': 'Vastgoed verkopen', 'Both': 'Beide',
  'Full name': 'Volledige naam', 'Work email': 'Zakelijk e-mailadres', 'Company': 'Bedrijf', 'You are': 'U bent',
  'Private person': 'Particulier', 'Private BV': 'Privé-bv', 'Fund': 'Fonds', 'Family office': 'Family office', 'Pension fund': 'Pensioenfonds', 'Insurer': 'Verzekeraar', 'Institutional investor': 'Institutionele belegger', 'Developer': 'Ontwikkelaar',
  'Typical ticket': 'Gebruikelijke investeringsomvang', 'Prefer not to say': 'Zeg ik liever niet', 'Up to €2m': 'Tot € 2 mln', '€2–10m': '€ 2–10 mln', '€10–50m': '€ 10–50 mln', '€50–250m': '€ 50–250 mln', '€250m+': '€ 250 mln+',
  'What are you looking for? (optional)': 'Waar bent u naar op zoek? (optioneel)', 'Regions, property types, size, timing': 'Regio\'s, vastgoedtypen, omvang, timing',
  'I agree that Maasland & Partners contacts me about my request (privacy statement).': 'Ik ga ermee akkoord dat Maasland & Partners contact met mij opneemt over mijn aanvraag (privacyverklaring).',
  'Sending…': 'Verzenden…',
  // Accept invitation
  'The two passwords are not the same.': 'De twee wachtwoorden komen niet overeen.', 'Choose a password': 'Kies een wachtwoord', 'Hide': 'Verbergen', 'Show': 'Tonen',
  'At least 10 characters. A passphrase works well.': 'Minimaal 10 tekens. Een wachtwoordzin werkt goed.', 'Repeat password': 'Herhaal wachtwoord',
  'I accept the terms, the privacy statement and that information I receive is confidential.': 'Ik ga akkoord met de voorwaarden en de privacyverklaring, en met de vertrouwelijkheid van de informatie die ik ontvang.',
  'Activating…': 'Bezig met activeren…', 'Activate my access': 'Mijn toegang activeren',
};
export default NL;
