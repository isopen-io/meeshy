/**
 * Hook de gestion des indicateurs de frappe
 * Gère les utilisateurs en train de taper dans une conversation
 *
 * @module hooks/conversations/useConversationTyping
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Participant } from '@meeshy/shared/types';
import type { SocketIOUser } from '@meeshy/shared/types/socketio-events';

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
  participants: Participant[];
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

// Délai avant arrêt automatique de l'indicateur de frappe (émetteur local)
const TYPING_STOP_DELAY = 3000;

// Filet de sécurité : un remote `typing:stop` peut se perdre (coupure réseau
// brève qui ne déclenche pas de `disconnect`, crash de l'onglet expéditeur
// avant que son timeout local ne s'exécute...). Sans ce filet, l'indicateur
// "X est en train d'écrire" resterait affiché jusqu'au ping-timeout du socket
// (~45-60s). 8s laisse une marge confortable au-dessus du cycle normal
// start→stop (3s) tout en bornant le pire cas perçu par l'utilisateur.
const REMOTE_TYPING_SAFETY_TIMEOUT = 8000;

/**
 * Extrait le displayName d'un participant
 */
function getParticipantDisplayName(
  participants: Participant[],
  userId: string,
  fallbackUsername: string
): string {
  const participant = participants.find(p => p.userId === userId);

  if (participant) {
    if (participant.displayName) return participant.displayName;
    if (participant.user) {
      const user = participant.user as SocketIOUser;
      if (user.firstName || user.lastName) {
        return `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
      if (user.username) return user.username;
    }
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
  // Un timeout de sécurité par utilisateur distant en train de taper
  const remoteTypingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const clearRemoteTypingTimeout = useCallback((userId: string) => {
    const existing = remoteTypingTimeoutsRef.current.get(userId);
    if (existing) {
      clearTimeout(existing);
      remoteTypingTimeoutsRef.current.delete(userId);
    }
  }, []);

  const clearAllRemoteTypingTimeouts = useCallback(() => {
    remoteTypingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    remoteTypingTimeoutsRef.current.clear();
  }, []);

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
      clearAllRemoteTypingTimeouts();
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

    if (typing) {
      // Refresh the safety timeout on every keepalive so a still-typing user
      // is never dropped mid-session, then reschedule the removal.
      clearRemoteTypingTimeout(userId);
      remoteTypingTimeoutsRef.current.set(
        userId,
        setTimeout(() => {
          remoteTypingTimeoutsRef.current.delete(userId);
          setTypingUsers(prev => prev.filter(u => u.id !== userId));
        }, REMOTE_TYPING_SAFETY_TIMEOUT)
      );
    } else {
      clearRemoteTypingTimeout(userId);
    }

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
  }, [currentUserId, clearRemoteTypingTimeout]);

  // Handle local typing start
  const handleTypingStart = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
    }

    // Re-emit on every keystroke, not just the first one of the session:
    // the underlying transport throttles this to ~1 emit/2s, and that
    // steady trickle is what refreshes the remote safety timeout above.
    // Gating this on `!isTyping` (as before) meant a single continuous
    // typing session only ever sent one `typing:start`, so anyone typing
    // longer than REMOTE_TYPING_SAFETY_TIMEOUT had their indicator dropped
    // by peers while still actively typing.
    startTyping();

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
