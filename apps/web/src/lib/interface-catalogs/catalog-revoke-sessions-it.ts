import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const it = {
  'revokeSessions.title': 'Non eri tu?',
  'revokeSessions.body': 'Disconnetti il tuo account da tutti i dispositivi, compreso quello che ha appena effettuato l’accesso. Poi dovrai accedere di nuovo.',
  'revokeSessions.action': 'Disconnetti tutti i dispositivi',
  'revokeSessions.working': 'Disconnessione…',
  'revokeSessions.done.title': 'Tutti i dispositivi sono disconnessi',
  'revokeSessions.done.body': 'Cambia la password al prossimo accesso.',
  'revokeSessions.invalid': 'Questo link di sicurezza è scaduto o è già stato usato. Accedi per gestire le tue sessioni.',
  'revokeSessions.dismiss': 'Ero io',
} as const satisfies RevokeSessionsCatalog;

export default it;
