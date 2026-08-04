/**
 * Écriture centralisée du compteur non-lu d'une conversation dans les DEUX
 * caches React Query : la liste plate (`conversations.lists()`) et le cache
 * infinite (`conversations.infinite()`, celui que lit la sidebar).
 *
 * Consommateurs : le handler socket `conversation:unread-updated` (après garde
 * de conversation active) et le reset optimiste à l'ouverture d'une
 * conversation. La structure de pages du cache infinite est préservée telle
 * quelle — seule la valeur `unreadCount` change, jamais la composition.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@meeshy/shared/types';

type InfiniteConversationData = {
  pages: { conversations: Conversation[]; pagination: unknown }[];
  pageParams: unknown[];
};

export function setConversationUnreadInCache(
  queryClient: QueryClient,
  conversationId: string,
  unreadCount: number
): void {
  queryClient.setQueriesData<Conversation[]>(
    { queryKey: queryKeys.conversations.lists() },
    (old) =>
      old?.map((conv) =>
        conv.id === conversationId ? { ...conv, unreadCount } : conv
      )
  );

  queryClient.setQueryData(
    queryKeys.conversations.infinite(),
    (old: InfiniteConversationData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          conversations: page.conversations.map((conv) =>
            conv.id === conversationId ? { ...conv, unreadCount } : conv
          ),
        })),
      };
    }
  );
}
