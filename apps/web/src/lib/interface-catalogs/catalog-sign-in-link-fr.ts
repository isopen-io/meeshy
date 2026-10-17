/**
 * LA CONFIRMATION D'UN LIEN DE CONNEXION ouvert hors de l'appareil qui l'a demandé (« Se connecter en tant que
 * @x ? », 8da83d255f) — la source des clés `signInLink.confirm.*`. Chargée AVEC le lien magique et la
 * vérification d'adresse (`lib/i18n-sign-in-link-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'signInLink.confirm.title': 'Se connecter en tant que @{username} ?',
  'signInLink.confirm.lead': 'Ce lien n’a pas été demandé depuis cet appareil. Ne continuez que si ce compte est bien le vôtre.',
  'signInLink.confirm.leadSignedIn': 'Vous êtes connecté avec @{current}. Ce lien ouvrirait le compte ci-dessous à sa place ; @{current} restera dans vos comptes sur cet appareil.',
  'signInLink.confirm.accept': 'Se connecter',
  'signInLink.confirm.cancel': 'Annuler',
} as const;

export default fr;
