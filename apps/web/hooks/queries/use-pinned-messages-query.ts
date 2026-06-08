'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { messagesService } from '@/services/conversations/messages.service';
import type { Message } from '@meeshy/shared/types';

export function usePinnedMessagesQuery(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.messages.pinned(conversationId ?? ''),
    queryFn: () => messagesService.getPinnedMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePinMessageMutation(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messagesService.pinMessage(conversationId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.pinned(conversationId) });
    },
  });
}

export function useUnpinMessageMutation(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messagesService.unpinMessage(conversationId, messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messages.pinned(conversationId) });
      const previous = queryClient.getQueryData<Message[]>(queryKeys.messages.pinned(conversationId));
      queryClient.setQueryData<Message[]>(
        queryKeys.messages.pinned(conversationId),
        (old) => old?.filter((m) => m.id !== messageId) ?? []
      );
      return { previous };
    },
    onError: (_err, _messageId, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.messages.pinned(conversationId), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.pinned(conversationId) });
    },
  });
}
