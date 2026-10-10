/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-es.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const esRowActions = {
  'rowActions.menu': 'Acciones de la conversación',
  'rowActions.pin': 'Fijar',
  'rowActions.unpin': 'Desfijar',
  'rowActions.mute': 'Silenciar',
  'rowActions.unmute': 'Sonido',
  'rowActions.read': 'Leído',
  'rowActions.unread': 'No leído',
  'rowActions.archive': 'Archivar',
  'rowActions.unarchive': 'Desarchivar',
  'lensSection.a11y.expanded': '{section}, expandida',
  'lensSection.a11y.folded': '{section}, contraída',
  'lensSection.a11y.folded.unread.one': '{section}, contraída, {count} mensaje sin leer',
  'lensSection.a11y.folded.unread.other': '{section}, contraída, {count} mensajes sin leer',
} as const;

export default esRowActions;
