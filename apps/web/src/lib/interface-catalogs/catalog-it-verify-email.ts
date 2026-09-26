/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-it.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const itVerifyEmail = {
  'verifyEmail.bar.title': 'Verifica dell’e-mail',
  'verifyEmail.noAddress': 'Questo link non contiene alcun indirizzo e-mail da verificare. Aprilo dall’e-mail che Meeshy ti ha inviato.',
  'verifyEmail.backToLogin': 'Torna all’accesso',
  'verifyEmail.verified': 'E-mail verificata!',
  'verifyEmail.continue': 'Continua',
  'verifyEmail.title': 'Controlla la tua e-mail',
  'verifyEmail.subtitle': 'Inserisci il codice a 6 cifre inviato a {email}',
  'verifyEmail.subtitle.created': 'Abbiamo creato il tuo account e inviato un codice e un link a {email}. Inserisci il codice o apri il link.',
  'verifyEmail.subtitle.pending': 'Il tuo account è in attesa di verifica: abbiamo inviato di nuovo un codice e un link a {email}.',
  'verifyEmail.code.label': 'Codice di verifica',
  'verifyEmail.submit': 'Verifica',
  'verifyEmail.submit.busy': 'Verifica in corso…',
  'verifyEmail.error.invalid': 'Codice non valido o scaduto',
  'verifyEmail.error.offline': 'Nessuna connessione. Controlla la rete e riprova.',
  'verifyEmail.error.rateLimited': 'Troppi tentativi — riprova tra qualche minuto.',
  'verifyEmail.resend.prompt': 'Non hai ricevuto il codice?',
  'verifyEmail.resend': 'Invia di nuovo il codice',
  'verifyEmail.resend.busy': 'Invio…',
  'verifyEmail.resend.locked': 'Invia di nuovo il codice ({seconds}s)',
  'verifyEmail.resend.done': 'Codice inviato di nuovo!',
  'verifyEmail.link.checking': 'Controllo del link…',
  'verifyEmail.link.invalid': 'Questo link non è più valido. Inserisci il codice ricevuto nella stessa e-mail.',
  'verifyEmail.proven': 'Indirizzo confermato ✓ — inserisci il codice ricevuto per accedere qui.',
  'verifyEmail.handoff.opened': 'Il link è stato aperto nell’app Meeshy.',
  'verifyEmail.handoff.stay': 'Continua nel browser',
  'verifyEmail.signingIn': 'Accesso in corso…',
  'verifyEmail.arrival.title': 'Indirizzo confermato!',
  'verifyEmail.arrival.lead': 'Stiamo preparando le tue conversazioni…',
  'verifyEmail.arrival.status': 'Indirizzo confermato — accesso in corso…',
  'emailSent.codeOrLink': 'Inserisci il codice a 6 cifre ricevuto su {email} oppure apri il link della stessa e-mail.',
};

export default itVerifyEmail;
