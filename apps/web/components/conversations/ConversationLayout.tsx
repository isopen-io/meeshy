'use client';

/**
 * ConversationLayout - Composant principal pour l'interface de conversation
 *
 * Refactorisé pour utiliser les hooks spécialisés (Single Responsibility):
 * - useConversationSelection: sélection et navigation entre conversations
 * - useConversationUI: gestion UI (mobile, resize, modals, galerie)
 * - useConversationTyping: indicateurs de frappe
 * - useComposerDrafts: brouillons du composer par conversation
 * - useMessageActions: actions CRUD sur les messages
 *
 * @module components/conversations/ConversationLayout
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUser, useIsAuthChecking } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { useConversationsPaginationRQ } from '@/hooks/queries/use-conversations-pagination-rq';
import { useNotifications } from '@/hooks/use-notifications';
import { useNotificationActions } from '@/stores/notification-store';
import { useVirtualKeyboard } from '@/hooks/use-virtual-keyboard';
import { conversationsService } from '@/services/conversations.service';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ConversationList } from './ConversationList';
import { ConversationHeader } from './ConversationHeader';
import { ConversationMessages } from './ConversationMessages';
import { ConversationEmptyState } from './ConversationEmptyState';
import { MessageComposer } from '@/components/common/message-composer';
import { getUserLanguageChoices } from '@/utils/user-language-preferences';
import { CreateConversationModal } from './create-conversation-modal';
import { ConversationDetailsSidebar } from './conversation-details-sidebar';
import { cn } from '@/lib/utils';
import type { Conversation, ThreadMember, UserRoleEnum, Attachment } from '@meeshy/shared/types';
import { useReplyStore } from '@/stores/reply-store';
import { toast } from 'sonner';
import { getAuthToken } from '@/utils/token-utils';
import { AttachmentGallery } from '@/components/attachments/AttachmentGallery';
import { FailedMessageBanner } from '@/components/messages/failed-message-banner';
import { useFailedMessagesStore, type FailedMessage } from '@/stores/failed-messages-store';
import { ConnectionStatusIndicator } from './connection-status-indicator';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { logger } from '@/utils/logger';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';
import { useSocketCacheSync, useInvalidateOnReconnect } from '@/hooks/queries';

// Hooks refactorisés (Single Responsibility)
import {
  useConversationSelection,
  useConversationUI,
  useConversationTyping,
  useComposerDrafts,
  useMessageActions,
} from '@/hooks/conversations';

interface ConversationLayoutProps {
  selectedConversationId?: string;
}

export function ConversationLayout({ selectedConversationId }: ConversationLayoutProps) {
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { t } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');

  // Hook pour le système de notifications
  const { setActiveConversationId } = useNotificationActions();

  // ID unique pour cette instance du composant
  const instanceId = useMemo(() => `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);

  // Mémoiser les choix de langues pour éviter re-renders de MessageComposer
  const languageChoices = useMemo(() => {
    return user ? getUserLanguageChoices(user) : [];
  }, [user?.systemLanguage, user?.regionalLanguage, user?.customDestinationLanguage]);

  // Hook de pagination pour les conversations (React Query)
  const {
    conversations: paginatedConversations,
    isLoading: isLoadingConversations,
    isLoadingMore: isLoadingMoreConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    refresh: refreshConversations,
    setConversations
  } = useConversationsPaginationRQ({
    limit: 50,
    enabled: !!user
  });

  const conversations = paginatedConversations;

  // ========== HOOKS REFACTORISÉS ==========

  // Hook: Sélection de conversation
  const {
    effectiveSelectedId,
    selectedConversation,
    handleSelectConversation,
    handleBackToList,
    setLocalSelectedConversationId,
  } = useConversationSelection({
    selectedConversationId,
    conversations,
  });

  // Hook: UI (mobile, resize, modals, galerie)
  const {
    isMobile,
    showConversationList,
    setShowConversationList,
    conversationListWidth,
    isResizing,
    handleResizeMouseDown,
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDetailsOpen,
    setIsDetailsOpen,
    galleryOpen,
    setGalleryOpen,
    selectedAttachmentId,
    setSelectedAttachmentId,
    handleImageClick,
  } = useConversationUI({
    selectedConversationId: effectiveSelectedId,
  });

  // Hook: Brouillons du composer
  const {
    message: newMessage,
    setMessage: setNewMessage,
    attachmentIds,
    setAttachmentIds,
    attachmentMimeTypes,
    setAttachmentMimeTypes,
    clearDraft,
    handleAttachmentsChange,
  } = useComposerDrafts({
    conversationId: effectiveSelectedId,
  });

  // États locaux restants
  const [participants, setParticipants] = useState<ThreadMember[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [translatingMessages, setTranslatingMessages] = useState<Map<string, Set<string>>>(new Map());
  const [usedLanguages, setUsedLanguages] = useState<string[]>([]);

  // Refs
  const participantsRef = useRef<ThreadMember[]>([]);
  const selectedConversationIdRef = useRef<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messageComposerRef = useRef<{ focus: () => void; blur: () => void; clearAttachments?: () => void; clearMentionedUserIds?: () => void; getMentionedUserIds?: () => string[] }>(null);
  const hasAttemptedReconnect = useRef(false);
  const previousConversationIdRef = useRef<string | null>(null);
  const hasLoadedInitialConversations = useRef(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Hook pour gérer les notifications
  const { notifications, markAsRead } = useNotifications();

  // Activer les mises à jour de statut utilisateur en temps réel (via WebSocket)
  useUserStatusRealtime();

  // Sync Socket.IO events avec le cache React Query
  useSocketCacheSync({ conversationId: effectiveSelectedId, enabled: !!effectiveSelectedId });
  useInvalidateOnReconnect();

  // Store global des utilisateurs
  const userStore = useUserStore();

  // Gérer le clavier virtuel sur mobile
  const keyboardState = useVirtualKeyboard();

  // Mettre à jour les refs quand les valeurs changent
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Hook pour les messages (React Query)
  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh: refreshMessages,
    clearMessages,
    addMessage,
    updateMessage,
    removeMessage
  } = useConversationMessagesRQ(selectedConversation?.id || null, user!, {
    limit: 20,
    enabled: !!selectedConversation?.id,
    containerRef: messagesScrollRef
  });

  // Hook: Actions sur les messages
  const {
    handleEditMessage,
    handleDeleteMessage,
    handleNavigateToMessage,
    imageAttachments,
  } = useMessageActions({
    conversationId: selectedConversation?.id || null,
    messages,
    selectedLanguage,
    updateMessage,
    removeMessage,
    refreshMessages,
    t: tCommon,
    loadMore,
    hasMore,
  });

  // Fonctions pour gérer l'état des traductions en cours
  const addTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      const currentLanguages = newMap.get(messageId) || new Set();
      currentLanguages.add(targetLanguage);
      newMap.set(messageId, currentLanguages);
      return newMap;
    });
  }, []);

  const removeTranslatingState = useCallback((messageId: string, targetLanguage: string) => {
    setTranslatingMessages(prev => {
      const newMap = new Map(prev);
      const currentLanguages = newMap.get(messageId);
      if (currentLanguages) {
        currentLanguages.delete(targetLanguage);
        if (currentLanguages.size === 0) {
          newMap.delete(messageId);
        } else {
          newMap.set(messageId, currentLanguages);
        }
      }
      return newMap;
    });
  }, []);

  const isTranslating = useCallback((messageId: string, targetLanguage: string): boolean => {
    const currentLanguages = translatingMessages.get(messageId);
    return currentLanguages ? currentLanguages.has(targetLanguage) : false;
  }, [translatingMessages]);

  // Callback pour gérer les événements de frappe
  const handleUserTyping = useCallback((userId: string, username: string, isTyping: boolean, typingConversationId: string) => {
    if (!user || userId === user.id) return;
    if (typingConversationId !== selectedConversationIdRef.current) return;

    // Note: typingUsers est géré par useConversationTyping
  }, [user]);

  // Hook Socket.IO messaging pour la communication temps réel
  const {
    sendMessage: sendMessageViaSocket,
    connectionStatus: socketConnectionStatus,
    startTyping,
    stopTyping
  } = useSocketIOMessaging({
    conversationId: selectedConversation?.id,
    currentUser: user || undefined,
    onUserTyping: handleUserTyping,
    onMessageEdited: useCallback((message: any) => {
      if (message.conversationId === selectedConversationIdRef.current) {
        updateMessage(message.id, message);
      }
    }, [updateMessage]),
    onMessageDeleted: useCallback((messageId: string) => {
      removeMessage(messageId);
    }, [removeMessage]),
    onNewMessage: useCallback(async (message: any) => {
      const currentConvId = selectedConversationIdRef.current;
      const normalizedConvId = meeshySocketIOService.getCurrentConversationId();
      const isForCurrentConversation =
        message.conversationId === normalizedConvId &&
        message.conversationId === currentConvId;

      // Mettre à jour la liste des conversations
      setConversations(prevConversations => {
        const conversationIndex = prevConversations.findIndex(c => c.id === message.conversationId);

        if (conversationIndex === -1) {
          setTimeout(() => refreshConversations(), 100);
          return prevConversations;
        }

        const currentConversation = prevConversations[conversationIndex];
        const isMessageFromCurrentUser = user && message.senderId === user.id;
        const isCurrentlyViewingThisConversation = message.conversationId === currentConvId;
        const shouldIncrementUnread = !isMessageFromCurrentUser && !isCurrentlyViewingThisConversation;

        const updatedConversation = {
          ...currentConversation,
          lastMessage: message,
          lastMessageAt: message.createdAt || new Date(),
          lastActivityAt: message.createdAt || new Date(),
          unreadCount: shouldIncrementUnread
            ? (currentConversation.unreadCount || 0) + 1
            : (currentConversation.unreadCount || 0)
        };

        const updatedConversations = prevConversations.filter((_, index) => index !== conversationIndex);
        return [updatedConversation, ...updatedConversations];
      });

      if (isForCurrentConversation) {
        addMessage(message);
      }
    }, [addMessage, setConversations, refreshConversations, user]),
    onTranslation: useCallback((messageId: string, translations: any[]) => {
      updateMessage(messageId, (prevMessage) => {
        const existingTranslations = Array.isArray(prevMessage.translations) ? prevMessage.translations : [];
        const updatedTranslations = [...existingTranslations];

        translations.forEach(newTranslation => {
          const targetLang = newTranslation.targetLanguage || newTranslation.language;
          const content = newTranslation.translatedContent || newTranslation.content;

          if (!targetLang || !content) return;

          const existingIndex = updatedTranslations.findIndex(t => t.targetLanguage === targetLang);

          const translationObject = {
            id: newTranslation.id || `${messageId}_${targetLang}`,
            messageId: messageId,
            sourceLanguage: newTranslation.sourceLanguage || prevMessage.originalLanguage || 'fr',
            targetLanguage: targetLang,
            translatedContent: content,
            translationModel: newTranslation.translationModel || newTranslation.model || 'basic',
            cacheKey: newTranslation.cacheKey || `${messageId}_${targetLang}`,
            cached: newTranslation.cached || newTranslation.fromCache || false,
            confidenceScore: newTranslation.confidenceScore || newTranslation.confidence || 0.9,
            createdAt: newTranslation.createdAt ? new Date(newTranslation.createdAt) : new Date(),
          };

          if (existingIndex >= 0) {
            updatedTranslations[existingIndex] = translationObject;
          } else {
            updatedTranslations.push(translationObject);
          }
        });

        return { ...prevMessage, translations: updatedTranslations };
      });

      setUsedLanguages(prev => {
        const newLanguages = translations
          .map(t => t.targetLanguage || t.language)
          .filter((lang): lang is string => Boolean(lang) && !prev.includes(lang));
        return newLanguages.length > 0 ? [...prev, ...newLanguages] : prev;
      });

      translations.forEach(translation => {
        const targetLang = translation.targetLanguage || translation.language;
        if (targetLang) removeTranslatingState(messageId, targetLang);
      });
    }, [updateMessage, removeTranslatingState])
  });

  const connectionStatus = socketConnectionStatus;

  // Hook: Typing indicators
  const {
    typingUsers,
    isTyping,
    handleTypingStart,
    handleTypingStop,
    handleTextInput: handleTypingTextInput,
  } = useConversationTyping({
    conversationId: selectedConversation?.id || null,
    currentUserId: user?.id || null,
    participants,
    startTyping,
    stopTyping,
  });

  // Informer le store de notifications de la conversation active
  useEffect(() => {
    setActiveConversationId(effectiveSelectedId || null);
    return () => setActiveConversationId(null);
  }, [effectiveSelectedId, setActiveConversationId]);

  // Sync URL → local
  useEffect(() => {
    if (selectedConversationId && !effectiveSelectedId) {
      setLocalSelectedConversationId(selectedConversationId);
    }
  }, [selectedConversationId, effectiveSelectedId, setLocalSelectedConversationId]);

  // Chargement des participants
  const loadParticipants = useCallback(async (conversationId: string) => {
    try {
      const participantsData = await conversationsService.getAllParticipants(conversationId);

      const allParticipants: ThreadMember[] = [
        ...participantsData.authenticatedParticipants.map(user => ({
          id: user.id,
          conversationId,
          userId: user.id,
          user: user,
          role: user.role as UserRoleEnum,
          joinedAt: new Date(),
          isActive: true,
          isAnonymous: false
        })),
        ...participantsData.anonymousParticipants.map(participant => ({
          id: participant.id,
          conversationId,
          userId: participant.id,
          user: {
            ...participant,
            displayName: participant.username,
            email: '',
            phoneNumber: '',
            isOnline: false,
            lastActiveAt: new Date(),
            systemLanguage: 'fr',
            regionalLanguage: 'fr',
            role: 'USER' as const,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            keepOriginalMessages: true,
            translationQuality: 'medium'
          },
          role: 'MEMBER' as UserRoleEnum,
          joinedAt: new Date(),
          isActive: true,
          isAnonymous: true
        }))
      ];

      // Déduplication des participants
      const participantsMap = new Map<string, ThreadMember>();
      allParticipants.filter(p => p.isAnonymous).forEach(p => participantsMap.set(p.userId, p));
      allParticipants.filter(p => !p.isAnonymous).forEach(p => participantsMap.set(p.userId, p));
      const uniqueParticipants = Array.from(participantsMap.values());

      userStore.setParticipants(uniqueParticipants.map(p => p.user).filter(Boolean) as any[]);
      setParticipants(uniqueParticipants);
    } catch (error) {
      console.error('[ConversationLayout] ❌ Erreur chargement participants:', error);
      setParticipants([]);
    }
  }, [userStore]);

  // Fonction pour charger une conversation directement
  const loadDirectConversation = useCallback(async (conversationId: string) => {
    try {
      const directConversation = await conversationsService.getConversation(conversationId);
      setConversations(prev => {
        if (prev.find(c => c.id === directConversation.id)) return prev;
        return [directConversation, ...prev];
      });
    } catch (error) {
      console.error(`[ConversationLayout-${instanceId}] Erreur chargement direct:`, error);
    }
  }, [setConversations, instanceId]);

  // Charger la conversation si pas dans la liste
  useEffect(() => {
    if (effectiveSelectedId && !isLoadingConversations && conversations.length > 0) {
      const found = conversations.find(c => c.id === effectiveSelectedId);
      if (!found) loadDirectConversation(effectiveSelectedId);
    }
  }, [effectiveSelectedId, conversations, isLoadingConversations, loadDirectConversation]);

  // Afficher les détails d'une conversation
  const handleShowDetails = useCallback((conversation: Conversation) => {
    if (effectiveSelectedId !== conversation.id) {
      handleSelectConversation(conversation);
      setTimeout(() => setIsDetailsOpen(true), 100);
    } else {
      setIsDetailsOpen(true);
    }
  }, [effectiveSelectedId, handleSelectConversation, setIsDetailsOpen]);

  // Start video call
  const handleStartCall = useCallback(async () => {
    if (!selectedConversation) {
      toast.error('Please select a conversation first');
      return;
    }

    if (selectedConversation.type !== 'direct') {
      toast.error('Video calls are only available for direct conversations');
      return;
    }

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' },
      });

      (window as any).__preauthorizedMediaStream = stream;

      const socket = meeshySocketIOService.getSocket();
      if (!socket || !socket.connected) {
        toast.error('Connection error. Please try again.');
        stream.getTracks().forEach(track => track.stop());
        delete (window as any).__preauthorizedMediaStream;
        return;
      }

      const callData = {
        conversationId: selectedConversation.id,
        type: 'video',
        settings: { audioEnabled: true, videoEnabled: true },
      };

      (socket as any).emit('call:initiate', callData);
      toast.success('Starting call...');
    } catch (error: any) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        delete (window as any).__preauthorizedMediaStream;
      }

      if (error.name === 'NotAllowedError') {
        toast.error('Camera/microphone permission denied.');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera or microphone found.');
      } else {
        toast.error('Failed to access camera/microphone: ' + error.message);
      }
    }
  }, [selectedConversation]);

  // Gérer la réponse à un message
  const handleReplyMessage = useCallback((message: any) => {
    useReplyStore.getState().setReplyingTo({
      id: message.id,
      content: message.content,
      originalLanguage: message.originalLanguage,
      sender: message.sender,
      createdAt: message.createdAt,
      translations: message.translations,
      attachments: message.attachments
    });
    messageComposerRef.current?.focus();
  }, []);

  // Naviguer vers un message depuis la galerie
  const handleNavigateToMessageFromGallery = useCallback((messageId: string) => {
    setGalleryOpen(false);
    setTimeout(() => handleNavigateToMessage(messageId), 300);
  }, [handleNavigateToMessage, setGalleryOpen]);

  // Envoi de message
  const handleSendMessage = useCallback(async () => {
    if ((!newMessage.trim() && attachmentIds.length === 0) || !selectedConversation || !user) return;

    const content = newMessage.trim();
    const replyToId = useReplyStore.getState().replyingTo?.id;
    const mentionedUserIds = messageComposerRef.current?.getMentionedUserIds?.() || [];
    const hasAttachments = attachmentIds.length > 0;

    if (selectedConversation.id !== effectiveSelectedId) {
      toast.error(t('conversationLayout.conversationChangedError'));
      return;
    }

    const currentAttachmentIds = [...attachmentIds];
    const currentAttachmentMimeTypes = [...attachmentMimeTypes];

    try {
      if (isTyping) {
        handleTypingStop();
      }

      await sendMessageViaSocket(
        content,
        selectedLanguage,
        replyToId,
        mentionedUserIds,
        hasAttachments ? currentAttachmentIds : undefined,
        hasAttachments ? currentAttachmentMimeTypes : undefined
      );

      // Marquer comme lu après envoi
      if (selectedConversation?.id) {
        conversationsService.markAsRead(selectedConversation.id).then(() => {
          setConversations(prev => prev.map(conv =>
            conv.id === selectedConversation.id ? { ...conv, unreadCount: 0 } : conv
          ));
        }).catch(console.error);
      }

      clearDraft();
      messageComposerRef.current?.clearAttachments?.();
      messageComposerRef.current?.clearMentionedUserIds?.();

      if (replyToId) useReplyStore.getState().clearReply();

      setTimeout(() => {
        messagesScrollRef.current?.scrollTo({ top: messagesScrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('[ConversationLayout] Erreur envoi message:', error);
      setAttachmentIds(currentAttachmentIds);
    }
  }, [newMessage, selectedConversation, user, attachmentIds, attachmentMimeTypes, effectiveSelectedId, selectedLanguage, isTyping, handleTypingStop, sendMessageViaSocket, clearDraft, setConversations, setAttachmentIds, t]);

  // Gestion de la saisie avec indicateurs de frappe
  const handleTyping = useCallback((value: string) => {
    setNewMessage(value);
    handleTypingTextInput(value);
  }, [setNewMessage, handleTypingTextInput]);

  // Gestion des touches clavier
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (isMobile) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage, isMobile]);

  // Handler pour restaurer un message en échec
  const handleRestoreFailedMessage = useCallback((failedMsg: FailedMessage) => {
    setNewMessage(failedMsg.content);
    setSelectedLanguage(failedMsg.originalLanguage);
    if (failedMsg.attachmentIds.length > 0) setAttachmentIds(failedMsg.attachmentIds);
    if (failedMsg.replyTo) useReplyStore.getState().setReplyingTo(failedMsg.replyTo as any);
    setTimeout(() => messageComposerRef.current?.focus(), 100);
    toast.info(t('messageRestored') || 'Message restauré.');
  }, [setNewMessage, setAttachmentIds, t]);

  // Handler pour renvoyer un message en échec
  const handleRetryFailedMessage = useCallback(async (failedMsg: FailedMessage): Promise<boolean> => {
    if (!selectedConversation?.id || !user) {
      toast.error('Impossible de renvoyer: conversation ou utilisateur manquant');
      return false;
    }

    const diagnostics = meeshySocketIOService.getConnectionDiagnostics();
    if (!diagnostics.isConnected) {
      meeshySocketIOService.reconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      const success = await sendMessageViaSocket(
        failedMsg.content,
        failedMsg.originalLanguage,
        failedMsg.replyToId,
        undefined,
        failedMsg.attachmentIds.length > 0 ? failedMsg.attachmentIds : undefined,
        undefined
      );
      return !!success;
    } catch (error) {
      console.error('❌ Erreur lors du renvoi:', error);
      return false;
    }
  }, [selectedConversation?.id, user, sendMessageViaSocket]);

  // Reconnexion automatique
  useEffect(() => {
    if (!connectionStatus.isConnected && connectionStatus.hasSocket && user) {
      if (hasAttemptedReconnect.current) return;
      hasAttemptedReconnect.current = true;

      const reconnectTimer = setTimeout(() => {
        if (!connectionStatus.isConnected) {
          meeshySocketIOService.reconnect();
          setTimeout(() => { hasAttemptedReconnect.current = false; }, 10000);
        }
      }, 3000);

      return () => clearTimeout(reconnectTimer);
    }

    if (connectionStatus.isConnected) hasAttemptedReconnect.current = false;
  }, [connectionStatus.isConnected, connectionStatus.hasSocket, user]);

  // Charger les conversations au montage initial
  useEffect(() => {
    if (user && !hasLoadedInitialConversations.current) {
      hasLoadedInitialConversations.current = true;
      refreshConversations();
      setSelectedLanguage(user.systemLanguage || 'fr');
    } else if (user) {
      setSelectedLanguage(user.systemLanguage || 'fr');
    }
  }, [user?.id, refreshConversations]);

  // Chargement parallèle conversation + participants
  useEffect(() => {
    const targetId = selectedConversationId || selectedConversation?.id;
    if (!targetId || !user) return;
    if (targetId === previousConversationIdRef.current) return;

    clearMessages();
    previousConversationIdRef.current = targetId;

    const needsConversation = !conversations.find(c => c.id === targetId);
    const loadPromises: Promise<void>[] = [];

    if (needsConversation) loadPromises.push(loadDirectConversation(targetId));
    loadPromises.push(loadParticipants(targetId));

    Promise.all(loadPromises).catch(error => {
      console.error(`[ConversationLayout-${instanceId}] Erreur chargement parallèle:`, error);
    });
  }, [selectedConversationId, selectedConversation?.id, user, conversations, loadDirectConversation, loadParticipants, clearMessages, instanceId]);

  // Marquer comme lu quand on scroll vers le bas
  useEffect(() => {
    const container = messagesScrollRef.current;
    const conversationId = selectedConversation?.id;
    if (!container || !conversationId) return;

    let markAsReadTimeout: NodeJS.Timeout | null = null;
    let hasMarkedAsRead = false;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < 100 && !hasMarkedAsRead) {
        if (markAsReadTimeout) clearTimeout(markAsReadTimeout);

        markAsReadTimeout = setTimeout(() => {
          hasMarkedAsRead = true;
          conversationsService.markAsRead(conversationId).then(() => {
            setConversations(prev => prev.map(conv =>
              conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
            ));
          }).catch(console.error);
        }, 500);
      }
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (markAsReadTimeout) clearTimeout(markAsReadTimeout);
    };
  }, [selectedConversation?.id, setConversations]);

  // Callback pour mettre à jour la conversation après modification
  const handleConversationUpdated = useCallback((updatedData: Partial<Conversation>) => {
    if (!selectedConversation) return;
    setConversations(prev => prev.map(conv =>
      conv.id === selectedConversation.id ? { ...conv, ...updatedData } : conv
    ));
  }, [selectedConversation, setConversations]);

  // Loader d'authentification
  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('conversationLayout.authChecking')}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // ========== RENDER ==========

  return (
    <>
      {/* Mode mobile avec conversation ouverte */}
      {isMobile && selectedConversation ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
          {/* Header */}
          <header
            className={cn(
              "flex-shrink-0 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-md border-b-2 border-gray-200 dark:border-gray-700 transition-all duration-300",
              keyboardState.isOpen && "max-h-14 overflow-hidden"
            )}
          >
            <ConversationHeader
              conversation={selectedConversation}
              currentUser={user}
              conversationParticipants={participants}
              typingUsers={typingUsers.map(u => ({ userId: u.id, username: u.displayName, conversationId: selectedConversation.id, timestamp: Date.now() }))}
              isMobile={isMobile}
              onBackToList={handleBackToList}
              onOpenDetails={() => setIsDetailsOpen(true)}
              onParticipantRemoved={() => {}}
              onParticipantAdded={() => {}}
              onLinkCreated={() => {}}
              onStartCall={handleStartCall}
              onOpenGallery={() => setGalleryOpen(true)}
              t={t}
              showBackButton={!!selectedConversationId}
            />
            {!connectionStatus.isConnected && (
              <div className="px-4 py-2"><ConnectionStatusIndicator /></div>
            )}
          </header>

          {/* Messages */}
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-transparent pb-4 min-h-0">
            <ConversationMessages
              messages={messages}
              translatedMessages={messages as any}
              currentUser={user}
              userLanguage={user.systemLanguage}
              usedLanguages={usedLanguages}
              isLoadingMessages={isLoadingMessages}
              isLoadingMore={isLoadingMore}
              hasMore={hasMore}
              isMobile={isMobile}
              conversationType={(selectedConversation.type as any) === 'anonymous' ? 'direct' : (selectedConversation.type as any) === 'broadcast' ? 'public' : selectedConversation.type as any}
              scrollContainerRef={messagesScrollRef}
              userRole={user.role as UserRoleEnum}
              conversationId={selectedConversation.id}
              addTranslatingState={addTranslatingState}
              isTranslating={isTranslating}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onReplyMessage={handleReplyMessage}
              onNavigateToMessage={handleNavigateToMessage}
              onImageClick={handleImageClick}
              onLoadMore={loadMore}
              t={t}
              tCommon={tCommon}
              reverseOrder={true}
            />
          </div>

          {/* Composer */}
          <div
            className="flex-shrink-0 bg-white/98 dark:bg-gray-950/98 backdrop-blur-xl border-t-2 border-gray-200 dark:border-gray-700 shadow-2xl p-4"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {selectedConversation?.id && (
              <FailedMessageBanner
                conversationId={selectedConversation.id}
                onRetry={handleRetryFailedMessage}
                onRestore={handleRestoreFailedMessage}
              />
            )}
            <MessageComposer
              ref={messageComposerRef}
              value={newMessage}
              onChange={handleTyping}
              onSend={handleSendMessage}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              placeholder={t('conversationLayout.writeMessage')}
              onKeyPress={handleKeyPress}
              choices={languageChoices}
              onAttachmentsChange={handleAttachmentsChange}
              token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
              userRole={user.role}
              conversationId={effectiveSelectedId || undefined}
            />
          </div>

          {/* Details sidebar - Mobile */}
          {isDetailsOpen && (
            <ConversationDetailsSidebar
              conversation={selectedConversation}
              currentUser={user}
              messages={messages}
              isOpen={isDetailsOpen}
              onClose={() => setIsDetailsOpen(false)}
              onConversationUpdated={handleConversationUpdated}
            />
          )}
        </div>
      ) : (
        /* Mode desktop ou mobile sans conversation */
        <div className="flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden h-screen">
          <DashboardLayout
            title={t('conversationLayout.conversations.title')}
            hideHeaderOnMobile={false}
            className="!bg-none !bg-transparent !h-full !min-h-0 !max-w-none !px-0 !overflow-hidden flex-1"
          >
            <div
              className={cn(
                "flex bg-transparent conversation-layout relative z-10 w-full h-full overflow-hidden",
                isMobile ? 'h-[calc(100vh-4rem)]' : 'h-full'
              )}
              role="application"
              aria-label={t('conversationLayout.conversations.title')}
            >
              {/* Liste des conversations */}
              {(!isMobile || !selectedConversationId) && (
                <>
                  <aside
                    ref={resizeRef}
                    style={!isMobile ? { width: `${conversationListWidth}px` } : undefined}
                    className={cn(
                      "flex-shrink-0 bg-white dark:bg-gray-950 border-r-2 border-gray-200 dark:border-gray-800 shadow-lg",
                      isMobile ? (showConversationList ? "fixed top-16 left-0 right-0 bottom-0 z-40 w-full" : "hidden") : "relative h-full"
                    )}
                    role="complementary"
                    aria-label={t('conversationLayout.conversationsList')}
                  >
                    <ConversationList
                      conversations={conversations}
                      selectedConversation={selectedConversation}
                      currentUser={user}
                      isLoading={isLoadingConversations}
                      isMobile={isMobile}
                      showConversationList={showConversationList}
                      onSelectConversation={handleSelectConversation}
                      onShowDetails={handleShowDetails}
                      onCreateConversation={() => setIsCreateModalOpen(true)}
                      onLinkCreated={refreshConversations}
                      t={t}
                      hasMore={hasMoreConversations}
                      isLoadingMore={isLoadingMoreConversations}
                      onLoadMore={loadMoreConversations}
                      tSearch={(key: string) => t(`search.${key}`)}
                    />
                  </aside>

                  {/* Resize handle - Desktop only */}
                  {!isMobile && (
                    <div
                      onMouseDown={handleResizeMouseDown}
                      className={cn(
                        "w-1 hover:w-2 bg-transparent hover:bg-primary/20 cursor-col-resize transition-all relative group",
                        isResizing && "w-2 bg-primary/30"
                      )}
                      style={{ userSelect: 'none', touchAction: 'none' }}
                    >
                      <div className="absolute inset-y-0 -left-1 -right-1" />
                      <div className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity",
                        isResizing && "opacity-100 bg-primary/50"
                      )} />
                    </div>
                  )}
                </>
              )}

              {/* Zone principale */}
              <main
                className={cn(
                  "flex flex-col min-w-0",
                  selectedConversationId ? "w-full h-full" : "flex-1 h-full"
                )}
                role="main"
                aria-label={selectedConversation ? t('conversationLayout.conversationWith', { name: selectedConversation.title }) : t('conversationLayout.selectConversation')}
              >
                {selectedConversation ? (
                  <div className="flex flex-col w-full h-full bg-white dark:bg-gray-950 shadow-xl overflow-hidden">
                    {/* Header */}
                    <header className="flex-shrink-0 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-md border-b-2 border-gray-200 dark:border-gray-700 relative z-10" role="banner">
                      <ConversationHeader
                        conversation={selectedConversation}
                        currentUser={user}
                        conversationParticipants={participants}
                        typingUsers={typingUsers.map(u => ({ userId: u.id, username: u.displayName, conversationId: selectedConversation.id, timestamp: Date.now() }))}
                        isMobile={false}
                        onBackToList={handleBackToList}
                        onOpenDetails={() => setIsDetailsOpen(true)}
                        onParticipantRemoved={() => {}}
                        onParticipantAdded={() => {}}
                        onLinkCreated={() => {}}
                        onStartCall={handleStartCall}
                        onOpenGallery={() => setGalleryOpen(true)}
                        t={t}
                        showBackButton={!!selectedConversationId}
                      />
                      {!connectionStatus.isConnected && (
                        <div className="px-6 py-2"><ConnectionStatusIndicator /></div>
                      )}
                    </header>

                    {/* Messages */}
                    <div
                      ref={messagesScrollRef}
                      className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-950"
                      role="region"
                      aria-live="polite"
                      aria-label={t('conversationLayout.messagesList')}
                    >
                      <ConversationMessages
                        messages={messages}
                        translatedMessages={messages as any}
                        currentUser={user}
                        userLanguage={user.systemLanguage}
                        usedLanguages={usedLanguages}
                        isLoadingMessages={isLoadingMessages}
                        isLoadingMore={isLoadingMore}
                        hasMore={hasMore}
                        isMobile={false}
                        conversationType={(selectedConversation.type as any) === 'anonymous' ? 'direct' : (selectedConversation.type as any) === 'broadcast' ? 'public' : selectedConversation.type as any}
                        scrollContainerRef={messagesScrollRef}
                        userRole={user.role as UserRoleEnum}
                        conversationId={selectedConversation.id}
                        addTranslatingState={addTranslatingState}
                        isTranslating={isTranslating}
                        onEditMessage={handleEditMessage}
                        onDeleteMessage={handleDeleteMessage}
                        onReplyMessage={handleReplyMessage}
                        onNavigateToMessage={handleNavigateToMessage}
                        onImageClick={handleImageClick}
                        onLoadMore={loadMore}
                        t={t}
                        tCommon={tCommon}
                        reverseOrder={true}
                      />
                    </div>

                    {/* Composer */}
                    <div className="flex-shrink-0 bg-white/98 dark:bg-gray-950/98 backdrop-blur-xl border-t-2 border-gray-200 dark:border-gray-700 shadow-2xl p-6">
                      {selectedConversation?.id && (
                        <FailedMessageBanner
                          conversationId={selectedConversation.id}
                          onRetry={handleRetryFailedMessage}
                          onRestore={handleRestoreFailedMessage}
                        />
                      )}
                      <MessageComposer
                        ref={messageComposerRef}
                        value={newMessage}
                        onChange={handleTyping}
                        onSend={handleSendMessage}
                        selectedLanguage={selectedLanguage}
                        onLanguageChange={setSelectedLanguage}
                        placeholder={t('conversationLayout.writeMessage')}
                        onKeyPress={handleKeyPress}
                        choices={languageChoices}
                        onAttachmentsChange={handleAttachmentsChange}
                        token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
                        userRole={user.role}
                        conversationId={effectiveSelectedId || undefined}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4 bg-white dark:bg-gray-950 overflow-hidden">
                    <ConversationEmptyState
                      conversationsCount={conversations.length}
                      onCreateConversation={() => setIsCreateModalOpen(true)}
                      onLinkCreated={refreshConversations}
                      t={t}
                    />
                  </div>
                )}
              </main>

              {/* Details sidebar - Desktop */}
              {selectedConversation && isDetailsOpen && (
                <ConversationDetailsSidebar
                  conversation={selectedConversation}
                  currentUser={user}
                  messages={messages}
                  isOpen={isDetailsOpen}
                  onClose={() => setIsDetailsOpen(false)}
                  onConversationUpdated={handleConversationUpdated}
                />
              )}
            </div>

            {/* Create conversation modal */}
            <CreateConversationModal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              currentUser={user}
              onConversationCreated={(id, conv) => {
                setIsCreateModalOpen(false);
                if (conv) {
                  setConversations(prev => [conv, ...prev]);
                  handleSelectConversation(conv);
                }
              }}
            />
          </DashboardLayout>
        </div>
      )}

      {/* Gallery */}
      {selectedConversation && (
        <AttachmentGallery
          conversationId={selectedConversation.id}
          initialAttachmentId={selectedAttachmentId || undefined}
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onNavigateToMessage={handleNavigateToMessageFromGallery}
          token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
          attachments={imageAttachments}
        />
      )}
    </>
  );
}
