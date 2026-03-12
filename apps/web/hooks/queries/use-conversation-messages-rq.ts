/**
 * Hook de messages utilisant React Query avec pagination infinie
 * Drop-in replacement pour useConversationMessages
 *
 * Utilise les services existants:
 * - conversationsService.getMessages() pour les utilisateurs authentifiés
 * - AnonymousChatService.loadMessages() pour les utilisateurs anonymes (via linkId)
 */

'use client';

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { conversationsService } from '@/services/conversations.service';
import { apiService } from '@/services/api.service';
import { AnonymousChatService } from '@/services/anonymous-chat.service';
import type { Message, User } from '@meeshy/shared/types';

export interface ConversationMessagesRQOptions {
  limit?: number;
  enabled?: boolean;
  threshold?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  scrollDirection?: 'up' | 'down';
  disableAutoFill?: boolean;
  linkId?: string; // Pour les utilisateurs anonymes via liens partagés
}

export type OptimisticMessage = Message & {
  _tempId: string;
  _localStatus: 'sending' | 'failed';
  _sendPayload?: {
    attachmentIds?: string[];
    attachmentMimeTypes?: string[];
    mentionedUserIds?: string[];
  };
};

export interface ConversationMessagesRQReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Message) => boolean;
  updateMessage: (messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => void;
  removeMessage: (messageId: string) => void;
  addOptimisticMessage: (message: Message & { _localStatus: string; _tempId: string }) => void;
  replaceOptimisticMessage: (tempId: string, serverMessage: Message) => void;
  markMessageFailed: (tempId: string) => void;
  removeOptimisticMessage: (tempId: string) => void;
}

// Instance du service anonyme (créée à la demande)
let anonymousChatServiceInstance: AnonymousChatService | null = null;

function getAnonymousChatService(linkId: string): AnonymousChatService {
  if (!anonymousChatServiceInstance) {
    anonymousChatServiceInstance = new AnonymousChatService();
  }
  anonymousChatServiceInstance.initialize(linkId);
  return anonymousChatServiceInstance;
}

/**
 * Fonction pour récupérer les messages via les services existants
 */
async function fetchMessagesFromService(
  conversationId: string,
  pageParam: number | string,
  limit: number,
  linkId?: string
): Promise<{ messages: Message[]; hasMore: boolean; total: number; nextCursor?: string | null }> {
  if (linkId) {
    // Utilisateur anonyme via lien partagé - utiliser AnonymousChatService
    const service = getAnonymousChatService(linkId);
    const page = typeof pageParam === 'number' ? pageParam : 1;
    const offset = (page - 1) * limit;
    const result = await service.loadMessages(limit, offset);

    return {
      messages: result.messages || [],
      hasMore: result.hasMore || false,
      total: result.total || 0,
    };
  } else {
    // Utilisateur authentifié - utiliser conversationsService
    const cursor = typeof pageParam === 'string' ? pageParam : null;
    const page = typeof pageParam === 'number' ? pageParam : 1;
    const result = await conversationsService.getMessages(conversationId, page, limit, cursor);

    return {
      messages: result.messages || [],
      hasMore: result.hasMore || false,
      total: result.total || 0,
      nextCursor: result.cursorPagination?.nextCursor,
    };
  }
}

export function useConversationMessagesRQ(
  conversationId: string | null,
  currentUser: User | null,
  options: ConversationMessagesRQOptions = {}
): ConversationMessagesRQReturn {
  const {
    limit = 20,
    enabled = true,
    threshold = 100,
    containerRef,
    scrollDirection = 'up',
    disableAutoFill = false,
    linkId,
  } = options;

  const queryClient = useQueryClient();
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const initialScrollDoneRef = useRef<boolean>(false);

  // Query key unique selon le mode (authentifié ou via lien)
  const queryKey = useMemo(() => {
    if (linkId) {
      return [...queryKeys.messages.infinite(conversationId ?? ''), 'link', linkId];
    }
    return queryKeys.messages.infinite(conversationId ?? '');
  }, [conversationId, linkId]);

  // Utiliser useInfiniteQuery avec les services
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      fetchMessagesFromService(conversationId!, pageParam, limit, linkId),
    initialPageParam: 1 as number | string,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      if (lastPage.nextCursor) return lastPage.nextCursor;
      return allPages.length + 1;
    },
    enabled: enabled && !!conversationId,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      messages: data.pages.flatMap((page) => page.messages),
    }),
  });

  // Extraire les messages depuis les pages et les trier
  const messages = useMemo(() => {
    if (!data?.messages) return [];

    // Tri DESC par createdAt (plus récent en premier)
    // Le composant MessagesDisplay inverse l'ordre pour l'affichage
    return [...data.messages].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [data?.messages]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage) {
      await fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Refresh function
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Clear messages - invalider le cache
  const clearMessages = useCallback(() => {
    if (conversationId) {
      queryClient.removeQueries({
        queryKey: queryKeys.messages.infinite(conversationId),
      });
    }
    initialScrollDoneRef.current = false;
  }, [queryClient, conversationId]);

  // Add message to cache
  const addMessage = useCallback((message: Message): boolean => {
    if (!conversationId) return false;

    let wasAdded = false;

    queryClient.setQueryData(
      queryKey,
      (old: typeof data) => {
        if (!old) return old;

        // ID-only dedup — no content-based matching
        for (const page of old.pages) {
          for (const m of page.messages) {
            if (m.id === message.id) return old;
          }
        }

        wasAdded = true;

        return {
          ...old,
          pages: old.pages.map((page, index) =>
            index === 0
              ? { ...page, messages: [message, ...page.messages] }
              : page
          ),
        };
      }
    );

    return wasAdded;
  }, [queryClient, conversationId, queryKey]);

  // Update message in cache
  const updateMessage = useCallback((
    messageId: string,
    updates: Partial<Message> | ((prev: Message) => Message)
  ) => {
    if (!conversationId) return;

    queryClient.setQueryData(
      queryKey,
      (old: typeof data) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            messages: page.messages.map(msg => {
              if (msg.id === messageId) {
                return typeof updates === 'function'
                  ? updates(msg)
                  : { ...msg, ...updates };
              }
              return msg;
            }),
          })),
        };
      }
    );
  }, [queryClient, conversationId, queryKey]);

  // Remove message from cache
  const removeMessage = useCallback((messageId: string) => {
    if (!conversationId) return;

    queryClient.setQueryData(
      queryKey,
      (old: typeof data) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            messages: page.messages.filter(msg => msg.id !== messageId),
          })),
        };
      }
    );
  }, [queryClient, conversationId, queryKey]);

  // Gestion du scroll infini
  useEffect(() => {
    if (!enabled || !containerRef?.current) return;

    const container = containerRef.current;

    const handleScroll = () => {
      if (isFetchingNextPage || !hasNextPage) return;

      // Ne pas charger avant que le scroll initial ne soit effectué
      if (!initialScrollDoneRef.current && scrollDirection === 'up') return;

      const { scrollTop, scrollHeight, clientHeight } = container;

      // Vérifier qu'il y a eu un mouvement significatif
      const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
      if (scrollDelta < 10) return;

      lastScrollTopRef.current = scrollTop;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        if (clientHeight >= scrollHeight || scrollHeight <= clientHeight + threshold) {
          return;
        }

        let shouldLoadMore = false;

        if (scrollDirection === 'up') {
          shouldLoadMore = scrollTop <= threshold;
        } else {
          const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
          shouldLoadMore = distanceFromBottom <= threshold;
        }

        if (shouldLoadMore) {
          loadMore();
        }
      }, 30);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [enabled, containerRef, isFetchingNextPage, hasNextPage, threshold, scrollDirection, loadMore]);

  // Reset scroll flag on conversation change
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  // Mark scroll as done after initial load
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      const timer = setTimeout(() => {
        initialScrollDoneRef.current = true;
      }, scrollDirection === 'up' ? 500 : 0);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isLoading, scrollDirection]);

  // Fetch initial read status summary when conversation messages load
  // Calls mark-as-received to trigger a socket event with the real summary counts
  const hasLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || !currentUser || isLoading || messages.length === 0) return;
    // Resolve real ObjectId from loaded messages (conversationId param may be an identifier/slug)
    const resolvedId = messages[0]?.conversationId ?? conversationId;
    if (hasLoadedRef.current === resolvedId) return;
    if (!/^[a-f\d]{24}$/i.test(resolvedId)) return;
    hasLoadedRef.current = resolvedId;

    // Mark-as-received triggers a read-status:updated socket event with summary
    apiService.post(`/conversations/${resolvedId}/mark-as-received`)
      .catch(() => {}); // Non-critical
  }, [conversationId, currentUser, isLoading, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill if container not full enough
  useEffect(() => {
    if (disableAutoFill || isLoading || isFetchingNextPage || !hasNextPage || !containerRef?.current) {
      return;
    }

    const checkAndLoadMore = () => {
      if (!containerRef.current || isFetchingNextPage || !hasNextPage) return;

      const { scrollHeight, clientHeight } = containerRef.current;
      if (scrollHeight <= clientHeight + 50 && hasNextPage) {
        loadMore();
      }
    };

    const timeoutId = setTimeout(checkAndLoadMore, 500);
    return () => clearTimeout(timeoutId);
  }, [disableAutoFill, messages.length, isLoading, isFetchingNextPage, hasNextPage, loadMore, containerRef]);

  // Optimistic message support
  const addOptimisticMessage = useCallback((message: Message & { _localStatus: string; _tempId: string }) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page, index) =>
          index === 0 ? { ...page, messages: [message, ...page.messages] } : page
        ),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  const replaceOptimisticMessage = useCallback((tempId: string, serverMessage: Message) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.map(m =>
            (m as any)._tempId === tempId ? serverMessage : m
          ),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  const markMessageFailed = useCallback((tempId: string) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.map(m =>
            (m as any)._tempId === tempId ? { ...m, _localStatus: 'failed' } : m
          ),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  const removeOptimisticMessage = useCallback((tempId: string) => {
    if (!conversationId) return;
    queryClient.setQueryData(queryKey, (old: typeof data) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          messages: page.messages.filter(m => (m as any)._tempId !== tempId),
        })),
      };
    });
  }, [queryClient, conversationId, queryKey]);

  return {
    messages,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error?.message ?? null,
    loadMore,
    refresh,
    clearMessages,
    addMessage,
    updateMessage,
    removeMessage,
    addOptimisticMessage,
    replaceOptimisticMessage,
    markMessageFailed,
    removeOptimisticMessage,
  };
}
