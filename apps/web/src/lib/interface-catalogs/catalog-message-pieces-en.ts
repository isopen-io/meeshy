import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const en = {
  'message.piece.reply': 'Reply to this media',
  'message.piece.save': 'Save this media',
  'message.piece.forward': 'Forward this media',
  'message.piece.delete': 'Delete this media',
  'message.piece.whole': 'Whole message',
  'message.piece.position': '{kind} {index} of {total}',
  'message.piece.previous': 'Previous media',
  'message.piece.next': 'Next media',
  'message.piece.deleted': 'Media deleted',
  'message.piece.deleteFailed': 'The media could not be deleted',
  'message.piece.preview': 'Message media',
} satisfies MessagePiecesCatalog;

export default en;
