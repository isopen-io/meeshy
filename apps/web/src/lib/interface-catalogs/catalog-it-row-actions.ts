/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-it.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et l'en-tête REPLIABLE d'une section de la liste (#8694) : le nom que lit
 * le lecteur d'écran dit l'état et, replié, le compte de non-lus caché.
 */
const itRowActions = {
  'rowActions.menu': 'Azioni della conversazione',
  'rowActions.pin': 'Fissa',
  'rowActions.unpin': 'Rimuovi',
  'rowActions.mute': 'Silenzia',
  'rowActions.unmute': 'Audio',
  'rowActions.read': 'Letto',
  'rowActions.unread': 'Non letto',
  'rowActions.archive': 'Archivia',
  'rowActions.unarchive': 'Dearchivia',
  'lensSection.a11y.expanded': '{section}, espansa',
  'lensSection.a11y.folded': '{section}, ridotta',
  'lensSection.a11y.folded.unread.one': '{section}, ridotta, {count} messaggio non letto',
  'lensSection.a11y.folded.unread.other': '{section}, ridotta, {count} messaggi non letti',
} as const;

export default itRowActions;
