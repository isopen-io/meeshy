import { useMemo } from 'react';
import type { Conversation, SocketIOUser } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import type { CommunityFilter } from '../CommunityCarousel';

interface UseConversationFilteringParams {
  conversations: Conversation[];
  searchQuery: string;
  selectedFilter: CommunityFilter;
  preferencesMap: Map<string, UserConversationPreferences>;
  currentUser: SocketIOUser;
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
  preferencesMap,
  currentUser
}: UseConversationFilteringParams): Conversation[] {
  // Prisme Linguistique (contrat Lentille LWS-9) : la recherche doit matcher ce
  // que le lecteur VOIT (le préview résolu), pas le contenu original du dernier
  // message. Même point d'entrée que ConversationItem — `getUserLanguagePreferences`
  // délègue à `resolveUserLanguagesOrdered` (@meeshy/shared) et injecte la
  // `deviceLocale` en 4e priorité (cf. apps/web/CLAUDE.md).
  const preferredLanguages = useMemo(
    () => getUserLanguagePreferences(currentUser),
    [
      currentUser.systemLanguage,
      currentUser.regionalLanguage,
      currentUser.customDestinationLanguage,
      currentUser.deviceLocale
    ]
  );

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
        const resolvedPreview = resolveLastMessagePreview({
          preview: conv.lastMessage?.content,
          translations: conv.lastMessageTranslations,
          originalLanguage: conv.lastMessageOriginalLanguage,
          preferredLanguages
        }) ?? '';
        return title.toLowerCase().includes(query) || resolvedPreview.toLowerCase().includes(query);
      });
    }

    return filtered;
  }, [conversations, searchQuery, selectedFilter, preferencesMap, preferredLanguages]);
}
