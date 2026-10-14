import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const de = {
  'message.piece.reply': 'Auf dieses Medium antworten',
  'message.piece.save': 'Dieses Medium speichern',
  'message.piece.forward': 'Dieses Medium weiterleiten',
  'message.piece.delete': 'Dieses Medium löschen',
  'message.piece.whole': 'Ganze Nachricht',
  'message.piece.position': '{kind} {index} von {total}',
  'message.piece.previous': 'Vorheriges Medium',
  'message.piece.next': 'Nächstes Medium',
  'message.piece.deleted': 'Medium gelöscht',
  'message.piece.deleteFailed': 'Das Medium konnte nicht gelöscht werden',
  'message.piece.preview': 'Medien der Nachricht',
  'message.edit.action': 'Bearbeiten',
  'message.edit.banner': 'Bearbeitung',
  'message.edit.cancel': 'Bearbeitung abbrechen',
  'message.edit.field': 'Nachricht bearbeiten',
  'message.edit.submit': 'Bearbeitung speichern',
  'message.edit.done': 'Nachricht bearbeitet',
  'message.edit.failed': 'Die Nachricht konnte nicht bearbeitet werden',
  'message.delete.action': 'Löschen',
  'message.delete.title': 'Diese Nachricht löschen?',
  'message.delete.titleMany': '{count} Nachrichten löschen?',
  'message.delete.hint': 'Für alle: Die Nachricht verschwindet bei allen Teilnehmern. Für mich: Sie wird nur bei dir ausgeblendet.',
  'message.delete.forEveryone': 'Für alle löschen',
  'message.delete.forMe': 'Für mich löschen',
  'message.delete.done': 'Nachricht gelöscht',
  'message.delete.doneMany': '{count} Nachrichten gelöscht',
  'message.delete.failed': 'Die Nachricht konnte nicht gelöscht werden',
  'message.delete.failedMany': 'Die Nachrichten konnten nicht gelöscht werden',
  'message.delete.partial': '{failed} von {count} Nachrichten konnten nicht gelöscht werden',
} satisfies MessagePiecesCatalog;

export default de;
