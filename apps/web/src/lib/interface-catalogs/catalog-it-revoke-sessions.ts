/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-it.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const itRevokeSessions = {
  'revokeSessions.title': 'Non eri tu?',
  'revokeSessions.body': 'Disconnetti il tuo account da tutti i dispositivi, compreso quello che ha appena effettuato l’accesso. Poi dovrai accedere di nuovo.',
  'revokeSessions.action': 'Disconnetti tutti i dispositivi',
  'revokeSessions.working': 'Disconnessione…',
  'revokeSessions.done.title': 'Tutti i dispositivi sono disconnessi',
  'revokeSessions.done.body': 'Cambia la password al prossimo accesso.',
  'revokeSessions.invalid': 'Questo link di sicurezza è scaduto o è già stato usato. Accedi per gestire le tue sessioni.',
  'revokeSessions.dismiss': 'Ero io',
} as const;

export default itRevokeSessions;
