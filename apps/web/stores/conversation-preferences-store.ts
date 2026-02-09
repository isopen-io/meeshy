/**
 * Conversation Preferences Store
 *
 * Zustand store for managing per-conversation user preferences:
 * - Pin/Unpin
 * - Mute/Unmute
 * - Archive/Unarchive
 * - Tags
 * - Categories
 * - Reactions
 *
 * This store provides reactive state management so that UI updates
 * immediately when preferences change.
 */

import { create } from 'zustand';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';

interface ConversationPreferencesState {
  // Preferences map by conversation ID
  preferencesMap: Map<string, UserConversationPreferences>;

  // Categories list
  categories: UserConversationCategory[];

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;

  // Error state
  error: string | null;
}

interface ConversationPreferencesActions {
  // Initialization
  initialize: () => Promise<void>;
  reset: () => void;

  // Get preferences for a conversation
  getPreferences: (conversationId: string) => UserConversationPreferences | undefined;

  // Toggle actions (update store + backend)
  togglePin: (conversationId: string, isPinned: boolean) => Promise<void>;
  toggleMute: (conversationId: string, isMuted: boolean) => Promise<void>;
  toggleArchive: (conversationId: string, isArchived: boolean) => Promise<void>;
  setReaction: (conversationId: string, reaction: string | null) => Promise<void>;

  // Update preferences
  updatePreference: (conversationId: string, prefs: Partial<UserConversationPreferences>) => void;

  // Reload from backend
  refreshPreferences: () => Promise<void>;
  refreshCategories: () => Promise<void>;
}

const DEFAULT_STATE: ConversationPreferencesState = {
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  isInitialized: false,
  error: null,
};

export const useConversationPreferencesStore = create<ConversationPreferencesState & ConversationPreferencesActions>()(
  (set, get) => ({
    ...DEFAULT_STATE,

    initialize: async () => {
      if (get().isInitialized) return;

      set({ isLoading: true, error: null });

      try {
        const [allPrefs, categories] = await Promise.all([
          userPreferencesService.getAllPreferences(),
          userPreferencesService.getCategories(),
        ]);

        const map = new Map<string, UserConversationPreferences>();
        allPrefs.forEach(pref => {
          map.set(pref.conversationId, pref);
        });

        set({
          preferencesMap: map,
          categories: categories.sort((a, b) => a.order - b.order),
          isInitialized: true,
        });
      } catch (error) {
        console.error('[ConversationPreferencesStore] Initialization error:', error);
        set({ error: 'Failed to load preferences', isInitialized: true });
      } finally {
        set({ isLoading: false });
      }
    },

    reset: () => {
      set(DEFAULT_STATE);
    },

    getPreferences: (conversationId: string) => {
      return get().preferencesMap.get(conversationId);
    },

    togglePin: async (conversationId: string, isPinned: boolean) => {
      // Optimistic update
      const currentPrefs = get().preferencesMap.get(conversationId);
      const newMap = new Map(get().preferencesMap);

      if (currentPrefs) {
        newMap.set(conversationId, { ...currentPrefs, isPinned });
      } else {
        newMap.set(conversationId, {
          id: '',
          userId: '',
          conversationId,
          isPinned,
          isMuted: false,
          isArchived: false,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      set({ preferencesMap: newMap });

      try {
        const updatedPrefs = await userPreferencesService.togglePin(conversationId, isPinned);
        const finalMap = new Map(get().preferencesMap);
        finalMap.set(conversationId, updatedPrefs);
        set({ preferencesMap: finalMap });
      } catch (error) {
        // Revert on error
        const revertMap = new Map(get().preferencesMap);
        if (currentPrefs) {
          revertMap.set(conversationId, currentPrefs);
        } else {
          revertMap.delete(conversationId);
        }
        set({ preferencesMap: revertMap });
        throw error;
      }
    },

    toggleMute: async (conversationId: string, isMuted: boolean) => {
      const currentPrefs = get().preferencesMap.get(conversationId);
      const newMap = new Map(get().preferencesMap);

      if (currentPrefs) {
        newMap.set(conversationId, { ...currentPrefs, isMuted });
      } else {
        newMap.set(conversationId, {
          id: '',
          userId: '',
          conversationId,
          isPinned: false,
          isMuted,
          isArchived: false,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      set({ preferencesMap: newMap });

      try {
        const updatedPrefs = await userPreferencesService.toggleMute(conversationId, isMuted);
        const finalMap = new Map(get().preferencesMap);
        finalMap.set(conversationId, updatedPrefs);
        set({ preferencesMap: finalMap });
      } catch (error) {
        const revertMap = new Map(get().preferencesMap);
        if (currentPrefs) {
          revertMap.set(conversationId, currentPrefs);
        } else {
          revertMap.delete(conversationId);
        }
        set({ preferencesMap: revertMap });
        throw error;
      }
    },

    toggleArchive: async (conversationId: string, isArchived: boolean) => {
      const currentPrefs = get().preferencesMap.get(conversationId);
      const newMap = new Map(get().preferencesMap);

      if (currentPrefs) {
        newMap.set(conversationId, { ...currentPrefs, isArchived });
      } else {
        newMap.set(conversationId, {
          id: '',
          userId: '',
          conversationId,
          isPinned: false,
          isMuted: false,
          isArchived,
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      set({ preferencesMap: newMap });

      try {
        const updatedPrefs = await userPreferencesService.toggleArchive(conversationId, isArchived);
        const finalMap = new Map(get().preferencesMap);
        finalMap.set(conversationId, updatedPrefs);
        set({ preferencesMap: finalMap });
      } catch (error) {
        const revertMap = new Map(get().preferencesMap);
        if (currentPrefs) {
          revertMap.set(conversationId, currentPrefs);
        } else {
          revertMap.delete(conversationId);
        }
        set({ preferencesMap: revertMap });
        throw error;
      }
    },

    setReaction: async (conversationId: string, reaction: string | null) => {
      const currentPrefs = get().preferencesMap.get(conversationId);
      const newMap = new Map(get().preferencesMap);

      if (currentPrefs) {
        newMap.set(conversationId, { ...currentPrefs, reaction: reaction || undefined });
      } else {
        newMap.set(conversationId, {
          id: '',
          userId: '',
          conversationId,
          isPinned: false,
          isMuted: false,
          isArchived: false,
          tags: [],
          reaction: reaction || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      set({ preferencesMap: newMap });

      try {
        const updatedPrefs = await userPreferencesService.updateReaction(conversationId, reaction);
        const finalMap = new Map(get().preferencesMap);
        finalMap.set(conversationId, updatedPrefs);
        set({ preferencesMap: finalMap });
      } catch (error) {
        const revertMap = new Map(get().preferencesMap);
        if (currentPrefs) {
          revertMap.set(conversationId, currentPrefs);
        } else {
          revertMap.delete(conversationId);
        }
        set({ preferencesMap: revertMap });
        throw error;
      }
    },

    updatePreference: (conversationId: string, prefs: Partial<UserConversationPreferences>) => {
      const currentPrefs = get().preferencesMap.get(conversationId);
      const newMap = new Map(get().preferencesMap);

      if (currentPrefs) {
        newMap.set(conversationId, { ...currentPrefs, ...prefs });
      }

      set({ preferencesMap: newMap });
    },

    refreshPreferences: async () => {
      try {
        const allPrefs = await userPreferencesService.getAllPreferences();
        const map = new Map<string, UserConversationPreferences>();
        allPrefs.forEach(pref => {
          map.set(pref.conversationId, pref);
        });
        set({ preferencesMap: map });
      } catch (error) {
        console.error('[ConversationPreferencesStore] Error refreshing preferences:', error);
      }
    },

    refreshCategories: async () => {
      try {
        const categories = await userPreferencesService.getCategories();
        set({ categories: categories.sort((a, b) => a.order - b.order) });
      } catch (error) {
        console.error('[ConversationPreferencesStore] Error refreshing categories:', error);
      }
    },
  })
);

// Selector hooks for specific use cases
export const useConversationPreference = (conversationId: string) => {
  return useConversationPreferencesStore(state => state.preferencesMap.get(conversationId));
};

export const useConversationCategories = () => {
  return useConversationPreferencesStore(state => state.categories);
};
