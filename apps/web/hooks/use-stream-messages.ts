/**
 * Hook useStreamMessages - Gestion des messages pour BubbleStream
 *
 * Extrait de bubble-stream-page.tsx pour responsabilité unique.
 * Gère le CRUD des messages, la navigation, et la modération.
 *
 * @module hooks/use-stream-messages
 */

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { messageService } from '@/services/message.service';
import { useReplyStore } from '@/stores/reply-store';
import type { Message, User, UserRoleEnum } from '@meeshy/shared/types';

interface UseStreamMessagesOptions {
  conversationId: string;
  user: User;
  messages: Message[];
  hasMore: boolean;
  selectedInputLanguage: string;
  refreshMessages: () => Promise<void>;
  loadMore: () => void;
  messageComposerRef: React.RefObject<any>;
  t: (key: string, params?: Record<string, string>) => string;
  tCommon: (key: string) => string;
}

interface UseStreamMessagesReturn {
  // Handlers pour les messages
  handleEditMessage: (messageId: string, newContent: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => Promise<void>;
  handleReplyMessage: (message: any) => void;
  handleNavigateToMessage: (messageId: string) => Promise<void>;

  // Rôle de modération
  getUserModerationRole: () => UserRoleEnum;
}

/**
 * Hook pour gérer les opérations sur les messages du BubbleStream
 */
export function useStreamMessages({
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
}: UseStreamMessagesOptions): UseStreamMessagesReturn {

  // Éditer un message
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    try {
      await messageService.editMessage(conversationId, messageId, {
        content: newContent,
        originalLanguage: selectedInputLanguage
      });

      await refreshMessages();
      toast.success(tCommon('messages.messageModified'));
    } catch (error) {
      console.error('Erreur lors de la modification du message:', error);
      toast.error(tCommon('messages.modifyError'));
      throw error;
    }
  }, [conversationId, selectedInputLanguage, refreshMessages, tCommon]);

  // Supprimer un message
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await messageService.deleteMessage(conversationId, messageId);

      await refreshMessages();
      toast.success(tCommon('messages.messageDeleted'));
    } catch (error) {
      console.error('Erreur lors de la suppression du message:', error);
      toast.error(tCommon('messages.deleteError'));
      throw error;
    }
  }, [conversationId, refreshMessages, tCommon]);

  // Répondre à un message
  const handleReplyMessage = useCallback((message: any) => {
    const { setReplyingTo } = useReplyStore.getState();
    setReplyingTo({
      id: message.id,
      content: message.content,
      originalLanguage: message.originalLanguage,
      sender: message.sender,
      createdAt: message.createdAt,
      translations: message.translations,
      attachments: message.attachments
    });

    if (messageComposerRef.current) {
      messageComposerRef.current.focus();
    }
  }, [messageComposerRef]);

  // Naviguer vers un message
  const handleNavigateToMessage = useCallback(async (messageId: string) => {

    // Helper pour scroller vers un message et le mettre en évidence
    const scrollToMessageElement = (element: HTMLElement) => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);

      toast.success(tCommon('messages.messageFound'));
    };

    // Helper pour attendre et réessayer de trouver l'élément
    const waitForElement = async (id: string, maxAttempts = 5): Promise<HTMLElement | null> => {
      for (let i = 0; i < maxAttempts; i++) {
        const element = document.getElementById(`message-${id}`);
        if (element) return element;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return null;
    };

    // Étape 1: Vérifier si l'élément est déjà dans le DOM
    let messageElement = document.getElementById(`message-${messageId}`);

    if (messageElement) {
      scrollToMessageElement(messageElement);
      return;
    }

    // Étape 2: Vérifier si le message existe dans la liste
    const messageExists = messages.some(msg => msg.id === messageId);

    if (messageExists) {
      toast.info(tCommon('messages.loadingMessage'));
      messageElement = await waitForElement(messageId);

      if (messageElement) {
        scrollToMessageElement(messageElement);
        return;
      }
    }

    // Étape 3: Le message n'est pas chargé - charger plus
    if (!hasMore) {
      toast.error(tCommon('messages.messageNotFound'));
      return;
    }

    toast.info(tCommon('messages.loadingOlderMessages'));

    const maxLoadAttempts = 3;
    for (let attempt = 0; attempt < maxLoadAttempts; attempt++) {
      if (!hasMore) break;

      await loadMore();
      await new Promise(resolve => setTimeout(resolve, 500));

      messageElement = await waitForElement(messageId, 3);

      if (messageElement) {
        scrollToMessageElement(messageElement);
        return;
      }
    }

    toast.error(tCommon('messages.messageNotFound'));
  }, [tCommon, messages, hasMore, loadMore]);

  // Obtenir le rôle de modération
  const getUserModerationRole = useCallback((): UserRoleEnum => {
    const role = (user.role as UserRoleEnum) ?? UserRoleEnum.USER;

    if (
      role === UserRoleEnum.ADMIN ||
      role === UserRoleEnum.BIGBOSS ||
      role === UserRoleEnum.MODERATOR
    ) {
      return role;
    }

    return role;
  }, [user.role]);

  return {
    handleEditMessage,
    handleDeleteMessage,
    handleReplyMessage,
    handleNavigateToMessage,
    getUserModerationRole,
  };
}
