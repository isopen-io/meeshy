import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useConversationPreferencesStore } from '@/stores/conversation-preferences-store';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { HeaderPreferences } from './types';

function isAnonymousUser(user: any): boolean {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

/**
 * Hook pour gérer les préférences dans le header de conversation
 * Utilise le store Zustand pour la synchronisation globale
 */
export function useHeaderPreferences(conversationId: string, currentUser: any, t: (key: string) => string) {
  const store = useConversationPreferencesStore();
  const storePrefs = store.preferencesMap.get(conversationId);
  const categories = store.categories;
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState<string | undefined>();

  // Initialiser le store si nécessaire
  useEffect(() => {
    if (!store.isInitialized && !isAnonymousUser(currentUser)) {
      store.initialize();
    }
  }, [store.isInitialized, currentUser]);

  // Charger le nom de la catégorie quand les préférences changent
  useEffect(() => {
    const loadCategoryName = async () => {
      if (storePrefs?.categoryId) {
        // D'abord chercher dans les catégories déjà chargées
        const cat = categories.find(c => c.id === storePrefs.categoryId);
        if (cat) {
          setCategoryName(cat.name);
        } else {
          // Sinon charger depuis le service
          setIsLoadingCategory(true);
          try {
            const category = await userPreferencesService.getCategory(storePrefs.categoryId);
            setCategoryName(category?.name);
          } catch {
            setCategoryName(undefined);
          } finally {
            setIsLoadingCategory(false);
          }
        }
      } else {
        setCategoryName(undefined);
      }
    };
    loadCategoryName();
  }, [storePrefs?.categoryId, categories]);

  // Construire les préférences pour le header
  const preferences: HeaderPreferences = useMemo(() => {
    if (isAnonymousUser(currentUser)) {
      return {
        isPinned: false,
        isMuted: false,
        isArchived: false,
        customName: undefined,
        tags: [],
        categoryName: undefined,
        isLoading: false,
      };
    }

    return {
      isPinned: storePrefs?.isPinned ?? false,
      isMuted: storePrefs?.isMuted ?? false,
      isArchived: storePrefs?.isArchived ?? false,
      customName: storePrefs?.customName,
      tags: storePrefs?.tags ?? [],
      categoryName,
      isLoading: store.isLoading || isLoadingCategory,
    };
  }, [storePrefs, categoryName, store.isLoading, isLoadingCategory, currentUser]);

  const togglePin = useCallback(async () => {
    try {
      const newPinnedState = !preferences.isPinned;
      await store.togglePin(conversationId, newPinnedState);
      toast.success(t(newPinnedState ? 'conversationHeader.pinned' : 'conversationHeader.unpinned'));
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error(t('conversationHeader.pinError'));
    }
  }, [conversationId, preferences.isPinned, store, t]);

  const toggleMute = useCallback(async () => {
    try {
      const newMutedState = !preferences.isMuted;
      await store.toggleMute(conversationId, newMutedState);
      toast.success(t(newMutedState ? 'conversationHeader.muted' : 'conversationHeader.unmuted'));
    } catch (error) {
      console.error('Error toggling mute:', error);
      toast.error(t('conversationHeader.muteError'));
    }
  }, [conversationId, preferences.isMuted, store, t]);

  const toggleArchive = useCallback(async () => {
    try {
      const newArchivedState = !preferences.isArchived;
      await store.toggleArchive(conversationId, newArchivedState);
      toast.success(t(newArchivedState ? 'conversationHeader.archived' : 'conversationHeader.unarchived'));
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error(t('conversationHeader.archiveError'));
    }
  }, [conversationId, preferences.isArchived, store, t]);

  return {
    preferences,
    togglePin,
    toggleMute,
    toggleArchive,
  };
}
