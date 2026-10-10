import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const pt = {
  'message.piece.reply': 'Responder a esta mídia',
  'message.piece.save': 'Salvar esta mídia',
  'message.piece.forward': 'Encaminhar esta mídia',
  'message.piece.delete': 'Excluir esta mídia',
  'message.piece.whole': 'Mensagem inteira',
  'message.piece.position': '{kind} {index} de {total}',
  'message.piece.previous': 'Mídia anterior',
  'message.piece.next': 'Próxima mídia',
  'message.piece.deleted': 'Mídia excluída',
  'message.piece.deleteFailed': 'Não foi possível excluir a mídia',
  'message.piece.preview': 'Mídias da mensagem',
} satisfies MessagePiecesCatalog;

export default pt;
