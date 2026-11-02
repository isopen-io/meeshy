/**
 * « QUI EST PRÉVENU » (#14063), ARABE : la section de Réglages ›
 * Notifications. Hors du catalogue d'interface, arrivé à son plafond : chargé
 * par la section (`i18n-circle-notify-catalog.ts`), jamais au démarrage.
 */
import type { CircleNotifyCatalog } from '../i18n-circle-notify-catalog';

const ar = {
  'circleNotify.title': 'من يتلقى الإشعار',
  'circleNotify.intro': 'اختر، لكل إجراء، أي دائرة من محيطك تتلقى إشعارًا.',
  'circleNotify.family.publication': 'منشوراتي',
  'circleNotify.family.onMyContent': 'نشاط الآخرين على محتواي',
  'circleNotify.family.elsewhere': 'نشاطي في أماكن أخرى',
  'circleNotify.summary.mixed': 'حسب الإجراء',
  'circleNotify.action.post': 'منشور',
  'circleNotify.action.reel': 'ريل',
  'circleNotify.action.story': 'قصة',
  'circleNotify.action.mood': 'مزاج',
  'circleNotify.action.repost': 'إعادة نشر',
  'circleNotify.action.share': 'مشاركة',
  'circleNotify.action.comment': 'تعليق',
  'circleNotify.action.reaction': 'تفاعل',
  'circleNotify.action.quote': 'اقتباس',
  'circleNotify.action.reference': 'إشارة مرجعية',
  'circleNotify.action.mention': 'إشارة',
  'circleNotify.choice.NOBODY': 'لا أحد',
  'circleNotify.explain.NOBODY': 'لا يتلقى أحد من محيطك إشعارًا.',
  'circleNotify.explain.COMMUNITY': 'كل روابطك، من الدم إلى المعارف، وأعضاء المجتمعات التي تشاركها.',
  'circleNotify.explain.PUBLIC': 'الأشخاص أنفسهم كما في المجتمع: لا يوجد متابعون في Meeshy، ولا يتلقى أي غريب إشعارًا.',
  'circleNotify.loading': 'جارٍ التحميل…',
  'circleNotify.unavailable': 'تعذّرت قراءة هذه الإعدادات.',
  'circleNotify.retry': 'إعادة المحاولة',
} as const satisfies CircleNotifyCatalog;

export default ar;
