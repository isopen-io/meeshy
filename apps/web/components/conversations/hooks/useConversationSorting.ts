import { useMemo } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';

interface ConversationGroup {
  type: 'pinned' | 'category' | 'uncategorized';
  categoryId?: string;
  categoryName?: string;
  conversations: Conversation[];
}

interface UseConversationSortingParams {
  conversations: Conversation[];
  preferencesMap: Map<string, UserConversationPreferences>;
  categories: UserConversationCategory[];
}

/**
 * Hook pour trier et grouper les conversations
 * Retourne les conversations triées et groupées par:
 * - Épinglées sans catégorie
 * - Catégories (dans l'ordre défini)
 * - Non catégorisées
 */
export function useConversationSorting({
  conversations,
  preferencesMap,
  categories
}: UseConversationSortingParams): ConversationGroup[] {
  // Trier les conversations (pinned first, puis par date)
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aPrefs = preferencesMap.get(a.id);
      const bPrefs = preferencesMap.get(b.id);
      const aPinned = aPrefs?.isPinned || false;
      const bPinned = bPrefs?.isPinned || false;

      // Les conversations épinglées viennent en premier
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // Pour les conversations du même statut d'épinglage, trier par date de dernier message
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations, preferencesMap]);

  // Grouper les conversations
  return useMemo(() => {
    const groups: ConversationGroup[] = [];

    // Séparer les conversations
    const pinnedWithoutCategory: Conversation[] = [];
    const conversationsByCategory = new Map<string, Conversation[]>();
    const uncategorized: Conversation[] = [];

    sortedConversations.forEach(conv => {
      const prefs = preferencesMap.get(conv.id);
      const isPinned = prefs?.isPinned || false;
      const categoryId = prefs?.categoryId;

      if (isPinned && !categoryId) {
        pinnedWithoutCategory.push(conv);
      } else if (categoryId) {
        if (!conversationsByCategory.has(categoryId)) {
          conversationsByCategory.set(categoryId, []);
        }
        conversationsByCategory.get(categoryId)!.push(conv);
      } else {
        uncategorized.push(conv);
      }
    });

    // Ajouter le groupe "Pinned" si nécessaire
    if (pinnedWithoutCategory.length > 0) {
      groups.push({
        type: 'pinned',
        conversations: pinnedWithoutCategory
      });
    }

    // Ajouter les groupes de catégories (dans l'ordre des catégories)
    const displayedCategoryIds = new Set<string>();
    categories.forEach(category => {
      const categoryConvs = conversationsByCategory.get(category.id);
      if (categoryConvs && categoryConvs.length > 0) {
        groups.push({
          type: 'category',
          categoryId: category.id,
          categoryName: category.name,
          conversations: categoryConvs
        });
        displayedCategoryIds.add(category.id);
      }
    });

    // Ajouter les conversations avec categoryId orphelin dans uncategorized
    conversationsByCategory.forEach((convs, categoryId) => {
      if (!displayedCategoryIds.has(categoryId)) {
        console.warn('[useConversationSorting] Found orphaned conversations with missing category:', categoryId);
        uncategorized.push(...convs);
      }
    });

    // Ajouter le groupe "Non catégorisées" si nécessaire
    if (uncategorized.length > 0) {
      groups.push({
        type: 'uncategorized',
        conversations: uncategorized
      });
    }

    return groups;
  }, [sortedConversations, preferencesMap, categories]);
}
