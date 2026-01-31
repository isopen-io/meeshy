'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Hook pour synchroniser la conversation sélectionnée avec l'URL
 * Permet les deeplinks et la préservation de la sélection au refresh
 */
export function useConversationUrlSync() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedConversationId, setSelectedConversationIdState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Initialize from URL on mount
  useEffect(() => {
    const urlConvId = searchParams.get('conversationId');
    setSelectedConversationIdState(urlConvId || null);
    setMounted(true);
  }, [searchParams]);

  // Setter que synchronise avec l'URL
  const setSelectedConversationId = useCallback((id: string | null) => {
    setSelectedConversationIdState(id);

    if (!id) {
      // Remove from URL if null
      const params = new URLSearchParams(searchParams.toString());
      params.delete('conversationId');
      const newUrl = params.toString() ? `?${params.toString()}` : '/v2/chats';
      router.push(newUrl, { scroll: false } as any);
    } else {
      // Add/update in URL
      const params = new URLSearchParams(searchParams.toString());
      params.set('conversationId', id);
      router.push(`?${params.toString()}`, { scroll: false } as any);
    }
  }, [searchParams, router]);

  return {
    selectedConversationId: mounted ? selectedConversationId : null,
    setSelectedConversationId,
    mounted,
  };
}
