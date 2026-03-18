'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { apiService } from '@/services/api.service';
import { useAuthStore } from '@/stores/auth-store';
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

          // Single-pass: ID dedup + own-message optimistic replacement
          const currentUser = useAuthStore.getState().user;
          const isOwnMessage = currentUser && message.senderId === currentUser.id;
          let optimisticTempId: string | null = null;

          for (const page of old.pages) {
            for (const m of page.messages) {
              if (m.id === message.id) return old; // already have this server message
              // If own message:new arrives while optimistic is still 'sending', replace it
              // Match by content to avoid cross-replacing when multiple messages are sending
              if (isOwnMessage && !optimisticTempId && (m as any)._tempId && (m as any)._localStatus === 'sending'
                  && m.content === message.content) {
                optimisticTempId = (m as any)._tempId;
              }
            }
          }

          // Replace optimistic if found (prevents duplicate when message:new arrives before ACK)
          if (optimisticTempId) {
            return {
              ...old,
              pages: old.pages.map(page => ({
                ...page,
                messages: page.messages.map(m =>
                  (m as any)._tempId === optimisticTempId ? message : m
                ),
              })),
            };
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

      // Update conversations list with latest message AND move to top (single pass)
      queryClient.setQueryData<Conversation[]>(
        queryKeys.conversations.list(),
        (old) => {
          if (!old) return old;

          let updated: Conversation | null = null;
          const rest: Conversation[] = [];
          for (const conv of old) {
            if (conv.id === targetConversationId) {
              updated = {
                ...conv,
                lastMessage: message,
                lastMessageAt: message.createdAt,
                updatedAt: message.createdAt,
              };
            } else {
              rest.push(conv);
            }
          }

          if (!updated) return old;
          return [updated, ...rest];
        }
      );

      // DO NOT invalidate here - setQueryData already has the correct lastMessage
      // Invalidating would trigger a re-fetch that could return stale data from backend cache
      // The backend may not have processed the message yet when we re-fetch

      // Auto mark-as-received for messages from other users
      // senderId is now always a User ID (resolved in message converters)
      const currentUser = useAuthStore.getState().user;
      if (currentUser && message.senderId !== currentUser.id && /^[a-f\d]{24}$/i.test(message.conversationId)) {
        apiService.post(`/conversations/${message.conversationId}/mark-as-received`)
          .catch(() => {}); // Non-critical, fire-and-forget
      }
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
      } else {
        // No conversationId available — invalidate all message queries so stale
        // data is refetched. This handles the case where delete events arrive
        // without a conversationId context.
        queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
      }
    };

    // Handler for message translations — merges as Translation[] array (not Record)
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

                // Merge translations as array, dedup by targetLanguage
                const existingTranslations = Array.isArray(m.translations) ? [...m.translations] : [];
                for (const t of data.translations) {
                  const targetLang = (t as any).language || t.targetLanguage;
                  const idx = existingTranslations.findIndex((et: any) =>
                    ((et as any).language || et.targetLanguage) === targetLang
                  );
                  if (idx >= 0) existingTranslations[idx] = t;
                  else existingTranslations.push(t);
                }

                return {
                  ...m,
                  translations: existingTranslations,
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
    const unsubscribeUnread = meeshySocketIOService.onUnreadUpdated(handleUnreadUpdated);

    // Cleanup on unmount
    return () => {
      unsubscribeMessage?.();
      unsubscribeEdit?.();
      unsubscribeDelete?.();
      unsubscribeTranslation?.();
      unsubscribeUnread?.();
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
