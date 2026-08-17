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
import { useShallow } from 'zustand/react/shallow';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { UserConversationPreferences, UserConversationCategory } from '@meeshy/shared/types/user-preferences';
import type {
  UserPreferencesConversationUpdatedEventData,
  UserPreferencesReorderedEventData,
} from '@meeshy/shared/types/socketio-events';

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

  // Apply a `user:preferences-updated` broadcast (conversation scope)
  applyRemotePreferences: (event: UserPreferencesConversationUpdatedEventData) => void;

  // Apply a `user:preferences-reordered` broadcast (drag-reorder, no version)
  applyRemoteReorder: (updates: UserPreferencesReorderedEventData['updates']) => void;

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

const createDefaultPreferences = (conversationId: string): UserConversationPreferences => ({
  id: '',
  userId: '',
  conversationId,
  isPinned: false,
  isMuted: false,
  isArchived: false,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

/**
 * Même arbitre que `applyRemotePreferences`, appliqué à l'autre écrivain : la
 * réponse HTTP du `PUT`. Deux bascules rapprochées peuvent voir leurs réponses
 * revenir dans le désordre, et une diffusion socket peut atterrir pendant le
 * vol — dans les deux cas, poser la réponse telle quelle rembobine un état plus
 * récent. `version` tranche.
 *
 * L'arbitrage n'a lieu que si la réponse PORTE une version : une réponse
 * antérieure à l'ajout du champ au sérialiseur n'a pas d'arbitre, et la laisser
 * tomber perdrait l'écriture. Côté local, l'absence vaut la version 0 (même
 * convention que le lecteur socket).
 */
const isStaleWriteResponse = (
  incoming: UserConversationPreferences,
  current: UserConversationPreferences | undefined
): boolean =>
  typeof incoming.version === 'number' && incoming.version <= (current?.version ?? 0);

export const useConversationPreferencesStore = create<ConversationPreferencesState & ConversationPreferencesActions>()(
  (set, get) => {
    /**
     * Écriture optimiste unique des quatre bascules : instantané → patch local
     * immédiat → requête → arbitrage de la réponse.
     */
    const writeOptimistic = async (
      conversationId: string,
      patch: Partial<UserConversationPreferences>,
      request: () => Promise<UserConversationPreferences>
    ): Promise<void> => {
      const snapshot = get().preferencesMap.get(conversationId);
      const optimistic: UserConversationPreferences = {
        ...(snapshot ?? createDefaultPreferences(conversationId)),
        ...patch,
      };

      const optimisticMap = new Map(get().preferencesMap);
      optimisticMap.set(conversationId, optimistic);
      set({ preferencesMap: optimisticMap });

      try {
        const confirmed = await request();
        if (isStaleWriteResponse(confirmed, get().preferencesMap.get(conversationId))) return;

        const finalMap = new Map(get().preferencesMap);
        finalMap.set(conversationId, confirmed);
        set({ preferencesMap: finalMap });
      } catch (error) {
        // Ne rétracter QUE notre propre écriture : l'état est immuable, donc
        // l'identité référentielle suffit à dire si personne n'a écrit depuis.
        // Rembobiner à l'instantané par-dessus une diffusion ou une bascule plus
        // récente en effacerait l'effet.
        if (get().preferencesMap.get(conversationId) === optimistic) {
          const revertMap = new Map(get().preferencesMap);
          if (snapshot) {
            revertMap.set(conversationId, snapshot);
          } else {
            revertMap.delete(conversationId);
          }
          set({ preferencesMap: revertMap });
        }
        throw error;
      }
    };

    return {
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

      togglePin: (conversationId: string, isPinned: boolean) =>
        writeOptimistic(conversationId, { isPinned }, () =>
          userPreferencesService.togglePin(conversationId, isPinned)
        ),

      toggleMute: (conversationId: string, isMuted: boolean) =>
        writeOptimistic(conversationId, { isMuted }, () =>
          userPreferencesService.toggleMute(conversationId, isMuted)
        ),

      toggleArchive: (conversationId: string, isArchived: boolean) =>
        writeOptimistic(conversationId, { isArchived }, () =>
          userPreferencesService.toggleArchive(conversationId, isArchived)
        ),

      setReaction: (conversationId: string, reaction: string | null) =>
        writeOptimistic(conversationId, { reaction: reaction || undefined }, () =>
          userPreferencesService.updateReaction(conversationId, reaction)
        ),

      updatePreference: (conversationId: string, prefs: Partial<UserConversationPreferences>) => {
        const currentPrefs = get().preferencesMap.get(conversationId);
        const newMap = new Map(get().preferencesMap);

        if (currentPrefs) {
          newMap.set(conversationId, { ...currentPrefs, ...prefs });
        }

        set({ preferencesMap: newMap });
      },

      applyRemotePreferences: (event: UserPreferencesConversationUpdatedEventData) => {
        const { conversationId, version } = event;
        const current = get().preferencesMap.get(conversationId);

        // La ligne est PAR UTILISATEUR : `writeConversationPreferences` diffuse à
        // tous ses appareils, y compris celui qui vient d'écrire. `version` est
        // l'arbitre — une diffusion qui ne dépasse pas l'état local décrit un
        // passé, et l'appliquer rembobinerait une action plus récente.
        if (version <= (current?.version ?? 0)) return;

        // `reset: false` sans snapshot n'apprend rien. Avancer le compteur ferait
        // alors tomber la PROCHAINE diffusion, celle qui portait l'état.
        if (!event.reset && !event.preferences) return;

        const payload = event.preferences;
        const next: UserConversationPreferences = {
          id: current?.id ?? '',
          userId: current?.userId || event.userId,
          conversationId,
          isPinned: payload?.isPinned ?? false,
          isMuted: payload?.isMuted ?? false,
          isArchived: payload?.isArchived ?? false,
          tags: payload ? [...payload.tags] : [],
          categoryId: payload?.categoryId ?? undefined,
          orderInCategory: payload?.orderInCategory ?? undefined,
          customName: payload?.customName ?? undefined,
          reaction: payload?.reaction ?? undefined,
          createdAt: current?.createdAt ?? new Date(),
          updatedAt: new Date(),
          version,
        };

        const newMap = new Map(get().preferencesMap);
        newMap.set(conversationId, next);
        set({ preferencesMap: newMap });
      },

      /**
       * Le glisser-déposer d'un autre appareil.
       *
       * `orderInCategory` est un critère de tri de la liste au même titre
       * qu'`isPinned` et `categoryId` (`useConversationSorting` les lit tous
       * les trois dans cette même map), mais c'est le seul que le serveur
       * annonce SANS version : `reorderConversationPreferences` refuse
       * délibérément de la bumper (« order is broadcast by
       * USER_PREFERENCES_REORDERED, which carries no version ») pour émettre un
       * événement par geste plutôt qu'un par ligne déplacée. L'arbitre de
       * `applyRemotePreferences` n'a donc rien à arbitrer ici, et le mirroir iOS
       * (`ConversationStore.applyRemoteReorder`) applique lui aussi sans garde.
       *
       * Une conversation SANS ligne locale est ignorée plutôt que créée : un
       * ordre seul ne dit rien des dix autres champs, et la ligne fabriquée
       * affirmerait des valeurs par défaut (`isPinned: false`, aucune catégorie)
       * que le serveur n'a jamais envoyées — elle sortirait la conversation de
       * son groupe pour la placer dans « non catégorisées ». Le serveur ne
       * diffuse que ce qu'il a écrit ; ce qu'on n'a pas encore chargé arrivera
       * par `initialize`.
       */
      applyRemoteReorder: (updates) => {
        const current = get().preferencesMap;
        const applicable = updates.filter((update) => current.has(update.conversationId));
        if (applicable.length === 0) return;

        const newMap = new Map(current);
        applicable.forEach(({ conversationId, orderInCategory }) => {
          newMap.set(conversationId, {
            ...newMap.get(conversationId)!,
            orderInCategory,
          });
        });
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
    };
  }
);

// Selector hooks for specific use cases
export const useConversationPreference = (conversationId: string) => {
  return useConversationPreferencesStore(state => state.preferencesMap.get(conversationId));
};

export const useConversationCategories = () => {
  return useConversationPreferencesStore(state => state.categories);
};

export const useConversationPreferencesActions = () => {
  return useConversationPreferencesStore(
    useShallow(state => ({
      initialize: state.initialize,
      getPreferences: state.getPreferences,
      togglePin: state.togglePin,
      toggleMute: state.toggleMute,
      toggleArchive: state.toggleArchive,
      setReaction: state.setReaction,
      updatePreference: state.updatePreference,
      refreshPreferences: state.refreshPreferences,
      refreshCategories: state.refreshCategories,
    }))
  );
};
