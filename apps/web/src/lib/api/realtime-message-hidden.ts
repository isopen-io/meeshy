import type { QueryClient } from '@tanstack/react-query';
import type { MessageHiddenForMeEventData } from '@meeshy/shared/types/socketio-events/message';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { hideRowsForReader } from './delete-message';

/**
 * LE PUITS DE `message:hidden-for-me` (#10587) — un message masqué « pour moi »
 * sur un autre appareil quitte le fil de celui-ci sans rechargement. La
 * passerelle l'émet vers la salle `user:<id>` du lecteur, en UN lot pour tout
 * le geste (`services/gateway/src/services/personalMessageVisibilitySync.ts`).
 *
 * Les rangées retirées sont celles du geste local (`hideRowsForReader`,
 * `delete-message.ts`) : le fil et l'écran des médias de la conversation que
 * l'événement NOMME, jamais une autre. Aucune pierre tombale — pour ce
 * lecteur, le message n'existe plus ; pour les autres, rien n'a changé.
 *
 * FAIL-CLOSED : l'événement nomme son compte, et un autre compte que celui de
 * la session ne retire rien. Rejoué (l'appareil qui a fait le geste le reçoit
 * aussi), il ne change rien — les rangées sont déjà parties.
 *
 * `message:restored-for-me` (l'inverse) n'est pas écouté : le web n'offre pas
 * ce geste, et la rangée revient au prochain chargement du fil.
 */
export function isMessageHiddenForMeEvent(payload: unknown): payload is MessageHiddenForMeEventData {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.userId !== 'string' || !Array.isArray(p.messages)) return false;
  return p.messages.every((ref: unknown) => {
    if (typeof ref !== 'object' || ref === null) return false;
    const r = ref as Record<string, unknown>;
    return typeof r.messageId === 'string' && typeof r.conversationId === 'string';
  });
}

export function applyMessageHiddenForMe(queryClient: QueryClient, data: MessageHiddenForMeEventData, viewerId: string): void {
  if (viewerId === '' || data.userId !== viewerId) return;
  const conversationIds = [...new Set(data.messages.map((ref) => ref.conversationId))];
  const describedByList = conversationIds
    .map((conversationId) => {
      const ids = new Set(data.messages.filter((ref) => ref.conversationId === conversationId).map((ref) => ref.messageId));
      return hideRowsForReader(queryClient, conversationId, ids).describedByList;
    })
    .some(Boolean);
  if (describedByList) void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });
}
