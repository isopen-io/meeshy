import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const it = {
  'signInLink.confirm.title': 'Accedere come @{username}?',
  'signInLink.confirm.lead': 'Questo link non è stato richiesto da questo dispositivo. Continua solo se questo account è tuo.',
  'signInLink.confirm.leadSignedIn': 'Hai effettuato l’accesso come @{current}. Questo link aprirebbe al suo posto l’account qui sotto; @{current} resterà tra i tuoi account su questo dispositivo.',
  'signInLink.confirm.accept': 'Accedi',
  'signInLink.confirm.cancel': 'Annulla',
  'signInLink.confirm.claim': 'Questo indirizzo sarà collegato a @{username} e rimosso da qualsiasi altro account Meeshy.',
  'signInLink.confirm.acceptClaim': 'Collega l’indirizzo e accedi',
  'verifyEmail.bar.title': 'Verifica dell’e-mail',
  'verifyEmail.noAddress': 'Questo link non contiene alcun indirizzo e-mail da verificare. Aprilo dall’e-mail che Meeshy ti ha inviato.',
  'verifyEmail.continue': 'Continua',
  'verifyEmail.title': 'Controlla la tua e-mail',
  'verifyEmail.subtitle': 'Inserisci il codice a 6 cifre inviato a {email}',
  'verifyEmail.subtitle.created': 'Abbiamo creato il tuo account e inviato un codice e un link a {email}. Inserisci il codice o apri il link.',
  'verifyEmail.subtitle.pending': 'La password è corretta, ma prima devi attivare il tuo account dimostrando che questo indirizzo è tuo. Abbiamo appena inviato un codice e un link a {email}.',
  'verifyEmail.subtitle.pending.inbox': 'Apri la tua casella di posta e controlla anche la cartella spam.',
  'verifyEmail.resend.prompt': 'Non hai ricevuto il codice?',
  'verifyEmail.resend': 'Invia di nuovo il codice',
  'verifyEmail.resend.busy': 'Invio…',
  'verifyEmail.resend.locked': 'Invia di nuovo il codice ({seconds}s)',
  'verifyEmail.resend.done': 'Codice inviato di nuovo!',
  'verifyEmail.link.invalid': 'Questo link non è più valido. Inserisci il codice ricevuto nella stessa e-mail.',
  'verifyEmail.handoff.opened': 'Il link è stato aperto nell’app Meeshy.',
  'verifyEmail.handoff.stay': 'Continua nel browser',
  'verifyEmail.arrival.title': 'Indirizzo confermato!',
  'verifyEmail.arrival.lead': 'Stiamo preparando le tue conversazioni…',
  'verifyEmail.arrival.status': 'Indirizzo confermato — accesso in corso…',
} satisfies SignInLinkCatalog;

export default it;
