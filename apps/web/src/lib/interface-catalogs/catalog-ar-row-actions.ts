/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-ar.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
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
  'lensSection.a11y.expanded': '{section}، موسّعة',
  'lensSection.a11y.folded': '{section}، مطوية',
  'lensSection.a11y.folded.unread.one': '{section}، مطوية، {count} رسالة غير مقروءة',
  'lensSection.a11y.folded.unread.other': '{section}، مطوية، {count} رسالة غير مقروءة',
} as const;

export default arRowActions;
