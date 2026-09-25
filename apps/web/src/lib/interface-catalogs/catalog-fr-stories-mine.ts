/**
 * « MES STORIES » (#6149) — tranche du catalogue français (`catalog-fr.ts`),
 * extraite pour tenir le budget de taille (CLAUDE.md, 1200 lignes) : ce sont
 * des clés du catalogue comme les autres, `catalog-fr` les RÉPAND, et les six
 * autres langues les portent à plat. Le listing que la pastille « moi » du
 * rail de stories ouvre désormais — miroir `MyStoriesView.swift` (titre,
 * état vide) et `MyStoriesDeleteConfirmation.swift` (confirmation).
 */
const frStoriesMine = {
  'storiesMine.title': 'Mes stories',
  'storiesMine.manage': 'Gérer mes stories',
  'storiesMine.empty.title': 'Aucune story envoyée',
  'storiesMine.empty.subtitle': 'Vos stories publiées apparaîtront ici tant qu’elles sont actives.',
  'storiesMine.action.open': 'Ouvrir',
  'storiesMine.action.delete': 'Supprimer',
  'storiesMine.delete.title': 'Supprimer la story ?',
  'storiesMine.delete.body': 'Cette action est définitive. La story ne sera plus visible par personne.',
  'storiesMine.delete.success': 'Story supprimée',
  'storiesMine.delete.failure': 'Échec de la suppression',
  'storiesMine.offline': 'Hors ligne — la suppression sera possible au retour du réseau.',
} as const;

export default frStoriesMine;
