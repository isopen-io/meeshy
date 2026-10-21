/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » (`/auth/revoke-sessions`, #10859) — la source des clés `revokeSessions.*`. Chargée AVEC
 * la page (`lib/i18n-revoke-sessions-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'revokeSessions.title': 'Ce n’était pas vous ?',
  'revokeSessions.body': 'Déconnectez votre compte de tous les appareils, y compris celui qui vient de se connecter. Il faudra ensuite vous reconnecter.',
  'revokeSessions.action': 'Déconnecter tous les appareils',
  'revokeSessions.working': 'Déconnexion…',
  'revokeSessions.done.title': 'Tous les appareils sont déconnectés',
  'revokeSessions.done.body': 'Changez votre mot de passe dès votre prochaine connexion.',
  'revokeSessions.invalid': 'Ce lien de sécurité a expiré ou a déjà servi. Connectez-vous pour gérer vos sessions.',
  'revokeSessions.dismiss': 'C’était bien moi',
} as const;

export default fr;
