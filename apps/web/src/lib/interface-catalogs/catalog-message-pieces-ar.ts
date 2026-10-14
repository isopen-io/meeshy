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
  'message.edit.action': 'تعديل',
  'message.edit.banner': 'جارٍ التعديل',
  'message.edit.cancel': 'إلغاء التعديل',
  'message.edit.field': 'تعديل الرسالة',
  'message.edit.submit': 'حفظ التعديل',
  'message.edit.done': 'تم تعديل الرسالة',
  'message.edit.failed': 'تعذّر تعديل الرسالة',
  'message.delete.action': 'حذف',
  'message.delete.title': 'حذف هذه الرسالة؟',
  'message.delete.titleMany': 'حذف {count} رسائل؟',
  'message.delete.hint': 'للجميع: تختفي الرسالة لدى جميع المشاركين. لي فقط: تُخفى لديك وحدك.',
  'message.delete.forEveryone': 'الحذف للجميع',
  'message.delete.forMe': 'الحذف لي فقط',
  'message.delete.done': 'تم حذف الرسالة',
  'message.delete.doneMany': 'تم حذف {count} رسائل',
  'message.delete.failed': 'تعذّر حذف الرسالة',
  'message.delete.failedMany': 'تعذّر حذف الرسائل',
  'message.delete.partial': 'تعذّر حذف {failed} من {count} رسائل',
} satisfies MessagePiecesCatalog;

export default ar;
