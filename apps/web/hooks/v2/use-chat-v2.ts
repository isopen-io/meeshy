'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useConversationsQuery, useConversationQuery } from '@/hooks/queries/use-conversations-query';
import { useInfiniteMessagesQuery, useMessagesQueryHelpers } from '@/hooks/queries/use-messages-query';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import type { Conversation, Message, User } from '@meeshy/shared/types';
import type { ConversationItemData } from '@/components/v2/ConversationItem';

// Type pour les utilisateurs en train de taper
interface TypingUser {
  id: string;
  username: string;
  conversationId: string;
  timestamp: number;
}

interface UseChatV2Options {
  initialConversationId?: string | null;
}

interface UseChatV2Return {
  // User
  currentUser: User | null;
  isAuthenticated: boolean;

  // Conversations
  conversations: ConversationItemData[];
  isLoadingConversations: boolean;
  conversationsError: Error | null;

  // Selected conversation
  selectedConversationId: string | null;
  selectedConversation: Conversation | null;
  selectConversation: (id: string | null) => void;

  // Messages
  messages: Message[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => void;

  // Send message
  sendMessage: (content: string, language?: string, attachmentIds?: string[]) => Promise<boolean>;
  isSending: boolean;

  // Typing
  typingUsers: TypingUser[];
  startTyping: () => void;
  stopTyping: () => void;

  // Socket status
  isConnected: boolean;
  reconnect: () => void;

  // Refresh
  refreshConversations: () => void;
}

/**
 * Hook V2 pour la gestion du chat
 * Combine conversations, messages et Socket.IO en temps reel
 */
export function useChatV2(options: UseChatV2Options = {}): UseChatV2Return {
  const { initialConversationId = null } = options;

  // Auth
  const { user: currentUser, isAuthenticated, isChecking } = useAuth();

  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversationId);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isSending, setIsSending] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Queries
  const {
    data: conversations,
    isLoading: isLoadingConversations,
    error: conversationsError,
    refetch: refreshConversations,
  } = useConversationsQuery({
    enabled: isAuthenticated && !isChecking,
  });

  const {
    data: selectedConversation,
  } = useConversationQuery(selectedConversationId);

  const {
    data: messagesData,
    isLoading: isLoadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMessagesQuery(selectedConversationId, {
    enabled: !!selectedConversationId && isAuthenticated,
  });

  // Message cache helpers
  const messageHelpers = useMessagesQueryHelpers(selectedConversationId || '');

  // Socket.IO callbacks
  const handleNewMessage = useCallback((message: Message) => {
    if (message.conversationId === selectedConversationId) {
      messageHelpers.addMessageToCache(message);
    }
  }, [selectedConversationId, messageHelpers]);

  const handleMessageEdited = useCallback((message: Message) => {
    if (message.conversationId === selectedConversationId) {
      messageHelpers.updateMessageInCache(message.id, message);
    }
  }, [selectedConversationId, messageHelpers]);

  const handleMessageDeleted = useCallback((messageId: string) => {
    messageHelpers.removeMessageFromCache(messageId);
  }, [messageHelpers]);

  const handleUserTyping = useCallback((
    userId: string,
    username: string,
    isTyping: boolean,
    conversationId: string
  ) => {
    if (conversationId !== selectedConversationId) return;

    setTypingUsers(prev => {
      if (isTyping) {
        // Add typing user
        const existing = prev.find(u => u.id === userId);
        if (existing) {
          return prev.map(u => u.id === userId ? { ...u, timestamp: Date.now() } : u);
        }
        return [...prev, { id: userId, username, conversationId, timestamp: Date.now() }];
      } else {
        // Remove typing user
        return prev.filter(u => u.id !== userId);
      }
    });

    // Auto-remove typing indicator after 5 seconds
    setTimeout(() => {
      setTypingUsers(prev => prev.filter(u => Date.now() - u.timestamp < 5000));
    }, 5000);
  }, [selectedConversationId]);

  // Socket.IO
  const {
    isConnected,
    sendMessage: socketSendMessage,
    startTyping: socketStartTyping,
    stopTyping: socketStopTyping,
    reconnect,
  } = useSocketIOMessaging({
    conversationId: selectedConversationId,
    currentUser: currentUser as User | null,
    onNewMessage: handleNewMessage,
    onMessageEdited: handleMessageEdited,
    onMessageDeleted: handleMessageDeleted,
    onUserTyping: handleUserTyping,
  });

  // Transform conversations to UI format
  const transformedConversations = useMemo((): ConversationItemData[] => {
    if (!conversations) return [];

    return conversations.map((conv): ConversationItemData => {
      // Determine language code from participants
      const otherParticipant = conv.members?.find(m => m.id !== currentUser?.id);
      const languageCode = otherParticipant?.systemLanguage || 'fr';

      // Get last message info
      const lastMessage = conv.lastMessage;
      let lastMessageData;

      if (lastMessage) {
        const messageType = lastMessage.messageType || 'text';
        lastMessageData = {
          content: lastMessage.content || '',
          type: messageType as 'text' | 'photo' | 'voice' | 'video' | 'file' | 'location',
          timestamp: lastMessage.createdAt
            ? new Date(lastMessage.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '',
          senderName: conv.isGroup ? lastMessage.sender?.displayName || lastMessage.sender?.username : undefined,
        };
      }

      // Check if typing in this conversation
      const isTypingInConv = typingUsers.some(u => u.conversationId === conv.id);

      return {
        id: conv.id,
        name: conv.title || otherParticipant?.displayName || otherParticipant?.username || 'Conversation',
        languageCode: conv.isGroup ? 'multi' : languageCode,
        isOnline: otherParticipant?.isOnline || false,
        isPinned: false, // TODO: Add pinning support
        isImportant: false,
        isMuted: false,
        isGroup: conv.isGroup || (conv.members?.length || 0) > 2,
        participantCount: conv.members?.length,
        tags: [],
        unreadCount: conv.unreadCount || 0,
        lastMessage: lastMessageData,
        isTyping: isTypingInConv,
      };
    });
  }, [conversations, currentUser, typingUsers]);

  // Get messages from infinite query
  const messages = useMemo(() => {
    if (!messagesData?.messages) return [];
    // Reverse to show oldest first (messages come in descending order)
    return [...messagesData.messages].reverse();
  }, [messagesData]);

  // Actions
  const selectConversation = useCallback((id: string | null) => {
    setSelectedConversationId(id);
    setTypingUsers([]); // Clear typing users when changing conversation
  }, []);

  const sendMessage = useCallback(async (
    content: string,
    language?: string,
    attachmentIds?: string[]
  ): Promise<boolean> => {
    if (!content.trim() || !selectedConversationId || isSending) {
      return false;
    }

    setIsSending(true);

    try {
      const lang = language || currentUser?.systemLanguage || 'fr';
      const success = await socketSendMessage(
        content,
        lang,
        undefined, // replyToId
        undefined, // mentionedUserIds
        attachmentIds
      );

      return success;
    } finally {
      setIsSending(false);
    }
  }, [selectedConversationId, isSending, currentUser, socketSendMessage]);

  const startTyping = useCallback(() => {
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    socketStartTyping();

    // Auto stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketStopTyping();
    }, 3000);
  }, [socketStartTyping, socketStopTyping]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socketStopTyping();
  }, [socketStopTyping]);

  const loadMoreMessages = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    // User
    currentUser: currentUser as User | null,
    isAuthenticated,

    // Conversations
    conversations: transformedConversations,
    isLoadingConversations,
    conversationsError: conversationsError as Error | null,

    // Selected conversation
    selectedConversationId,
    selectedConversation: selectedConversation || null,
    selectConversation,

    // Messages
    messages,
    isLoadingMessages,
    hasMoreMessages: hasNextPage || false,
    loadMoreMessages,

    // Send message
    sendMessage,
    isSending,

    // Typing
    typingUsers,
    startTyping,
    stopTyping,

    // Socket status
    isConnected,
    reconnect,

    // Refresh
    refreshConversations,
  };
}
