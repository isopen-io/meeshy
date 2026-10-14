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
  'message.edit.action': 'Edit',
  'message.edit.banner': 'Editing',
  'message.edit.cancel': 'Cancel editing',
  'message.edit.field': 'Edit the message',
  'message.edit.submit': 'Save the edit',
  'message.edit.done': 'Message edited',
  'message.edit.failed': 'The message could not be edited',
  'message.delete.action': 'Delete',
  'message.delete.title': 'Delete this message?',
  'message.delete.titleMany': 'Delete {count} messages?',
  'message.delete.hint': 'For everyone: the message disappears for all participants. For me: it is only hidden for you.',
  'message.delete.forEveryone': 'Delete for everyone',
  'message.delete.forMe': 'Delete for me',
  'message.delete.done': 'Message deleted',
  'message.delete.doneMany': '{count} messages deleted',
  'message.delete.failed': 'The message could not be deleted',
  'message.delete.failedMany': 'The messages could not be deleted',
  'message.delete.partial': '{failed} of {count} messages could not be deleted',
  'message.delete.partialOne': '1 of {count} messages could not be deleted',
} satisfies MessagePiecesCatalog;

export default en;
