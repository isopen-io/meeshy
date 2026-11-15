/**
 * L'INVITATION DU VISITEUR (#9149) — la source des clés `visitor.*`. Chargée
 * À LA DEMANDE, pour un visiteur sans compte seulement (`lib/i18n-visitor-catalog.ts`) :
 * un lecteur connecté ne la télécharge jamais, et elle ne pèse pas sur les
 * catalogues d'interface.
 */
const fr = {
  'visitor.title': 'Rejoignez Meeshy',
  'visitor.sharedBy.reel': '{name} vous a partagé ce réel',
  'visitor.sharedBy.post': '{name} vous a partagé cette publication',
  'visitor.sharedBy.story': '{name} vous a partagé cette story',
  'visitor.sharedBy.mood': '{name} vous a partagé cette humeur',
  'visitor.body': 'Créez votre compte ou connectez-vous pour réagir, commenter et tout lire dans votre langue.',
  'visitor.signup': 'Créer un compte',
  'visitor.login': 'Se connecter',
  'visitor.later': 'Continuer à regarder',
  'visitor.refused.title': 'Ce contenu n’est pas accessible',
  'visitor.refused.body': 'Il n’existe plus, ou il est réservé à son audience. Connectez-vous pour le voir s’il vous est destiné.',
} as const;

export default fr;
