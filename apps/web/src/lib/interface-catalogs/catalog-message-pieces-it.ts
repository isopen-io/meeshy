import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const it = {
  'message.piece.reply': 'Rispondi a questo contenuto',
  'message.piece.save': 'Salva questo contenuto',
  'message.piece.forward': 'Inoltra questo contenuto',
  'message.piece.delete': 'Elimina questo contenuto',
  'message.piece.whole': 'Messaggio intero',
  'message.piece.position': '{kind} {index} di {total}',
  'message.piece.previous': 'Contenuto precedente',
  'message.piece.next': 'Contenuto successivo',
  'message.piece.deleted': 'Contenuto eliminato',
  'message.piece.deleteFailed': 'Impossibile eliminare il contenuto',
  'message.piece.preview': 'Contenuti del messaggio',
  'message.edit.action': 'Modifica',
  'message.edit.banner': 'Modifica in corso',
  'message.edit.cancel': 'Annulla la modifica',
  'message.edit.field': 'Modifica il messaggio',
  'message.edit.submit': 'Salva la modifica',
  'message.edit.done': 'Messaggio modificato',
  'message.edit.failed': 'Impossibile modificare il messaggio',
  'message.delete.action': 'Elimina',
  'message.delete.title': 'Eliminare questo messaggio?',
  'message.delete.titleMany': 'Eliminare {count} messaggi?',
  'message.delete.hint': 'Per tutti: il messaggio scompare per tutti i partecipanti. Per me: viene nascosto solo per te.',
  'message.delete.forEveryone': 'Elimina per tutti',
  'message.delete.forMe': 'Elimina per me',
  'message.delete.done': 'Messaggio eliminato',
  'message.delete.doneMany': '{count} messaggi eliminati',
  'message.delete.failed': 'Impossibile eliminare il messaggio',
  'message.delete.failedMany': 'Impossibile eliminare i messaggi',
  'message.delete.partial': 'Impossibile eliminare {failed} messaggi su {count}',
} satisfies MessagePiecesCatalog;

export default it;
