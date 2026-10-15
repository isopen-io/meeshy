import type { EmojiPickerCatalog } from '../i18n-emoji-picker-catalog';

/** LA FEUILLE D'EMOJIS, ARABE (#10531) — les clés du français. */
const ar = {
  'emojiPicker.search': 'البحث عن رمز تعبيري',
  'emojiPicker.search.empty': 'لم يُعثر على أي رمز تعبيري',
  'emojiPicker.search.unavailable': 'البحث عن الرموز التعبيرية غير متاح حاليًا.',
  'emojiPicker.loading': 'جارٍ تحميل الرموز التعبيرية…',
  'emojiPicker.failed': 'تعذّر تحميل الرموز التعبيرية.',
  'emojiPicker.retry': 'إعادة المحاولة',
  'emojiPicker.categories': 'فئات الرموز التعبيرية',
  'emojiPicker.section.suggested': 'اقتراحات',
  'emojiPicker.section.recent': 'المستخدمة مؤخرًا',
  'emojiPicker.category.recent': 'الأخيرة',
  'emojiPicker.category.smileys': 'الوجوه والمشاعر',
  'emojiPicker.category.people': 'الأشخاص والإيماءات',
  'emojiPicker.category.animals': 'الحيوانات والطبيعة',
  'emojiPicker.category.food': 'الطعام والشراب',
  'emojiPicker.category.activities': 'الأنشطة',
  'emojiPicker.category.travel': 'السفر والأماكن',
  'emojiPicker.category.objects': 'الأشياء',
  'emojiPicker.category.symbols': 'الرموز',
  'emojiPicker.category.flags': 'الأعلام',
  'emojiPicker.tones': 'درجات لون البشرة',
  'emojiPicker.tone.default': 'الافتراضي',
  'emojiPicker.tone.light': 'فاتح',
  'emojiPicker.tone.medium-light': 'فاتح متوسط',
  'emojiPicker.tone.medium': 'متوسط',
  'emojiPicker.tone.medium-dark': 'داكن متوسط',
  'emojiPicker.tone.dark': 'داكن',
} as const satisfies EmojiPickerCatalog;

export default ar;
