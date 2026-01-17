/**
 * Hook de gestion des indicateurs de frappe
 * Gère les utilisateurs en train de taper dans une conversation
 *
 * @module hooks/conversations/useConversationTyping
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThreadMember } from '@meeshy/shared/types';

interface TypingUser {
  id: string;
  displayName: string;
}

interface UseConversationTypingOptions {
  /** ID de la conversation */
  conversationId: string | null;
  /** ID de l'utilisateur actuel */
  currentUserId: string | null;
  /** Liste des participants de la conversation */
  participants: ThreadMember[];
  /** Fonction pour signaler le début de la frappe (Socket.IO) */
  startTyping: () => void;
  /** Fonction pour signaler la fin de la frappe (Socket.IO) */
  stopTyping: () => void;
}

interface UseConversationTypingReturn {
  /** Utilisateurs en train de taper */
  typingUsers: TypingUser[];
  /** L'utilisateur actuel est-il en train de taper */
  isTyping: boolean;
  /** Handler pour les événements typing des autres utilisateurs */
  handleUserTyping: (userId: string, username: string, isTyping: boolean, typingConversationId: string) => void;
  /** Démarrer la frappe locale (avec auto-stop timeout) */
  handleTypingStart: () => void;
  /** Arrêter la frappe locale immédiatement */
  handleTypingStop: () => void;
  /** Handler pour la saisie de texte (gère auto start/stop) */
  handleTextInput: (value: string) => void;
}

// Délai avant arrêt automatique de l'indicateur de frappe
const TYPING_STOP_DELAY = 3000;

/**
 * Extrait le displayName d'un participant
 */
function getParticipantDisplayName(
  participants: ThreadMember[],
  userId: string,
  fallbackUsername: string
): string {
  const participant = participants.find(p => p.userId === userId);

  if (participant?.user) {
    const user = participant.user;
    if (user.displayName) return user.displayName;
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    if (user.username) return user.username;
  }

  if (fallbackUsername && fallbackUsername !== userId) {
    return fallbackUsername;
  }

  return `User ${userId.slice(-6)}`;
}

/**
 * Hook pour gérer les indicateurs de frappe
 */
export function useConversationTyping({
  conversationId,
  currentUserId,
  participants,
  startTyping,
  stopTyping,
}: UseConversationTypingOptions): UseConversationTypingReturn {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Refs pour éviter re-créations de callbacks
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const participantsRef = useRef(participants);
  const conversationIdRef = useRef(conversationId);

  // Sync refs
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Cleanup on unmount or conversation change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      // Stop typing if active
      if (isTyping) {
        stopTyping();
      }
    };
  }, [conversationId]); // Reset on conversation change

  // Reset typing users when conversation changes
  useEffect(() => {
    setTypingUsers([]);
    setIsTyping(false);
  }, [conversationId]);

  // Handle remote user typing event
  const handleUserTyping = useCallback((
    userId: string,
    username: string,
    typing: boolean,
    typingConversationId: string
  ) => {
    // Ignore own events
    if (!currentUserId || userId === currentUserId) return;

    // Filter by conversation
    if (typingConversationId !== conversationIdRef.current) return;

    setTypingUsers(prev => {
      if (typing) {
        // Already in list?
        if (prev.some(u => u.id === userId)) return prev;

        // Get display name
        const displayName = getParticipantDisplayName(
          participantsRef.current,
          userId,
          username
        );

        return [...prev, { id: userId, displayName }];
      } else {
        // Remove from list
        return prev.filter(u => u.id !== userId);
      }
    });
  }, [currentUserId]);

  // Handle local typing start
  const handleTypingStart = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      startTyping();
    }

    // Reset timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop after delay
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      stopTyping();
    }, TYPING_STOP_DELAY);
  }, [isTyping, startTyping, stopTyping]);

  // Handle local typing stop
  const handleTypingStop = useCallback(() => {
    if (isTyping) {
      setIsTyping(false);
      stopTyping();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [isTyping, stopTyping]);

  // Handle text input (auto manage typing state)
  const handleTextInput = useCallback((value: string) => {
    if (value.trim()) {
      handleTypingStart();
    } else {
      handleTypingStop();
    }
  }, [handleTypingStart, handleTypingStop]);

  return {
    typingUsers,
    isTyping,
    handleUserTyping,
    handleTypingStart,
    handleTypingStop,
    handleTextInput,
  };
}
