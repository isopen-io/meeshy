/**
 * Hook useStreamSocket - Gestion Socket.IO pour BubbleStream
 *
 * Extrait de bubble-stream-page.tsx pour respecter le principe de responsabilité unique.
 * Gère la connexion temps réel, les événements typing/status, et les stats de conversation.
 *
 * @module hooks/use-stream-socket
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { getLanguageFlag } from '@meeshy/shared/types';
import type { User, Message } from '@meeshy/shared/types';

interface LanguageStats {
  language: string;
  flag: string;
  count: number;
  color: string;
}

interface TypingUser {
  id: string;
  displayName: string;
}

interface UseStreamSocketOptions {
  conversationId: string;
  user: User;
  activeUsers: User[];
  isLoadingTranslations: boolean;
  onNewMessage: (message: Message) => void;
  onMessageEdited: (message: Message) => void;
  onMessageDeleted: (messageId: string) => void;
  onTranslation: (messageId: string, translations: any[]) => void;
  onActiveUsersUpdate: (users: User[]) => void;
}

interface UseStreamSocketReturn {
  // État de connexion
  connectionStatus: {
    isConnected: boolean;
    hasSocket: boolean;
  };

  // Utilisateurs en frappe
  typingUsers: TypingUser[];

  // Statistiques de langues
  messageLanguageStats: LanguageStats[];
  activeLanguageStats: LanguageStats[];

  // ObjectId normalisé du backend
  normalizedConversationId: string | null;

  // Actions
  sendMessage: (
    content: string,
    language: string,
    replyToId?: string,
    mentionedUserIds?: string[],
    attachmentIds?: string[],
    attachmentMimeTypes?: string[]
  ) => Promise<boolean>;
  startTyping: () => void;
  stopTyping: () => void;
  reconnect: () => void;
  getDiagnostics: () => any;
}

/**
 * Hook pour gérer la connexion Socket.IO et les événements temps réel du BubbleStream
 */
export function useStreamSocket({
  conversationId,
  user,
  activeUsers,
  isLoadingTranslations,
  onNewMessage,
  onMessageEdited,
  onMessageDeleted,
  onTranslation,
  onActiveUsersUpdate,
}: UseStreamSocketOptions): UseStreamSocketReturn {

  // État pour les utilisateurs en train de taper
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Statistiques de langues
  const [messageLanguageStats, setMessageLanguageStats] = useState<LanguageStats[]>([]);
  const [activeLanguageStats, setActiveLanguageStats] = useState<LanguageStats[]>([]);

  // ObjectId normalisé du backend
  const [normalizedConversationId, setNormalizedConversationId] = useState<string | null>(null);

  // Refs pour éviter les re-créations
  const normalizedConversationIdRef = useRef<string | null>(null);
  const activeUsersRef = useRef(activeUsers);

  // Mettre à jour la ref activeUsers
  useEffect(() => {
    activeUsersRef.current = activeUsers;
  }, [activeUsers]);

  // Handler pour les utilisateurs en train de taper
  const handleUserTyping = useCallback((userId: string, username: string, isTyping: boolean, typingConversationId: string) => {
    if (userId === user.id) return;

    const currentNormalizedId = normalizedConversationIdRef.current;
    if (!currentNormalizedId || typingConversationId !== currentNormalizedId) {
      return;
    }

    setTypingUsers(prev => {
      if (isTyping) {
        if (prev.some(u => u.id === userId)) return prev;

        const connectedUser = activeUsersRef.current.find(u => u.id === userId);
        let displayName: string;

        if (connectedUser) {
          if (connectedUser.displayName) {
            displayName = connectedUser.displayName;
          } else if (connectedUser.firstName || connectedUser.lastName) {
            displayName = `${connectedUser.firstName || ''} ${connectedUser.lastName || ''}`.trim();
          } else {
            displayName = connectedUser.username;
          }
        } else if (username && username !== userId) {
          displayName = username;
        } else {
          displayName = `Utilisateur ${userId.slice(-6)}`;
        }

        return [...prev, { id: userId, displayName }];
      } else {
        return prev.filter(u => u.id !== userId);
      }
    });
  }, [user.id]);

  // Handler pour le statut utilisateur
  const handleUserStatus = useCallback((userId: string, username: string, isOnline: boolean) => {
    // Géré par les événements socket - peut être étendu si nécessaire
  }, []);

  // Handler pour les statistiques de conversation
  const handleConversationStats = useCallback((data: any) => {
    if (!data || data.conversationId !== conversationId) return;

    const stats: any = data.stats || {};

    if (stats.messagesPerLanguage) {
      const mapped = Object.entries(stats.messagesPerLanguage).map(([code, count]) => ({
        language: code as string,
        flag: getLanguageFlag(code as string),
        count: count as number,
        color: undefined as any
      })).filter((s: any) => s.count > 0);
      setMessageLanguageStats(mapped as any);
    }

    if (stats.participantsPerLanguage) {
      const mapped = Object.entries(stats.participantsPerLanguage).map(([code, count]) => ({
        language: code as string,
        flag: getLanguageFlag(code as string),
        count: count as number,
        color: undefined as any
      })).filter((s: any) => s.count > 0);
      setActiveLanguageStats(mapped as any);
    }

    if (Array.isArray(stats.onlineUsers)) {
      onActiveUsersUpdate(stats.onlineUsers.map((u: any) => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: '',
        avatar: '',
        role: 'USER' as const,
        permissions: {
          canAccessAdmin: false,
          canManageUsers: false,
          canManageGroups: false,
          canManageConversations: false,
          canViewAnalytics: false,
          canModerateContent: false,
          canViewAuditLogs: false,
          canManageNotifications: false,
          canManageTranslations: false,
        },
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isOnline: true,
        isActive: true,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        updatedAt: new Date()
      })));
    }
  }, [conversationId, onActiveUsersUpdate]);

  // Handler pour les statistiques en ligne
  const handleConversationOnlineStats = useCallback((data: any) => {
    if (!data || data.conversationId !== conversationId) return;

    if (Array.isArray(data.onlineUsers)) {
      const usersToDisplay = [...data.onlineUsers];

      if (!usersToDisplay.find((u: any) => u.id === user?.id)) {
        usersToDisplay.unshift({
          id: user?.id,
          username: user?.username,
          firstName: user?.firstName,
          lastName: user?.lastName,
          avatar: user?.avatar,
          systemLanguage: user?.systemLanguage,
          displayName: user?.displayName
        });
      }

      onActiveUsersUpdate(usersToDisplay.map((u: any) => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: u.avatar || '',
        role: 'USER' as const,
        permissions: {
          canAccessAdmin: false,
          canManageUsers: false,
          canManageGroups: false,
          canManageConversations: false,
          canViewAnalytics: false,
          canModerateContent: false,
          canViewAuditLogs: false,
          canManageNotifications: false,
          canManageTranslations: false,
        },
        systemLanguage: u.systemLanguage || 'fr',
        regionalLanguage: 'fr',
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isOnline: true,
        isActive: true,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        updatedAt: new Date()
      })));
    }
  }, [conversationId, user, onActiveUsersUpdate]);

  // Hook Socket.IO principal
  const {
    sendMessage: sendMessageToService,
    connectionStatus,
    startTyping,
    stopTyping,
    reconnect,
    getDiagnostics
  } = useSocketIOMessaging({
    conversationId,
    currentUser: user,
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onUserTyping: handleUserTyping,
    onUserStatus: handleUserStatus,
    onTranslation,
    onConversationStats: handleConversationStats,
    onConversationOnlineStats: handleConversationOnlineStats,
  });

  // Écouter l'événement CONVERSATION_JOINED pour obtenir l'ObjectId normalisé
  useEffect(() => {
    const unsubscribe = meeshySocketIOService.onConversationJoined((data: { conversationId: string; userId: string }) => {
      normalizedConversationIdRef.current = data.conversationId;
      setNormalizedConversationId(data.conversationId);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Mettre à jour la ref quand conversationId change
  useEffect(() => {
    const currentNormalizedId = meeshySocketIOService.getCurrentConversationId();
    normalizedConversationIdRef.current = currentNormalizedId;
    if (currentNormalizedId) {
      setNormalizedConversationId(currentNormalizedId);
    }
  }, [conversationId]);

  return {
    connectionStatus,
    typingUsers,
    messageLanguageStats,
    activeLanguageStats,
    normalizedConversationId,
    sendMessage: sendMessageToService,
    startTyping,
    stopTyping,
    reconnect,
    getDiagnostics,
  };
}
