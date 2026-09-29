import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const deCommentRow = {
  'comments.action.like': 'Gefällt mir',
  'comments.action.unlike': 'Gefällt mir nicht mehr',
  'comments.action.edit': 'Bearbeiten',
  'comments.action.delete': 'Löschen',
  'comments.edit.label': 'Kommentar bearbeiten',
  'comments.edit.save': 'Speichern',
  'comments.edit.cancel': 'Abbrechen',
  'comments.action.reply': 'Antworten',
  'comments.reply.to': 'Antwort an {name}',
  'comments.reply.cancel': 'Antwort abbrechen',
  'comments.composer.fold': 'Kommentarfeld einklappen',
  'comments.replies.show': 'Antworten ansehen ({count})',
  'comments.replies.hide': 'Antworten ausblenden',
  'comments.replies.more': 'Weitere Antworten ansehen',
  'comments.replies.error': 'Die Antworten konnten nicht geladen werden',
  'comments.replies.label': 'Antworten an {name}',
  'comments.action.image_with_replies': 'Mit den Antworten als Bild gestalten',
  'comments.report.title': 'Diesen Kommentar melden',
} satisfies CommentRowCatalogSlice;

export default deCommentRow;
