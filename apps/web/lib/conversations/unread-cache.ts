/**
 * Écriture centralisée du compteur non-lu d'une conversation dans
 * `conversations.infinite()` — le SEUL cache de liste que l'application lit.
 *
 * Consommateurs : le handler socket `conversation:unread-updated` (après garde
 * de conversation active) et le reset optimiste à l'ouverture d'une
 * conversation. La structure de pages est préservée telle quelle — seule la
 * valeur `unreadCount` change, jamais la composition.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

type InfiniteConversationData = {
  pages: { conversations: Conversation[]; pagination: unknown }[];
  pageParams: unknown[];
};

/**
 * Le pont ✦ à écrire À CÔTÉ du compteur, si l'appelant en a un à recopier.
 *
 * Objet-enveloppe plutôt qu'un 4e paramètre `ConversationBridge | undefined`
 * nu : un pont nu ne distingue pas « je ne sais rien du pont, laisse celui du
 * cache tel quel » de « voici ce que le serveur vient d'annoncer, l'absence de
 * pont incluse ». L'enveloppe absente dit le premier, l'enveloppe présente le
 * second.
 *
 * Cette signature était déjà la bonne — c'est son APPELANT qui, jusqu'au
 * cycle 63, passait toujours une enveloppe. Le relais socket (REV-5/B1) la
 * fournissait même quand le fil ne portait aucun `bridge`, si bien que tout
 * émetteur serveur qui n'avait pas calculé son pont en ordonnait l'effacement.
 * Le troisième état vit maintenant sur le fil (`bridge` absent ≠ `bridge:
 * null`, cf. `ConversationUnreadUpdatedEventData`), et le handler ne construit
 * l'enveloppe que lorsque la clé est là.
 *
 * `bridge: undefined` DANS l'enveloppe reste donc un ordre d'effacement — la
 * traduction du `null` du fil. Jumeau de `ConversationSyncEngine
 * .handleUnreadUpdated` côté iOS.
 */
export interface BridgeCacheUpdate {
  readonly bridge: ConversationBridge | undefined;
}

export function setConversationUnreadInCache(
  queryClient: QueryClient,
  conversationId: string,
  unreadCount: number,
  bridgeUpdate?: BridgeCacheUpdate
): void {
  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          conversations: page.conversations.map((conv) =>
            conv.id === conversationId
              ? { ...conv, unreadCount, ...(bridgeUpdate ? { bridge: bridgeUpdate.bridge } : {}) }
              : conv
          ),
        })),
      };
    }
  );
}
