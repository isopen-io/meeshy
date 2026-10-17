/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-de.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const deRevokeSessions = {
  'revokeSessions.title': 'Das warst nicht du?',
  'revokeSessions.body': 'Melde dein Konto auf allen Geräten ab, auch auf dem, das sich gerade angemeldet hat. Danach musst du dich erneut anmelden.',
  'revokeSessions.action': 'Alle Geräte abmelden',
  'revokeSessions.working': 'Abmeldung…',
  'revokeSessions.done.title': 'Alle Geräte sind abgemeldet',
  'revokeSessions.done.body': 'Ändere dein Passwort bei der nächsten Anmeldung.',
  'revokeSessions.invalid': 'Dieser Sicherheitslink ist abgelaufen oder wurde bereits verwendet. Melde dich an, um deine Sitzungen zu verwalten.',
  'revokeSessions.dismiss': 'Das war ich',
} as const;

export default deRevokeSessions;
