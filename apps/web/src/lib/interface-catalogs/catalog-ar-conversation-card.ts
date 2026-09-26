import type { ConversationCardCatalogSlice } from './catalog-fr-conversation-card';

/** La carte de conversation d'une bulle (#8099) — voir `catalog-fr-conversation-card.ts`. */
const arConversationCard = {
  'conversation.card.invite.lead': 'يدعوك للانضمام إلى هذه المحادثة',
  'conversation.card.members.one': '{count} عضو',
  'conversation.card.members.other': '{count} أعضاء',
  'conversation.card.messages.one': '{count} رسالة',
  'conversation.card.messages.other': '{count} رسائل',
  'conversation.card.languages': 'اللغات المستخدمة',
  'conversation.card.join': 'انضمام',
  'conversation.card.joinAnonymously': 'انضمام دون اسم',
  'conversation.card.open': 'فتح',
  'conversation.card.leave': 'مغادرة',
  'conversation.card.leaving': 'جارٍ المغادرة…',
  'conversation.card.leave.confirm.title': 'مغادرة «{title}»؟',
  'conversation.card.leave.confirm.body': 'لن تتلقى رسائلها بعد الآن. يبقى السجل قابلاً للقراءة.',
  'conversation.card.cancel': 'إلغاء',
  'conversation.card.expired': 'انتهت صلاحية الرابط',
  'conversation.card.expired.body': 'رابط الدعوة هذا لم يعد نشطًا.',
  'conversation.card.private': 'محادثة خاصة',
  'conversation.card.private.body': 'لا يراها إلا أعضاؤها.',
  'conversation.card.notFound': 'الرابط غير موجود',
  'conversation.card.notFound.body': 'رابط الدعوة هذا غير موجود أو تم حذفه.',
  'conversation.card.error': 'تعذّر تحميل هذه المحادثة',
  'conversation.card.retry': 'إعادة المحاولة',
  'conversation.card.loading': 'جارٍ تحميل المحادثة',
  'conversation.card.join.error': 'تعذّر الانضمام. حاول مرة أخرى.',
  'conversation.card.leave.error': 'تعذّرت المغادرة. حاول مرة أخرى.',
  'conversation.card.a11y': 'محادثة: {title}',
} satisfies ConversationCardCatalogSlice;

export default arConversationCard;
