import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import * as userPreferencesEndpoints from '@meeshy/shared/api/endpoints/user-preferences';

import type { Transport } from '../net/transport';
import type { ConversationFlags, ConversationPreferencePatch } from './preferences';

/*
 * LES PORTS DES PRÉFÉRENCES DE CONVERSATION, hors de `./preferences` (#14645).
 * La liste lit `./preferences` à la première peinture (`customNameOf`,
 * `flagsOf`…) ; ces ports n'y servent qu'à un geste. Les garder là tirait le
 * catalogue d'adresses `conversations` entier dans le module d'entrée.
 */

/**
 * `PUT userPreferences.conversationsByConversationId` (§3.2,
 * `services/gateway/src/routes/conversation-preferences.ts:349-435`). Corps
 * PARTIEL — un seul champ par appel : composer les trois à chaque fois
 * écraserait, côté serveur, un changement concurrent sur un champ que
 * l'appelant n'avait pas l'intention de toucher (`updateData` du serveur ne
 * touche que ce qu'il reçoit, `:393-405`).
 */
export function pushConversationFlags(
  transport: Transport,
  conversationId: string,
  patch: Partial<ConversationFlags> | ConversationPreferencePatch,
): Promise<unknown> {
  return transport({
    method: 'PUT',
    path: userPreferencesEndpoints.conversationsByConversationId(conversationId),
    body: patch,
  });
}

/**
 * `POST conversations.byConversationIdReceipts`, corps
 * `{ type: 'read' }` (§3.3, `receipts.ts:689-701`) — le SUCCESSEUR de l'alias
 * déprécié, jamais l'alias lui-même.
 */
export function pushRead(transport: Transport, conversationId: string): Promise<unknown> {
  return transport({
    method: 'POST',
    path: conversationsEndpoints.byConversationIdReceipts(conversationId),
    body: { type: 'read' },
  });
}

/**
 * `POST conversations.byIdMarkUnread`, sans corps (§3.4,
 * `messages-read-status.ts:159-196`).
 */
export function pushUnread(transport: Transport, conversationId: string): Promise<unknown> {
  return transport({
    method: 'POST',
    path: conversationsEndpoints.byIdMarkUnread(conversationId),
  });
}
