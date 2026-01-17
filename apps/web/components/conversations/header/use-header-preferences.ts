import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { HeaderPreferences } from './types';

function isAnonymousUser(user: any): boolean {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

export function useHeaderPreferences(conversationId: string, currentUser: any, t: (key: string) => string) {
  const [preferences, setPreferences] = useState<HeaderPreferences>({
    isPinned: false,
    isMuted: false,
    isArchived: false,
    customName: undefined,
    tags: [],
    categoryName: undefined,
    isLoading: true,
  });

  // Charger les préférences initiales
  useEffect(() => {
    const isUserAnonymous = isAnonymousUser(currentUser);

    if (isUserAnonymous) {
      setPreferences({
        isPinned: false,
        isMuted: false,
        isArchived: false,
        customName: undefined,
        tags: [],
        categoryName: undefined,
        isLoading: false,
      });
      return;
    }

    const loadPreferences = async () => {
      try {
        const prefs = await userPreferencesService.getPreferences(conversationId);
        if (prefs) {
          let categoryName: string | undefined;
          if (prefs.categoryId) {
            const category = await userPreferencesService.getCategory(prefs.categoryId);
            categoryName = category?.name;
          }

          setPreferences({
            isPinned: prefs.isPinned,
            isMuted: prefs.isMuted,
            isArchived: prefs.isArchived,
            customName: prefs.customName,
            tags: prefs.tags || [],
            categoryName,
            isLoading: false,
          });
        } else {
          setPreferences({
            isPinned: false,
            isMuted: false,
            isArchived: false,
            customName: undefined,
            tags: [],
            categoryName: undefined,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
        setPreferences({
          isPinned: false,
          isMuted: false,
          isArchived: false,
          customName: undefined,
          tags: [],
          categoryName: undefined,
          isLoading: false,
        });
      }
    };
    loadPreferences();
  }, [conversationId, currentUser]);

  const togglePin = useCallback(async () => {
    try {
      const newPinnedState = !preferences.isPinned;
      setPreferences(prev => ({ ...prev, isPinned: newPinnedState }));
      await userPreferencesService.togglePin(conversationId, newPinnedState);
      toast.success(t(newPinnedState ? 'conversationHeader.pinned' : 'conversationHeader.unpinned'));
    } catch (error) {
      console.error('Error toggling pin:', error);
      setPreferences(prev => ({ ...prev, isPinned: !prev.isPinned }));
      toast.error(t('conversationHeader.pinError'));
    }
  }, [conversationId, preferences.isPinned, t]);

  const toggleMute = useCallback(async () => {
    try {
      const newMutedState = !preferences.isMuted;
      setPreferences(prev => ({ ...prev, isMuted: newMutedState }));
      await userPreferencesService.toggleMute(conversationId, newMutedState);
      toast.success(t(newMutedState ? 'conversationHeader.muted' : 'conversationHeader.unmuted'));
    } catch (error) {
      console.error('Error toggling mute:', error);
      setPreferences(prev => ({ ...prev, isMuted: !prev.isMuted }));
      toast.error(t('conversationHeader.muteError'));
    }
  }, [conversationId, preferences.isMuted, t]);

  const toggleArchive = useCallback(async () => {
    try {
      const newArchivedState = !preferences.isArchived;
      setPreferences(prev => ({ ...prev, isArchived: newArchivedState }));
      await userPreferencesService.toggleArchive(conversationId, newArchivedState);
      toast.success(t(newArchivedState ? 'conversationHeader.archived' : 'conversationHeader.unarchived'));
    } catch (error) {
      console.error('Error toggling archive:', error);
      setPreferences(prev => ({ ...prev, isArchived: !prev.isArchived }));
      toast.error(t('conversationHeader.archiveError'));
    }
  }, [conversationId, preferences.isArchived, t]);

  return {
    preferences,
    togglePin,
    toggleMute,
    toggleArchive,
  };
}
