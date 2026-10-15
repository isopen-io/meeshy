/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-de.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
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
  'rowActions.delete': 'Löschen',
  'conversation.departure.leave': 'Verlassen',
  'conversation.departure.delete': 'Für mich löschen',
  'conversation.departure.leave.title': 'Unterhaltung verlassen?',
  'conversation.departure.leave.message': 'Du erhältst keine Nachrichten mehr. Dein Verlauf bleibt lesbar.',
  'conversation.departure.delete.title': 'Konversation löschen?',
  'conversation.departure.delete.message': '„{title}“ wird für dich ausgeblendet. Die anderen Teilnehmer behalten sie.',
  'conversation.departure.leave.error': 'Die Unterhaltung konnte nicht verlassen werden.',
  'conversation.departure.delete.error': 'Die Unterhaltung konnte nicht gelöscht werden.',
  'conversation.departure.offline': 'Offline — versuche es erneut, sobald du verbunden bist.',
  'lensSection.label.pinned': 'Angeheftet',
  'lensSection.label.live': 'Live',
  'lensSection.label.today': 'Heute',
  'lensSection.label.yesterday': 'Gestern',
  'lensSection.label.thisWeek': 'Diese Woche',
  'lensSection.label.older': 'Älter',
  'lensSection.a11y.expanded': '{section}, ausgeklappt',
  'lensSection.a11y.folded': '{section}, eingeklappt',
  'lensSection.a11y.folded.unread.one': '{section}, eingeklappt, {count} ungelesene Nachricht',
  'lensSection.a11y.folded.unread.other': '{section}, eingeklappt, {count} ungelesene Nachrichten',
} as const;

export default deRowActions;
