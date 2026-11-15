/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-fr.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
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
  'rowActions.delete': 'Supprimer',
  'conversation.departure.leave': 'Quitter',
  'conversation.departure.delete': 'Supprimer pour moi',
  'conversation.departure.leave.title': 'Quitter la conversation ?',
  'conversation.departure.leave.message': 'Vous ne recevrez plus de messages. Votre historique restera lisible.',
  'conversation.departure.delete.title': 'Supprimer la conversation ?',
  'conversation.departure.delete.message': '« {title} » sera masquée pour vous. Les autres participants la conservent.',
  'conversation.departure.leave.error': 'Impossible de quitter la conversation.',
  'conversation.departure.delete.error': 'Impossible de supprimer la conversation.',
  'conversation.departure.offline': 'Hors ligne — réessayez une fois connecté.',
  'lensSection.label.pinned': 'Épingles',
  'lensSection.label.live': 'En direct',
  'lensSection.label.today': "Aujourd'hui",
  'lensSection.label.yesterday': 'Hier',
  'lensSection.label.thisWeek': 'Cette semaine',
  'lensSection.label.older': 'Plus ancien',
  'lensSection.a11y.expanded': '{section}, dépliée',
  'lensSection.a11y.folded': '{section}, repliée',
  'lensSection.a11y.folded.unread.one': '{section}, repliée, {count} message non lu',
  'lensSection.a11y.folded.unread.other': '{section}, repliée, {count} messages non lus',
} as const;

export default frRowActions;
