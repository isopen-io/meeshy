import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const arCommentRow = {
  'comments.action.like': 'أعجبني',
  'comments.action.unlike': 'لم يعد يعجبني',
  'comments.action.edit': 'تعديل',
  'comments.action.delete': 'حذف',
  'comments.action.delete.confirm': 'تأكيد',
  'comments.edit.label': 'تعديل التعليق',
  'comments.edit.save': 'حفظ',
  'comments.edit.cancel': 'إلغاء',
  'comments.action.reply': 'رد',
  'comments.reply.to': 'الرد على {name}',
  'comments.reply.cancel': 'إلغاء الرد',
  'comments.composer.fold': 'طيّ حقل التعليق',
  'comments.replies.show': 'عرض الردود ({count})',
  'comments.replies.hide': 'إخفاء الردود',
  'comments.replies.more': 'عرض المزيد من الردود',
  'comments.replies.error': 'تعذر تحميل الردود',
  'comments.replies.label': 'الردود على {name}',
} satisfies CommentRowCatalogSlice;

export default arCommentRow;
