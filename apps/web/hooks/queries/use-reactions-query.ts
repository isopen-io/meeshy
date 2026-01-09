/**
 * Hook de réactions utilisant React Query avec sync Socket.IO
 *
 * Avantages:
 * - Cache React Query centralisé
 * - Mutations avec optimistic updates
 * - Sync automatique via WebSocket
 */

'use client';

import { useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type {
  ReactionAggregation,
  ReactionSync,
  ReactionUpdateEvent
} from '@meeshy/shared/types/reaction';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { useI18n } from '@/hooks/useI18n';

// Étendre les query keys pour les réactions
const reactionKeys = {
  all: ['reactions'] as const,
  message: (messageId: string) => [...reactionKeys.all, messageId] as const,
};

export interface UseReactionsQueryOptions {
  messageId: string;
  currentUserId?: string;
  isAnonymous?: boolean;
  enabled?: boolean;
}

interface ReactionState {
  reactions: ReactionAggregation[];
  userReactions: string[];
}

// Fonction pour récupérer les réactions via Socket.IO
async function fetchReactions(messageId: string): Promise<ReactionState> {
  return new Promise((resolve, reject) => {
    const socket = meeshySocketIOService.getSocket();
    if (!socket?.connected) {
      // Retourner un état vide si pas connecté
      resolve({ reactions: [], userReactions: [] });
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Timeout fetching reactions'));
    }, 5000);

    socket.emit(
      CLIENT_EVENTS.REACTION_REQUEST_SYNC,
      messageId,
      (response: any) => {
        clearTimeout(timeout);
        if (response.success && response.data) {
          const syncData = response.data as ReactionSync;
          resolve({
            reactions: syncData.reactions as ReactionAggregation[],
            userReactions: syncData.userReactions as string[],
          });
        } else {
          reject(new Error(response.error || 'Failed to fetch reactions'));
        }
      }
    );
  });
}

export function useReactionsQuery({
  messageId,
  currentUserId,
  isAnonymous = false,
  enabled = true,
}: UseReactionsQueryOptions) {
  const { t } = useI18n('reactions');
  const queryClient = useQueryClient();
  const MAX_REACTIONS_PER_USER = 3;

  // Query pour récupérer les réactions
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: reactionKeys.message(messageId),
    queryFn: () => fetchReactions(messageId),
    enabled: enabled && !!messageId,
    staleTime: Infinity, // Socket.IO gère les mises à jour
    retry: 1,
  });

  const reactions = data?.reactions ?? [];
  const userReactions = data?.userReactions ?? [];

  // Mutation pour ajouter une réaction
  const addMutation = useMutation({
    mutationFn: async (emoji: string) => {
      return new Promise<boolean>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          CLIENT_EVENTS.REACTION_ADD,
          { messageId, emoji },
          (response: any) => {
            if (response.success) {
              resolve(true);
            } else {
              reject(new Error(response.error || 'Failed to add reaction'));
            }
          }
        );
      });
    },
    onMutate: async (emoji) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: reactionKeys.message(messageId) });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<ReactionState>(reactionKeys.message(messageId));

      // Optimistic update
      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [], userReactions: [emoji] };

        const existing = old.reactions.find(r => r.emoji === emoji);
        let newReactions: ReactionAggregation[];

        if (existing) {
          newReactions = old.reactions.map(r =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, hasCurrentUser: true }
              : r
          );
        } else {
          newReactions = [
            ...old.reactions,
            {
              emoji,
              count: 1,
              userIds: currentUserId && !isAnonymous ? [currentUserId] : [],
              anonymousIds: isAnonymous && currentUserId ? [currentUserId] : [],
              hasCurrentUser: true,
            },
          ];
        }

        return {
          reactions: newReactions,
          userReactions: old.userReactions.includes(emoji)
            ? old.userReactions
            : [...old.userReactions, emoji],
        };
      });

      return { previousData };
    },
    onError: (err, _emoji, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(reactionKeys.message(messageId), context.previousData);
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to add reaction';
      if (errorMessage.includes('Maximum') && errorMessage.includes('different reactions')) {
        toast.error(t('maxReactionsReached', { max: MAX_REACTIONS_PER_USER }));
      } else {
        toast.error(errorMessage);
      }
    },
  });

  // Mutation pour retirer une réaction
  const removeMutation = useMutation({
    mutationFn: async (emoji: string) => {
      return new Promise<boolean>((resolve, reject) => {
        const socket = meeshySocketIOService.getSocket();
        if (!socket?.connected) {
          reject(new Error('Socket not connected'));
          return;
        }

        socket.emit(
          CLIENT_EVENTS.REACTION_REMOVE,
          { messageId, emoji },
          (response: any) => {
            if (response.success) {
              resolve(true);
            } else {
              reject(new Error(response.error || 'Failed to remove reaction'));
            }
          }
        );
      });
    },
    onMutate: async (emoji) => {
      await queryClient.cancelQueries({ queryKey: reactionKeys.message(messageId) });

      const previousData = queryClient.getQueryData<ReactionState>(reactionKeys.message(messageId));

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [], userReactions: [] };

        const existing = old.reactions.find(r => r.emoji === emoji);
        if (!existing) return old;

        let newReactions: ReactionAggregation[];
        if (existing.count <= 1) {
          newReactions = old.reactions.filter(r => r.emoji !== emoji);
        } else {
          newReactions = old.reactions.map(r =>
            r.emoji === emoji
              ? { ...r, count: r.count - 1, hasCurrentUser: false }
              : r
          );
        }

        return {
          reactions: newReactions,
          userReactions: old.userReactions.filter(e => e !== emoji),
        };
      });

      return { previousData };
    },
    onError: (_err, _emoji, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(reactionKeys.message(messageId), context.previousData);
      }
      toast.error('Failed to remove reaction');
    },
  });

  // Actions
  const addReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (!enabled || !messageId) return false;

    // Vérifier si déjà réagi
    if (userReactions.includes(emoji)) return true;

    // Vérifier la limite
    if (userReactions.length >= MAX_REACTIONS_PER_USER) {
      toast.error(t('maxReactionsReached', { max: MAX_REACTIONS_PER_USER }));
      return false;
    }

    try {
      await addMutation.mutateAsync(emoji);
      return true;
    } catch {
      return false;
    }
  }, [enabled, messageId, userReactions, addMutation, t]);

  const removeReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (!enabled || !messageId) return false;

    try {
      await removeMutation.mutateAsync(emoji);
      return true;
    } catch {
      return false;
    }
  }, [enabled, messageId, removeMutation]);

  const toggleReaction = useCallback(async (emoji: string): Promise<boolean> => {
    if (userReactions.includes(emoji)) {
      return removeReaction(emoji);
    } else {
      return addReaction(emoji);
    }
  }, [userReactions, addReaction, removeReaction]);

  const hasReacted = useCallback((emoji: string): boolean => {
    return userReactions.includes(emoji);
  }, [userReactions]);

  const getReactionCount = useCallback((emoji: string): number => {
    const reaction = reactions.find(r => r.emoji === emoji);
    return reaction?.count || 0;
  }, [reactions]);

  const totalCount = useMemo(() => {
    return reactions.reduce((sum, r) => sum + r.count, 0);
  }, [reactions]);

  // Écouter les événements Socket.IO pour mettre à jour le cache
  useEffect(() => {
    if (!enabled || !messageId) return;

    const handleReactionAdded = (event: ReactionUpdateEvent) => {
      if (event.messageId !== messageId) return;

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [event.aggregation], userReactions: [] };

        const existing = old.reactions.find(r => r.emoji === event.emoji);
        let newReactions: ReactionAggregation[];

        if (existing) {
          newReactions = old.reactions.map(r =>
            r.emoji === event.emoji ? event.aggregation : r
          );
        } else {
          newReactions = [...old.reactions, event.aggregation];
        }

        // Mettre à jour userReactions si c'est nous
        let newUserReactions = old.userReactions;
        if (
          (event.userId && event.userId === currentUserId && !isAnonymous) ||
          (event.anonymousId && event.anonymousId === currentUserId && isAnonymous)
        ) {
          if (!old.userReactions.includes(event.emoji)) {
            newUserReactions = [...old.userReactions, event.emoji];
          }
        }

        return { reactions: newReactions, userReactions: newUserReactions };
      });
    };

    const handleReactionRemoved = (event: ReactionUpdateEvent) => {
      if (event.messageId !== messageId) return;

      queryClient.setQueryData<ReactionState>(reactionKeys.message(messageId), (old) => {
        if (!old) return { reactions: [], userReactions: [] };

        let newReactions: ReactionAggregation[];
        if (event.aggregation.count === 0) {
          newReactions = old.reactions.filter(r => r.emoji !== event.emoji);
        } else {
          newReactions = old.reactions.map(r =>
            r.emoji === event.emoji ? event.aggregation : r
          );
        }

        // Mettre à jour userReactions si c'est nous
        let newUserReactions = old.userReactions;
        if (
          (event.userId && event.userId === currentUserId && !isAnonymous) ||
          (event.anonymousId && event.anonymousId === currentUserId && isAnonymous)
        ) {
          newUserReactions = old.userReactions.filter(e => e !== event.emoji);
        }

        return { reactions: newReactions, userReactions: newUserReactions };
      });
    };

    const unsubAdded = meeshySocketIOService.onReactionAdded(handleReactionAdded);
    const unsubRemoved = meeshySocketIOService.onReactionRemoved(handleReactionRemoved);

    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [enabled, messageId, currentUserId, isAnonymous, queryClient]);

  return {
    // État
    reactions,
    isLoading,
    error: error?.message ?? null,
    totalCount,
    userReactions,

    // Actions
    addReaction,
    removeReaction,
    toggleReaction,

    // Utilitaires
    hasReacted,
    getReactionCount,
    refreshReactions: refetch,
  };
}
