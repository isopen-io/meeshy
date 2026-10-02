import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const enCommentRow = {
  'comments.action.like': 'Like',
  'comments.action.unlike': 'Unlike',
  'comments.action.edit': 'Edit',
  'comments.action.delete': 'Delete',
  'comments.edit.label': 'Edit comment',
  'comments.edit.save': 'Save',
  'comments.edit.cancel': 'Cancel',
  'comments.action.reply': 'Reply',
  'comments.reply.to': 'Replying to {name}',
  'comments.reply.cancel': 'Cancel reply',
  'comments.composer.fold': 'Fold the comment field',
  'comments.composer.unfold': 'Show the comment field',
  'comments.composer.attach': 'Attach a photo or video',
  'comments.media.upload_failed': 'The attachment couldn’t be sent.',
  'comments.replies.show': 'View replies ({count})',
  'comments.replies.hide': 'Hide replies',
  'comments.replies.more': 'View more replies',
  'comments.replies.error': 'Couldn’t load the replies',
  'comments.replies.label': 'Replies to {name}',
  'comments.action.image_with_replies': 'Make an image with the replies',
  'comments.report.title': 'Report this comment',
} satisfies CommentRowCatalogSlice;

export default enCommentRow;
