import { useMemo } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import type { CommunityFilter } from '../CommunityCarousel';

interface UseConversationFilteringParams {
  conversations: Conversation[];
  searchQuery: string;
  selectedFilter: CommunityFilter;
  preferencesMap: Map<string, UserConversationPreferences>;
}

/**
 * Hook pour filtrer les conversations selon:
 * - La recherche (query)
 * - Le filtre communauté sélectionné
 * - Les préférences utilisateur (archived, reacted, etc.)
 */
export function useConversationFiltering({
  conversations,
  searchQuery,
  selectedFilter,
  preferencesMap
}: UseConversationFilteringParams): Conversation[] {
  return useMemo(() => {
    // Dédupliquer les conversations par id
    const seenIds = new Set<string>();
    const uniqueConversations = conversations.filter(conv => {
      if (conv.id && seenIds.has(conv.id)) return false;
      if (conv.id) seenIds.add(conv.id);
      return true;
    });

    // Filtrer selon le filtre sélectionné
    let filtered = uniqueConversations.filter(conv => {
      const prefs = preferencesMap.get(conv.id);
      const isArchived = prefs?.isArchived || false;

      if (selectedFilter.type === 'all') {
        return !isArchived;
      } else if (selectedFilter.type === 'archived') {
        return isArchived;
      } else if (selectedFilter.type === 'reacted') {
        return !isArchived && !!prefs?.reaction;
      } else if (selectedFilter.type === 'community') {
        return !isArchived && conv.communityId === selectedFilter.communityId;
      } else if (selectedFilter.type === 'category') {
        return !isArchived && prefs?.categoryId === selectedFilter.categoryId;
      }
      return true;
    });

    // Filtrer par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv => {
        const title = conv.title || '';
        const lastMessage = conv.lastMessage?.content || '';
        return title.toLowerCase().includes(query) || lastMessage.toLowerCase().includes(query);
      });
    }

    return filtered;
  }, [conversations, searchQuery, selectedFilter, preferencesMap]);
}
