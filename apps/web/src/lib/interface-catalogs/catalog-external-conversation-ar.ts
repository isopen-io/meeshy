import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const ar = {
  'externalConversation.entry.title': 'راسل صديقًا على واتساب',
  'externalConversation.entry.detail': 'عبر رقمه، بتشفير تام بين الطرفين',
  'externalConversation.handle.label': 'رقم واتساب الخاص بصديقك',
  'externalConversation.handle.hint': 'بالصيغة الدولية، مع رمز البلد: ‎+971 50 123 4567.',
  'externalConversation.handle.invalid': 'هذا الرقم ليس بالصيغة الدولية. ابدأ بعلامة + ثم رمز البلد.',
  'externalConversation.submit': 'راسل',
  'externalConversation.pending': 'جارٍ الفتح…',
  'externalConversation.cancel': 'إلغاء',
  'externalConversation.encrypted': 'مشفّرة تشفيرًا تامًا بين الطرفين: لا يستطيع Meeshy قراءة رسائلك. تتم الترجمة على جهازك، والميزات التي تتطلب قراءة الرسالة على خوادمنا غير متاحة في هذه المحادثة.',
  'externalConversation.phoneUnverified': 'أكّد رقم هاتفك لتراسل صديقًا على واتساب.',
  'externalConversation.phoneVerified': 'تم تأكيد الرقم. المس «راسل» لفتح المحادثة.',
  'externalConversation.refused.disabled': 'مراسلة صديق على واتساب غير متاحة هنا بعد.',
  'externalConversation.refused.reserved': 'خلال المرحلة التجريبية، المحادثات المشفّرة تشفيرًا تامًا مخصّصة لبعض الحسابات.',
  'externalConversation.refused.limit': 'لديك بالفعل الحد الأقصى من محادثات واتساب المفتوحة. أغلق واحدة لتفتح أخرى.',
  'externalConversation.refused.rateLimited': 'فُتحت محادثات كثيرة في وقت قصير. حاول مجددًا بعد ساعة.',
  'externalConversation.refused.offline': 'غير متصل: أعد الاتصال ثم المس «راسل» مجددًا.',
  'externalConversation.refused.failed': 'تعذّر فتح هذه المحادثة. حاول مجددًا بعد لحظة.',
} satisfies ExternalConversationCatalog;

export default ar;
