/**
 * **LES TYPES DE PUSH QUI ANNONCENT UNE REMISE DE MESSAGE** (#7368, #7307).
 *
 * Jumeau de `NotificationPayloadHelpers.deliveryReceiptTypes` côté iOS, et de
 * `DELIVERY_RECEIPT_TYPES` dans `public/sw-push.js` (script classique, qui ne
 * peut pas importer ce module — `delivery-receipt-types.test.ts` compare les
 * deux listes au caractère). Les réactions et les événements sociaux portent
 * le `messageId` du message RÉAGI, pas remis : ils restent dehors.
 */
export const DELIVERY_RECEIPT_TYPES: ReadonlySet<string> = new Set([
  'new_message',
  'message_reply',
  'reply',
  'message_forwarded',
  'user_mentioned',
  'new_conversation',
  'new_conversation_direct',
  'new_conversation_group',
  'added_to_conversation',
]);
