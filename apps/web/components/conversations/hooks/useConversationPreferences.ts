import { useState, useEffect } from 'react';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';

interface UseConversationPreferencesReturn {
  preferencesMap: Map<string, UserConversationPreferences>;
  categories: UserConversationCategory[];
  isLoadingPreferences: boolean;
  collapsedSections: Set<string>;
  toggleSection: (sectionId: string) => void;
}

/**
 * Hook pour gérer les préférences utilisateur des conversations
 * Utilise le store Zustand pour la réactivité
 * Gère: préférences (pin, mute, archive), catégories, et état collapsed des sections
 */
export function useConversationPreferences(
  conversationsLength: number
): UseConversationPreferencesReturn {
  // Utiliser le store Zustand pour les préférences
  const store = useConversationPreferencesStore();
  const { preferencesMap, categories, isLoading, isInitialized, initialize } = store;

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    // Charger l'état collapsed depuis localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('collapsedConversationSections');
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch (e) {
          return new Set();
        }
      }
    }
    return new Set();
  });

  // Initialiser le store si nécessaire
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Sauvegarder l'état collapsed dans localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('collapsedConversationSections', JSON.stringify([...collapsedSections]));
    }
  }, [collapsedSections]);

  // Fonction pour toggle une section
  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  return {
    preferencesMap,
    categories,
    isLoadingPreferences: isLoading || !isInitialized,
    collapsedSections,
    toggleSection
  };
}
