import type { QueryClient } from '@tanstack/react-query';
import type { MessageHiddenForMeEventData, MessageRestoredForMeEventData } from '@meeshy/shared/types/socketio-events/message';

import { rowExitStore } from '@/lib/view/row-exit-motion';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { hideRowsForReader } from './delete-message';
import { messagesQueryKey } from './messages';

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
 * L'ÉCHO D'UN REPLI EN COURS NE RETIRE PAS SA RANGÉE (#12634). La passerelle
 * diffuse AVANT de répondre en HTTP : l'appareil du geste reçoit l'événement
 * pendant que sa rangée se replie encore (`row-exit-motion.ts`). Une rangée
 * notée sortante est laissée au geste local, qui la retire à la fin du repli
 * et relit lui-même la ligne de liste ; la retirer ici la faisait disparaître
 * d'un coup, à mi-fondu.
 *
 * `message:restored-for-me` (l'inverse, #18914) relit le fil de chaque
 * conversation nommée : la charge ne porte pas le message, une APPARITION ne
 * s'écrit pas en pierre tombale (`event-names.ts`).
 */
function namesVisibilityRefs(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.userId !== 'string' || !Array.isArray(p.messages)) return false;
  return p.messages.every((ref: unknown) => {
    if (typeof ref !== 'object' || ref === null) return false;
    const r = ref as Record<string, unknown>;
    return typeof r.messageId === 'string' && typeof r.conversationId === 'string';
  });
}

export function isMessageHiddenForMeEvent(payload: unknown): payload is MessageHiddenForMeEventData {
  return namesVisibilityRefs(payload);
}

export function isMessageRestoredForMeEvent(payload: unknown): payload is MessageRestoredForMeEventData {
  return namesVisibilityRefs(payload);
}

/** Restauré pour moi sur un autre appareil : le fil de chaque conversation nommée, lui seul. FAIL-CLOSED sur le compte. */
export function applyMessageRestoredForMe(queryClient: QueryClient, data: MessageRestoredForMeEventData, viewerId: string): void {
  if (viewerId === '' || data.userId !== viewerId) return;
  for (const conversationId of new Set(data.messages.map((ref) => ref.conversationId))) {
    void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId), exact: true });
  }
}

export function applyMessageHiddenForMe(queryClient: QueryClient, data: MessageHiddenForMeEventData, viewerId: string): void {
  if (viewerId === '' || data.userId !== viewerId) return;
  const { leaving } = rowExitStore.getState();
  const refs = data.messages.filter((ref) => !leaving.has(ref.messageId));
  const conversationIds = [...new Set(refs.map((ref) => ref.conversationId))];
  const describedByList = conversationIds
    .map((conversationId) => {
      const ids = new Set(refs.filter((ref) => ref.conversationId === conversationId).map((ref) => ref.messageId));
      return hideRowsForReader(queryClient, conversationId, ids).describedByList;
    })
    .some(Boolean);
  if (describedByList) void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY, exact: true });
}
