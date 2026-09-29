import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const enCommentRow = {
  'comments.action.like': 'Like',
  'comments.action.unlike': 'Unlike',
  'comments.action.edit': 'Edit',
  'comments.action.delete': 'Delete',
  'comments.action.delete.confirm': 'Confirm',
  'comments.edit.label': 'Edit comment',
  'comments.edit.save': 'Save',
  'comments.edit.cancel': 'Cancel',
  'comments.action.reply': 'Reply',
  'comments.reply.to': 'Replying to {name}',
  'comments.reply.cancel': 'Cancel reply',
  'comments.replies.show': 'View replies ({count})',
  'comments.replies.hide': 'Hide replies',
  'comments.replies.more': 'View more replies',
  'comments.replies.error': 'Couldn’t load the replies',
  'comments.replies.label': 'Replies to {name}',
} satisfies CommentRowCatalogSlice;

export default enCommentRow;
