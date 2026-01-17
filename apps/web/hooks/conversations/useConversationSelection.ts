/**
 * Hook de sélection de conversation
 * Gère l'état de sélection (URL ou local) et la navigation
 *
 * @module hooks/conversations/useConversationSelection
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Conversation } from '@meeshy/shared/types';

interface UseConversationSelectionOptions {
  /** ID de conversation depuis l'URL (optionnel) */
  selectedConversationId?: string;
  /** Liste des conversations disponibles */
  conversations: Conversation[];
}

interface UseConversationSelectionReturn {
  /** ID effectif (URL ou local) */
  effectiveSelectedId: string | null;
  /** Conversation sélectionnée */
  selectedConversation: Conversation | null;
  /** Sélectionner une conversation */
  handleSelectConversation: (conversation: Conversation) => void;
  /** Retourner à la liste */
  handleBackToList: () => void;
  /** ID de sélection locale (sans URL) */
  localSelectedConversationId: string | null;
  /** Setter pour la sélection locale */
  setLocalSelectedConversationId: (id: string | null) => void;
}

/**
 * Hook pour gérer la sélection de conversation
 * Supporte deux modes:
 * - Mode URL: /conversations/:id (navigation avec router)
 * - Mode local: sélection sans changement d'URL
 */
export function useConversationSelection({
  selectedConversationId,
  conversations,
}: UseConversationSelectionOptions): UseConversationSelectionReturn {
  const router = useRouter();

  // État local pour la sélection dynamique (sans changement d'URL)
  const [localSelectedConversationId, setLocalSelectedConversationId] = useState<string | null>(null);

  // ID effectif: priorité à l'URL, sinon local
  const effectiveSelectedId = selectedConversationId || localSelectedConversationId;

  // Conversation sélectionnée (mémorisée)
  const selectedConversation = useMemo(() => {
    if (!effectiveSelectedId || !conversations.length) {
      return null;
    }
    return conversations.find(c => c.id === effectiveSelectedId) || null;
  }, [effectiveSelectedId, conversations]);

  // Sélection d'une conversation
  const handleSelectConversation = useCallback((conversation: Conversation) => {
    // Éviter la re-sélection
    if (effectiveSelectedId === conversation.id) {
      return;
    }

    // Mode dynamique: mise à jour de l'état local SANS changer l'URL
    if (!selectedConversationId) {
      setLocalSelectedConversationId(conversation.id);
      // Mise à jour de l'URL dans l'historique sans recharger
      window.history.replaceState(null, '', '/conversations');
    } else {
      // Mode URL: navigation classique
      router.push(`/conversations/${conversation.id}`);
    }
  }, [effectiveSelectedId, selectedConversationId, router]);

  // Retour à la liste
  const handleBackToList = useCallback(() => {
    // Mode dynamique: effacer la sélection locale
    if (!selectedConversationId && localSelectedConversationId) {
      setLocalSelectedConversationId(null);
    } else if (selectedConversationId) {
      // Mode URL: navigation vers la liste sans ID
      router.push('/conversations');
    }
  }, [selectedConversationId, localSelectedConversationId, router]);

  // Sync URL → local si on arrive avec une URL /conversations/:id
  useEffect(() => {
    if (selectedConversationId && !localSelectedConversationId) {
      setLocalSelectedConversationId(selectedConversationId);
    }
  }, [selectedConversationId, localSelectedConversationId]);

  return {
    effectiveSelectedId,
    selectedConversation,
    handleSelectConversation,
    handleBackToList,
    localSelectedConversationId,
    setLocalSelectedConversationId,
  };
}
