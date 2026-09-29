/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-fr.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const frRowActions = {
  'rowActions.menu': 'Actions de conversation',
  'rowActions.pin': 'Épingler',
  'rowActions.unpin': 'Désépingler',
  'rowActions.mute': 'Silence',
  'rowActions.unmute': 'Son',
  'rowActions.read': 'Lu',
  'rowActions.unread': 'Non lu',
  'rowActions.archive': 'Archiver',
  'rowActions.unarchive': 'Désarchiver',
  'lensSection.a11y.expanded': '{section}, dépliée',
  'lensSection.a11y.folded': '{section}, repliée',
  'lensSection.a11y.folded.unread.one': '{section}, repliée, {count} message non lu',
  'lensSection.a11y.folded.unread.other': '{section}, repliée, {count} messages non lus',
} as const;

export default frRowActions;
