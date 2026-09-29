import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const esCommentRow = {
  'comments.action.like': 'Me gusta',
  'comments.action.unlike': 'Ya no me gusta',
  'comments.action.edit': 'Editar',
  'comments.action.delete': 'Eliminar',
  'comments.action.delete.confirm': 'Confirmar',
  'comments.edit.label': 'Editar comentario',
  'comments.edit.save': 'Guardar',
  'comments.edit.cancel': 'Cancelar',
  'comments.action.reply': 'Responder',
  'comments.reply.to': 'Respondiendo a {name}',
  'comments.reply.cancel': 'Cancelar la respuesta',
  'comments.replies.show': 'Ver respuestas ({count})',
  'comments.replies.hide': 'Ocultar respuestas',
  'comments.replies.more': 'Ver más respuestas',
  'comments.replies.error': 'No se pudieron cargar las respuestas',
  'comments.replies.label': 'Respuestas a {name}',
} satisfies CommentRowCatalogSlice;

export default esCommentRow;
