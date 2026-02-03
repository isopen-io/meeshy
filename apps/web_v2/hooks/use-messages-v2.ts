/**
 * Hook for V2 Messages Management
 *
 * Combines React Query + WebSocket for real-time messaging.
 * Includes optimistic updates for message sending.
 */

'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useWebSocket } from '@/hooks/use-websocket';
import { conversationsService } from '@/services/conversations.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { Message, User, TypingEvent } from '@meeshy/shared/types';

export interface UseMessagesV2Options {
  enabled?: boolean;
  limit?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onNewMessage?: (message: Message) => void;
}

export interface SendMessageOptions {
  replyToId?: string;
  attachmentIds?: string[];
  language?: string;
}

export interface MessagesV2Return {
  // Data
  messages: Message[];

  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;
  isSending: boolean;

  // Pagination
  hasMore: boolean;
  loadMore: () => Promise<void>;

  // Actions
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;

  // Typing
  typingUsers: Set<string>;
  startTyping: () => void;
  stopTyping: () => void;

  // Utils
  refresh: () => Promise<void>;
  markAsRead: () => Promise<void>;

  // Real-time status
  isConnected: boolean;

  // Error
  error: string | null;
}

export function useMessagesV2(
  conversationId: string | null,
  currentUser: User | null,
  options: UseMessagesV2Options = {}
): MessagesV2Return {
  const { enabled = true, limit = 20, containerRef, onNewMessage } = options;

  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Use existing messages hook with React Query
  const {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    addMessage,
    updateMessage,
    removeMessage,
  } = useConversationMessagesRQ(conversationId, currentUser, {
    enabled: enabled && !!conversationId,
    limit,
    containerRef,
    scrollDirection: 'up',
  });

  // Handle new message from WebSocket
  const handleNewMessage = useCallback(
    (message: Message) => {
      // Only add if not from current user (avoid duplicates from optimistic updates)
      if (message.senderId !== currentUser?.id) {
        addMessage(message);
      }
      onNewMessage?.(message);
    },
    [addMessage, currentUser?.id, onNewMessage]
  );

  // Handle message edited
  const handleMessageEdited = useCallback(
    (message: Message) => {
      updateMessage(message.id, message);
    },
    [updateMessage]
  );

  // Handle message deleted
  const handleMessageDeleted = useCallback(
    (messageId: string) => {
      removeMessage(messageId);
    },
    [removeMessage]
  );

  // Handle typing events
  const handleTyping = useCallback(
    (event: TypingEvent) => {
      if (event.userId === currentUser?.id) return;

      const isTyping = (event as any).isTyping;

      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (isTyping) {
          next.add(event.userId);

          // Clear existing timeout for this user
          const existingTimeout = typingTimeoutRef.current.get(event.userId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          // Auto-remove after 3 seconds of no typing
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Set(p);
              n.delete(event.userId);
              return n;
            });
            typingTimeoutRef.current.delete(event.userId);
          }, 3000);

          typingTimeoutRef.current.set(event.userId, timeout);
        } else {
          next.delete(event.userId);
          const timeout = typingTimeoutRef.current.get(event.userId);
          if (timeout) {
            clearTimeout(timeout);
            typingTimeoutRef.current.delete(event.userId);
          }
        }
        return next;
      });
    },
    [currentUser?.id]
  );

  // WebSocket for real-time
  const {
    isConnected,
    sendMessage: wsSendMessage,
    sendMessageWithAttachments,
    editMessage: wsEditMessage,
    deleteMessage: wsDeleteMessage,
    startTyping: wsStartTyping,
    stopTyping: wsStopTyping,
  } = useWebSocket({
    conversationId,
    onNewMessage: handleNewMessage,
    onMessageEdited: handleMessageEdited,
    onMessageDeleted: handleMessageDeleted,
    onTyping: handleTyping,
  });

  // Cleanup typing timeouts on unmount
  useEffect(() => {
    return () => {
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutRef.current.clear();
    };
  }, []);

  // Send message with optimistic update
  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}): Promise<boolean> => {
      if (!conversationId || !currentUser || isSending) return false;

      const { replyToId, attachmentIds, language = 'fr' } = options;

      setIsSending(true);

      // Create optimistic message
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const optimisticMessage: Message = {
        id: tempId,
        conversationId,
        senderId: currentUser.id,
        content,
        originalLanguage: language,
        messageType: 'text',
        messageSource: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        timestamp: new Date(),
        isEdited: false,
        isDeleted: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        deliveredCount: 0,
        readCount: 0,
        reactionCount: 0,
        isEncrypted: false,
        translations: [],
        replyToId,
        sender: currentUser,
      } as Message;

      // Add optimistic message immediately
      addMessage(optimisticMessage);

      try {
        let success: boolean;

        if (attachmentIds && attachmentIds.length > 0) {
          success = await sendMessageWithAttachments(content, attachmentIds, language, replyToId);
        } else {
          success = await wsSendMessage(content, language, replyToId);
        }

        if (!success) {
          // Rollback on failure
          removeMessage(tempId);
        }

        return success;
      } catch (error) {
        // Rollback on error
        removeMessage(tempId);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [
      conversationId,
      currentUser,
      isSending,
      addMessage,
      removeMessage,
      wsSendMessage,
      sendMessageWithAttachments,
    ]
  );

  // Edit message with optimistic update
  const editMessage = useCallback(
    async (messageId: string, content: string): Promise<boolean> => {
      const originalMessage = messages.find((m) => m.id === messageId);
      if (!originalMessage) return false;

      // Optimistic update
      updateMessage(messageId, { content, isEdited: true });

      const success = await wsEditMessage(messageId, content);

      if (!success) {
        // Rollback
        updateMessage(messageId, {
          content: originalMessage.content,
          isEdited: originalMessage.isEdited,
        });
      }

      return success;
    },
    [messages, updateMessage, wsEditMessage]
  );

  // Delete message with optimistic update
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const deletedMessage = messages.find((m) => m.id === messageId);
      if (!deletedMessage) return false;

      // Optimistic delete
      removeMessage(messageId);

      const success = await wsDeleteMessage(messageId);

      if (!success) {
        // Rollback
        addMessage(deletedMessage);
      }

      return success;
    },
    [messages, removeMessage, addMessage, wsDeleteMessage]
  );

  // Mark as read
  const markAsRead = useCallback(async () => {
    if (!conversationId) return;

    try {
      await conversationsService.markAsRead(conversationId);

      // Update unread count in conversations list
      queryClient.setQueryData(queryKeys.conversations.infinite(), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            conversations: page.conversations.map((conv: any) =>
              conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
            ),
          })),
        };
      });
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }, [conversationId, queryClient]);

  // Mark as read when messages load
  useEffect(() => {
    if (conversationId && messages.length > 0 && !isLoading) {
      markAsRead();
    }
  }, [conversationId, messages.length, isLoading, markAsRead]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    isSending,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    typingUsers,
    startTyping: wsStartTyping,
    stopTyping: wsStopTyping,
    refresh,
    markAsRead,
    isConnected,
    error,
  };
}
