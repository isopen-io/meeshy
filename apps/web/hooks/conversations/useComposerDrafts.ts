/**
 * Hook de gestion des brouillons de composer
 * Sauvegarde et restaure l'état du composer par conversation
 *
 * @module hooks/conversations/useComposerDrafts
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useReplyStore } from '@/stores/reply-store';

interface ComposerState {
  message: string;
  attachmentIds: string[];
  attachmentMimeTypes: string[];
  replyTo: any | null;
}

interface UseComposerDraftsOptions {
  /** ID de la conversation */
  conversationId: string | null;
}

interface UseComposerDraftsReturn {
  /** Message actuel */
  message: string;
  /** Setter pour le message */
  setMessage: (msg: string) => void;
  /** IDs des attachments */
  attachmentIds: string[];
  /** Setter pour les IDs */
  setAttachmentIds: (ids: string[]) => void;
  /** Types MIME des attachments */
  attachmentMimeTypes: string[];
  /** Setter pour les types MIME */
  setAttachmentMimeTypes: (types: string[]) => void;
  /** Effacer le brouillon actuel */
  clearDraft: () => void;
  /** Handler pour les changements d'attachments (stabilisé) */
  handleAttachmentsChange: (ids: string[], mimeTypes: string[]) => void;
}

/**
 * Hook pour gérer les brouillons de composer par conversation
 *
 * SÉCURITÉ: Chaque conversation a son propre brouillon isolé
 * pour éviter les fuites de données entre conversations
 */
export function useComposerDrafts({
  conversationId,
}: UseComposerDraftsOptions): UseComposerDraftsReturn {
  // États
  const [message, setMessage] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentMimeTypes, setAttachmentMimeTypes] = useState<string[]>([]);

  // Refs pour éviter les boucles infinies
  const draftsRef = useRef<Map<string, ComposerState>>(new Map());
  const prevConversationIdRef = useRef<string | null>(null);
  const prevAttachmentIdsRef = useRef<string>('[]');
  const prevMimeTypesRef = useRef<string>('[]');

  // Save/restore drafts on conversation change
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const currentId = conversationId;

    // Changement de conversation
    if (currentId !== prevId) {
      // Sauvegarder le brouillon de la conversation précédente
      if (prevId) {
        const currentReplyTo = useReplyStore.getState().replyingTo;
        draftsRef.current.set(prevId, {
          message,
          attachmentIds,
          attachmentMimeTypes,
          replyTo: currentReplyTo,
        });
      }

      // Restaurer ou réinitialiser pour la nouvelle conversation
      if (currentId) {
        const saved = draftsRef.current.get(currentId);
        if (saved) {
          setMessage(saved.message);
          setAttachmentIds(saved.attachmentIds);
          setAttachmentMimeTypes(saved.attachmentMimeTypes);

          if (saved.replyTo) {
            useReplyStore.getState().setReplyingTo(saved.replyTo);
          } else {
            useReplyStore.getState().clearReply();
          }
        } else {
          // Pas de brouillon, réinitialiser
          setMessage('');
          setAttachmentIds([]);
          setAttachmentMimeTypes([]);
          useReplyStore.getState().clearReply();
        }
      }

      prevConversationIdRef.current = currentId;
    }
  }, [conversationId]); // Intentionally not including state to avoid loops

  // Clear draft for current conversation
  const clearDraft = useCallback(() => {
    setMessage('');
    setAttachmentIds([]);
    setAttachmentMimeTypes([]);
    useReplyStore.getState().clearReply();

    if (conversationId) {
      draftsRef.current.delete(conversationId);
    }
  }, [conversationId]);

  // Callback mémorisé pour les changements d'attachments
  // Utilise des refs pour éviter les updates inutiles
  const handleAttachmentsChange = useCallback((ids: string[], mimeTypes: string[]) => {
    const idsString = JSON.stringify(ids);
    const mimeTypesString = JSON.stringify(mimeTypes);

    // Ne mettre à jour que si les valeurs ont vraiment changé
    if (idsString !== prevAttachmentIdsRef.current) {
      setAttachmentIds(ids);
      prevAttachmentIdsRef.current = idsString;
    }

    if (mimeTypesString !== prevMimeTypesRef.current) {
      setAttachmentMimeTypes(mimeTypes);
      prevMimeTypesRef.current = mimeTypesString;
    }
  }, []); // Pas de dépendances - les setState et refs sont stables

  return {
    message,
    setMessage,
    attachmentIds,
    setAttachmentIds,
    attachmentMimeTypes,
    setAttachmentMimeTypes,
    clearDraft,
    handleAttachmentsChange,
  };
}
