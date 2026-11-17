import type { QueryClient } from '@tanstack/react-query';

import { patchConversation, patchConversationDetail } from './conversations';
import type { Conversation } from './types';

/**
 * **L'EFFECTIF D'UN GROUPE SUIT LES ARRIVÉES ET LES DÉPARTS** (#18914, WEB-14)
 * — `conversation:participant-joined` / `-left` / `-banned`, de n'importe quel
 * membre, sur la ligne de liste et la fiche du fil. Seule la feuille de
 * détails ouverte les écoutait (`conversation-members-live.ts`).
 *
 * Le contrat (`socketio-events/participant.ts`) sert l'effectif ACTIF APRÈS le
 * geste, ABSOLU — « à POSER, pas à incrémenter » : un delta ne converge pas
 * après un événement manqué, un total se rattrape au suivant. Il voyage avec
 * `memberCountCapped` (« 199+ »), posé quand servi, ABSENT quand l'effectif
 * est exact. L'incrément n'est que le repli d'une passerelle antérieure à ce
 * contrat ; un bannissement qui n'a retiré personne (`membershipEnded: false`)
 * n'en retire pas. FAIL-CLOSED : une charge sans conversation ne touche rien.
 */
export type MembershipChange = 'joined' | 'left' | 'banned';

type MemberCountChange =
  | { readonly conversationId: string; readonly served: { readonly memberCount: number; readonly capped: boolean } }
  | { readonly conversationId: string; readonly delta: 1 | -1 };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function fallbackDelta(payload: Readonly<Record<string, unknown>>, change: MembershipChange): 1 | -1 | 0 {
  if (change === 'joined') return 1;
  if (change === 'banned' && payload.membershipEnded === false) return 0;
  return -1;
}

export function memberCountChangeOf(payload: unknown, change: MembershipChange): MemberCountChange | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Readonly<Record<string, unknown>>;
  if (typeof p.conversationId !== 'string' || p.conversationId === '') return null;
  if (isCount(p.memberCount)) return { conversationId: p.conversationId, served: { memberCount: p.memberCount, capped: p.memberCountCapped === true } };
  const delta = fallbackDelta(p, change);
  return delta === 0 ? null : { conversationId: p.conversationId, delta };
}

function withServedCount(conversation: Conversation, served: { readonly memberCount: number; readonly capped: boolean }): Conversation {
  const { memberCountCapped: _exact, ...rest } = conversation;
  return served.capped ? { ...rest, memberCount: served.memberCount, memberCountCapped: true } : { ...rest, memberCount: served.memberCount };
}

export function applyMemberCountChange(queryClient: QueryClient, change: MemberCountChange): void {
  const edit =
    'served' in change
      ? (conversation: Conversation): Conversation => withServedCount(conversation, change.served)
      : (conversation: Conversation): Conversation => ({ ...conversation, memberCount: Math.max(0, (conversation.memberCount ?? 0) + change.delta) });
  patchConversation(queryClient, change.conversationId, edit);
  patchConversationDetail(queryClient, change.conversationId, edit);
}
