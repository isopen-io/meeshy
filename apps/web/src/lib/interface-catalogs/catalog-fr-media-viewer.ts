/**
 * LES ACTIONS DE LA VISIONNEUSE (#6303) — tranche du catalogue `catalog-fr.ts`, extraite pour tenir
 * le budget de taille (motif `catalog-fr-media-hub.ts`) : le catalogue la RÉPAND. Miroir des libellés
 * iOS `media.save.title`, `media.react.title`, `media.reply.title`, `media.compose.title`.
 */
const frMediaViewer = {
  'media.viewer.save': 'Enregistrer',
  'media.viewer.react': 'Réagir',
  'media.viewer.react_with': 'Réagir avec {emoji}',
  'media.viewer.reply': 'Répondre',
  'media.viewer.compose': 'Créer avec ce média',
  'media.viewer.saved': 'Enregistré',
  'media.viewer.save_failed': 'Enregistrement impossible',
  'media.viewer.offline': 'Hors ligne — réessayez une fois connecté',
  'media.viewer.retry': 'Touchez de nouveau pour enregistrer',
  'media.viewer.react_failed': 'Réaction impossible',
  'media.viewer.react_limit': 'Nombre maximal de réactions atteint',
  'media.viewer.compose_failed': 'Impossible d’ouvrir ce média dans le studio',
} as const;

export default frMediaViewer;
