import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const es = {
  'message.piece.reply': 'Responder a este archivo',
  'message.piece.save': 'Guardar este archivo',
  'message.piece.forward': 'Reenviar este archivo',
  'message.piece.delete': 'Eliminar este archivo',
  'message.piece.whole': 'Todo el mensaje',
  'message.piece.position': '{kind} {index} de {total}',
  'message.piece.previous': 'Archivo anterior',
  'message.piece.next': 'Archivo siguiente',
  'message.piece.deleted': 'Archivo eliminado',
  'message.piece.deleteFailed': 'No se pudo eliminar el archivo',
  'message.piece.preview': 'Archivos del mensaje',
} satisfies MessagePiecesCatalog;

export default es;
