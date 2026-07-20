'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { fetchMessagesFromService } from '@/hooks/queries/use-conversation-messages-rq';

const HOVER_DEBOUNCE_MS = 200;
const PREFETCH_MESSAGE_LIMIT = 20;

/**
 * Précharge les messages d'une conversation au survol.
 * Utilise un debounce pour ignorer les survols accidentels.
 * Ne précharge pas si les données sont déjà en cache React Query.
 */
export function usePrefetchOnHover(conversationId: string) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const queryKey = queryKeys.messages.infinite(conversationId);
      const cached = queryClient.getQueryData(queryKey);

      if (cached !== undefined) return;

      queryClient.prefetchInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam, signal }) =>
          fetchMessagesFromService(conversationId, pageParam, PREFETCH_MESSAGE_LIMIT, undefined, signal),
        initialPageParam: 1 as number | string,
      });
    }, HOVER_DEBOUNCE_MS);
  }, [conversationId, queryClient]);

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}
