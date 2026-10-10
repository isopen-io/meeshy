import type { MessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';

/** Chaque pièce d'un message se vise seule (#9907, #9908) — miroir de `catalog-message-pieces-fr.ts`. */
const ar = {
  'message.piece.reply': 'الرد على هذه الوسائط',
  'message.piece.save': 'حفظ هذه الوسائط',
  'message.piece.forward': 'إعادة توجيه هذه الوسائط',
  'message.piece.delete': 'حذف هذه الوسائط',
  'message.piece.whole': 'الرسالة كاملة',
  'message.piece.position': '{kind} {index} من {total}',
  'message.piece.previous': 'الوسائط السابقة',
  'message.piece.next': 'الوسائط التالية',
  'message.piece.deleted': 'تم حذف الوسائط',
  'message.piece.deleteFailed': 'تعذّر حذف الوسائط',
  'message.piece.preview': 'وسائط الرسالة',
} satisfies MessagePiecesCatalog;

export default ar;
