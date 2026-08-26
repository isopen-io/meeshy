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
import { toast } from 'sonner';

// Hooks personnalisés extraits
import { useI18n } from '@/hooks/useI18n';
import { useNotificationActions } from '@/stores/notification-store';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useSocketCacheSync } from '@/hooks/queries/use-socket-cache-sync';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useMessageTranslations } from '@/hooks/use-message-translations';
import { useReplyStore } from '@/stores/reply-store';

// Hooks de stream extraits (NOUVEAUX)
import { useStreamSocket } from '@/hooks/use-stream-socket';
import { useStreamMessages } from '@/hooks/use-stream-messages';
import { useStreamTranslation } from '@/hooks/use-stream-translation';
import { useStreamUI } from '@/hooks/use-stream-ui';

// Composants de stream extraits (NOUVEAUX)
import { StreamHeader, StreamThreadHeader, StreamComposer, StreamSidebar } from '@/components/bubble-stream';

// Variante `thread` (/chat/:linkId) — géométrie de messagerie + Lentille
import { streamScrollLayout } from '@/lib/conversations/stream-variant';
import { useThreadActiveReadingMode } from '@/hooks/lentille/use-thread-reading-mode';
import { useReadingModeStore } from '@/stores/reading-mode-store';
import { useConversationAccent } from '@/hooks/conversations/use-conversation-accent';

// Composants réutilisables
import { ConversationMessages } from '@/components/conversations/ConversationMessages';
import { AttachmentGallery } from '@/components/attachments/AttachmentGallery';
import { LoadingState } from '@/components/common/LoadingStates';
import { useSeenMessages } from '@/hooks/use-seen-messages';
import { useQueryClient } from '@tanstack/react-query';
import { markScopeNotificationsRead } from '@/lib/notifications/notification-read-sync';
import { setConversationUnreadInCache } from '@/lib/conversations/unread-cache';

// Services et utils
import { getAuthToken } from '@/utils/token-utils';
import { conversationsService } from '@/services';
import { detectLanguage } from '@/utils/language-detection';
import { getMaxMessageLength } from '@/lib/constants/languages';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

// Types et constantes
import type { User, Message } from '@meeshy/shared/types';
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
import {
  getUserLanguageChoices,
  type BubbleStreamPageProps,
  type _LanguageChoice
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
  initialParticipants,
  attachmentPermissions,
  variant = 'stream',
  conversationTitle,
  conversationType,
}: BubbleStreamPageProps) {

  // La géométrie de défilement de la variante — voir stream-variant.ts.
  // `thread` : ancien en haut / récent en bas, la seule géométrie compatible
  // avec la perspective Focal (ligne de focus ancrée près du BAS du viewport).
  const isThread = variant === 'thread';
  const scrollLayout = streamScrollLayout(variant);

  // i18n
  const { t, isLoading: isLoadingTranslations } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');

  // Router
  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const messageComposerRef = useRef<unknown>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const conversationObjectIdRef = useRef<string | null>(null);
  const currentFocusedConversationRef = useRef<string | null>(null);

  // Limite de caractères
  const maxMessageLength = getMaxMessageLength(user?.role);

  // Notifications
  const { setActiveConversationId } = useNotificationActions();

  // Hook pour le système de notifications (toasts pour les messages d'autres conversations)
  useNotificationsManagerRQ();

  // Sync Socket.IO ↔ cache React Query.
  //
  // `ConversationLayout` en était le SEUL monteur : `/` et `/chat/:linkId`,
  // que ce composant sert, n'appliquaient au cache aucun des événements que ce
  // hook porte seul — réaction, épinglage, transcription, traduction audio,
  // statut de pièce jointe, restauration « pour moi », accusés, pastilles… Les
  // trois événements que cet écran traite déjà (`message:new`, `:edited`,
  // `:deleted`, via `useStreamSocket` plus bas) restent traités là où ils le
  // sont : ce hook y est idempotent (dédup par id, garde d'édition périmée), et
  // le retrait du handler local coûterait le scroll-vers-le-récent qui y est
  // attaché.
  //
  // LA CLÉ. Ce hook reçoit l'identifiant que l'ÉCRAN emploie — le SLUG
  // `"meeshy"` sur la page d'accueil — alors que toute charge socket porte
  // l'ObjectId résolu. La réconciliation ne se fait pas ici : elle est déjà
  // dans `messageCacheKeysFor`, qui reconnaît une entrée alias au
  // `conversationId` que portent ses messages CACHÉS. Son angle mort est donc
  // le cache VIDE — la fenêtre de la lecture initiale — et c'est exactement
  // celle que ferme `addMessage` en semant sa première page. Les deux moitiés
  // se composent ; ni l'une ni l'autre ne suffit.
  useSocketCacheSync({ conversationId, enabled: true });

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
    scrollDirection: scrollLayout.scrollDirection,
    disableAutoFill: false
  });

  // Lentille de lecture — même magasin collant par conversation que la vue
  // applicative (`ConversationView`) et que l'aperçu visiteur
  // (`SharedConversationPreview`) : la clé est l'ObjectId de la conversation,
  // le choix survit donc au passage visiteur → participant. Hooks appelés
  // inconditionnellement (règle des hooks) ; seuls la variante `thread` monte
  // le sélecteur et transmet le mode au fil.
  const readingMode = useThreadActiveReadingMode(conversationId);
  const setReadingMode = useReadingModeStore((state) => state.setMode);
  const toggleReadingDensity = useReadingModeStore((state) => state.toggleDensity);

  const handleReadingModeChange = useCallback(
    (mode: Parameters<typeof setReadingMode>[1]) => {
      if (conversationId) setReadingMode(conversationId, mode);
    },
    [conversationId, setReadingMode]
  );
  const handleToggleReadingDensity = useCallback(() => {
    if (conversationId) toggleReadingDensity(conversationId);
  }, [conversationId, toggleReadingDensity]);

  // L'accent de la conversation (règle produit CLAUDE.md § Conversation
  // Accent Color) : publié en variables CSS, consommé par l'en-tête, le ring
  // de la carte focale et la Lentille via `--conv-accent`.
  const accentStyle = useConversationAccent(
    isThread && conversationId
      ? ({
          id: conversationId,
          title: conversationTitle || '',
          type: (conversationType || 'group') as never,
        } as never)
      : null
  );

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
  const [, setDetectedLanguage] = useState<string>('fr');
  const [userLanguage, setUserLanguage] = useState<string>(resolveUserPreferredLanguage());
  // Canonical (normalized) system code — must match languageChoices[0].code so the
  // selection-validation effect below never treats the default as out-of-range.
  const [selectedInputLanguage, setSelectedInputLanguage] = useState<string>(normalizeLanguageCode(user.systemLanguage) || 'fr');
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
    _searchQuery,
    _setSearchQuery,
    location,
    trendingHashtags,
  } = useStreamUI({
    messages,
    messagesContainerRef: messagesContainerRef as React.RefObject<HTMLDivElement>,
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
    _removeTranslatingState,
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
      messageSender: (message.sender as unknown)?.username || message.sender?.displayName,
      attachments: message.attachments,
      attachmentCount: message.attachments?.length ?? 0,
      messageType: message.messageType,
    });

    // Filtrer si on a déjà chargé des messages ET que le message ne correspond pas
    if (currentConversationObjectId && message.conversationId !== currentConversationObjectId) {
      console.log('⚠️ [BubbleStreamPage] Message filtered out - different conversation');
      return;
    }

    console.log('✅ [BubbleStreamPage] Adding message to feed');
    const wasAdded = addMessage(message);
    console.log('✅ [BubbleStreamPage] addMessage returned:', wasAdded);

    // Scroll automatique pour les nouveaux messages — vers le RÉCENT de la
    // variante : haut pour le feed (récent en haut), bas pour le fil partagé.
    // senderId is a Participant ID, compare via sender.userId or sender.user.id
    const senderUserId = getSenderUserId(message.sender as Record<string, unknown>) ?? message.senderId;
    if (senderUserId !== user.id) {
      setTimeout(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        if (isThread) {
          const distanceFromBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight;
          if (distanceFromBottom < 300) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          }
        } else if (container.scrollTop < 300) {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 300);
    }
  }, [addMessage, user.id, conversationId, isThread]);

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

  // Écouter la conversation active pour les notifications + consommer
  // l'ouverture (reset optimiste du badge + notifications de la conversation
  // marquées lues), comme le fait ConversationLayout pour /conversations.
  // Sans cela, le compteur de la conversation d'accueil ne redescendait JAMAIS.
  useEffect(() => {
    console.log('🔍 [BubbleStreamPage] normalizedConversationId changed:', {
      normalizedConversationId,
      conversationId,
    });

    if (normalizedConversationId) {
      setActiveConversationId(normalizedConversationId);
      setConversationUnreadInCache(queryClient, normalizedConversationId, 0);
      markScopeNotificationsRead(queryClient, {
        kind: 'conversation',
        conversationId: normalizedConversationId,
      });
    }

    return () => {
      setActiveConversationId(null);
    };
  }, [normalizedConversationId, setActiveConversationId, queryClient]);

  // Suivi de lecture exact : rapporte au serveur les messages RÉELLEMENT
  // affichés (curseur de lecture + badge). Ce hook n'était monté que par
  // ConversationView — la page d'accueil n'émettait donc jamais de
  // mark-as-read et son compteur croissait indéfiniment. `conversationId`
  // n'est fourni qu'une fois l'initialisation finie : le conteneur scrollable
  // est alors monté, et le changement de dépendance ré-attache les observers.
  // Sessions ANONYMES exclues : la route mark-as-read est JWT-only
  // (allowAnonymous: false) — chaque flush partirait en 401.
  useSeenMessages({
    containerRef: messagesContainerRef,
    conversationId:
      isInitializing || isAnonymousMode ? null : (normalizedConversationId || null),
  });

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
      setSelectedInputLanguage(languageChoices[0]?.code ?? 'fr');
    }
  }, [languageChoices, selectedInputLanguage]);

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

      if (sendResult?.success) {
        toast.success(tCommon('messages.messageSent'));

        // Clear mentions
        if (messageComposerRef.current?.clearMentionedUserIds) {
          messageComposerRef.current.clearMentionedUserIds();
        }

        // Scroll automatique vers le récent de la variante (haut du feed,
        // bas du fil partagé).
        const scrollToLatest = () => {
          const container = messagesContainerRef.current;
          if (!container) return;
          container.scrollTo({
            top: isThread ? container.scrollHeight : 0,
            behavior: 'smooth',
          });
        };

        setTimeout(scrollToLatest, 100);
        setTimeout(scrollToLatest, 500);
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

      <div
        style={accentStyle as React.CSSProperties | undefined}
        className="flex h-full min-h-0 w-full flex-col bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
      >
        {/* Offline banner for anonymous users */}
        {isAnonymousMode && !connectionStatus.isConnected && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center text-sm text-amber-700 dark:text-amber-300">
            {tCommon('connection.offlineAnonymous') || 'Mode hors ligne — vos messages seront envoyés à la reconnexion'}
          </div>
        )}

        <div className="flex h-full min-h-0 w-full flex-col xl:flex-row">
          {/* Colonne principale */}
          <section className="grid flex-1 min-h-0 grid-rows-[auto,1fr,auto] overflow-hidden">

            {/* Header : identité de conversation + Lentille pour le fil
                partagé, pilule de connexion historique pour le feed */}
            {isThread ? (
              <StreamThreadHeader
                title={conversationTitle || t('bubbleStream.threadTitleFallback', 'Conversation')}
                participantCount={activeUsers.length}
                isConnected={connectionStatus.isConnected && connectionStatus.hasSocket}
                typingUsers={typingUsers}
                readingMode={readingMode}
                onReadingModeChange={handleReadingModeChange}
                onToggleDensity={handleToggleReadingDensity}
                onReconnect={reconnect}
              />
            ) : (
              <StreamHeader
                connectionStatus={connectionStatus}
                typingUsers={typingUsers}
                onReconnect={reconnect}
                t={t}
              />
            )}

            {/* Feed principal */}
            <div
              ref={messagesContainerRef}
              className="row-start-2 min-h-0 h-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-blue-50/50 to-white dark:from-gray-900/50 dark:to-gray-950"
            >
              <ConversationMessages
                messages={messages}
                translatedMessages={messages as unknown}
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
                reverseOrder={scrollLayout.reverseOrder}
                scrollDirection={scrollLayout.scrollDirection}
                scrollButtonDirection={scrollLayout.scrollButtonDirection}
                scrollContainerRef={messagesContainerRef}
                readingMode={isThread ? readingMode : undefined}
                scrollButtonOffsetClass={isThread ? 'right-6 xl:right-[360px]' : undefined}
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
              attachmentPermissions={attachmentPermissions}
              withSafeArea={isThread}
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
