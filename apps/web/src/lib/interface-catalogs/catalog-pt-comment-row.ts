import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const ptCommentRow = {
  'comments.action.like': 'Gostei',
  'comments.action.unlike': 'Já não gosto',
  'comments.action.edit': 'Editar',
  'comments.action.delete': 'Eliminar',
  'comments.action.delete.confirm': 'Confirmar',
  'comments.edit.label': 'Editar comentário',
  'comments.edit.save': 'Guardar',
  'comments.edit.cancel': 'Cancelar',
  'comments.action.reply': 'Responder',
  'comments.reply.to': 'Respondendo a {name}',
  'comments.reply.cancel': 'Cancelar resposta',
  'comments.composer.fold': 'Recolher o campo de comentário',
  'comments.replies.show': 'Ver respostas ({count})',
  'comments.replies.hide': 'Ocultar respostas',
  'comments.replies.more': 'Ver mais respostas',
  'comments.replies.error': 'Não foi possível carregar as respostas',
  'comments.replies.label': 'Respostas a {name}',
} satisfies CommentRowCatalogSlice;

export default ptCommentRow;
