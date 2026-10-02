/**
 * LA RANGÉE DE COMMENTAIRE ET SES GESTES (#7135, #8583) — tranche du
 * catalogue, extraite pour tenir le budget de taille (motif
 * `catalog-fr-quote.ts`) : chaque langue RÉPAND la sienne dans son catalogue.
 * Aimer, répondre, modifier, supprimer ; le bandeau « Répondre à X » du
 * composeur ; le dépliage des réponses d'un commentaire.
 */
const frCommentRow = {
  'comments.action.like': 'J’aime',
  'comments.action.unlike': 'Je n’aime plus',
  'comments.action.edit': 'Modifier',
  'comments.action.delete': 'Supprimer',
  'comments.edit.label': 'Modifier le commentaire',
  'comments.edit.save': 'Enregistrer',
  'comments.edit.cancel': 'Annuler',
  'comments.action.reply': 'Répondre',
  'comments.reply.to': 'Répondre à {name}',
  'comments.reply.cancel': 'Annuler la réponse',
  'comments.composer.fold': 'Replier la saisie du commentaire',
  'comments.composer.unfold': 'Afficher la saisie du commentaire',
  'comments.replies.show': 'Voir les réponses ({count})',
  'comments.replies.hide': 'Masquer les réponses',
  'comments.replies.more': 'Voir plus de réponses',
  'comments.replies.error': 'Impossible de charger les réponses',
  'comments.replies.label': 'Réponses à {name}',
  'comments.action.image_with_replies': 'Imager avec les réponses',
  'comments.report.title': 'Signaler ce commentaire',
} as const;

export type CommentRowCatalogSlice = Readonly<Record<keyof typeof frCommentRow, string>>;

export default frCommentRow;
