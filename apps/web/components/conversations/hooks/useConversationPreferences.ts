import { useState, useEffect } from 'react';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';
import { userPreferencesService } from '@/services/user-preferences.service';

interface UseConversationPreferencesReturn {
  preferencesMap: Map<string, UserConversationPreferences>;
  categories: UserConversationCategory[];
  isLoadingPreferences: boolean;
  collapsedSections: Set<string>;
  toggleSection: (sectionId: string) => void;
}

/**
 * Hook pour gérer les préférences utilisateur des conversations
 * Gère: préférences (pin, mute, archive), catégories, et état collapsed des sections
 */
export function useConversationPreferences(
  conversationsLength: number
): UseConversationPreferencesReturn {
  const [preferencesMap, setPreferencesMap] = useState<Map<string, UserConversationPreferences>>(new Map());
  const [categories, setCategories] = useState<UserConversationCategory[]>([]);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
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

  // Charger les préférences utilisateur
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setIsLoadingPreferences(true);
        const allPrefs = await userPreferencesService.getAllPreferences();
        const map = new Map<string, UserConversationPreferences>();
        allPrefs.forEach(pref => {
          map.set(pref.conversationId, pref);
        });
        setPreferencesMap(map);
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, [conversationsLength]);

  // Charger les catégories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await userPreferencesService.getCategories();
        const sorted = cats.sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          return a.name.localeCompare(b.name);
        });
        setCategories(sorted);
      } catch (error) {
        console.error('[useConversationPreferences] Error loading categories:', error);
      }
    };
    loadCategories();
  }, []);

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
    isLoadingPreferences,
    collapsedSections,
    toggleSection
  };
}
