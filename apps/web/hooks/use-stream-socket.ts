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

// Filet de sécurité : un `typing:stop` distant peut se perdre (coupure
// réseau brève sans déconnexion socket, onglet expéditeur tué avant que son
// propre timeout d'arrêt ne s'exécute...). Sans ce filet, l'indicateur "X est
// en train d'écrire" resterait affiché jusqu'au ping-timeout du socket
// (~45-60s). 8s laisse une marge confortable au-dessus du cycle normal
// start→stop tout en bornant le pire cas perçu par l'utilisateur.
const REMOTE_TYPING_SAFETY_TIMEOUT = 8000;

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
    attachmentMimeTypes?: string[],
    clientMessageId?: string
  ) => ReturnType<ReturnType<typeof useSocketIOMessaging>['sendMessage']>;
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
  // Un timeout de sécurité par utilisateur distant en train de taper
  const remoteTypingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Mettre à jour la ref activeUsers
  useEffect(() => {
    activeUsersRef.current = activeUsers;
  }, [activeUsers]);

  // Nettoyage des timeouts de sécurité au démontage
  useEffect(() => {
    return () => {
      remoteTypingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      remoteTypingTimeoutsRef.current.clear();
    };
  }, []);

  // Handler pour les utilisateurs en train de taper
  const handleUserTyping = useCallback((userId: string, username: string, isTyping: boolean, typingConversationId: string) => {
    if (userId === user.id) return;

    const currentNormalizedId = normalizedConversationIdRef.current;
    if (!currentNormalizedId || typingConversationId !== currentNormalizedId) {
      return;
    }

    const existingTimeout = remoteTypingTimeoutsRef.current.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      remoteTypingTimeoutsRef.current.delete(userId);
    }

    if (isTyping) {
      remoteTypingTimeoutsRef.current.set(
        userId,
        setTimeout(() => {
          remoteTypingTimeoutsRef.current.delete(userId);
          setTypingUsers(prev => prev.filter(u => u.id !== userId));
        }, REMOTE_TYPING_SAFETY_TIMEOUT)
      );
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
  //
  // La liste des présents est SEMÉE à l'ouverture — `conversation:stats` porte
  // `stats.onlineUsers` — et c'était, jusqu'ici, la seule fois qu'elle bougeait :
  // ce gestionnaire était un corps VIDE, et le seul autre écrivain de la liste
  // écoutait `conversation:online-stats`, canal que la passerelle n'a jamais
  // émis et que le cycle 77 a retiré. Qui arrivait après vous n'apparaissait
  // jamais ; qui partait restait affiché, pour toute la durée de la session.
  //
  // Les deux moitiés du défaut se protégeaient l'une l'autre : le gestionnaire
  // vide paraissait couvert par le canal riche, et le canal riche paraissait
  // dispensé d'émetteur par le gestionnaire présent. Retirer le canal mort a
  // donc laissé la liste avec UN SEUL écrivain — la semence du join.
  //
  // `user:status` est le canal qui porte réellement ce fait : la passerelle le
  // diffuse aux rooms de conversation à chaque connexion et déconnexion, et les
  // trois clients s'en servent déjà pour leur présence. Il ne porte qu'un
  // delta — un identifiant, un nom, un état — là où l'instantané défunt
  // promettait la liste entière ; c'est assez pour la tenir à jour à partir de
  // la semence, et c'est le seul des deux qu'on puisse tenir sans refaire deux
  // requêtes par conversation à chaque connexion.
  const handleUserStatus = useCallback((userId: string, username: string, isOnline: boolean) => {
    if (!userId || userId === user.id) return;

    const current = activeUsersRef.current;
    const known = current.find(u => u.id === userId);

    if (!isOnline) {
      if (!known) return;
      onActiveUsersUpdate(current.filter(u => u.id !== userId));
      return;
    }

    if (known) return;

    // `user:status` ne porte pas de profil — ni prénom, ni avatar, ni langue.
    // L'entrée est donc MINIMALE et assumée : le nom d'affichage suffit à la
    // pastille, et le prochain `conversation:stats` (à la prochaine ouverture)
    // la remplacera par la forme complète. Inventer un profil ferait pire.
    onActiveUsersUpdate([
      ...current,
      {
        id: userId,
        username,
        firstName: '',
        lastName: '',
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
        isOnline: true,
        isActive: true,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      } as unknown as User,
    ]);
  }, [user.id, onActiveUsersUpdate]);

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
        isOnline: true,
        isActive: true,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        updatedAt: new Date()
      })));
    }
  }, [conversationId, onActiveUsersUpdate]);

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
