'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { Message, Conversation } from '@/types';
import type { TranslationEvent } from '@meeshy/shared/types';

interface UseSocketCacheSyncOptions {
  conversationId?: string | null;
  enabled?: boolean;
}

export function useSocketCacheSync(options: UseSocketCacheSyncOptions = {}) {
  const { conversationId, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Handler for new messages
    const handleNewMessage = (message: Message) => {
      const targetConversationId = message.conversationId;

      // Update infinite messages query
      queryClient.setQueryData(
        queryKeys.messages.infinite(targetConversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;

          // Check if message already exists
          const allMessages = old.pages.flatMap((page) => page.messages);
          if (allMessages.some((m) => m.id === message.id)) {
            return old;
          }

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

      // Update simple messages list
      queryClient.setQueryData<Message[]>(
        queryKeys.messages.list(targetConversationId),
        (old) => {
          if (!old) return [message];
          if (old.some((m) => m.id === message.id)) return old;
          return [message, ...old];
        }
      );

      // Update conversations list with latest message AND move to top
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) => {
          if (!old) return old;

          const conversationIndex = old.findIndex(conv => conv.id === targetConversationId);
          if (conversationIndex === -1) return old;

          const conversation = old[conversationIndex];
          const updatedConversation = {
            ...conversation,
            lastMessage: message,
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
          };

          // Move conversation to top of list
          const otherConversations = old.filter((_, idx) => idx !== conversationIndex);
          return [updatedConversation, ...otherConversations];
        }
      );

      // DO NOT invalidate here - setQueryData already has the correct lastMessage
      // Invalidating would trigger a re-fetch that could return stale data from backend cache
      // The backend may not have processed the message yet when we re-fetch
    };

    // Handler for edited messages
    const handleMessageEdited = (message: Message) => {
      const targetConversationId = message.conversationId;

      queryClient.setQueryData(
        queryKeys.messages.infinite(targetConversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === message.id ? { ...m, ...message } : m
              ),
            })),
          };
        }
      );

      // Update lastMessage if this edited message is the last one
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) => {
          if (!old) return old;
          return old.map((conv) => {
            if (conv.id === targetConversationId && conv.lastMessage?.id === message.id) {
              return { ...conv, lastMessage: message };
            }
            return conv;
          });
        }
      );
    };

    // Handler for deleted messages
    const handleMessageDeleted = (messageId: string) => {
      // We need to find which conversation this message belongs to
      // For now, update messages if we have a conversationId
      if (conversationId) {
        queryClient.setQueryData(
          queryKeys.messages.infinite(conversationId),
          (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.filter((m) => m.id !== messageId),
              })),
            };
          }
        );
      }

      // Note: If the deleted message was the lastMessage of a conversation,
      // we would need to fetch the new lastMessage. For now, the conversation
      // will show the deleted message until next refresh. This is acceptable
      // since message deletion is rare. A full refresh would be needed to get
      // the previous message as the new lastMessage.
    };

    // Handler for message translations
    const handleTranslation = (data: TranslationEvent) => {
      if (!conversationId) return;

      queryClient.setQueryData(
        queryKeys.messages.infinite(conversationId),
        (old: { pages: { messages: Message[]; hasMore: boolean; total: number }[]; pageParams: number[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== data.messageId) return m;

                // Build translations object from the array
                const newTranslations = data.translations.reduce((acc, t) => ({
                  ...acc,
                  [t.targetLanguage]: t.translatedContent,
                }), m.translations || {});

                return {
                  ...m,
                  translations: newTranslations,
                };
              }),
            })),
          };
        }
      );
    };

    // Handler for unread count updates
    const handleUnreadUpdated = (data: { conversationId: string; unreadCount: number }) => {
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) =>
          old?.map((conv) =>
            conv.id === data.conversationId
              ? { ...conv, unreadCount: data.unreadCount }
              : conv
          )
      );
    };

    // Register listeners
    const unsubscribeMessage = meeshySocketIOService.onNewMessage(handleNewMessage);
    const unsubscribeEdit = meeshySocketIOService.onMessageEdited(handleMessageEdited);
    const unsubscribeDelete = meeshySocketIOService.onMessageDeleted(handleMessageDeleted);
    const unsubscribeTranslation = meeshySocketIOService.onTranslation(handleTranslation);

    // Cleanup on unmount
    return () => {
      unsubscribeMessage?.();
      unsubscribeEdit?.();
      unsubscribeDelete?.();
      unsubscribeTranslation?.();
    };
  }, [conversationId, enabled, queryClient]);
}

/**
 * Hook to invalidate queries on reconnect.
 * Note: React Query's refetchOnReconnect: 'always' already handles most cases.
 * This hook provides additional invalidation for socket reconnection.
 */
export function useInvalidateOnReconnect() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for online events as a proxy for reconnection
    const handleOnline = () => {
      // Invalidate all queries on reconnect to ensure fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient]);
}
