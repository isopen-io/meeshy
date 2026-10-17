/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-fr.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const frRevokeSessions = {
  'revokeSessions.title': 'Ce n’était pas vous ?',
  'revokeSessions.body': 'Déconnectez votre compte de tous les appareils, y compris celui qui vient de se connecter. Il faudra ensuite vous reconnecter.',
  'revokeSessions.action': 'Déconnecter tous les appareils',
  'revokeSessions.working': 'Déconnexion…',
  'revokeSessions.done.title': 'Tous les appareils sont déconnectés',
  'revokeSessions.done.body': 'Changez votre mot de passe dès votre prochaine connexion.',
  'revokeSessions.invalid': 'Ce lien de sécurité a expiré ou a déjà servi. Connectez-vous pour gérer vos sessions.',
  'revokeSessions.dismiss': 'C’était bien moi',
} as const;

export default frRevokeSessions;
