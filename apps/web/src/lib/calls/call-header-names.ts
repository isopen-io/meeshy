import { findCachedConversation } from '@/lib/api/conversations';
import { customNameOf } from '@/lib/api/preferences';
import { appQueryClient } from '@/lib/api/query-client';

import { callHeaderNames, type CallHeaderNames } from './call-header';
import type { ActiveCall } from './call-store';

/**
 * Les noms que la conversation en cache donne à l'appel (#17341) : lus à froid, sans réseau. La capsule
 * de l'en-tête, l'étiquette de la bulle et la capsule de partage (P18.5, P18.10) les lisent par ici.
 */
export function cachedCallNames(call: Pick<ActiveCall, 'conversationId' | 'isGroup' | 'title'>): CallHeaderNames {
  const conversation = call.conversationId === '' ? undefined : findCachedConversation(appQueryClient, call.conversationId);
  return callHeaderNames(conversation === undefined ? undefined : { type: conversation.type, title: conversation.title, customName: customNameOf(conversation) }, call.isGroup ? call.title : null);
}
