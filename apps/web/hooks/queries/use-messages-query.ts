import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Message } from '@meeshy/shared/types';

interface UseMessagesQueryOptions {
  limit?: number;
  enabled?: boolean;
}

export function useMessagesQuery(
  conversationId: string | null | undefined,
  options: UseMessagesQueryOptions = {}
) {
  const { limit = 20, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.messages.list(conversationId ?? ''),
    queryFn: () => conversationsService.getMessages(conversationId!, 1, limit),
    // staleTime: Infinity (Socket.IO gère le temps réel)
    enabled: !!conversationId && enabled,
    select: (data) => data.messages,
  });
}

export function useInfiniteMessagesQuery(
  conversationId: string | null | undefined,
  options: UseMessagesQueryOptions = {}
) {
  const { limit = 20, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: queryKeys.messages.infinite(conversationId ?? ''),
    queryFn: ({ pageParam = 1 }) =>
      conversationsService.getMessages(conversationId!, pageParam, limit),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length + 1;
    },
    // staleTime: Infinity (Socket.IO gère le temps réel)
    enabled: !!conversationId && enabled,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      messages: data.pages.flatMap((page) => page.messages),
    }),
  });
}

export function useMessagesQueryHelpers(conversationId: string) {
  const queryClient = useQueryClient();

  const addMessageToCache = (message: Message) => {
    // Update infinite query cache
    queryClient.setQueryData(
      queryKeys.messages.infinite(conversationId),
      (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page, index) =>
            index === 0
              ? { ...page, messages: [message, ...page.messages] }
              : page
          ),
        };
      }
    );

    // Update simple query cache
    queryClient.setQueryData<Message[]>(
      queryKeys.messages.list(conversationId),
      (old) => (old ? [message, ...old] : [message])
    );
  };

  const updateMessageInCache = (messageId: string, updates: Partial<Message>) => {
    // Update infinite query cache
    queryClient.setQueryData(
      queryKeys.messages.infinite(conversationId),
      (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((msg) =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            ),
          })),
        };
      }
    );
  };

  const removeMessageFromCache = (messageId: string) => {
    // Update infinite query cache
    queryClient.setQueryData(
      queryKeys.messages.infinite(conversationId),
      (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((msg) => msg.id !== messageId),
          })),
        };
      }
    );
  };

  const invalidateMessages = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.messages.list(conversationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.messages.infinite(conversationId) });
  };

  return {
    addMessageToCache,
    updateMessageInCache,
    removeMessageFromCache,
    invalidateMessages,
  };
}
