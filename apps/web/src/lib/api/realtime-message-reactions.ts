import type { QueryClient } from '@tanstack/react-query';
import type { ReactionUpdateEventData } from '@meeshy/shared/types/socketio-events/reaction';

import { findCachedThreadMessage, patchThreadMessages } from './messages';
import { reactionStore } from './reaction-store';
import type { Message } from './types';

/**
 * LE PUITS DE `reaction:added` / `reaction:removed` (#5863) — la passerelle
 * diffuse à la room de la conversation l'état ABSOLU de l'emoji touché
 * (`ReactionService.createUpdateEvent` : `aggregation = { emoji, count,
 * participantIds }`, `getBroadcastAggregation`) et l'ACTEUR (`userId`, son
 * User.id — `participantId` est un Participant.id, jamais comparable au
 * lecteur).
 *
 * **Le compte se POSE, il ne s'additionne jamais** : c'est ce qui rend l'écho
 * de MA réaction optimiste (`performReaction`, déjà `+1`) inoffensif, et une
 * double livraison idempotente. **« Ma réaction » ne bascule QUE pour le geste
 * du lecteur** (un autre de ses appareils) — même garde que `story:reacted`
 * (`reaction-realtime.ts`) et `post:liked`.
 *
 * Fail-closed, motif `realtime-attachment-reactions.ts` : fil fermé, message
 * inconnu, ou message qui se dit d'une AUTRE conversation que celle que la
 * charge nomme ⇒ rien ne change — ni le compte, ni « ma réaction ».
 */
export function isMessageReactionUpdate(payload: unknown): payload is ReactionUpdateEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.messageId !== 'string' || typeof p.conversationId !== 'string' || typeof p.emoji !== 'string') {
    return false;
  }
  if (p.action !== 'add' && p.action !== 'remove') return false;
  if (p.userId !== undefined && typeof p.userId !== 'string') return false;
  const aggregation = p.aggregation;
  if (typeof aggregation !== 'object' || aggregation === null) return false;
  const a = aggregation as Record<string, unknown>;
  return a.emoji === p.emoji && typeof a.count === 'number' && Number.isFinite(a.count) && a.count >= 0;
}

const withCount = (message: Message, emoji: string, count: number): Message => {
  const current = message.reactionSummary ?? {};
  if ((current[emoji] ?? 0) === count) return message;
  const { [emoji]: _dropped, ...rest } = current;
  return { ...message, reactionSummary: count === 0 ? rest : { ...rest, [emoji]: count } };
};

export function applyMessageReactionUpdate(
  queryClient: QueryClient,
  data: ReactionUpdateEventData,
  viewerId: string,
): void {
  const existing = findCachedThreadMessage(queryClient, data.conversationId, data.messageId);
  if (existing === undefined || existing.conversationId !== data.conversationId) return;

  const next = withCount(existing, data.emoji, data.aggregation.count);
  if (next !== existing) {
    patchThreadMessages(queryClient, data.conversationId, (messages) =>
      messages.map((m) => (m.id === data.messageId ? next : m)),
    );
  }

  if (data.userId === undefined || data.userId !== viewerId) return;
  if (data.action === 'add') reactionStore.getState().add(data.messageId, data.emoji);
  else reactionStore.getState().remove(data.messageId, data.emoji);
}
