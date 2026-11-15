/**
 * LE MENU D'UNE LIGNE DE CONVERSATION (#8150) — tranche du catalogue
 * `catalog-es.ts`, qu'il RÉPAND. Mots repris d'iOS (`swipe.*`,
 * `Localizable.xcstrings`).
 *
 * Et QUITTER ou SUPPRIMER une conversation (#7285, #7837) — mots d'iOS
 * (`common.delete`, `conversation.info.leave.*`, `conversation.delete.confirm.*`,
 * `conversation.prefs.delete-for-me`, `conversation.options.error.*`).
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
  'rowActions.delete': 'Eliminar',
  'conversation.departure.leave': 'Salir',
  'conversation.departure.delete': 'Eliminar para mí',
  'conversation.departure.leave.title': '¿Salir de la conversación?',
  'conversation.departure.leave.message': 'Ya no recibirás mensajes. Tu historial seguirá siendo legible.',
  'conversation.departure.delete.title': '¿Eliminar la conversación?',
  'conversation.departure.delete.message': '«{title}» se ocultará para ti. Los demás participantes la conservan.',
  'conversation.departure.leave.error': 'No se pudo salir de la conversación.',
  'conversation.departure.delete.error': 'No se pudo eliminar la conversación.',
  'conversation.departure.offline': 'Sin conexión — inténtalo de nuevo cuando estés conectado.',
  'lensSection.label.pinned': 'Fijadas',
  'lensSection.label.live': 'En directo',
  'lensSection.label.today': 'Hoy',
  'lensSection.label.yesterday': 'Ayer',
  'lensSection.label.thisWeek': 'Esta semana',
  'lensSection.label.older': 'Más antiguo',
  'lensSection.a11y.expanded': '{section}, expandida',
  'lensSection.a11y.folded': '{section}, contraída',
  'lensSection.a11y.folded.unread.one': '{section}, contraída, {count} mensaje sin leer',
  'lensSection.a11y.folded.unread.other': '{section}, contraída, {count} mensajes sin leer',
} as const;

export default esRowActions;
