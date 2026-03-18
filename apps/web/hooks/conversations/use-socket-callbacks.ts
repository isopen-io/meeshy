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
  addMessage: _addMessage,
  updateMessage: _updateMessage,
  removeMessage: _removeMessage,
  setConversations: _setConversations,
  refreshConversations: _refreshConversations,
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
   * NOTE: Cache mutations (addMessage, setConversations) removed — useSocketCacheSync is the single cache writer.
   * This callback only handles UI side-effects (scroll, mark-as-received, etc.)
   */
  const onNewMessage = useCallback(
    (_message: Message) => {
      // All cache mutations (addMessage, setConversations with lastMessage/unreadCount/reorder)
      // are handled by useSocketCacheSync to avoid dual-write duplicates.
      // UI-only effects (scroll-to-bottom, mark-as-received) are handled in ConversationLayout.
    },
    []
  );

  /**
   * Callback pour les messages édités
   * NOTE: Cache mutation (updateMessage) removed — useSocketCacheSync is the single cache writer.
   */
  const onMessageEdited = useCallback(
    (_message: Message) => {
      // Cache mutation handled by useSocketCacheSync.
    },
    []
  );

  /**
   * Callback pour les messages supprimés
   * NOTE: Cache mutation (removeMessage) removed — useSocketCacheSync is the single cache writer.
   */
  const onMessageDeleted = useCallback(
    (_messageId: string) => {
      // Cache mutation handled by useSocketCacheSync.
    },
    []
  );

  /**
   * Callback pour les traductions
   * NOTE: Cache mutation (updateMessage) removed — useSocketCacheSync is the single cache writer.
   * Keeps: removeTranslatingState + addUsedLanguages (UI state, not cache).
   */
  const onTranslation = useCallback(
    (messageId: string, translations: Translation[]) => {
      // Cache mutation (updateMessage with translations merge) handled by useSocketCacheSync.

      // Update UI-only state: used languages
      const newLanguages = translations
        .map(t => t.targetLanguage || t.language)
        .filter((lang): lang is string => Boolean(lang));

      addUsedLanguages(newLanguages);

      // Remove translating spinners
      for (const translation of translations) {
        const targetLang =
          translation.targetLanguage || translation.language;
        if (targetLang) {
          removeTranslatingState(messageId, targetLang);
        }
      }
    },
    [removeTranslatingState, addUsedLanguages]
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
