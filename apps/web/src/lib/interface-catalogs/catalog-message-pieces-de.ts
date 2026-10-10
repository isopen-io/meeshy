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
} satisfies MessagePiecesCatalog;

export default de;
