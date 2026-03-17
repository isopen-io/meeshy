'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { conversationsService } from '@/services/conversations.service';

const HOVER_DEBOUNCE_MS = 200;

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
      const queryKey = queryKeys.messages.list(conversationId);
      const cached = queryClient.getQueryData(queryKey);

      if (cached !== undefined) return;

      queryClient.prefetchQuery({
        queryKey,
        queryFn: () => conversationsService.getMessages(conversationId, 1, 20),
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
