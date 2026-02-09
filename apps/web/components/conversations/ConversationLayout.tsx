'use client';

/**
 * ConversationLayout - Composant principal pour l'interface de conversation
 *
 * Refactorisé pour suivre:
 * - Vercel React Best Practices (bundle-dynamic-imports, rerender-*, js-*)
 * - Web Interface Guidelines (accessibility, transitions, safe-areas)
 *
 * Hooks utilisés (Single Responsibility):
 * - useConversationSelection: sélection et navigation
 * - useConversationUI: mobile, resize, modals, galerie
 * - useConversationTyping: indicateurs de frappe
 * - useComposerDrafts: brouillons par conversation
 * - useMessageActions: CRUD messages
 * - useTranslationState: état des traductions
 * - useParticipants: chargement participants
 * - useVideoCall: appels vidéo
 * - useSocketCallbacks: callbacks Socket.IO
 *
 * @module components/conversations/ConversationLayout
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useUser, useIsAuthChecking } from '@/stores';
import { useI18n } from '@/hooks/useI18n';
import { useConversationMessagesRQ } from '@/hooks/queries/use-conversation-messages-rq';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { useConversationsPaginationRQ } from '@/hooks/queries/use-conversations-pagination-rq';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { useNotificationActions } from '@/stores/notification-store';
import { useVirtualKeyboard } from '@/hooks/use-virtual-keyboard';
import { conversationsService } from '@/services/conversations.service';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { ConversationEmptyState } from './ConversationEmptyState';
import { CreateConversationModal } from './create-conversation-modal';
import { getUserLanguageChoices } from '@/utils/user-language-preferences';
import { cn } from '@/lib/utils';
import { useReplyStore } from '@/stores/reply-store';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useSocketCacheSync, useInvalidateOnReconnect } from '@/hooks/queries';

import type { Conversation, UserRoleEnum } from '@meeshy/shared/types';
import type { FailedMessage } from '@/stores/failed-messages-store';

// Hooks refactorisés (Single Responsibility)
import {
  useConversationSelection,
  useConversationUI,
  useConversationTyping,
  useComposerDrafts,
  useMessageActions,
  useTranslationState,
  useParticipants,
  useVideoCall,
  useSocketCallbacks,
} from '@/hooks/conversations';

// Dynamic imports (bundle-dynamic-imports) - chargés uniquement quand nécessaires
const AttachmentGallery = dynamic(
  () => import('@/components/attachments/AttachmentGallery').then(m => m.AttachmentGallery),
  { ssr: false }
);

interface ConversationLayoutProps {
  selectedConversationId?: string;
}

// Loader statique hoisted (rendering-hoist-jsx)
const AuthCheckingLoader = (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">Vérification de l'authentification...</p>
    </div>
  </div>
);

export function ConversationLayout({ selectedConversationId }: ConversationLayoutProps) {
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { t } = useI18n('conversations');
  const { t: tCommon } = useI18n('common');

  // Notification system
  const { setActiveConversationId } = useNotificationActions();
  useNotificationsManagerRQ(); // Initialise Socket.IO pour les notifications en temps réel

  // Instance ID pour debugging
  const instanceId = useMemo(
    () => `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    []
  );

  // Mémoiser les choix de langues (rerender-memo)
  const languageChoices = useMemo(() => {
    return user ? getUserLanguageChoices(user) : [];
  }, [user?.systemLanguage, user?.regionalLanguage, user?.customDestinationLanguage]);

  // ========== HOOKS PAGINATION ==========
  const {
    conversations: paginatedConversations,
    isLoading: isLoadingConversations,
    isLoadingMore: isLoadingMoreConversations,
    hasMore: hasMoreConversations,
    loadMore: loadMoreConversations,
    refresh: refreshConversations,
    setConversations,
  } = useConversationsPaginationRQ({ limit: 50, enabled: !!user });

  const conversations = paginatedConversations;

  // ========== HOOKS REFACTORISÉS ==========

  // Sélection de conversation
  const {
    effectiveSelectedId,
    selectedConversation,
    handleSelectConversation,
    handleBackToList,
    setLocalSelectedConversationId,
  } = useConversationSelection({ selectedConversationId, conversations });

  // UI (mobile, resize, modals, galerie)
  const {
    isMobile,
    showConversationList,
    conversationListWidth,
    isResizing,
    handleResizeMouseDown,
    isCreateModalOpen,
    setIsCreateModalOpen,
    galleryOpen,
    setGalleryOpen,
    selectedAttachmentId,
    handleImageClick,
  } = useConversationUI({ selectedConversationId: effectiveSelectedId });

  // Brouillons du composer
  const {
    message: newMessage,
    setMessage: setNewMessage,
    attachmentIds,
    setAttachmentIds,
    attachmentMimeTypes,
    clearDraft,
    handleAttachmentsChange,
  } = useComposerDrafts({ conversationId: effectiveSelectedId });

  // Traductions
  const {
    addTranslatingState,
    removeTranslatingState,
    isTranslating,
    usedLanguages,
    addUsedLanguages,
  } = useTranslationState();

  // Participants
  const { participants, participantsRef, loadParticipants } = useParticipants({
    conversationId: effectiveSelectedId,
  });

  // Appels vidéo
  const { startCall: handleStartCall } = useVideoCall({
    conversation: selectedConversation,
  });

  // États locaux
  const [selectedLanguage, setSelectedLanguage] = useState('fr');

  // Refs
  const selectedConversationIdRef = useRef<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messageComposerRef = useRef<{
    focus: () => void;
    blur: () => void;
    clearAttachments?: () => void;
    clearMentionedUserIds?: () => void;
    getMentionedUserIds?: () => string[];
  }>(null);
  const hasAttemptedReconnect = useRef(false);
  const previousConversationIdRef = useRef<string | null>(null);
  const hasLoadedInitialConversations = useRef(false);
  const currentFocusedConversationRef = useRef<string | null>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Activer les mises à jour de statut utilisateur en temps réel
  useUserStatusRealtime();

  // Sync Socket.IO events avec le cache React Query
  useSocketCacheSync({ conversationId: effectiveSelectedId, enabled: !!effectiveSelectedId });
  useInvalidateOnReconnect();

  // Clavier virtuel mobile
  const keyboardState = useVirtualKeyboard();

  // Mettre à jour ref quand conversation change
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversation?.id || null;
  }, [selectedConversation?.id]);

  // ========== HOOKS MESSAGES ==========
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
    removeMessage,
  } = useConversationMessagesRQ(selectedConversation?.id || null, user!, {
    limit: 20,
    enabled: !!selectedConversation?.id,
    containerRef: messagesScrollRef,
  });

  // Actions sur les messages
  const { handleEditMessage, handleDeleteMessage, handleNavigateToMessage, imageAttachments } =
    useMessageActions({
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

  // ========== SOCKET CALLBACKS ==========
  const { onNewMessage, onMessageEdited, onMessageDeleted, onTranslation, onUserTyping } =
    useSocketCallbacks({
      conversationId: selectedConversation?.id || null,
      currentUser: user,
      addMessage,
      updateMessage,
      removeMessage,
      setConversations,
      refreshConversations,
      removeTranslatingState,
      addUsedLanguages,
    });

  // Socket.IO messaging
  const { sendMessage: sendMessageViaSocket, connectionStatus, startTyping, stopTyping } =
    useSocketIOMessaging({
      conversationId: selectedConversation?.id,
      currentUser: user || undefined,
      onUserTyping,
      onMessageEdited,
      onMessageDeleted,
      onNewMessage,
      onTranslation,
    });

  // Typing indicators
  const { typingUsers, isTyping, handleTypingStop, handleTextInput: handleTypingTextInput } =
    useConversationTyping({
      conversationId: selectedConversation?.id || null,
      currentUserId: user?.id || null,
      participants,
      startTyping,
      stopTyping,
    });

  // ========== EFFECTS ==========

  // Informer le store de notifications
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

  // Charger conversation directe si pas dans liste
  const loadDirectConversation = useCallback(
    async (conversationId: string) => {
      try {
        const directConversation = await conversationsService.getConversation(conversationId);
        setConversations(prev => {
          if (prev.find(c => c.id === directConversation.id)) return prev;
          return [directConversation, ...prev];
        });
      } catch (error) {
        console.error(`[ConversationLayout-${instanceId}] Erreur chargement direct:`, error);
      }
    },
    [setConversations, instanceId]
  );

  useEffect(() => {
    if (effectiveSelectedId && !isLoadingConversations && conversations.length > 0) {
      const found = conversations.find(c => c.id === effectiveSelectedId);
      if (!found) loadDirectConversation(effectiveSelectedId);
    }
  }, [effectiveSelectedId, conversations, isLoadingConversations, loadDirectConversation]);

  // Charger conversations au montage
  useEffect(() => {
    if (user && !hasLoadedInitialConversations.current) {
      hasLoadedInitialConversations.current = true;
      refreshConversations();
      setSelectedLanguage(user.systemLanguage || 'fr');
    } else if (user) {
      setSelectedLanguage(user.systemLanguage || 'fr');
    }
  }, [user?.id, refreshConversations]);

  // Auto-focus sur le composer lors de l'ouverture d'une conversation
  // DOIT être défini AVANT le useEffect de chargement pour s'exécuter en premier
  useEffect(() => {
    const targetId = effectiveSelectedId;

    if (!targetId || isMobile) return;

    // Ne pas focus si on a déjà focusé cette conversation
    if (targetId === currentFocusedConversationRef.current) return;

    // Délai pour s'assurer que le MessageComposer est complètement monté
    const focusTimeout = setTimeout(() => {
      if (messageComposerRef.current?.focus) {
        messageComposerRef.current.focus();
        currentFocusedConversationRef.current = targetId;
      }
    }, 500);

    return () => clearTimeout(focusTimeout);
  }, [effectiveSelectedId, isMobile]);

  // Chargement parallèle conversation + participants (async-parallel)
  useEffect(() => {
    const targetId = selectedConversationId || selectedConversation?.id;
    if (!targetId || !user) return;
    if (targetId === previousConversationIdRef.current) return;

    clearMessages();
    previousConversationIdRef.current = targetId;

    const loadPromises: Promise<void>[] = [];
    const needsConversation = !conversations.find(c => c.id === targetId);

    if (needsConversation) loadPromises.push(loadDirectConversation(targetId));
    loadPromises.push(loadParticipants(targetId));

    Promise.all(loadPromises).catch(error => {
      console.error(`[ConversationLayout-${instanceId}] Erreur chargement parallèle:`, error);
    });
  }, [
    selectedConversationId,
    selectedConversation?.id,
    user,
    conversations,
    loadDirectConversation,
    loadParticipants,
    clearMessages,
    instanceId,
  ]);

  // Synchroniser l'ID de conversation active pour filtrer les notifications
  // Cela permet d'éviter d'afficher des notifications pour la conversation déjà ouverte
  useEffect(() => {
    if (effectiveSelectedId) {
      setActiveConversationId(effectiveSelectedId);
      console.debug(`[ConversationLayout] Active conversation set: ${effectiveSelectedId}`);
    }

    // Cleanup: réinitialiser quand le composant se démonte ou change de conversation
    return () => {
      setActiveConversationId(null);
      console.debug('[ConversationLayout] Active conversation cleared');
    };
  }, [effectiveSelectedId, setActiveConversationId]);

  // Marquer comme lu quand scroll vers le bas
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
          conversationsService
            .markAsRead(conversationId)
            .then(() => {
              setConversations(prev =>
                prev.map(conv =>
                  conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
                )
              );
            })
            .catch(console.error);
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

  // Reconnexion automatique
  useEffect(() => {
    if (!connectionStatus.isConnected && connectionStatus.hasSocket && user) {
      if (hasAttemptedReconnect.current) return;
      hasAttemptedReconnect.current = true;

      const reconnectTimer = setTimeout(() => {
        if (!connectionStatus.isConnected) {
          meeshySocketIOService.reconnect();
          setTimeout(() => {
            hasAttemptedReconnect.current = false;
          }, 10000);
        }
      }, 3000);

      return () => clearTimeout(reconnectTimer);
    }

    if (connectionStatus.isConnected) hasAttemptedReconnect.current = false;
  }, [connectionStatus.isConnected, connectionStatus.hasSocket, user]);

  // ========== HANDLERS ==========

  // Sélectionner une conversation depuis le menu "Paramètres" de la liste
  const handleShowDetails = useCallback(
    (conversation: Conversation) => {
      if (effectiveSelectedId !== conversation.id) {
        handleSelectConversation(conversation);
      }
      // Le modal de paramètres s'ouvre maintenant depuis le header de la conversation
    },
    [effectiveSelectedId, handleSelectConversation]
  );

  const handleReplyMessage = useCallback((message: any) => {
    useReplyStore.getState().setReplyingTo({
      id: message.id,
      content: message.content,
      originalLanguage: message.originalLanguage,
      sender: message.sender,
      createdAt: message.createdAt,
      translations: message.translations,
      attachments: message.attachments,
    });
    messageComposerRef.current?.focus();
  }, []);

  const handleNavigateToMessageFromGallery = useCallback(
    (messageId: string) => {
      setGalleryOpen(false);
      setTimeout(() => handleNavigateToMessage(messageId), 300);
    },
    [handleNavigateToMessage, setGalleryOpen]
  );

  const handleSendMessage = useCallback(async () => {
    if ((!newMessage.trim() && attachmentIds.length === 0) || !selectedConversation || !user)
      return;

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
      if (isTyping) handleTypingStop();

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
        conversationsService
          .markAsRead(selectedConversation.id)
          .then(() => {
            setConversations(prev =>
              prev.map(conv =>
                conv.id === selectedConversation.id ? { ...conv, unreadCount: 0 } : conv
              )
            );
          })
          .catch(console.error);
      }

      clearDraft();
      messageComposerRef.current?.clearAttachments?.();
      messageComposerRef.current?.clearMentionedUserIds?.();

      if (replyToId) useReplyStore.getState().clearReply();

      setTimeout(() => {
        messagesScrollRef.current?.scrollTo({
          top: messagesScrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    } catch (error) {
      console.error('[ConversationLayout] Erreur envoi message:', error);
      setAttachmentIds(currentAttachmentIds);
    }
  }, [
    newMessage,
    selectedConversation,
    user,
    attachmentIds,
    attachmentMimeTypes,
    effectiveSelectedId,
    selectedLanguage,
    isTyping,
    handleTypingStop,
    sendMessageViaSocket,
    clearDraft,
    setConversations,
    setAttachmentIds,
    t,
  ]);

  const handleTyping = useCallback(
    (value: string) => {
      setNewMessage(value);
      handleTypingTextInput(value);
    },
    [setNewMessage, handleTypingTextInput]
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMobile) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage, isMobile]
  );

  const handleRestoreFailedMessage = useCallback(
    (failedMsg: FailedMessage) => {
      setNewMessage(failedMsg.content);
      setSelectedLanguage(failedMsg.originalLanguage);
      if (failedMsg.attachmentIds.length > 0) setAttachmentIds(failedMsg.attachmentIds);
      if (failedMsg.replyTo) useReplyStore.getState().setReplyingTo(failedMsg.replyTo as any);
      setTimeout(() => messageComposerRef.current?.focus(), 100);
      toast.info(t('messageRestored') || 'Message restauré.');
    },
    [setNewMessage, setAttachmentIds, t]
  );

  const handleRetryFailedMessage = useCallback(
    async (failedMsg: FailedMessage): Promise<boolean> => {
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
    },
    [selectedConversation?.id, user, sendMessageViaSocket]
  );

  const handleConversationUpdated = useCallback(
    (updatedData: Partial<Conversation>) => {
      if (!selectedConversation) return;
      setConversations(prev =>
        prev.map(conv =>
          conv.id === selectedConversation.id ? { ...conv, ...updatedData } : conv
        )
      );
    },
    [selectedConversation, setConversations]
  );

  // ========== RENDER ==========

  if (isAuthChecking) return AuthCheckingLoader;
  if (!user) return null;

  // Mode mobile avec conversation ouverte
  if (isMobile && selectedConversation) {
    return (
      <>
        <ConversationView
          conversation={selectedConversation}
          currentUser={user}
          messages={messages}
          participants={participants}
          isMobile={true}
          isKeyboardOpen={keyboardState.isOpen}
          isConnected={connectionStatus.isConnected}
          selectedLanguage={selectedLanguage}
          usedLanguages={usedLanguages}
          userLanguage={user.systemLanguage}
          isLoadingMessages={isLoadingMessages}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          composerValue={newMessage}
          languageChoices={languageChoices}
          typingUsers={typingUsers}
          addTranslatingState={addTranslatingState}
          isTranslating={isTranslating}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onReplyMessage={handleReplyMessage}
          onNavigateToMessage={handleNavigateToMessage}
          onImageClick={handleImageClick}
          onLoadMore={loadMore}
          onComposerChange={handleTyping}
          onSendMessage={handleSendMessage}
          onLanguageChange={setSelectedLanguage}
          onKeyPress={handleKeyPress}
          onAttachmentsChange={handleAttachmentsChange}
          onRetryFailedMessage={handleRetryFailedMessage}
          onRestoreFailedMessage={handleRestoreFailedMessage}
          onBackToList={handleBackToList}
          onStartCall={handleStartCall}
          onOpenGallery={() => setGalleryOpen(true)}
          onParticipantAdded={() => loadParticipants(effectiveSelectedId)}
          onParticipantRemoved={() => loadParticipants(effectiveSelectedId)}
          onLinkCreated={() => {}}
          scrollContainerRef={messagesScrollRef}
          composerRef={messageComposerRef}
          t={t}
          tCommon={tCommon}
          showBackButton={!!selectedConversationId}
        />

        {galleryOpen && (
          <AttachmentGallery
            conversationId={selectedConversation.id}
            initialAttachmentId={selectedAttachmentId || undefined}
            open={galleryOpen}
            onClose={() => setGalleryOpen(false)}
            onNavigateToMessage={handleNavigateToMessageFromGallery}
            attachments={imageAttachments}
          />
        )}
      </>
    );
  }

  // Mode desktop ou mobile sans conversation
  return (
    <div className="flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden h-screen">
      <DashboardLayout
        title={t('conversationLayout.conversations.title')}
        hideHeaderOnMobile={false}
        className="!bg-none !bg-transparent !h-full !min-h-0 !max-w-none !px-0 !overflow-hidden flex-1"
      >
        <div
          className={cn(
            'flex bg-transparent conversation-layout relative z-10 w-full h-full overflow-hidden',
            isMobile ? 'h-[calc(100vh-4rem)]' : 'h-full'
          )}
          role="region"
          aria-label={t('conversationLayout.conversations.title')}
        >
          {/* Liste des conversations */}
          {(!isMobile || !selectedConversationId) && (
            <>
              <aside
                ref={resizeRef}
                style={!isMobile ? { width: `${conversationListWidth}px` } : undefined}
                className={cn(
                  'flex-shrink-0 bg-white dark:bg-gray-950 border-r-2 border-gray-200 dark:border-gray-800 shadow-lg',
                  isMobile
                    ? showConversationList
                      ? 'fixed top-16 left-0 right-0 bottom-0 z-40 w-full'
                      : 'hidden'
                    : 'relative h-full'
                )}
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
                    'w-1 hover:w-2 bg-transparent hover:bg-primary/20 cursor-col-resize',
                    'transition-[width,background-color] duration-150 relative group',
                    isResizing && 'w-2 bg-primary/30'
                  )}
                  style={{ userSelect: 'none', touchAction: 'none' }}
                >
                  <div className="absolute inset-y-0 -left-1 -right-1" />
                  <div
                    className={cn(
                      'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                      'w-1 h-8 rounded-full bg-muted-foreground/20',
                      'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
                      isResizing && 'opacity-100 bg-primary/50'
                    )}
                  />
                </div>
              )}
            </>
          )}

          {/* Zone principale */}
          <main
            className={cn(
              'flex flex-col min-w-0',
              selectedConversationId ? 'w-full h-full' : 'flex-1 h-full'
            )}
            aria-label={
              selectedConversation
                ? t('conversationLayout.conversationWith', { name: selectedConversation.title })
                : t('conversationLayout.selectConversation')
            }
          >
            {selectedConversation ? (
              <ConversationView
                conversation={selectedConversation}
                currentUser={user}
                messages={messages}
                participants={participants}
                isMobile={false}
                isConnected={connectionStatus.isConnected}
                selectedLanguage={selectedLanguage}
                usedLanguages={usedLanguages}
                userLanguage={user.systemLanguage}
                isLoadingMessages={isLoadingMessages}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                composerValue={newMessage}
                languageChoices={languageChoices}
                typingUsers={typingUsers}
                addTranslatingState={addTranslatingState}
                isTranslating={isTranslating}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
                onReplyMessage={handleReplyMessage}
                onNavigateToMessage={handleNavigateToMessage}
                onImageClick={handleImageClick}
                onLoadMore={loadMore}
                onComposerChange={handleTyping}
                onSendMessage={handleSendMessage}
                onLanguageChange={setSelectedLanguage}
                onKeyPress={handleKeyPress}
                onAttachmentsChange={handleAttachmentsChange}
                onRetryFailedMessage={handleRetryFailedMessage}
                onRestoreFailedMessage={handleRestoreFailedMessage}
                onBackToList={handleBackToList}
                onStartCall={handleStartCall}
                onOpenGallery={() => setGalleryOpen(true)}
                onParticipantAdded={() => loadParticipants(effectiveSelectedId)}
                onParticipantRemoved={() => loadParticipants(effectiveSelectedId)}
                onLinkCreated={() => {}}
                scrollContainerRef={messagesScrollRef}
                composerRef={messageComposerRef}
                t={t}
                tCommon={tCommon}
                showBackButton={!!selectedConversationId}
              />
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

      {/* Gallery - Desktop */}
      {selectedConversation && galleryOpen && (
        <AttachmentGallery
          conversationId={selectedConversation.id}
          initialAttachmentId={selectedAttachmentId || undefined}
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onNavigateToMessage={handleNavigateToMessageFromGallery}
          attachments={imageAttachments}
        />
      )}
    </div>
  );
}
