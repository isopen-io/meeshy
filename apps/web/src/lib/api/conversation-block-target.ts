import { peerOf } from '@/lib/view/conversation';

import type { PersonSummary } from './friend-requests';
import type { Conversation } from './types';

/**
 * LA PERSONNE QU'ON BLOQUE DEPUIS LA LIGNE D'UN DIRECT (#10593) — le pair, s'il
 * a un compte : un invité ne se bloque pas. Module LÉGER, à part du geste
 * (`conversation-block.ts`, qui emporte le port et `zod`) : la liste le lit à
 * chaque rangée pour savoir quoi proposer, et ne charge le geste qu'au geste.
 */
export function blockTargetOf(conversation: Conversation, viewerId: string): PersonSummary | undefined {
  const peer = peerOf(conversation, viewerId);
  const id = peer?.userId ?? undefined;
  if (peer === undefined || id === undefined || id === '') return undefined;
  return {
    id,
    username: peer.user?.username ?? '',
    displayName: peer.displayName ?? peer.user?.displayName ?? null,
    avatar: peer.avatar ?? peer.user?.avatar ?? null,
  };
}
