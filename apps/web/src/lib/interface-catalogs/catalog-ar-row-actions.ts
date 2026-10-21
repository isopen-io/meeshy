/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-ar.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const arRowActions = {
  'rowActions.menu': 'إجراءات المحادثة',
  'rowActions.pin': 'تثبيت',
  'rowActions.unpin': 'إلغاء التثبيت',
  'rowActions.mute': 'كتم',
  'rowActions.unmute': 'الصوت',
  'rowActions.read': 'مقروءة',
  'rowActions.unread': 'غير مقروءة',
  'rowActions.archive': 'أرشفة',
  'rowActions.unarchive': 'إلغاء الأرشفة',
  'rowActions.delete': 'حذف',
  'conversation.departure.leave': 'مغادرة',
  'conversation.departure.delete': 'حذف عندي',
  'conversation.departure.leave.title': 'مغادرة المحادثة؟',
  'conversation.departure.leave.message': 'لن تتلقى رسائل بعد الآن. سيظل سجلّك قابلًا للقراءة.',
  'conversation.departure.delete.title': 'حذف المحادثة؟',
  'conversation.departure.delete.message': 'ستُخفى «{title}» بالنسبة إليك. أما بقية المشاركين فتبقى لديهم.',
  'conversation.departure.leave.error': 'تعذّر مغادرة المحادثة.',
  'conversation.departure.delete.error': 'تعذّر حذف المحادثة.',
  'conversation.departure.offline': 'غير متصل — أعد المحاولة عند الاتصال.',
  'lensSection.label.pinned': 'المثبّتة',
  'lensSection.label.live': 'مباشر',
  'lensSection.label.today': 'اليوم',
  'lensSection.label.yesterday': 'أمس',
  'lensSection.label.thisWeek': 'هذا الأسبوع',
  'lensSection.label.older': 'أقدم',
  'lensSection.a11y.expanded': '{section}، موسّعة',
  'lensSection.a11y.folded': '{section}، مطوية',
  'lensSection.a11y.folded.unread.one': '{section}، مطوية، {count} رسالة غير مقروءة',
  'lensSection.a11y.folded.unread.other': '{section}، مطوية، {count} رسالة غير مقروءة',
} as const;

export default arRowActions;
