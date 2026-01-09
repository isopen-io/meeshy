import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Conversation, CreateConversationRequest } from '@meeshy/shared/types';

interface ConversationsFilters {
  type?: string;
  search?: string;
}

interface UseConversationsQueryOptions {
  limit?: number;
  offset?: number;
  filters?: ConversationsFilters;
  enabled?: boolean;
}

export function useConversationsQuery(options: UseConversationsQueryOptions = {}) {
  const { limit = 20, offset = 0, filters, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.conversations.list(filters),
    queryFn: () => conversationsService.getConversations({ limit, offset, skipCache: true }),
    // staleTime: Infinity (défini globalement dans QueryClient)
    enabled,
    select: (data) => data.conversations,
  });
}

export function useConversationsWithPagination(options: UseConversationsQueryOptions = {}) {
  const { limit = 20, offset = 0, filters, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.conversations.list(filters),
    queryFn: () => conversationsService.getConversations({ limit, offset, skipCache: true }),
    // staleTime: Infinity (défini globalement dans QueryClient)
    enabled,
  });
}

export function useConversationQuery(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId ?? ''),
    queryFn: () => conversationsService.getConversation(conversationId!),
    // staleTime: Infinity (défini globalement dans QueryClient)
    enabled: !!conversationId,
  });
}

interface UseInfiniteConversationsOptions {
  limit?: number;
  filters?: ConversationsFilters;
  enabled?: boolean;
}

export function useInfiniteConversationsQuery(options: UseInfiniteConversationsOptions = {}) {
  const { limit = 20, filters, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.conversations.infinite(),
    queryFn: ({ pageParam = 0 }) =>
      conversationsService.getConversations({
        limit,
        offset: pageParam,
        skipCache: pageParam > 0, // Cache uniquement la première page
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination.hasMore) return undefined;
      return lastPage.pagination.offset + lastPage.pagination.limit;
    },
    enabled,
  });
}

export function useCreateConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateConversationRequest) =>
      conversationsService.createConversation(data),
    onSuccess: (newConversation) => {
      // Invalidate and refetch conversations list
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() });

      // Optionally add to cache directly
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) => (old ? [newConversation, ...old] : [newConversation])
      );
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      conversationsService.deleteConversation(conversationId),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) => old?.filter((conv) => conv.id !== deletedId)
      );

      // Remove the detail query
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(deletedId) });

      // Invalidate to be sure
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
    },
  });
}
