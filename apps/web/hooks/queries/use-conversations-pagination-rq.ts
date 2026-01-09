/**
 * Hook de pagination des conversations utilisant React Query
 * Drop-in replacement pour useConversationsPagination
 *
 * Avantages:
 * - Cache automatique via React Query
 * - Sync avec Socket.IO via useSocketCacheSync
 * - Pas de re-fetch automatique (staleTime: Infinity)
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfiniteConversationsQuery } from './use-conversations-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation } from '@meeshy/shared/types';

interface UseConversationsPaginationRQOptions {
  limit?: number;
  enabled?: boolean;
}

interface UseConversationsPaginationRQResult {
  conversations: Conversation[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  setConversations: (updater: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
}

export function useConversationsPaginationRQ(
  options: UseConversationsPaginationRQOptions = {}
): UseConversationsPaginationRQResult {
  const { limit = 20, enabled = true } = options;
  const queryClient = useQueryClient();

  // Utiliser le hook React Query
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteConversationsQuery({ limit, enabled });

  // Extraire les conversations depuis les pages
  const conversations = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.conversations);
  }, [data?.pages]);

  // Load more function
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Refresh function
  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // SetConversations - mise à jour directe du cache React Query
  // Compatible avec l'API existante qui utilise setState
  const setConversations = useCallback((
    updater: Conversation[] | ((prev: Conversation[]) => Conversation[])
  ) => {
    queryClient.setQueryData(
      queryKeys.conversations.infinite(),
      (old: typeof data) => {
        if (!old) return old;

        // Extraire les conversations actuelles
        const currentConversations = old.pages.flatMap(page => page.conversations);

        // Appliquer l'updater
        const newConversations = typeof updater === 'function'
          ? updater(currentConversations)
          : updater;

        // Reconstruire la structure de pages
        // On met tout dans la première page pour simplifier
        return {
          pages: [{
            conversations: newConversations,
            pagination: {
              total: newConversations.length,
              offset: 0,
              limit: newConversations.length,
              hasMore: old.pages[old.pages.length - 1]?.pagination?.hasMore ?? false,
            },
          }],
          pageParams: old.pageParams.slice(0, 1),
        };
      }
    );
  }, [queryClient]);

  return {
    conversations,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    error: error as Error | null,
    hasMore: hasNextPage ?? false,
    loadMore,
    refresh,
    setConversations,
  };
}
