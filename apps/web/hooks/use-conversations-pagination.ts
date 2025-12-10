/**
 * Hook personnalisé pour la pagination automatique des conversations
 * Charge 20 conversations à la fois avec scroll infini
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import { conversationsService } from '@/services/conversations.service';

interface UseConversationsPaginationOptions {
  limit?: number;
  enabled?: boolean;
}

interface UseConversationsPaginationResult {
  conversations: Conversation[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
}

export function useConversationsPagination(
  options: UseConversationsPaginationOptions = {}
): UseConversationsPaginationResult {
  const { limit = 20, enabled = true } = options;
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  // Référence pour éviter les appels multiples simultanés
  const isLoadingRef = useRef(false);

  /**
   * Charge une page de conversations
   */
  const loadConversations = useCallback(async (currentOffset: number, append: boolean = false) => {
    if (isLoadingRef.current || !enabled) return;
    
    isLoadingRef.current = true;
    
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      
      
      // Utiliser le service avec pagination
      const result = await conversationsService.getConversations({
        limit,
        offset: currentOffset,
        skipCache: append // Ne pas utiliser le cache pour les pages suivantes
      });
      
      
      if (append) {
        setConversations(prev => [...prev, ...result.conversations]);
      } else {
        setConversations(result.conversations);
      }
      
      setHasMore(result.pagination.hasMore);
      setError(null);
      
    } catch (err) {
      console.error('❌ [Pagination] Erreur chargement conversations:', err);
      setError(err instanceof Error ? err : new Error('Erreur inconnue'));
      setHasMore(false);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [enabled, limit]);

  /**
   * Charge la page initiale au montage
   */
  useEffect(() => {
    if (enabled) {
      loadConversations(0, false);
    }
  }, [enabled]); // Pas de loadConversations pour éviter les boucles

  /**
   * Charge la page suivante
   */
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoading) {
      return;
    }
    
    const nextOffset = offset + limit;
    setOffset(nextOffset);
    loadConversations(nextOffset, true);
  }, [hasMore, isLoadingMore, isLoading, offset, limit, loadConversations]);

  /**
   * Rafraîchit la liste complète
   */
  const refresh = useCallback(() => {
    setOffset(0);
    setHasMore(true);
    setConversations([]);
    loadConversations(0, false);
  }, [loadConversations]);

  return {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    setConversations
  };
}

