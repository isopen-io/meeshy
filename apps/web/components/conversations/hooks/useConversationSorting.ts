import { useMemo } from 'react';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';
import { sortConversations, type SectionableConversation } from '@meeshy/shared/utils/conversation-sections';

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
 * Le wire `GET /conversations` porte `Conversation.updatedAt`/`lastMessageAt`
 * comme `Date`, mais des appelants (React Query hydraté depuis du JSON,
 * fixtures de test) laissent parfois passer une chaîne ISO. `sortConversations`
 * exige des `Date` réels (`.getTime()` en interne) — normaliser ici plutôt que
 * de dupliquer cette tolérance dans la loi partagée.
 */
const toDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
};

/**
 * Adaptateur conversation web → `SectionableConversation` (loi partagée,
 * `packages/shared/utils/conversation-sections.ts`).
 *
 * Provenance re-prouvée : `isPinned` / `categoryId` / `orderInCategory` ne
 * viennent JAMAIS d'un champ de `Conversation` (elle n'en porte aucun
 * exploitable) — uniquement de `preferencesMap.get(conversation.id)`
 * (`UserConversationPreferences`), exactement comme le groupement plus bas
 * dans ce fichier le lisait déjà avant ce correctif.
 *
 * `liveCall` n'existe sur aucune plateforme aujourd'hui (cf. doc de la loi
 * partagée) : toujours `null` ici, ce qui neutralise ce critère de tri sans
 * en fabriquer un.
 */
const toSectionable = (
  conversation: Conversation,
  preferencesMap: Map<string, UserConversationPreferences>
): SectionableConversation => {
  const prefs = preferencesMap.get(conversation.id);
  return {
    id: conversation.id,
    isPinned: prefs?.isPinned ?? false,
    categoryId: prefs?.categoryId ?? null,
    orderInCategory: prefs?.orderInCategory ?? null,
    lastMessageAt: toDate(conversation.lastMessageAt),
    updatedAt: toDate(conversation.updatedAt) ?? new Date(0),
    liveCall: null,
  };
};

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
  // Trier les conversations : délégué à la loi partagée `sortConversations`
  // (pinned → live → catégorie/orderInCategory → lastMessageAt desc, repli
  // updatedAt → id). Le hook ne fait plus qu'adapter web → SectionableConversation
  // et reprojeter l'ordre résolu sur les `Conversation` d'origine — corrigé E11
  // (`packages/shared/utils/conversation-sections.ts`), plus de tri sur
  // `lastMessage.createdAt`.
  const sortedConversations = useMemo(() => {
    const byId = new Map(conversations.map((conversation) => [conversation.id, conversation] as const));
    const sectionable = conversations.map((conversation) => toSectionable(conversation, preferencesMap));
    return sortConversations(sectionable).map((entry) => byId.get(entry.id)!);
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
