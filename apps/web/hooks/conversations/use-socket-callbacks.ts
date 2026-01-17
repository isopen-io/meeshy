/**
 * useSocketCallbacks - Centralise les callbacks Socket.IO pour les messages
 *
 * Suit les Vercel React Best Practices:
 * - Logique isolée dans un hook dédié
 * - useCallback avec dépendances minimales
 * - Évite les re-renders inutiles
 *
 * @module hooks/conversations/use-socket-callbacks
 */

import { useCallback, useRef, useEffect } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { Message, Conversation, User } from '@meeshy/shared/types';

interface Translation {
  id?: string;
  messageId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  language?: string;
  translatedContent?: string;
  content?: string;
  translationModel?: string;
  model?: string;
  cacheKey?: string;
  cached?: boolean;
  fromCache?: boolean;
  confidenceScore?: number;
  confidence?: number;
  createdAt?: string | Date;
}

interface UseSocketCallbacksOptions {
  /**
   * ID de la conversation courante
   */
  conversationId: string | null;

  /**
   * Utilisateur courant
   */
  currentUser: User | null;

  /**
   * Ajoute un message à la liste
   */
  addMessage: (message: Message) => void;

  /**
   * Met à jour un message
   */
  updateMessage: (
    messageId: string,
    updater: Message | ((prev: Message) => Message)
  ) => void;

  /**
   * Supprime un message
   */
  removeMessage: (messageId: string) => void;

  /**
   * Met à jour la liste des conversations
   */
  setConversations: (updater: (prev: Conversation[]) => Conversation[]) => void;

  /**
   * Rafraîchit les conversations
   */
  refreshConversations: () => void;

  /**
   * Supprime l'état de traduction en cours
   */
  removeTranslatingState: (messageId: string, targetLanguage: string) => void;

  /**
   * Ajoute des langues utilisées
   */
  addUsedLanguages: (languages: string[]) => void;
}

interface UseSocketCallbacksReturn {
  /**
   * Callback pour les nouveaux messages
   */
  onNewMessage: (message: Message) => void;

  /**
   * Callback pour les messages édités
   */
  onMessageEdited: (message: Message) => void;

  /**
   * Callback pour les messages supprimés
   */
  onMessageDeleted: (messageId: string) => void;

  /**
   * Callback pour les traductions
   */
  onTranslation: (messageId: string, translations: Translation[]) => void;

  /**
   * Callback pour les indicateurs de frappe
   */
  onUserTyping: (
    userId: string,
    username: string,
    isTyping: boolean,
    typingConversationId: string
  ) => void;
}

/**
 * Hook pour centraliser les callbacks Socket.IO
 */
export function useSocketCallbacks({
  conversationId,
  currentUser,
  addMessage,
  updateMessage,
  removeMessage,
  setConversations,
  refreshConversations,
  removeTranslatingState,
  addUsedLanguages,
}: UseSocketCallbacksOptions): UseSocketCallbacksReturn {
  // Refs pour éviter les dépendances dans les callbacks
  const conversationIdRef = useRef(conversationId);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  /**
   * Callback pour les nouveaux messages
   */
  const onNewMessage = useCallback(
    (message: Message) => {
      const currentConvId = conversationIdRef.current;
      const normalizedConvId = meeshySocketIOService.getCurrentConversationId();

      const isForCurrentConversation =
        message.conversationId === normalizedConvId &&
        message.conversationId === currentConvId;

      // Mettre à jour la liste des conversations
      setConversations(prevConversations => {
        const conversationIndex = prevConversations.findIndex(
          c => c.id === message.conversationId
        );

        if (conversationIndex === -1) {
          // Conversation non trouvée, rafraîchir la liste
          setTimeout(() => refreshConversations(), 100);
          return prevConversations;
        }

        const currentConversation = prevConversations[conversationIndex];
        const isMessageFromCurrentUser =
          currentUser && message.senderId === currentUser.id;
        const isCurrentlyViewingThisConversation =
          message.conversationId === currentConvId;

        const shouldIncrementUnread =
          !isMessageFromCurrentUser && !isCurrentlyViewingThisConversation;

        const updatedConversation = {
          ...currentConversation,
          lastMessage: message,
          lastMessageAt: message.createdAt || new Date(),
          lastActivityAt: message.createdAt || new Date(),
          unreadCount: shouldIncrementUnread
            ? (currentConversation.unreadCount || 0) + 1
            : currentConversation.unreadCount || 0,
        };

        // Déplacer la conversation en haut de la liste
        const updatedConversations = prevConversations.filter(
          (_, index) => index !== conversationIndex
        );

        return [updatedConversation, ...updatedConversations];
      });

      // Ajouter le message si c'est la conversation courante
      if (isForCurrentConversation) {
        addMessage(message);
      }
    },
    [addMessage, setConversations, refreshConversations, currentUser]
  );

  /**
   * Callback pour les messages édités
   */
  const onMessageEdited = useCallback(
    (message: Message) => {
      if (message.conversationId === conversationIdRef.current) {
        updateMessage(message.id, message);
      }
    },
    [updateMessage]
  );

  /**
   * Callback pour les messages supprimés
   */
  const onMessageDeleted = useCallback(
    (messageId: string) => {
      removeMessage(messageId);
    },
    [removeMessage]
  );

  /**
   * Callback pour les traductions
   */
  const onTranslation = useCallback(
    (messageId: string, translations: Translation[]) => {
      updateMessage(messageId, prevMessage => {
        const existingTranslations = Array.isArray(prevMessage.translations)
          ? prevMessage.translations
          : [];

        const updatedTranslations = [...existingTranslations];

        for (const newTranslation of translations) {
          const targetLang =
            newTranslation.targetLanguage || newTranslation.language;
          const content =
            newTranslation.translatedContent || newTranslation.content;

          if (!targetLang || !content) continue;

          const existingIndex = updatedTranslations.findIndex(
            t => t.targetLanguage === targetLang
          );

          const translationObject = {
            id: newTranslation.id || `${messageId}_${targetLang}`,
            messageId,
            sourceLanguage:
              newTranslation.sourceLanguage ||
              prevMessage.originalLanguage ||
              'fr',
            targetLanguage: targetLang,
            translatedContent: content,
            translationModel:
              newTranslation.translationModel ||
              newTranslation.model ||
              'basic',
            cacheKey: newTranslation.cacheKey || `${messageId}_${targetLang}`,
            cached: newTranslation.cached || newTranslation.fromCache || false,
            confidenceScore:
              newTranslation.confidenceScore ||
              newTranslation.confidence ||
              0.9,
            createdAt: newTranslation.createdAt
              ? new Date(newTranslation.createdAt)
              : new Date(),
          };

          if (existingIndex >= 0) {
            updatedTranslations[existingIndex] = translationObject;
          } else {
            updatedTranslations.push(translationObject);
          }
        }

        return { ...prevMessage, translations: updatedTranslations };
      });

      // Mettre à jour les langues utilisées
      const newLanguages = translations
        .map(t => t.targetLanguage || t.language)
        .filter((lang): lang is string => Boolean(lang));

      addUsedLanguages(newLanguages);

      // Supprimer les états de traduction en cours
      for (const translation of translations) {
        const targetLang =
          translation.targetLanguage || translation.language;
        if (targetLang) {
          removeTranslatingState(messageId, targetLang);
        }
      }
    },
    [updateMessage, removeTranslatingState, addUsedLanguages]
  );

  /**
   * Callback pour les indicateurs de frappe
   */
  const onUserTyping = useCallback(
    (
      userId: string,
      _username: string,
      _isTyping: boolean,
      typingConversationId: string
    ) => {
      // Ignorer les événements de l'utilisateur courant
      if (!currentUser || userId === currentUser.id) return;

      // Ignorer les événements d'autres conversations
      if (typingConversationId !== conversationIdRef.current) return;

      // Note: La gestion des typingUsers est déléguée à useConversationTyping
    },
    [currentUser]
  );

  return {
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onTranslation,
    onUserTyping,
  };
}
