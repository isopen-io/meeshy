import type { QueryClient } from '@tanstack/react-query';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { applyEncryptionAnnounced } from '@/lib/api/realtime-encryption-regime';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { encryptionRegime } from './conversation-encryption-explanation';
import { decodeEncryptionStatus, switchConversationEncryption, type EncryptionModeSwitchGesture } from './conversation-encryption-switch';

/**
 * **LE GESTE « CHANGER DE MODE », CÂBLÉ** (#14648) — `GET encryption-status`
 * pour le droit servi (`canToggleEncryption`, appartenance et rôle compris) et
 * `POST encryption` pour la bascule. Le mode servi entre dans les caches de la
 * liste et du détail par `applyEncryptionAnnounced`, qui ne rouvre jamais le
 * clair ; un état servi `e2ee` scelle la conversation pour ce compte (#12949).
 * Aucune passerelle en fixtures : la fiche explique, sans geste.
 */
export function encryptionModeSwitchGesture(params: {
  readonly deps: ConversationsDeps;
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly online: () => boolean;
}): EncryptionModeSwitchGesture | undefined {
  const { deps, queryClient, conversationId } = params;
  if (deps.source !== 'gateway') return undefined;
  return {
    readStatus: async () => {
      const result = await deps.transport
        .request<unknown>({ method: 'GET', path: conversationsEndpoints.byConversationIdEncryptionStatus(conversationId) })
        .catch(() => null);
      if (result === null || !result.ok) return null;
      const status = decodeEncryptionStatus(result.data);
      if (status !== null && encryptionRegime(status.mode) === 'end-to-end') {
        endToEndRegimeLedger.getState().learnEndToEnd(conversationId);
        applyEncryptionAnnounced(queryClient, conversationId, 'e2ee');
      }
      return status;
    },
    switchTo: ({ servedMode, target }) =>
      switchConversationEncryption(
        {
          online: params.online,
          post: (mode) => deps.transport.request<unknown>({ method: 'POST', path: conversationsEndpoints.byConversationIdEncryption(conversationId), body: { mode } }),
          learn: (mode) => applyEncryptionAnnounced(queryClient, conversationId, mode),
        },
        { conversationId, servedMode, target },
      ),
  };
}
