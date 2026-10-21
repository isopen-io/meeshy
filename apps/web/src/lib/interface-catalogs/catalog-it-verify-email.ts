/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-it.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const itVerifyEmail = {
  'verifyEmail.backToLogin': 'Torna all’accesso',
  'verifyEmail.verified': 'E-mail verificata!',
  'verifyEmail.code.label': 'Codice di verifica',
  'verifyEmail.submit': 'Verifica',
  'verifyEmail.submit.busy': 'Verifica in corso…',
  'verifyEmail.error.invalid': 'Codice non valido o scaduto',
  'verifyEmail.error.offline': 'Nessuna connessione. Controlla la rete e riprova.',
  'verifyEmail.error.rateLimited': 'Troppi tentativi — riprova tra qualche minuto.',
  'verifyEmail.link.checking': 'Controllo del link…',
  'verifyEmail.proven': 'Indirizzo confermato ✓ — inserisci il codice ricevuto per accedere qui.',
  'emailSent.codeOrLink': 'Inserisci il codice a 6 cifre ricevuto su {email} oppure apri il link della stessa e-mail.',
  'signInLink.switchAccount.title': 'Aprire un ALTRO account?',
  'signInLink.switchAccount.lead': 'Hai effettuato l’accesso come @{current}, ma ciò che hai appena aperto porta a un altro account:',
  'signInLink.switchAccount.warning': 'Se non hai richiesto tu questo link o codice, annulla: resti connesso e non cambia nulla.',
  'signInLink.switchAccount.cancel': 'Annulla e resta su @{current}',
  'signInLink.switchAccount.confirm': 'Apri questo altro account',
  'signInLink.switchAccount.kept': '@{current} resterà tra i tuoi account su questo dispositivo.',
  'signInLink.switchAccount.busy': 'Un attimo…',
  'signInLink.switchAccount.failed': 'Impossibile aprire questo altro account al momento. Resti connesso e il link è stato chiuso.',
  'signInLink.switchAccount.expired': 'Questo link è scaduto: richiedine uno nuovo. Resti connesso.',
  'signInLink.switchAccount.leave': 'Torna alla home',
  'emailSent.title': 'Email inviata',
  'emailSent.openLink': 'Apri il link inviato a {email}',
  'emailSent.nothingReceived': 'Non hai ricevuto nulla?',
  'emailSent.nothingReceived.text': 'Controlla la cartella spam: il messaggio potrebbe essere finito lì.',
};

export default itVerifyEmail;
