/**
 * Hook Simple pour WebSocket
 * 
 * UTILISATION:
 * 
 * // Dans n'importe quelle page avec conversation
 * const { sendMessage, messages } = useSimpleWebSocket({
 *   conversationId: 'meeshy',  // ou ID dynamique
 *   onNewMessage: (msg) => console.log('Message reçu:', msg)
 * });
 * 
 * // Envoyer un message
 * await sendMessage('Hello', 'en');
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { webSocketService } from '@/services/websocket.service';
import type { Message, TranslationEvent, TypingEvent, UserStatusEvent } from '@/types';

export interface UseWebSocketOptions {
  conversationId?: string | null;
  onNewMessage?: (message: Message) => void;
  onMessageEdited?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
  onTranslation?: (data: TranslationEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onUserStatus?: (event: UserStatusEvent) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { 
    conversationId, 
    onNewMessage, 
    onMessageEdited,
    onMessageDeleted,
    onTranslation, 
    onTyping, 
    onUserStatus 
  } = options;
  
  const [isConnected, setIsConnected] = useState(false);

  // ÉTAPE 1: Gérer le join/leave de conversation
  // Le service gère automatiquement le cas où l'auth n'est pas encore prête
  // via pendingJoinConversationId
  useEffect(() => {
    if (!conversationId) return;

    webSocketService.joinConversation(conversationId);

    // Si l'authentification arrive plus tard, re-tenter le join
    const unsubAuth = webSocketService.onAuthenticated(() => {
      webSocketService.joinConversation(conversationId);
    });

    return () => {
      unsubAuth();
      webSocketService.leaveConversation(conversationId);
    };
  }, [conversationId]);

  // ÉTAPE 2: Configurer les listeners
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    
    if (onNewMessage) {
      const unsub = webSocketService.onNewMessage(onNewMessage);
      unsubscribers.push(unsub);
    }
    
    if (onMessageEdited) {
      const unsub = webSocketService.onMessageEdited(onMessageEdited);
      unsubscribers.push(unsub);
    }
    
    if (onMessageDeleted) {
      const unsub = webSocketService.onMessageDeleted(onMessageDeleted);
      unsubscribers.push(unsub);
    }
    
    if (onTranslation) {
      const unsub = webSocketService.onTranslation(onTranslation);
      unsubscribers.push(unsub);
    }
    
    if (onTyping) {
      const unsub = webSocketService.onTyping(onTyping);
      unsubscribers.push(unsub);
    }
    
    if (onUserStatus) {
      const unsub = webSocketService.onUserStatus(onUserStatus);
      unsubscribers.push(unsub);
    }
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [onNewMessage, onMessageEdited, onMessageDeleted, onTranslation, onTyping, onUserStatus]);

  // ÉTAPE 3: Surveiller l'état de connexion
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = webSocketService.isConnected();
      setIsConnected(connected);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // ÉTAPE 4: Actions
  const sendMessage = useCallback(async (
    content: string, 
    language: string,
    replyToId?: string
  ): Promise<boolean> => {
    if (!conversationId) {
      console.error('❌ [HOOK] Pas de conversationId');
      return false;
    }
    
    return await webSocketService.sendMessage(conversationId, content, language, replyToId);
  }, [conversationId]);

  const startTyping = useCallback(() => {
    if (conversationId) {
      webSocketService.startTyping(conversationId);
    }
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    if (conversationId) {
      webSocketService.stopTyping(conversationId);
    }
  }, [conversationId]);

  const sendMessageWithAttachments = useCallback(async (
    content: string,
    attachmentIds: string[],
    language: string,
    replyToId?: string
  ): Promise<boolean> => {
    if (!conversationId) {
      console.error('❌ [HOOK] Pas de conversationId');
      return false;
    }
    
    return await webSocketService.sendMessageWithAttachments(conversationId, content, attachmentIds, language, replyToId);
  }, [conversationId]);

  const editMessage = useCallback(async (messageId: string, content: string): Promise<boolean> => {
    return await webSocketService.editMessage(messageId, content);
  }, []);

  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    return await webSocketService.deleteMessage(messageId);
  }, []);

  const reconnect = useCallback(() => {
    webSocketService.reconnect();
  }, []);

  const getDiagnostics = useCallback(() => {
    return webSocketService.getDiagnostics();
  }, []);

  return {
    isConnected,
    sendMessage,
    sendMessageWithAttachments,
    editMessage,
    deleteMessage,
    startTyping,
    stopTyping,
    reconnect,
    getDiagnostics,
    status: webSocketService.getConnectionStatus()
  };
}

