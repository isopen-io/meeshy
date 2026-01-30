/**
 * Hook unifié pour la messagerie
 * Combine l'envoi de messages et les indicateurs de frappe
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSocketIOMessaging } from './use-socketio-messaging';
import { useFailedMessagesStore } from '@/stores/failed-messages-store';
import { 
  validateMessageContent, 
  prepareMessageMetadata, 
  logMessageSend, 
  logMessageSuccess,
  handleMessageError,
  createStandardMessageCallbacks
} from '@/utils/messaging-utils';
import type { User } from '@/types';

interface TypingUser {
  userId: string;
  username: string;
  conversationId: string;
  timestamp: number;
}

interface UseMessagingOptions {
  conversationId?: string;
  currentUser?: User;
  onMessageSent?: (content: string, language: string) => void;
  onMessageFailed?: (content: string, error: Error) => void;
  onNewMessage?: (message: any) => void;
  onMessageEdited?: (message: any) => void;
  onMessageDeleted?: (messageId: string) => void;
  onUserTyping?: (userId: string, username: string, isTyping: boolean, conversationId: string) => void;
  onUserStatus?: (userId: string, username: string, isOnline: boolean) => void;
  onTranslation?: (messageId: string, translations: any[]) => void;
  onConversationStats?: (data: any) => void;
}

interface UseMessagingReturn {
  // État d'envoi
  isSending: boolean;
  sendError: string | null;

  // Actions de messagerie
  sendMessage: (content: string, originalLanguage?: string, replyToId?: string, mentionedUserIds?: string[], attachmentIds?: string[], attachmentMimeTypes?: string[]) => Promise<boolean>;
  editMessage: (messageId: string, newContent: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;

  // Indicateurs de frappe
  typingUsers: TypingUser[];
  isTyping: boolean;
  startTyping: () => void;
  stopTyping: () => void;
  
  // Socket.IO messaging
  socketMessaging: ReturnType<typeof useSocketIOMessaging>;
}

export function useMessaging(options: UseMessagingOptions = {}): UseMessagingReturn {
  const {
    conversationId,
    currentUser,
    onMessageSent,
    onMessageFailed,
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onUserTyping,
    onUserStatus,
    onTranslation,
    onConversationStats
  } = options;

  // 🟠 OPTIMISATION: Extraire uniquement l'ID et la langue pour éviter re-renders
  const currentUserId = currentUser?.id;
  const systemLanguage = currentUser?.systemLanguage || 'fr';

  // État d'envoi
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Indicateurs de frappe
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🟠 OPTIMISATION: Ref pour conversationId stable dans handleTypingEvent
  const conversationIdRef = useRef(conversationId);

  // 🟡 OPTIMISATION: Ref pour cleanup timeout
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Store pour les messages en échec
  const { addFailedMessage } = useFailedMessagesStore();

  // Socket.IO messaging - SERVICE MATURE
  const socketMessaging = useSocketIOMessaging({
    conversationId,
    currentUser,
    events: {
      message: true,
      edit: true,
      delete: true,
      translation: true,
      typing: true,
      status: true,
      conversationStats: true,
      onlineStats: true
    },
    onNewMessage,
    onMessageEdited,
    onMessageDeleted,
    onUserTyping: (userId, username, isTyping, typingConversationId) => {
      // NE PAS FILTRER par conversationId !
      // Le backend normalise les IDs et met tous les clients dans la même room
      // Si tu reçois l'événement, c'est que tu es dans la bonne room
      
      handleTypingEvent(userId, username, isTyping);
      onUserTyping?.(userId, username, isTyping, typingConversationId);
    },
    onUserStatus,
    onTranslation,
    onConversationStats
  });

  // 🟠 OPTIMISATION: handleTypingEvent stable sans dépendances (utilise ref)
  // Gestion des indicateurs de frappe
  const handleTypingEvent = useCallback((userId: string, username: string, isTyping: boolean) => {
    setTypingUsers(prev => {
      if (isTyping) {
        // Ajouter ou mettre à jour l'utilisateur qui tape
        const existingUserIndex = prev.findIndex(user => user.userId === userId);
        const newUser = {
          userId,
          username,
          conversationId: conversationIdRef.current || '',
          timestamp: Date.now()
        };

        if (existingUserIndex >= 0) {
          const updated = [...prev];
          updated[existingUserIndex] = newUser;
          return updated;
        } else {
          return [...prev, newUser];
        }
      } else {
        // Retirer l'utilisateur qui ne tape plus
        return prev.filter(user => user.userId !== userId);
      }
    });
  }, []); // Pas de dépendances! Stable

  // 🟠 OPTIMISATION: startTyping avec currentUserId au lieu de currentUser
  // Actions de frappe
  const startTyping = useCallback(() => {
    if (!isTyping && conversationId && currentUserId) {
      setIsTyping(true);
      socketMessaging.startTyping();

      // Note: Le timeout est géré dans le composant (ConversationLayout)
      // pour permettre un meilleur contrôle du délai de 3 secondes
    }
  }, [isTyping, conversationId, currentUserId, socketMessaging]);

  // 🟠 OPTIMISATION: stopTyping avec currentUserId au lieu de currentUser
  const stopTyping = useCallback(() => {
    if (isTyping && conversationId && currentUserId) {
      setIsTyping(false);
      socketMessaging.stopTyping();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  }, [isTyping, conversationId, currentUserId, socketMessaging]);

  // 🟠 OPTIMISATION: sendMessage avec currentUserId et systemLanguage
  // Envoi de message (avec ou sans attachments)
  const sendMessage = useCallback(async (
    content: string,
    originalLanguage?: string,
    replyToId?: string,
    mentionedUserIds?: string[],
    attachmentIds?: string[],
    attachmentMimeTypes?: string[]
  ): Promise<boolean> => {
    if (!conversationId || !currentUserId) {
      console.error('[MESSAGING] Cannot send message: missing conversationId or currentUserId');
      return false;
    }

    // Validation du contenu (peut être vide si on a des attachments)
    if (!content.trim() && (!attachmentIds || attachmentIds.length === 0)) {
      setSendError('Message vide sans attachments');
      toast.error('Veuillez saisir un message ou ajouter un fichier');
      return false;
    }

    setIsSending(true);
    setSendError(null);

    try {
      // Déterminer la langue source (originalLanguage ou langue système de l'utilisateur)
      const sourceLanguage = originalLanguage || systemLanguage;

      // Préparer les métadonnées
      const metadata = prepareMessageMetadata(content, sourceLanguage);

      // Log de l'envoi avec les BONS paramètres
      logMessageSend(content, sourceLanguage, conversationId);

      // Envoyer via Socket.IO avec la langue correcte
      // socketMessaging.sendMessage prend (content, language, replyToId, mentionedUserIds, attachmentIds, attachmentMimeTypes)
      const success = await socketMessaging.sendMessage(
        content,
        sourceLanguage,
        replyToId,
        mentionedUserIds,
        attachmentIds,
        attachmentMimeTypes
      );

      if (success) {
        // Arrêter la frappe
        stopTyping();
        
        // Log du succès avec les BONS paramètres
        logMessageSuccess(content, sourceLanguage);
        
        // Callback de succès
        onMessageSent?.(content, sourceLanguage);
        
        return true;
      } else {
        throw new Error('Failed to send message via Socket.IO');
      }
    } catch (error) {
      // Restaurer le message en cas d'erreur n'est pas nécessaire ici
      // car le composant gère déjà l'état du message
      const errorMessage = handleMessageError(error, content);
      setSendError(errorMessage);
      
      // NOUVEAU: Sauvegarder automatiquement le message en échec
      if (conversationId) {
        const failedMsgId = addFailedMessage({
          conversationId,
          content,
          originalLanguage: originalLanguage || systemLanguage,
          attachmentIds: attachmentIds || [],
          replyToId,
          error: errorMessage,
        });
        
        // Toast avec action de restauration
        toast.error(errorMessage, {
          action: {
            label: 'Restaurer',
            onClick: () => {
              // Le composant parent gérera la restauration via FailedMessageBanner
            }
          },
          duration: 5000,
        });
      } else {
        toast.error(errorMessage);
      }
      
      // Callback d'erreur
      onMessageFailed?.(content, error as Error);
      
      return false;
    } finally {
      setIsSending(false);
    }
  }, [conversationId, currentUserId, systemLanguage, socketMessaging, onMessageSent, onMessageFailed, stopTyping, addFailedMessage]); // 🟠 OPTIMISATION: currentUserId + systemLanguage

  // Édition de message
  const editMessage = useCallback(async (messageId: string, newContent: string): Promise<boolean> => {
    setIsSending(true);
    setSendError(null);

    try {
      const success = await socketMessaging.editMessage(messageId, newContent);
      if (success) {
        toast.success('Message edited successfully');
      }
      return success;
    } catch (error) {
      const errorMessage = handleMessageError(error, newContent);
      setSendError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [socketMessaging]);

  // Suppression de message
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    setIsSending(true);
    setSendError(null);

    try {
      const success = await socketMessaging.deleteMessage(messageId);
      if (success) {
        toast.success('Message deleted successfully');
      }
      return success;
    } catch (error) {
      const errorMessage = handleMessageError(error, '');
      setSendError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [socketMessaging]);

  // 🟠 OPTIMISATION: Mettre à jour conversationIdRef pour handleTypingEvent stable
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Nettoyage des timeouts
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // 🟡 OPTIMISATION: Nettoyage optimisé avec setTimeout récursif (seulement si users actifs)
  // Nettoyage des utilisateurs qui tapent (après 5 secondes)
  useEffect(() => {
    // Ne rien faire si aucun user ne tape
    if (typingUsers.length === 0) {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
      return;
    }

    const cleanup = () => {
      const now = Date.now();
      setTypingUsers(prev => {
        const filtered = prev.filter(user => now - user.timestamp < 5000);

        // Re-scheduler seulement s'il reste des users
        if (filtered.length > 0) {
          cleanupTimeoutRef.current = setTimeout(cleanup, 1000);
        }

        return filtered;
      });
    };

    // Démarrer le premier timeout
    cleanupTimeoutRef.current = setTimeout(cleanup, 1000);

    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
    };
  }, [typingUsers.length]); // Dépend seulement de la longueur

  return {
    // État d'envoi
    isSending,
    sendError,

    // Actions de messagerie
    sendMessage,
    editMessage,
    deleteMessage,

    // Indicateurs de frappe
    typingUsers,
    isTyping,
    startTyping,
    stopTyping,
    
    // Socket.IO messaging
    socketMessaging
  };
}
