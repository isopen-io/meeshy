/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-en.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const enRevokeSessions = {
  'revokeSessions.title': 'Wasn’t you?',
  'revokeSessions.body': 'Sign your account out of every device, including the one that just signed in. You will need to sign in again afterwards.',
  'revokeSessions.action': 'Sign out all devices',
  'revokeSessions.working': 'Signing out…',
  'revokeSessions.done.title': 'All devices are signed out',
  'revokeSessions.done.body': 'Change your password the next time you sign in.',
  'revokeSessions.invalid': 'This security link has expired or was already used. Sign in to manage your sessions.',
  'revokeSessions.dismiss': 'It was me',
} as const;

export default enRevokeSessions;
