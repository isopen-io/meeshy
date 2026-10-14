import { effectiveFlagsOf } from '@/lib/conversation-store';
import { peerOf } from '@/lib/view/conversation';

import { performRowAction, type ConversationActionDeps } from './conversation-actions';
import { findCachedConversation } from './conversations';
import { performBlock, performUnblock, type FriendActionDeps, type FriendActionOutcome } from './friend-actions';
import type { PersonSummary } from './friend-requests';
import type { Conversation } from './types';

/**
 * BLOQUER DEPUIS LA LIGNE D'UN DIRECT (#10593) — la loi d'iOS
 * (`ConversationListView.swift:1149` : `BlockActionCoordinator.block` puis
 * `archiveConversation`) : on bloque le pair ET on range la conversation aux
 * archives. Les deux gestes s'appliquent à l'instant ; un blocage refusé défait
 * aussi l'archive qu'il avait entraînée — sinon la conversation disparaîtrait
 * de la liste sans que personne ne soit bloqué. Débloquer ne touche pas à
 * l'archive, comme sur iOS.
 *
 * Le blocage lui-même est celui de « Découvrir » (`performBlock`,
 * `friend-actions.ts`) : même panier des bloqués, même instantané, même
 * retour arrière — la ligne et l'annuaire bougent ensemble.
 */
export type ConversationBlockDeps = ConversationActionDeps & FriendActionDeps;

export type ConversationBlockIntent = 'block' | 'unblock';

/** Le pair d'un direct, s'il a un compte — un invité ne se bloque pas. */
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

export async function performConversationBlock(params: {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly intent: ConversationBlockIntent;
  readonly deps: ConversationBlockDeps;
}): Promise<FriendActionOutcome> {
  const { conversation, viewerId, intent, deps } = params;
  const person = blockTargetOf(conversation, viewerId);
  if (person === undefined) return 'failed';
  if (!deps.isOnline()) return 'offline';
  if (intent === 'unblock') return performUnblock({ person, deps });

  const flags = effectiveFlagsOf(conversation, deps.store.getState().overrides);
  const archives = !flags.isArchived && flags.archiveLocked !== true;
  const archived = archives ? performRowAction({ conversationId: conversation.id, action: 'archive', deps }) : Promise.resolve();
  const outcome = await performBlock({ person, deps });
  await archived;
  if (outcome === 'done' || !archives) return outcome;

  const now = findCachedConversation(deps.queryClient, conversation.id) ?? conversation;
  if (effectiveFlagsOf(now, deps.store.getState().overrides).isArchived) {
    await performRowAction({ conversationId: conversation.id, action: 'archive', deps });
  }
  return outcome;
}
