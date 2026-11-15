/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-en.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
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
  'rowActions.delete': 'Delete',
  'conversation.departure.leave': 'Leave',
  'conversation.departure.delete': 'Delete for me',
  'conversation.departure.leave.title': 'Leave conversation?',
  'conversation.departure.leave.message': "You'll no longer receive messages. Your history stays readable.",
  'conversation.departure.delete.title': 'Delete this conversation?',
  'conversation.departure.delete.message': '“{title}” will be hidden for you. Other participants keep it.',
  'conversation.departure.leave.error': "Couldn't leave the conversation.",
  'conversation.departure.delete.error': "Couldn't delete the conversation.",
  'conversation.departure.offline': "Offline — try again once you're connected.",
  'lensSection.label.pinned': 'Pinned',
  'lensSection.label.live': 'Live',
  'lensSection.label.today': 'Today',
  'lensSection.label.yesterday': 'Yesterday',
  'lensSection.label.thisWeek': 'This week',
  'lensSection.label.older': 'Older',
  'lensSection.a11y.expanded': '{section}, expanded',
  'lensSection.a11y.folded': '{section}, collapsed',
  'lensSection.a11y.folded.unread.one': '{section}, collapsed, {count} unread message',
  'lensSection.a11y.folded.unread.other': '{section}, collapsed, {count} unread messages',
} as const;

export default enRowActions;
