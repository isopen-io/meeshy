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
} satisfies MessagePiecesCatalog;

export default it;
