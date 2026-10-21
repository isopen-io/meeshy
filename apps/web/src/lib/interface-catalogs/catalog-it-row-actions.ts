/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-it.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
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
  'rowActions.delete': 'Elimina',
  'conversation.departure.leave': 'Esci',
  'conversation.departure.delete': 'Elimina per me',
  'conversation.departure.leave.title': 'Uscire dalla conversazione?',
  'conversation.departure.leave.message': 'Non riceverai più messaggi. La tua cronologia resterà leggibile.',
  'conversation.departure.delete.title': 'Eliminare la conversazione?',
  'conversation.departure.delete.message': '«{title}» sarà nascosta per te. Gli altri partecipanti la conservano.',
  'conversation.departure.leave.error': 'Impossibile abbandonare la conversazione.',
  'conversation.departure.delete.error': 'Impossibile eliminare la conversazione.',
  'conversation.departure.offline': 'Offline — riprova quando sei connesso.',
  'lensSection.label.pinned': 'Fissate',
  'lensSection.label.live': 'In diretta',
  'lensSection.label.today': 'Oggi',
  'lensSection.label.yesterday': 'Ieri',
  'lensSection.label.thisWeek': 'Questa settimana',
  'lensSection.label.older': 'Meno recenti',
  'lensSection.a11y.expanded': '{section}, espansa',
  'lensSection.a11y.folded': '{section}, ridotta',
  'lensSection.a11y.folded.unread.one': '{section}, ridotta, {count} messaggio non letto',
  'lensSection.a11y.folded.unread.other': '{section}, ridotta, {count} messaggi non letti',
} as const;

export default itRowActions;
