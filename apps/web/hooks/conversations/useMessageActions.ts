/**
 * Hook pour les actions sur les messages
 * Gère: édition, suppression, navigation, galerie
 *
 * @module hooks/conversations/useMessageActions
 */

'use client';

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { messageService } from '@/services/message.service';
import { sanitizeText } from '@/utils/xss-protection';
import type { Message, Attachment } from '@meeshy/shared/types';

interface UseMessageActionsOptions {
  /** ID de la conversation */
  conversationId: string | null;
  /** Liste des messages */
  messages: Message[];
  /** Langue sélectionnée */
  selectedLanguage: string;
  /** Updater de message (du hook React Query) */
  updateMessage: (id: string, updates: Partial<Message> | ((prev: Message) => Message)) => void;
  /** Suppression de message (du hook React Query) */
  removeMessage: (id: string) => void;
  /** Refresh des messages */
  refreshMessages: () => Promise<void>;
  /** Fonction de traduction */
  t: (key: string) => string;
  /** Fonction pour charger plus de messages */
  loadMore?: () => Promise<void>;
  /** Y a-t-il plus de messages à charger */
  hasMore?: boolean;
}

interface UseMessageActionsReturn {
  /** Éditer un message */
  handleEditMessage: (messageId: string, newContent: string) => Promise<void>;
  /** Supprimer un message */
  handleDeleteMessage: (messageId: string) => Promise<void>;
  /** Naviguer vers un message (avec lazy loading si nécessaire) */
  handleNavigateToMessage: (messageId: string) => Promise<void>;
  /** Tous les attachments images des messages */
  imageAttachments: Attachment[];
}

/**
 * Hook pour gérer les actions CRUD sur les messages
 */
export function useMessageActions({
  conversationId,
  messages,
  selectedLanguage,
  updateMessage,
  removeMessage,
  refreshMessages,
  t,
  loadMore,
  hasMore = false,
}: UseMessageActionsOptions): UseMessageActionsReturn {

  // Éditer un message
  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!conversationId) return;

    // Sanitize input
    const sanitizedContent = sanitizeText(newContent);
    if (!sanitizedContent.trim()) {
      toast.error(t('messages.contentRequired') || 'Content required');
      return;
    }

    try {
      // Optimistic update
      updateMessage(messageId, (prev) => ({
        ...prev,
        content: sanitizedContent,
        isEdited: true,
        editedAt: new Date(),
      }));

      // API call
      await messageService.editMessage(conversationId, messageId, {
        content: sanitizedContent,
        originalLanguage: selectedLanguage,
      });

      toast.success(t('messages.messageEdited') || 'Message edited');
    } catch (error) {
      console.error('Edit error:', error);
      toast.error(t('messages.editError') || 'Edit failed');

      // Rollback: recharger les messages
      await refreshMessages();
      throw error;
    }
  }, [conversationId, selectedLanguage, updateMessage, refreshMessages, t]);

  // Supprimer un message
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!conversationId) return;

    try {
      // Optimistic update
      removeMessage(messageId);

      // API call
      await messageService.deleteMessage(conversationId, messageId);

      toast.success(t('messages.messageDeleted') || 'Message deleted');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('messages.deleteError') || 'Delete failed');

      // Rollback
      await refreshMessages();
      throw error;
    }
  }, [conversationId, removeMessage, refreshMessages, t]);

  // Naviguer vers un message (avec lazy loading)
  const handleNavigateToMessage = useCallback(async (messageId: string) => {
    // Helper pour scroller et highlight
    const scrollToMessageElement = (element: HTMLElement) => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      // Highlight temporaire
      element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);

      toast.success(t('messages.messageFound') || 'Message found');
    };

    // Helper pour attendre l'élément dans le DOM
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

    // Étape 2: Vérifier si le message est chargé mais pas rendu
    const messageExists = messages.some(msg => msg.id === messageId);
    if (messageExists) {
      toast.info(t('messages.loadingMessage') || 'Loading message...');
      messageElement = await waitForElement(messageId);
      if (messageElement) {
        scrollToMessageElement(messageElement);
        return;
      }
    }

    // Étape 3: Charger plus de messages si disponible
    if (!loadMore || !hasMore) {
      toast.error(t('messages.messageNotFound') || 'Message not found');
      return;
    }

    toast.info(t('messages.loadingOlderMessages') || 'Loading older messages...');

    // Max 3 tentatives de chargement
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

    // Message non trouvé
    toast.error(t('messages.messageNotFound') || 'Message not found');
  }, [messages, t, loadMore, hasMore]);

  // Extraire les attachments images pour la galerie
  const imageAttachments = useMemo(() => {
    const attachments: Attachment[] = [];

    messages.forEach(message => {
      if (message.attachments && message.attachments.length > 0) {
        message.attachments.forEach(attachment => {
          if (attachment.mimeType?.startsWith('image/')) {
            attachments.push(attachment);
          }
        });
      }
    });

    return attachments;
  }, [messages]);

  return {
    handleEditMessage,
    handleDeleteMessage,
    handleNavigateToMessage,
    imageAttachments,
  };
}
