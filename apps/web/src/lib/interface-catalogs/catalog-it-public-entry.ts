import type frPublicEntry from './catalog-fr-public-entry';

/** L'entrée publique (#10007) — tranche `it` de `catalog-fr-public-entry.ts`, mêmes clés. */
const itPublicEntry = {
  'publicHeader.home': 'Home di Meeshy',
  'publicHeader.language': 'Lingua',
  'login.offline': 'Offline: al momento non è possibile accedere.',
  'login.twoFactor.title': 'Autenticazione a due fattori',
  'login.twoFactor.lead': 'Inserisci il codice della tua app di autenticazione.',
  'login.twoFactor.code': 'Codice a 6 cifre',
  'login.twoFactor.submit': 'Conferma',
  'login.twoFactor.busy': 'Verifica…',
  'login.twoFactor.cancel': 'Annulla',
  'login.passwordDoor': 'Accedi con nome utente e password',
  'login.username.label': 'E-mail, telefono o nome utente',
  'login.username.placeholder': 'Nome utente, e-mail o telefono',
  'login.password.label': 'Password',
  'login.submit': 'Accedi',
  'login.submit.busy': 'Accesso…',
  'login.emailDoor': 'Accedi tramite e-mail',
  'login.forgotPassword': 'Password dimenticata?',
  'login.forgotPassword.label': 'Password dimenticata',
  'login.noAccount': 'Non hai un account?',
  'login.createAccount': 'Crea un account',
  'magicLink.title': 'Il tuo indirizzo e-mail',
  'magicLink.howItWorks': 'Come funziona',
  'magicLink.howItWorks.text': 'Nessuna password da ricordare: ti inviamo un link via e-mail. Aprilo e sei dentro.',
  'magicLink.email.label': 'Indirizzo e-mail',
  'magicLink.email.placeholder': 'nome@esempio.it',
  'magicLink.email.invalid': 'Indirizzo e-mail non valido',
  'magicLink.rateLimited': 'Troppe richieste: riprova tra un’ora.',
  'magicLink.offline': 'Nessuna connessione. Controlla la rete e riprova.',
  'magicLink.submit': 'Ricevi il link',
  'magicLink.submit.busy': 'Invio…',
} satisfies Readonly<Record<keyof typeof frPublicEntry, string>>;

export default itPublicEntry;
