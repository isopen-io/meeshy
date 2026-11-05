/**
 * LA VOIX (#16419), ARABE : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const ar = {
  'voice.title': 'الصوت',
  'voice.intro': 'ما يفعله Meeshy برسائلك الصوتية. يمكنك سحب كل إذن في أي وقت.',
  'voice.transcription': 'نسخ رسائلي الصوتية نصًّا',
  'voice.transcription.info': 'تتحوّل رسائلك الصوتية إلى نص يستطيع الجميع قراءته وترجمته.',
  'voice.translation': 'ترجمة رسائلي الصوتية',
  'voice.translation.info': 'تُسمَع رسائلك الصوتية بلغة كل مستلم.',
  'voice.cloning': 'استنساخ صوتي',
  'voice.cloning.info': 'تستخدم الترجمات الصوتية لرسائلك صوتك أنت.',
  'voice.loading': 'جارٍ قراءة أذوناتك الصوتية…',
  'voice.unavailable': 'تعذّرت قراءة أذوناتك الصوتية.',
  'voice.retry': 'إعادة المحاولة',
  'voice.notice.message': 'فعّل الموافقة الصوتية لتُنسَخ رسائلك الصوتية نصًّا وتُترجَم.',
  'voice.notice.action': 'التفعيل في الإعدادات',
} as const satisfies VoiceCatalog;

export default ar;
