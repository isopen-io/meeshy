/**
 * Les noms de la SESSION d'une connexion : authentifiée, jeton expiré, session
 * révoquée — une PARTIE de `SERVER_EVENTS` (`event-names.ts`), qui les répand.
 *
 * À part pour la raison de `viewing-event-names.ts` (#9966) : la présence
 * « regarde la conversation » s'annonce de nouveau à chaque `authenticated`,
 * dès la première peinture du web.
 */

export const SESSION_SERVER_EVENTS = {
  AUTHENTICATED: 'authenticated',
  AUTH_TOKEN_EXPIRED: 'auth:token-expired',
  AUTH_SESSION_REVOKED: 'auth:session-revoked',
} as const;
