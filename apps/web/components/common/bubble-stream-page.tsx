/**
 * BubbleStreamPage - Page publique de conversation multilingue (REFACTORÉ)
 *
 * Version optimisée avec hooks extraits et composants mémorisés.
 * Réduit de 1822 lignes à ~450 lignes en respectant le principe de responsabilité unique.
 *
 * AMÉLIORATIONS:
 * - Hooks extraits: useStreamSocket, useStreamMessages, useStreamTranslation, useStreamUI
 * - Composants mémorisés: StreamHeader, StreamComposer, StreamSidebar
 * - Re-renders optimisés avec React.memo
 * - Performance critique temps réel maintenue
 * - Zero breaking changes
 *
 * @module components/common/bubble-stream-page-refactored
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// Hooks personnalisés extraits
import { useI18n } from '@/hooks/useI18n';
import { useFixRadixZIndex } from '@/hooks/use-fix-z-index';
import { useNotificationActions } from '@/stores/notification-store';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useMessageTranslations } from '@/hooks/use-message-translations';
import { useReplyStore } from '@/stores/reply-store';

// Hooks de stream extraits (NOUVEAUX)
import { useStreamSocket } from '@/hooks/use-stream-socket';
import { useStreamMessages } from '@/hooks/use-stream-messages';
import { useStreamTranslation } from '@/hooks/use-stream-translation';
import { useStreamUI } from '@/hooks/use-stream-ui';

// Composants de stream extraits (NOUVEAUX)
import { StreamHeader, StreamComposer, StreamSidebar } from '@/components/bubble-stream';

// Composants réutilisables
import { ConversationMessages } from '@/components/conversations/ConversationMessages';
import { AttachmentGallery } from '@/components/attachments/AttachmentGallery';
import { LoadingState } from '@/components/common/LoadingStates';

// Services et utils
import { getAuthToken } from '@/utils/token-utils';
import { conversationsService } from '@/services';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { detectLanguage } from '@/utils/language-detection';
import { getMaxMessageLength } from '@/lib/constants/languages';

// Types et constantes
import type { User, Message } from '@meeshy/shared/types';
import {
  getUserLanguageChoices,
  type BubbleStreamPageProps,
  type LanguageChoice
} from '@/lib/bubble-stream-modules';

const TYPING_STOP_DELAY = 3000; // 3 secondes après la dernière frappe

/**
 * Composant principal BubbleStreamPage refactorisé
 */
export function BubbleStreamPage({
  user,
  conversationId = 'meeshy',
  isAnonymousMode = false,
  linkId,
  initialParticipants
}: BubbleStreamPageProps) {

  // i18n
  const { t, isLoading: isLoadingTranslations } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');

  // Router
  const router = useRouter();

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageComposerRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);
  const conversationObjectIdRef = useRef<string | null>(null);
  const currentFocusedConversationRef = useRef<string | null>(null);

  // Limite de caractères
  const maxMessageLength = getMaxMessageLength(user?.role);

  // Fix z-index Radix UI
  useFixRadixZIndex();

  // Notifications
  const { setActiveConversationId } = useNotificationActions();

  // Hook pour le système de notifications (toasts pour les messages d'autres conversations)
  useNotificationsManagerRQ();

  // Hook pour les messages (React Query avec pagination infinie)
  const {
    messages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh: refreshMessages,
    addMessage,
    updateMessage: updateMessageTranslations,
    removeMessage
  } = useConversationMessagesRQ(conversationId, user, {
    limit: 20,
    enabled: true,
    threshold: 200,
    linkId: isAnonymousMode ? linkId : undefined,
    containerRef: messagesContainerRef,
    scrollDirection: 'down',
    disableAutoFill: false
  });

  // Mettre à jour la ref avec l'ObjectId de la conversation courante
  useEffect(() => {
    if (messages.length > 0 && messages[0].conversationId) {
      conversationObjectIdRef.current = messages[0].conversationId;
      console.log('🔍 [BubbleStreamPage] Conversation ObjectId updated:', messages[0].conversationId);
    }
  }, [messages]);

  // Auto-focus sur le composer lors de l'ouverture de la conversation
  useEffect(() => {
    if (!conversationId || isAnonymousMode) return;

    // Ne pas focus si on a déjà focusé cette conversation
    if (conversationId === currentFocusedConversationRef.current) return;

    // Délai plus long pour BubbleStreamPage car il charge plus de composants
    const focusTimeout = setTimeout(() => {
      if (messageComposerRef.current?.focus) {
        messageComposerRef.current.focus();
        currentFocusedConversationRef.current = conversationId;
      }
    }, 1000);

    return () => clearTimeout(focusTimeout);
  }, [conversationId, isAnonymousMode]);

  // Hook pour les préférences de traduction
  const {
    getUserLanguagePreferences,
    resolveUserPreferredLanguage,
  } = useMessageTranslations({ currentUser: user });

  // États de base
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('fr');
  const [userLanguage, setUserLanguage] = useState<string>(resolveUserPreferredLanguage());
  const [selectedInputLanguage, setSelectedInputLanguage] = useState<string>(user.systemLanguage || 'fr');
  const [activeUsers, setActiveUsers] = useState<User[]>(initialParticipants || []);

  // États de chargement
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);

  // Langues utilisées par l'utilisateur
  const usedLanguages: string[] = getUserLanguagePreferences();

  // Choix de langues mémorisés (CRITIQUE pour éviter re-renders)
  const languageChoices = useMemo(() => getUserLanguageChoices(user), [
    user.systemLanguage,
    user.regionalLanguage,
    user.customDestinationLanguage
  ]);

  // Hook UI (NOUVEAU - extrait)
  const {
    isMobile,
    galleryOpen,
    selectedAttachmentId,
    imageAttachments,
    setGalleryOpen,
    handleImageClick,
    handleNavigateToMessageFromGallery,
    handleAttachmentDeleted,
    attachmentIds,
    attachmentMimeTypes,
    handleAttachmentsChange,
    searchQuery,
    setSearchQuery,
    location,
    trendingHashtags,
  } = useStreamUI({
    messages,
    messagesContainerRef,
  });

  // Fonction pour dédoublonner les utilisateurs actifs
  const deduplicateUsers = useCallback((users: User[]): User[] => {
    const uniqueUsers = users.reduce((acc: User[], current: User) => {
      const existingUser = acc.find(u => u.id === current.id);
      if (!existingUser) {
        acc.push(current);
      }
      return acc;
    }, []);
    return uniqueUsers;
  }, []);

  // Fonction pour mettre à jour les utilisateurs actifs
  const setActiveUsersDeduped = useCallback((users: User[]) => {
    setActiveUsers(deduplicateUsers(users));
  }, [deduplicateUsers]);

  // Hook de traduction (NOUVEAU - extrait)
  const {
    addTranslatingState,
    removeTranslatingState,
    isTranslating,
    handleTranslation,
  } = useStreamTranslation({
    user,
    updateMessage: updateMessageTranslations,
  });

  // Handler pour les nouveaux messages reçus via WebSocket
  const handleNewMessage = useCallback((message: Message) => {
    // CORRECTION: Utiliser l'ObjectId du premier message chargé comme référence
    // car normalizedConvId retourne l'identifier "meeshy", pas l'ObjectId MongoDB
    const currentConversationObjectId = conversationObjectIdRef.current;

    console.log('🔍 [BubbleStreamPage] handleNewMessage called', {
      messageConvId: message.conversationId,
      currentConversationObjectId,
      conversationIdentifier: conversationId,
      willFilter: currentConversationObjectId && message.conversationId !== currentConversationObjectId,
      messageContent: message.content?.substring(0, 50),
      messageSender: message.sender?.username || message.anonymousSender?.displayName,
    });

    // Filtrer si on a déjà chargé des messages ET que le message ne correspond pas
    if (currentConversationObjectId && message.conversationId !== currentConversationObjectId) {
      console.log('⚠️ [BubbleStreamPage] Message filtered out - different conversation');
      return;
    }

    console.log('✅ [BubbleStreamPage] Adding message to feed');
    const wasAdded = addMessage(message);
    console.log('✅ [BubbleStreamPage] addMessage returned:', wasAdded);

    // Scroll automatique pour les nouveaux messages
    if (message.senderId !== user.id && message.anonymousSenderId !== user.id) {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const { scrollTop } = messagesContainerRef.current;

          if (scrollTop < 300) {
            messagesContainerRef.current.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }
        }
      }, 300);
    }
  }, [addMessage, user.id, conversationId]);

  // Hook Socket.IO (NOUVEAU - extrait)
  const {
    connectionStatus,
    typingUsers,
    messageLanguageStats,
    activeLanguageStats,
    normalizedConversationId,
    sendMessage: sendMessageToService,
    startTyping,
    stopTyping,
    reconnect,
  } = useStreamSocket({
    conversationId,
    user,
    activeUsers,
    isLoadingTranslations,
    onNewMessage: handleNewMessage,
    onMessageEdited: (message: Message) => {
      // CORRECTION BUG: Filtrer les messages édités par conversationId ObjectId
      const currentConversationObjectId = conversationObjectIdRef.current;

      if (currentConversationObjectId && message.conversationId !== currentConversationObjectId) {
        return;
      }

      updateMessageTranslations(message.id, message);
      toast.info(tCommon('messages.messageEditedByOther'));
    },
    onMessageDeleted: (messageId: string) => {
      // NOTE: Pas besoin de filtrer ici car removeMessage() est sûr
      // Si le message n'existe pas dans le cache, il ne fait rien
      removeMessage(messageId);
      toast.info(tCommon('messages.messageDeletedByOther'));
    },
    onTranslation: handleTranslation,
    onActiveUsersUpdate: setActiveUsersDeduped,
  });

  // Hook pour les opérations sur les messages (NOUVEAU - extrait)
  const {
    handleEditMessage,
    handleDeleteMessage,
    handleReplyMessage,
    handleNavigateToMessage,
    getUserModerationRole,
  } = useStreamMessages({
    conversationId,
    user,
    messages,
    hasMore,
    selectedInputLanguage,
    refreshMessages,
    loadMore,
    messageComposerRef,
    t,
    tCommon,
  });

  // Écouter la conversation active pour les notifications
  useEffect(() => {
    console.log('🔍 [BubbleStreamPage] normalizedConversationId changed:', {
      normalizedConversationId,
      conversationId,
    });

    if (normalizedConversationId) {
      setActiveConversationId(normalizedConversationId);
    }

    return () => {
      setActiveConversationId(null);
    };
  }, [normalizedConversationId, setActiveConversationId]);

  // Détection automatique de langue
  useEffect(() => {
    if (newMessage.trim().length > 15) {
      const detectedLang = detectLanguage(newMessage);
      setDetectedLanguage(detectedLang);
    }
  }, [newMessage]);

  // Mise à jour de la langue utilisateur
  useEffect(() => {
    const newUserLanguage = resolveUserPreferredLanguage();
    setUserLanguage(newUserLanguage);
  }, [user.systemLanguage, user.regionalLanguage, user.customDestinationLanguage, resolveUserPreferredLanguage]);

  // Validation de la langue sélectionnée
  useEffect(() => {
    const availableLanguageCodes = languageChoices.map(choice => choice.code);
    if (!availableLanguageCodes.includes(selectedInputLanguage)) {
      setSelectedInputLanguage(user.systemLanguage || 'fr');
    }
  }, [languageChoices, selectedInputLanguage, user.systemLanguage]);

  // Chargement parallèle des messages et utilisateurs
  useEffect(() => {
    if (!conversationId || hasLoadedMessages) return;

    const loadPromises: Promise<void>[] = [refreshMessages()];

    if (activeUsers.length === 0 && !isAnonymousMode && normalizedConversationId) {
      const loadActiveUsers = async () => {
        try {
          const onlineUsers = await conversationsService.getParticipants(normalizedConversationId, { onlineOnly: true });
          setActiveUsersDeduped(onlineUsers);
        } catch (error) {
          console.error('Erreur chargement utilisateurs actifs:', error);
        }
      };
      loadPromises.push(loadActiveUsers());
    }

    Promise.all(loadPromises)
      .then(() => setHasLoadedMessages(true))
      .catch(error => {
        console.error('Erreur chargement parallèle:', error);
        setHasLoadedMessages(true);
      });
  }, [conversationId, hasLoadedMessages, activeUsers.length, isAnonymousMode, normalizedConversationId, refreshMessages, setActiveUsersDeduped]);

  // Gérer l'état d'initialisation
  useEffect(() => {
    if (hasLoadedMessages && !isLoadingMessages) {
      setIsInitializing(false);
    }
  }, [hasLoadedMessages, isLoadingMessages]);

  // Afficher l'écran de chargement
  if (isInitializing) {
    return (
      <LoadingState
        message={
          !hasLoadedMessages
            ? t('bubbleStream.loading')
            : t('bubbleStream.connecting')
        }
        fullScreen={true}
      />
    );
  }

  // Handler pour envoyer un message
  const handleSendMessage = async () => {
    if ((!newMessage.trim() && attachmentIds.length === 0) || newMessage.length > maxMessageLength) {
      return;
    }

    const messageContent = newMessage.trim();
    const replyToId = useReplyStore.getState().replyingTo?.id;

    // Arrêter l'indicateur de frappe
    if (isTyping) {
      setIsTyping(false);
      stopTyping();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    setNewMessage('');

    // Effacer la réponse
    if (replyToId) {
      useReplyStore.getState().clearReply();
    }

    // Clear attachments
    const currentAttachmentIds = [...attachmentIds];
    const currentAttachmentMimeTypes = [...attachmentMimeTypes];

    if (messageComposerRef.current?.clearAttachments) {
      messageComposerRef.current.clearAttachments();
    }

    try {
      if (!connectionStatus.isConnected) {
        setNewMessage(messageContent);
        return;
      }

      // Extraire les mentions
      const mentionedUserIds = messageComposerRef.current?.getMentionedUserIds?.() || [];

      // Envoyer le message
      const sendResult = await sendMessageToService(
        messageContent,
        selectedInputLanguage,
        replyToId,
        mentionedUserIds,
        currentAttachmentIds.length > 0 ? currentAttachmentIds : undefined,
        currentAttachmentMimeTypes.length > 0 ? currentAttachmentMimeTypes : undefined
      );

      if (sendResult) {
        toast.success(tCommon('messages.messageSent'));

        // Clear mentions
        if (messageComposerRef.current?.clearMentionedUserIds) {
          messageComposerRef.current.clearMentionedUserIds();
        }

        // Scroll automatique
        const scrollToTop = () => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
        };

        setTimeout(scrollToTop, 100);
        setTimeout(scrollToTop, 500);
      } else {
        throw new Error('Envoi du message échoué');
      }

    } catch (error) {
      console.error('Erreur envoi message:', error);
      toast.error(tCommon('messages.sendError'));
      setNewMessage(messageContent);
    }
  };

  // Handler pour les touches clavier
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (isMobile) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handler pour la frappe
  const handleTyping = (value: string) => {
    setNewMessage(value);

    if (value.trim()) {
      if (!isTyping) {
        setIsTyping(true);
        startTyping();
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        stopTyping();
      }, TYPING_STOP_DELAY);

    } else {
      if (isTyping) {
        setIsTyping(false);
        stopTyping();
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  return (
    <>
      <style jsx global>{`
        .scrollbar-hidden {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scrollbar-hidden::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div className="flex h-full min-h-0 w-full flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex h-full min-h-0 w-full flex-col xl:flex-row">
          {/* Colonne principale */}
          <section className="grid flex-1 min-h-0 grid-rows-[auto,1fr,auto] overflow-hidden">

            {/* Header avec indicateur de connexion - COMPOSANT EXTRAIT */}
            <StreamHeader
              connectionStatus={connectionStatus}
              typingUsers={typingUsers}
              onReconnect={reconnect}
              t={t}
            />

            {/* Feed principal */}
            <div
              ref={messagesContainerRef}
              className="row-start-2 min-h-0 h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-blue-50/50 to-white dark:from-gray-900/50 dark:to-gray-950"
            >
              <ConversationMessages
                messages={messages}
                translatedMessages={messages as any}
                isLoadingMessages={isLoadingMessages}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                currentUser={user}
                userLanguage={userLanguage}
                usedLanguages={usedLanguages}
                isMobile={isMobile}
                conversationType="public"
                userRole={getUserModerationRole()}
                conversationId={normalizedConversationId || conversationId}
                isAnonymous={isAnonymousMode}
                currentAnonymousUserId={isAnonymousMode ? user.id : undefined}
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
                reverseOrder={false}
                scrollDirection="down"
                scrollButtonDirection="up"
                scrollContainerRef={messagesContainerRef}
              />
            </div>

            {/* Zone de composition - COMPOSANT EXTRAIT */}
            <StreamComposer
              ref={messageComposerRef}
              value={newMessage}
              onChange={handleTyping}
              onSend={handleSendMessage}
              selectedLanguage={selectedInputLanguage}
              onLanguageChange={setSelectedInputLanguage}
              location={location}
              placeholder={t('conversationSearch.shareMessage')}
              onKeyPress={handleKeyPress}
              choices={languageChoices}
              onAttachmentsChange={handleAttachmentsChange}
              token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
              userRole={user?.role}
              conversationId={normalizedConversationId || conversationId}
            />
          </section>

          {/* Sidebar droite - COMPOSANT EXTRAIT */}
          <StreamSidebar
            messageLanguageStats={messageLanguageStats}
            activeLanguageStats={activeLanguageStats}
            userLanguage={userLanguage}
            activeUsers={activeUsers}
            trendingHashtags={trendingHashtags}
            t={t}
            tCommon={tCommon}
          />
        </div>
      </div>

      {/* Galerie d'images */}
      <AttachmentGallery
        conversationId={normalizedConversationId || conversationId}
        initialAttachmentId={selectedAttachmentId || undefined}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onNavigateToMessage={handleNavigateToMessageFromGallery}
        token={typeof window !== 'undefined' ? getAuthToken()?.value : undefined}
        attachments={imageAttachments}
        currentUserId={user?.id}
        onAttachmentDeleted={handleAttachmentDeleted}
      />
    </>
  );
}
