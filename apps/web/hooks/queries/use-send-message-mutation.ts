import { useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from '@/services/conversations.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import type { Conversation, SendMessageRequest } from '@meeshy/shared/types';

interface SendMessageParams {
  conversationId: string;
  data: SendMessageRequest;
}

interface OptimisticMessage {
  id: string;
  conversationId: string;
  content: string;
  senderId?: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  isEdited: boolean;
  messageType: string;
  originalLanguage: string;
  translations: never[];
  status: 'sending' | 'sent' | 'failed';
  sender?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
}

interface MessagePage {
  messages: unknown[];
  hasMore: boolean;
  total: number;
}

interface InfiniteMessagesData {
  pages: MessagePage[];
  pageParams: number[];
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: ({ conversationId, data }: SendMessageParams) =>
      conversationsService.sendMessage(conversationId, data),

    onMutate: async ({ conversationId, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.messages.infinite(conversationId),
      });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId)
      );

      // Create an optimistic message
      const optimisticMessage: OptimisticMessage = {
        id: `temp-${Date.now()}`,
        conversationId,
        content: data.content,
        messageType: 'text',
        originalLanguage: currentUser?.systemLanguage || 'en',
        senderId: currentUser?.id,
        sender: currentUser
          ? {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName || currentUser.username,
              avatar: currentUser.avatar,
            }
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        isEdited: false,
        translations: [],
        status: 'sending',
      };

      // Optimistically update the messages cache
      queryClient.setQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId),
        (old) => {
          if (!old) {
            return {
              pages: [
                { messages: [optimisticMessage], hasMore: false, total: 1 },
              ],
              pageParams: [1],
            };
          }
          return {
            ...old,
            pages: old.pages.map((page, index) =>
              index === 0
                ? { ...page, messages: [optimisticMessage, ...page.messages] }
                : page
            ),
          };
        }
      );

      // Update the conversation's lastMessage
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) =>
          old?.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  lastMessageAt: optimisticMessage.createdAt,
                }
              : conv
          )
      );

      // Return context for rollback
      return { previousMessages, optimisticMessage };
    },

    onError: (_error, { conversationId }, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          queryKeys.messages.infinite(conversationId),
          context.previousMessages
        );
      }
    },

    onSuccess: (sentMessage, { conversationId }, context) => {
      // Replace the optimistic message with the real one
      queryClient.setQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg: unknown) => {
                const message = msg as { id: string };
                return message.id === context?.optimisticMessage?.id
                  ? sentMessage
                  : msg;
              }),
            })),
          };
        }
      );

      // Update the conversation's lastMessage with the real message
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) =>
          old?.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  lastMessageAt: (sentMessage as { createdAt?: Date }).createdAt || new Date(),
                }
              : conv
          )
      );

      // Invalidate conversations lists (nouveau message = conversation modifiée)
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
    },

    onSettled: (_data, _error, { conversationId }) => {
      // Always refetch after error or success to ensure cache is in sync
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.list(conversationId),
      });
    },
  });
}

export function useEditMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
      content,
    }: {
      conversationId: string;
      messageId: string;
      content: string;
    }) => meeshySocketIOService.editMessage(messageId, content),

    onMutate: async ({ conversationId, messageId, content }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.messages.infinite(conversationId),
      });

      const previousMessages = queryClient.getQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId)
      );

      queryClient.setQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg: unknown) => {
                const message = msg as { id: string; content: string; updatedAt?: Date };
                return message.id === messageId
                  ? { ...message, content, updatedAt: new Date() }
                  : msg;
              }),
            })),
          };
        }
      );

      return { previousMessages };
    },

    onError: (_error, { conversationId }, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          queryKeys.messages.infinite(conversationId),
          context.previousMessages
        );
      }
    },

    onSuccess: () => {
      // Invalidate conversations lists (message édité = conversation modifiée)
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
    },
  });
}

export function useDeleteMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => meeshySocketIOService.deleteMessage(messageId),

    onMutate: async ({ conversationId, messageId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.messages.infinite(conversationId),
      });

      const previousMessages = queryClient.getQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId)
      );

      queryClient.setQueryData<InfiniteMessagesData>(
        queryKeys.messages.infinite(conversationId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((msg: unknown) => {
                const message = msg as { id: string };
                return message.id !== messageId;
              }),
            })),
          };
        }
      );

      return { previousMessages };
    },

    onError: (_error, { conversationId }, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(
          queryKeys.messages.infinite(conversationId),
          context.previousMessages
        );
      }
    },

    onSuccess: () => {
      // Invalidate conversations lists (message supprimé = conversation modifiée)
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.lists() });
    },
  });
}

export function useMarkAsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      conversationsService.markAsRead(conversationId),

    onSuccess: (_, conversationId) => {
      // Update the conversation's unread count
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) =>
          old?.map((conv) =>
            conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
          )
      );
    },
  });
}
