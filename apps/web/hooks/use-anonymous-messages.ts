/**
 * Hook pour gérer les messages des participants anonymes
 * Utilise le service AnonymousChatService pour les opérations CRUD
 */

import { useState, useEffect, useCallback } from 'react';
import { anonymousChatService } from '@/services/anonymous-chat.service';
import { toast } from 'sonner';

export interface AnonymousMessage {
  id: string;
  content: string;
  originalLanguage: string;
  createdAt: string;
  sender?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    avatar?: string;
    isMeeshyer: boolean; // true pour membres authentifiés, false pour anonymes
  };
  translations?: Array<{
    id: string;
    targetLanguage: string;
    translatedContent: string;
  }>;
}

export function useAnonymousMessages(linkId: string) {
  const [messages, setMessages] = useState<AnonymousMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialiser le service
  useEffect(() => {
    if (typeof window !== 'undefined') {
      anonymousChatService.initialize(linkId);
    }
  }, [linkId]);

  // Charger les messages
  const loadMessages = useCallback(async (limit: number = 50, offset: number = 0) => {
    if (!anonymousChatService.hasActiveSession()) {
      setError('Aucune session anonyme active');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await anonymousChatService.loadMessages(limit, offset);
      
      if (offset === 0) {
        // Premier chargement, remplacer les messages
        setMessages(result.messages || []);
      } else {
        // Chargement paginé, ajouter les messages
        setMessages(prev => [...prev, ...(result.messages || [])]);
      }
      
      setHasMore(result.hasMore || false);
    } catch (error) {
      console.error('Erreur chargement messages anonymes:', error);
      setError(error instanceof Error ? error.message : 'Erreur lors du chargement des messages');
      toast.error('Erreur lors du chargement des messages');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Envoyer un message
  const sendMessage = useCallback(async (content: string, originalLanguage: string = 'fr') => {
    if (!anonymousChatService.hasActiveSession()) {
      toast.error('Session anonyme non active');
      return false;
    }

    if (!content.trim()) {
      toast.error('Le message ne peut pas être vide');
      return false;
    }

    try {
      const result = await anonymousChatService.sendMessage(content, originalLanguage);
      
      // Ajouter le nouveau message à la liste
      const newMessage: AnonymousMessage = {
        id: result.messageId,
        content: content.trim(),
        originalLanguage,
        createdAt: new Date().toISOString(),
        sender: result.message.sender
      };
      
      setMessages(prev => [...prev, newMessage]);
      
      return true;
    } catch (error) {
      console.error('Erreur envoi message anonyme:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'envoi du message';
      console.error(errorMessage);
      return false;
    }
  }, []);

  // Charger les messages initiaux
  useEffect(() => {
    if (typeof window !== 'undefined' && anonymousChatService.hasActiveSession()) {
      loadMessages(50, 0);
    }
  }, [loadMessages]);

  // Rafraîchir la session
  const refreshSession = useCallback(async () => {
    try {
      const chatData = await anonymousChatService.refreshSession();
      if (chatData) {
        // Recharger les messages après rafraîchissement
        await loadMessages(50, 0);
        return chatData;
      }
    } catch (error) {
      console.error('Erreur rafraîchissement session:', error);
      setError('Session expirée');
    }
    return null;
  }, [loadMessages]);

  // Quitter la session
  const leaveSession = useCallback(async () => {
    try {
      await anonymousChatService.leaveSession();
      setMessages([]);
      setHasMore(true);
      setError(null);
    } catch (error) {
      console.error('Erreur lors de la fermeture de session:', error);
    }
  }, []);

  return {
    messages,
    isLoading,
    hasMore,
    error,
    loadMessages,
    sendMessage,
    refreshSession,
    leaveSession,
    hasActiveSession: anonymousChatService.hasActiveSession()
  };
}
