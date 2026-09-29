/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-de.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const deRowActions = {
  'rowActions.menu': 'Unterhaltungsaktionen',
  'rowActions.pin': 'Anheften',
  'rowActions.unpin': 'Lösen',
  'rowActions.mute': 'Stumm',
  'rowActions.unmute': 'Ton',
  'rowActions.read': 'Gelesen',
  'rowActions.unread': 'Ungelesen',
  'rowActions.archive': 'Archivieren',
  'rowActions.unarchive': 'Archivierung aufheben',
  'lensSection.a11y.expanded': '{section}, ausgeklappt',
  'lensSection.a11y.folded': '{section}, eingeklappt',
  'lensSection.a11y.folded.unread.one': '{section}, eingeklappt, {count} ungelesene Nachricht',
  'lensSection.a11y.folded.unread.other': '{section}, eingeklappt, {count} ungelesene Nachrichten',
} as const;

export default deRowActions;
