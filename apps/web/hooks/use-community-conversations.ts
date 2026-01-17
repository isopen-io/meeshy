/**
 * Hook pour gérer les conversations d'une communauté
 * Suit les Vercel React Best Practices: separation of concerns
 */

import { useState, useCallback } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import { communitiesService } from '@/services/communities.service';
import { toast } from 'sonner';

export function useCommunityConversations() {
  const [communityConversations, setCommunityConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Charger les conversations d'une communauté
  const loadCommunityConversations = useCallback(async (
    communityId: string,
    selectedGroupIsPrivate?: boolean
  ) => {
    try {
      setIsLoadingConversations(true);

      const response = await communitiesService.getCommunityConversations(communityId);

      // L'API retourne {success: true, data: [...]}
      if (response.data && typeof response.data === 'object' && 'data' in response.data) {
        const rawConversations = (response.data as any).data;

        // Mapper les conversations pour corriger les incohérences de format
        const mappedConversations = rawConversations.map((conv: any) => ({
          ...conv,
          participants: conv.members || [],
          isPrivate: selectedGroupIsPrivate || false,
          members: conv.members || []
        }));

        setCommunityConversations(mappedConversations || []);
      } else if (Array.isArray(response.data)) {
        const mappedConversations = response.data.map((conv: any) => ({
          ...conv,
          participants: conv.members || [],
          isPrivate: selectedGroupIsPrivate || false,
          members: conv.members || []
        }));
        setCommunityConversations(mappedConversations);
      } else {
        setCommunityConversations([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des conversations de la communauté:', error);
      toast.error('Erreur lors du chargement des conversations');
      setCommunityConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  return {
    communityConversations,
    isLoadingConversations,
    loadCommunityConversations
  };
}
