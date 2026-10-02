import type { CommentRowCatalogSlice } from './catalog-fr-comment-row';

/** La rangée de commentaire et ses gestes (#7135, #8583) — tranche du catalogue, miroir de `catalog-fr-comment-row.ts`. */
const arCommentRow = {
  'comments.action.like': 'أعجبني',
  'comments.action.unlike': 'لم يعد يعجبني',
  'comments.action.edit': 'تعديل',
  'comments.action.delete': 'حذف',
  'comments.edit.label': 'تعديل التعليق',
  'comments.edit.save': 'حفظ',
  'comments.edit.cancel': 'إلغاء',
  'comments.action.reply': 'رد',
  'comments.reply.to': 'الرد على {name}',
  'comments.reply.cancel': 'إلغاء الرد',
  'comments.composer.fold': 'طيّ حقل التعليق',
  'comments.composer.unfold': 'إظهار حقل التعليق',
  'comments.composer.attach': 'إرفاق صورة أو فيديو',
  'comments.media.upload_failed': 'تعذّر إرسال المرفق.',
  'comments.replies.show': 'عرض الردود ({count})',
  'comments.replies.hide': 'إخفاء الردود',
  'comments.replies.more': 'عرض المزيد من الردود',
  'comments.replies.error': 'تعذر تحميل الردود',
  'comments.replies.label': 'الردود على {name}',
  'comments.action.image_with_replies': 'تحويل إلى صورة مع الردود',
  'comments.report.title': 'الإبلاغ عن هذا التعليق',
} satisfies CommentRowCatalogSlice;

export default arCommentRow;
