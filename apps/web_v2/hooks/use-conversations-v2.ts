/**
 * Hook for V2 Conversations Management
 *
 * Combines React Query + WebSocket for real-time conversation updates.
 * Drop-in replacement for mockConversations in /v2/chats page.
 */

'use client';

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useInfiniteConversationsQuery,
  useConversationQuery,
} from '@/hooks/queries/use-conversations-query';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import {
  transformToConversationItem,
  groupConversationsByCategory,
  type TransformConversationOptions,
} from '@/utils/transform-conversation';
import type { Conversation, Message, TypingEvent, UserStatusEvent } from '@meeshy/shared/types';
import type { ConversationItemData } from '@/components';

export interface UseConversationsV2Options {
  enabled?: boolean;
  limit?: number;
  currentUserId?: string;
}

export interface ConversationsV2Return {
  // Raw data
  conversations: Conversation[];
  currentConversation: Conversation | null;

  // Transformed data for V2 components
  conversationItems: ConversationItemData[];

  // Grouped data
  pinnedConversations: ConversationItemData[];
  categorizedConversations: Map<string, ConversationItemData[]>;
  uncategorizedConversations: ConversationItemData[];

  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;

  // Pagination
  hasMore: boolean;
  loadMore: () => Promise<void>;

  // Actions
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;

  // Real-time
  isConnected: boolean;
  typingUsers: Map<string, Set<string>>;
  onlineUsers: Set<string>;

  // Error
  error: string | null;
}

export function useConversationsV2(
  selectedId: string | null,
  options: UseConversationsV2Options = {}
): ConversationsV2Return {
  const { enabled = true, limit = 20, currentUserId } = options;
  const queryClient = useQueryClient();

  // Track typing and online users
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Query for conversations list
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteConversationsQuery({
    limit,
    enabled,
  });

  // Query for selected conversation detail
  const { data: currentConversation, isLoading: isLoadingCurrent } =
    useConversationQuery(selectedId);

  // Handle new message to update lastMessage in list
  const handleNewMessage = useCallback(
    (message: Message) => {
      queryClient.setQueryData(queryKeys.conversations.infinite(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            conversations: page.conversations.map((conv: Conversation) =>
              conv.id === message.conversationId
                ? {
                    ...conv,
                    lastMessage: message,
                    lastMessageAt: message.createdAt,
                    unreadCount:
                      message.senderId !== currentUserId
                        ? (conv.unreadCount ?? 0) + 1
                        : conv.unreadCount,
                  }
                : conv
            ),
          })),
        };
      });
    },
    [queryClient, currentUserId]
  );

  // Handle typing events
  const handleTyping = useCallback((event: TypingEvent) => {
    setTypingUsers((prev) => {
      const next = new Map(prev);
      const conversationTyping = next.get(event.conversationId) || new Set();

      if ((event as any).isTyping) {
        conversationTyping.add(event.userId);
      } else {
        conversationTyping.delete(event.userId);
      }

      if (conversationTyping.size > 0) {
        next.set(event.conversationId, conversationTyping);
      } else {
        next.delete(event.conversationId);
      }

      return next;
    });
  }, []);

  // Handle user status events
  const handleUserStatus = useCallback((event: UserStatusEvent) => {
    setOnlineUsers((prev) => {
      const next = new Set(prev);
      if (event.isOnline) {
        next.add(event.userId);
      } else {
        next.delete(event.userId);
      }
      return next;
    });
  }, []);

  // WebSocket for real-time updates (only when a conversation is selected)
  const { isConnected } = useWebSocket({
    conversationId: selectedId,
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
    onUserStatus: handleUserStatus,
  });

  // Extract conversations from all pages
  const conversations = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.conversations);
  }, [data?.pages]);

  // Get typing user IDs for current conversation
  const currentTypingUserIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return typingUsers.get(selectedId) || new Set<string>();
  }, [selectedId, typingUsers]);

  // Transform options
  const transformOptions: TransformConversationOptions = useMemo(
    () => ({
      currentUserId,
      onlineUserIds: onlineUsers,
      typingUserIds: currentTypingUserIds,
    }),
    [currentUserId, onlineUsers, currentTypingUserIds]
  );

  // Transform conversations to V2 format
  const conversationItems = useMemo(() => {
    return conversations.map((conv) => {
      // Get typing users for this specific conversation
      const convTypingUsers = typingUsers.get(conv.id) || new Set<string>();
      return transformToConversationItem(conv, {
        ...transformOptions,
        typingUserIds: convTypingUsers,
      });
    });
  }, [conversations, transformOptions, typingUsers]);

  // Group conversations
  const grouped = useMemo(() => {
    return groupConversationsByCategory(conversationItems);
  }, [conversationItems]);

  // Actions
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refreshConversations = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const selectConversation = useCallback(
    (id: string) => {
      // Prefetch conversation detail
      queryClient.prefetchQuery({
        queryKey: queryKeys.conversations.detail(id),
      });

      // Mark as read when selecting
      const conv = conversations.find((c) => c.id === id);
      if (conv && (conv.unreadCount ?? 0) > 0) {
        queryClient.setQueryData(queryKeys.conversations.infinite(), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              conversations: page.conversations.map((c: Conversation) =>
                c.id === id ? { ...c, unreadCount: 0 } : c
              ),
            })),
          };
        });
      }
    },
    [queryClient, conversations]
  );

  return {
    conversations,
    currentConversation: currentConversation ?? null,
    conversationItems,
    pinnedConversations: grouped.pinned,
    categorizedConversations: grouped.categorized,
    uncategorizedConversations: grouped.uncategorized,
    isLoading: isLoading || isLoadingCurrent,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    loadMore,
    selectConversation,
    refreshConversations,
    isConnected,
    typingUsers,
    onlineUsers,
    error: error?.message ?? null,
  };
}
