/**
 * Utilitaires réutilisables pour la messagerie
 * Basés sur l'approche éprouvée de BubbleStreamPage
 */

import type { User, Message } from '@/types';

// Configuration des limites de messages (doit correspondre aux variables d'environnement)
export const MAX_MESSAGE_LENGTH = parseInt(process.env.NEXT_PUBLIC_MAX_MESSAGE_LENGTH || '1024', 10);
export const MAX_TEXT_ATTACHMENT_THRESHOLD = parseInt(process.env.NEXT_PUBLIC_MAX_TEXT_ATTACHMENT_THRESHOLD || '2000', 10);

export interface MessageSenderConfig {
  conversationId?: string;
  currentUser?: User;
  maxMessageLength?: number;
}

export interface MessageSendOptions {
  content: string;
  sourceLanguage?: string;
  onSuccess?: (content: string, language: string) => void;
  onError?: (content: string, error: Error) => void;
  onRestoreMessage?: (content: string) => void;
}

/**
 * Validation du contenu d'un message avant envoi
 */
export function validateMessageContent(
  content: string, 
  maxLength: number = MAX_MESSAGE_LENGTH
): { isValid: boolean; error?: string } {
  if (!content.trim()) {
    return { isValid: false, error: 'Le message ne peut pas être vide' };
  }
  
  if (content.length > maxLength) {
    return { isValid: false, error: `Le message ne peut pas dépasser ${maxLength} caractères` };
  }
  
  return { isValid: true };
}

/**
 * Prépare les métadonnées d'un message pour l'envoi
 */
export function prepareMessageMetadata(
  content: string,
  sourceLanguage: string,
  userLanguageChoices?: string[]
) {
  return {
    content: content.trim(),
    sourceLanguage,
    userLanguageChoices: userLanguageChoices || [],
    timestamp: Date.now()
  };
}

/**
 * Log standardisé pour l'envoi de messages
 */
export function logMessageSend(
  content: string,
  sourceLanguage: string,
  conversationId?: string
) {
  // Logs désactivés pour réduire le bruit
}

/**
 * Log standardisé pour le succès d'envoi
 */
export function logMessageSuccess(
  content: string,
  sourceLanguage: string
) {
  // Logs désactivés pour réduire le bruit
}

/**
 * Configuration standard pour les callbacks de messagerie
 */
export function createStandardMessageCallbacks(options: {
  onNewMessage?: (message: Message) => void;
  onMessageSent?: (content: string, language: string) => void;
  onMessageFailed?: (content: string, error: Error) => void;
  onUserTyping?: (userId: string, username: string, isTyping: boolean, conversationId: string) => void;
  onUserStatus?: (userId: string, username: string, isOnline: boolean) => void;
  onTranslation?: (messageId: string, translations: any[]) => void;
  onConversationStats?: (data: any) => void;
  onConversationOnlineStats?: (data: any) => void;
}) {
  return {
    onNewMessage: (message: Message) => {
      options.onNewMessage?.(message);
    },
    
    onUserTyping: (userId: string, username: string, isTyping: boolean, conversationId: string) => {
      options.onUserTyping?.(userId, username, isTyping, conversationId);
    },
    
    onUserStatus: (userId: string, username: string, isOnline: boolean) => {
      options.onUserStatus?.(userId, username, isOnline);
    },
    
    onTranslation: (messageId: string, translations: any[]) => {
      options.onTranslation?.(messageId, translations);
    },
    
    onConversationStats: (data: any) => {
      options.onConversationStats?.(data);
    },
    
    onConversationOnlineStats: (data: any) => {
      options.onConversationOnlineStats?.(data);
    }
  };
}

/**
 * Gestionnaire d'erreurs standardisé pour la messagerie
 */
export function handleMessageError(
  error: unknown,
  content: string,
  onRestoreMessage?: (content: string) => void
): string {
  console.error('❌ Erreur lors de l\'envoi du message:', error);
  
  // Restaurer le message en cas d'erreur
  onRestoreMessage?.(content);
  
  // Déterminer le message d'erreur approprié
  if (error instanceof Error) {
    if (error.message.includes('not authenticated') || error.message.includes('User not authenticated')) {
      return 'Erreur d\'authentification. Veuillez vous reconnecter.';
    }
    if (error.message.includes('not connected') || error.message.includes('WebSocket')) {
      return 'Connexion perdue. Reconnexion en cours...';
    }
    if (error.message.includes('permission') || error.message.includes('authorized')) {
      return 'Vous n\'avez pas les permissions pour envoyer des messages dans cette conversation.';
    }
    return error.message;
  }
  
  return 'Erreur lors de l\'envoi du message';
}
