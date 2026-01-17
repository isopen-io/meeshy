import { useState, useCallback } from 'react';
import { apiService } from '@/services/api.service';

interface Community {
  id: string;
  name: string;
  description?: string;
  identifier?: string;
  isPrivate: boolean;
  members: Array<{
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  }>;
  _count: {
    members: number;
    Conversation: number;
  };
}

interface UseCommunitySearchReturn {
  communities: Community[];
  isLoadingCommunities: boolean;
  loadCommunities: (searchQuery?: string) => Promise<void>;
}

/**
 * Hook pour rechercher des communautés
 */
export function useCommunitySearch(): UseCommunitySearchReturn {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isLoadingCommunities, setIsLoadingCommunities] = useState(false);

  const loadCommunities = useCallback(async (searchQuery: string = '') => {
    setIsLoadingCommunities(true);
    try {
      const response = await apiService.get<{ success: boolean; data: any[] }>(
        searchQuery.length >= 2
          ? `/api/communities?search=${encodeURIComponent(searchQuery)}`
          : '/api/communities'
      );

      if (response.data.success) {
        setCommunities(response.data.data || []);
      } else {
        console.error('Error loading communities');
      }
    } catch (error) {
      console.error('Error loading communities:', error);
    } finally {
      setIsLoadingCommunities(false);
    }
  }, []);

  return {
    communities,
    isLoadingCommunities,
    loadCommunities
  };
}
