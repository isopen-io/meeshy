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
 * Le pont ✦ à écrire À CÔTÉ du compteur, si l'appelant en a un à annoncer.
 *
 * Objet-enveloppe plutôt qu'un 4e paramètre `ConversationBridge | undefined`
 * nu : un pont nu ne distingue pas « je ne sais rien du pont, laisse celui du
 * cache tel quel » (l'enveloppe ABSENTE — repli implicite d'un
 * `ConversationLayout`/`bubble-stream-page` qui ne remet que `unreadCount` à 0
 * à l'ouverture, et du relais socket quand le serveur n'a pas calculé) de
 * « voici la réponse du serveur pour ce pont, `undefined` inclus »
 * (l'enveloppe PRÉSENTE, qui efface).
 *
 * Cette distinction est la MÊME que celle des trois états du wire
 * (`ConversationUnreadUpdatedEventData.bridge`, cycle 63) ; le relais socket
 * la traduit d'un vocabulaire à l'autre :
 *
 *   wire `bridge: {…}`  → `{ bridge }`         ⇒ écrit
 *   wire `bridge: null` → `{ bridge: undefined }` ⇒ efface
 *   wire clé absente    → enveloppe absente     ⇒ garde
 *
 * Jumeau de `ConversationSyncEngine.handleUnreadUpdated` côté iOS, qui tient
 * la même règle sur `BridgeAnnouncement`.
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
