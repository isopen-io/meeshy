import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const it = {
  'signInLink.confirm.title': 'Accedere come @{username}?',
  'signInLink.confirm.lead': 'Questo link non è stato richiesto da questo dispositivo. Continua solo se questo account è tuo.',
  'signInLink.confirm.leadSignedIn': 'Hai effettuato l’accesso come @{current}. Questo link aprirebbe al suo posto l’account qui sotto; @{current} resterà tra i tuoi account su questo dispositivo.',
  'signInLink.confirm.accept': 'Accedi',
  'signInLink.confirm.cancel': 'Annulla',
} satisfies SignInLinkCatalog;

export default it;
