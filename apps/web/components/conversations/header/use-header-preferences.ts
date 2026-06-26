import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import {
  useConversationPreferencesStore,
  useConversationPreference,
  useConversationCategories,
  useConversationPreferencesActions,
} from '@/stores/conversation-preferences-store';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { HeaderPreferences } from './types';

function isAnonymousUser(user: unknown): boolean {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

/**
 * Hook pour gérer les préférences dans le header de conversation
 * Utilise le store Zustand pour la synchronisation globale
 */
export function useHeaderPreferences(conversationId: string, currentUser: unknown, t: (key: string) => string) {
  const storePrefs = useConversationPreference(conversationId);
  const categories = useConversationCategories();
  const isStoreLoading = useConversationPreferencesStore(state => state.isLoading);
  const isInitialized = useConversationPreferencesStore(state => state.isInitialized);
  const {
    initialize,
    togglePin: togglePinAction,
    toggleMute: toggleMuteAction,
    toggleArchive: toggleArchiveAction,
  } = useConversationPreferencesActions();
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState<string | undefined>();

  // Initialiser le store si nécessaire
  useEffect(() => {
    if (!isInitialized && !isAnonymousUser(currentUser)) {
      initialize();
    }
  }, [isInitialized, initialize, currentUser]);

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
      tags: [...(storePrefs?.tags ?? [])],
      categoryName,
      isLoading: isStoreLoading || isLoadingCategory,
    };
  }, [storePrefs, categoryName, isStoreLoading, isLoadingCategory, currentUser]);

  const togglePin = useCallback(async () => {
    try {
      const newPinnedState = !preferences.isPinned;
      await togglePinAction(conversationId, newPinnedState);
      toast.success(t(newPinnedState ? 'conversationHeader.pinned' : 'conversationHeader.unpinned'));
    } catch (error) {
      logger.error('[useHeaderPreferences]', 'Error toggling pin:', { error });
      toast.error(t('conversationHeader.pinError'));
    }
  }, [conversationId, preferences.isPinned, togglePinAction, t]);

  const toggleMute = useCallback(async () => {
    try {
      const newMutedState = !preferences.isMuted;
      await toggleMuteAction(conversationId, newMutedState);
      toast.success(t(newMutedState ? 'conversationHeader.muted' : 'conversationHeader.unmuted'));
    } catch (error) {
      logger.error('[useHeaderPreferences]', 'Error toggling mute:', { error });
      toast.error(t('conversationHeader.muteError'));
    }
  }, [conversationId, preferences.isMuted, toggleMuteAction, t]);

  const toggleArchive = useCallback(async () => {
    try {
      const newArchivedState = !preferences.isArchived;
      await toggleArchiveAction(conversationId, newArchivedState);
      toast.success(t(newArchivedState ? 'conversationHeader.archived' : 'conversationHeader.unarchived'));
    } catch (error) {
      logger.error('[useHeaderPreferences]', 'Error toggling archive:', { error });
      toast.error(t('conversationHeader.archiveError'));
    }
  }, [conversationId, preferences.isArchived, toggleArchiveAction, t]);

  return {
    preferences,
    togglePin,
    toggleMute,
    toggleArchive,
  };
}
