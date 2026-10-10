/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-en.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const enRowActions = {
  'rowActions.menu': 'Conversation actions',
  'rowActions.pin': 'Pin',
  'rowActions.unpin': 'Unpin',
  'rowActions.mute': 'Mute',
  'rowActions.unmute': 'Sound',
  'rowActions.read': 'Read',
  'rowActions.unread': 'Unread',
  'rowActions.archive': 'Archive',
  'rowActions.unarchive': 'Unarchive',
  'lensSection.a11y.expanded': '{section}, expanded',
  'lensSection.a11y.folded': '{section}, collapsed',
  'lensSection.a11y.folded.unread.one': '{section}, collapsed, {count} unread message',
  'lensSection.a11y.folded.unread.other': '{section}, collapsed, {count} unread messages',
} as const;

export default enRowActions;
