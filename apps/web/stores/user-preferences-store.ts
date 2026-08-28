import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import { trackPreferenceWrite } from '@/lib/preferences/preference-write-lock';
import { DEFAULT_PUBLICATION_VISIBILITY } from '@meeshy/shared/types/post';
import type {
  NotificationPreference,
  PrivacyPreference,
} from '@meeshy/shared/types/preferences';

export type { EncryptionPreference } from '@meeshy/shared/types';

export type StoreNotificationPreferences = Pick<
  NotificationPreference,
  | 'pushEnabled'
  | 'emailEnabled'
  | 'soundEnabled'
  | 'newMessageEnabled'
  | 'missedCallEnabled'
  | 'systemEnabled'
  | 'conversationEnabled'
  | 'replyEnabled'
  | 'mentionEnabled'
  | 'reactionEnabled'
  | 'contactRequestEnabled'
  | 'memberJoinedEnabled'
  | 'dndEnabled'
  | 'dndStartTime'
  | 'dndEndTime'
>;

export type EncryptionPreferences = Pick<
  PrivacyPreference,
  | 'encryptionPreference'
  | 'autoEncryptNewConversations'
  | 'showEncryptionStatus'
  | 'warnOnUnencrypted'
>;

export type StorePrivacyPreferences = Pick<
  PrivacyPreference,
  | 'showOnlineStatus'
  | 'showLastSeen'
  | 'showReadReceipts'
  | 'showTypingIndicator'
  | 'allowContactRequests'
  | 'allowGroupInvites'
  | 'saveMediaToGallery'
  | 'allowAnalytics'
>;

export interface LanguagePreferences {
  preferredLanguage: string;
  translationEnabled: boolean;
  autoTranslate: boolean;
  translationTargetLanguage: string;
}

export interface StoryPreferences {
  defaultVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  storyNotificationsEnabled: boolean;
}

/**
 * Server state, not a preference: whether a `SignalPreKeyBundle` row exists for
 * this user. Written by `POST /signal/keys`, reported by
 * `GET /me/preferences/encryption`.
 *
 * It cannot ride on the user object: `userSchema` — the response schema
 * fast-json-stringify serializes `GET /auth/me` through — declares no signal
 * field, so any the handler sets is dropped before the body is written.
 */
export interface EncryptionKeyStatus {
  hasSignalKeys: boolean;
  signalRegistrationId: number | null;
  lastKeyRotation: string | null;
}

export interface UserPreferencesState {
  notifications: StoreNotificationPreferences;
  encryption: EncryptionPreferences;
  encryptionKeys: EncryptionKeyStatus;
  privacy: StorePrivacyPreferences;
  language: LanguagePreferences;
  story: StoryPreferences;

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  lastSyncedAt: string | null;

  // Error state
  error: string | null;
}

export interface UserPreferencesActions {
  // Initialization
  initialize: () => Promise<void>;
  reset: () => void;

  // Sync with backend
  syncAll: () => Promise<void>;
  syncNotifications: () => Promise<void>;
  syncEncryption: () => Promise<void>;
  syncEncryptionKeys: () => Promise<void>;
  syncPrivacy: () => Promise<void>;

  updateNotifications: (prefs: Partial<StoreNotificationPreferences>) => Promise<void>;
  updateEncryption: (prefs: Partial<EncryptionPreferences>) => Promise<void>;
  updateEncryptionLocalSettings: (settings: Partial<EncryptionPreferences>) => Promise<void>;
  updatePrivacy: (prefs: Partial<StorePrivacyPreferences>) => Promise<void>;
  updateLanguage: (prefs: Partial<LanguagePreferences>) => void;
  updateStory: (prefs: Partial<StoryPreferences>) => void;

  // Utility checks
  shouldShowEncryptionWarning: (conversationEncrypted: boolean) => boolean;
  isInDndPeriod: () => boolean;
  canReceiveNotification: (type: keyof StoreNotificationPreferences) => boolean;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_NOTIFICATION_PREFERENCES: StoreNotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  memberJoinedEnabled: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
};

const DEFAULT_ENCRYPTION_PREFERENCES: EncryptionPreferences = {
  encryptionPreference: 'optional',
  autoEncryptNewConversations: false,
  showEncryptionStatus: true,
  warnOnUnencrypted: false,
};

const DEFAULT_ENCRYPTION_KEY_STATUS: EncryptionKeyStatus = {
  hasSignalKeys: false,
  signalRegistrationId: null,
  lastKeyRotation: null,
};

const DEFAULT_PRIVACY_PREFERENCES: StorePrivacyPreferences = {
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowContactRequests: true,
  allowGroupInvites: true,
  saveMediaToGallery: false,
  allowAnalytics: true,
};

const DEFAULT_LANGUAGE_PREFERENCES: LanguagePreferences = {
  preferredLanguage: 'fr',
  translationEnabled: true,
  autoTranslate: false,
  translationTargetLanguage: 'fr',
};

const DEFAULT_STORY_PREFERENCES: StoryPreferences = {
  defaultVisibility: DEFAULT_PUBLICATION_VISIBILITY,
  storyNotificationsEnabled: true,
};

const DEFAULT_STATE: UserPreferencesState = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  encryption: DEFAULT_ENCRYPTION_PREFERENCES,
  encryptionKeys: DEFAULT_ENCRYPTION_KEY_STATUS,
  privacy: DEFAULT_PRIVACY_PREFERENCES,
  language: DEFAULT_LANGUAGE_PREFERENCES,
  story: DEFAULT_STORY_PREFERENCES,
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null,
  error: null,
};

// ============================================================================
// PERSISTED STATE MIGRATION
// ============================================================================

/**
 * v1 (2026-08-23) — l'audience par défaut d'une story passe de `FRIENDS` à
 * `PUBLIC`, alignée sur les posts et les réels.
 *
 * Sans cette migration, la bascule ne toucherait que les NOUVEAUX navigateurs :
 * tout onglet ayant déjà ouvert Meeshy porte `story.defaultVisibility:
 * 'FRIENDS'` gravé dans `localStorage` et le rejouerait indéfiniment. C'est ce
 * qui rend l'application IMMÉDIATE, pas différée au prochain vidage de cache.
 *
 * La réécriture est ciblée : seul l'ANCIEN DÉFAUT littéral est remplacé. Une
 * valeur posée par l'utilisateur via `updateStory` (`PRIVATE`, ou `FRIENDS`
 * re-choisi après la bascule — version courante) survit intacte.
 */
export const USER_PREFERENCES_STORE_VERSION = 1;

export type PersistedUserPreferences = Partial<
  Pick<
    UserPreferencesState,
    | 'notifications'
    | 'encryption'
    | 'encryptionKeys'
    | 'privacy'
    | 'language'
    | 'story'
    | 'lastSyncedAt'
  >
>;

const LEGACY_DEFAULT_STORY_VISIBILITY: StoryPreferences['defaultVisibility'] = 'FRIENDS';

export const migrateUserPreferences = (
  persistedState: PersistedUserPreferences | null | undefined,
  version: number,
): PersistedUserPreferences => {
  const state = persistedState ?? {};
  if (version >= USER_PREFERENCES_STORE_VERSION) return state;

  const story = state.story;
  if (!story || story.defaultVisibility !== LEGACY_DEFAULT_STORY_VISIBILITY) return state;

  return {
    ...state,
    story: { ...story, defaultVisibility: DEFAULT_STORY_PREFERENCES.defaultVisibility },
  };
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useUserPreferencesStore = create<UserPreferencesState & UserPreferencesActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // ========================================================================
      // INITIALIZATION
      // ========================================================================

      initialize: async () => {
        const token = authManager.getAuthToken();
        if (!token) {
          set({ isInitialized: true });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          await get().syncAll();
          set({ isInitialized: true, lastSyncedAt: new Date().toISOString() });
        } catch (error) {
          console.error('[UserPreferencesStore] Initialization error:', error);
          set({ error: 'Failed to load preferences', isInitialized: true });
        } finally {
          set({ isLoading: false });
        }
      },

      reset: () => {
        set(DEFAULT_STATE);
      },

      // ========================================================================
      // SYNC METHODS
      // ========================================================================

      syncAll: async () => {
        await Promise.all([
          get().syncNotifications(),
          get().syncEncryption(),
          get().syncEncryptionKeys(),
          get().syncPrivacy(),
        ]);
      },

      syncNotifications: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/notification'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              const { id, userId, isDefault, createdAt, updatedAt, ...prefs } = data.data;
              set(state => ({
                notifications: { ...state.notifications, ...prefs }
              }));
            }
          }
        } catch (error) {
          console.error('[UserPreferencesStore] Error syncing notifications:', error);
        }
      },

      syncEncryption: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          // Encryption preferences are now part of privacy preferences
          const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              // Extract encryption-related fields from privacy preferences
              const {
                encryptionPreference,
                autoEncryptNewConversations,
                showEncryptionStatus,
                warnOnUnencrypted
              } = data.data;

              set(state => ({
                encryption: {
                  ...state.encryption,
                  encryptionPreference: encryptionPreference || 'optional',
                  autoEncryptNewConversations: autoEncryptNewConversations ?? false,
                  showEncryptionStatus: showEncryptionStatus ?? true,
                  warnOnUnencrypted: warnOnUnencrypted ?? false,
                }
              }));
            }
          }
        } catch (error) {
          console.error('[UserPreferencesStore] Error syncing encryption:', error);
        }
      },

      syncEncryptionKeys: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/encryption'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (!response.ok) return;

          const data = await response.json();
          if (!data.success || !data.data) return;

          const { hasSignalKeys, signalRegistrationId, lastKeyRotation } = data.data;

          set({
            encryptionKeys: {
              hasSignalKeys: hasSignalKeys === true,
              signalRegistrationId: signalRegistrationId ?? null,
              lastKeyRotation: lastKeyRotation ?? null,
            }
          });
        } catch (error) {
          // Le dernier statut connu reste affiché : une panne réseau n'est pas
          // la preuve que l'utilisateur a perdu ses clés.
          console.error('[UserPreferencesStore] Error syncing encryption keys:', error);
        }
      },

      syncPrivacy: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              // Filter out encryption-related fields (they're synced separately)
              const {
                id,
                userId,
                createdAt,
                updatedAt,
                encryptionPreference,
                autoEncryptNewConversations,
                showEncryptionStatus,
                warnOnUnencrypted,
                ...prefs
              } = data.data;

              set(state => ({
                privacy: { ...state.privacy, ...prefs }
              }));
            }
          }
        } catch (error) {
          // Privacy endpoint might not exist yet - use defaults
          console.warn('[UserPreferencesStore] Privacy endpoint not available, using defaults');
        }
      },

      // ========================================================================
      // UPDATE METHODS
      // ========================================================================

      updateNotifications: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        // Optimistic update
        set(state => ({
          notifications: { ...state.notifications, ...prefs }
        }));

        try {
          const response = await fetch(buildApiUrl('/me/preferences/notification'), {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(get().notifications),
          });

          if (!response.ok) {
            // Revert on error
            await get().syncNotifications();
            throw new Error('Failed to update notification preferences');
          }
        } catch (error) {
          console.error('[UserPreferencesStore] Error updating notifications:', error);
          throw error;
        }
      },

      updateEncryption: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        // Optimistic update
        set(state => ({
          encryption: { ...state.encryption, ...prefs }
        }));

        return trackPreferenceWrite(async () => {
          try {
            // Encryption preferences are stored in privacy preferences
            // We need to merge with existing privacy prefs
            const currentPrivacy = get().privacy;
            const updatedEncryption = get().encryption;

            const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...currentPrivacy,
                encryptionPreference: updatedEncryption.encryptionPreference,
                autoEncryptNewConversations: updatedEncryption.autoEncryptNewConversations,
                showEncryptionStatus: updatedEncryption.showEncryptionStatus,
                warnOnUnencrypted: updatedEncryption.warnOnUnencrypted,
              }),
            });

            if (!response.ok) {
              // Revert on error
              await get().syncEncryption();
              throw new Error('Failed to update encryption preferences');
            }
          } catch (error) {
            console.error('[UserPreferencesStore] Error updating encryption:', error);
            throw error;
          }
        });
      },

      updateEncryptionLocalSettings: async (settings) => {
        // Deprecated: localSettings are now top-level encryption preferences
        // Just call updateEncryption with the settings
        await get().updateEncryption(settings);
      },

      updatePrivacy: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        // Optimistic update
        set(state => ({
          privacy: { ...state.privacy, ...prefs }
        }));

        return trackPreferenceWrite(async () => {
          try {
            const response = await fetch(buildApiUrl('/me/preferences/privacy'), {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(get().privacy),
            });

            if (!response.ok) {
              await get().syncPrivacy();
              throw new Error('Failed to update privacy preferences');
            }
          } catch (error) {
            console.error('[UserPreferencesStore] Error updating privacy:', error);
            throw error;
          }
        });
      },

      updateLanguage: (prefs) => {
        set(state => ({
          language: { ...state.language, ...prefs }
        }));
      },

      updateStory: (prefs) => {
        set(state => ({
          story: { ...state.story, ...prefs }
        }));
      },

      // ========================================================================
      // UTILITY CHECKS
      // ========================================================================

      shouldShowEncryptionWarning: (conversationEncrypted: boolean) => {
        const { encryption } = get();

        // Show warning if user prefers encryption but conversation is not encrypted
        if (encryption.encryptionPreference === 'always' && !conversationEncrypted) {
          return true;
        }

        // Show warning based on user preference
        if (encryption.warnOnUnencrypted && !conversationEncrypted) {
          return true;
        }

        return false;
      },

      isInDndPeriod: () => {
        const { notifications } = get();

        if (!notifications.dndEnabled) return false;

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const startTime = notifications.dndStartTime || '22:00';
        const endTime = notifications.dndEndTime || '08:00';

        // Handle overnight DND periods (e.g., 22:00 - 08:00)
        if (startTime > endTime) {
          return currentTime >= startTime || currentTime < endTime;
        }

        return currentTime >= startTime && currentTime < endTime;
      },

      canReceiveNotification: (type) => {
        const { notifications } = get();
        const state = get();

        // Check if in DND period
        if (state.isInDndPeriod()) return false;

        // Check global toggle
        if (!notifications.pushEnabled) return false;

        // Check specific type
        const key = type as keyof StoreNotificationPreferences;
        if (typeof notifications[key] === 'boolean') {
          return notifications[key] as boolean;
        }

        return true;
      },
    }),
    {
      name: 'meeshy-user-preferences',
      version: USER_PREFERENCES_STORE_VERSION,
      migrate: (persistedState, version) =>
        migrateUserPreferences(persistedState as PersistedUserPreferences, version),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        notifications: state.notifications,
        encryption: state.encryption,
        encryptionKeys: state.encryptionKeys,
        privacy: state.privacy,
        language: state.language,
        story: state.story,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);

// ============================================================================
// HOOKS FOR SPECIFIC PREFERENCE CATEGORIES
// ============================================================================

/**
 * Hook for notification preferences only
 */
export const useNotificationPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.notifications,
    update: state.updateNotifications,
    sync: state.syncNotifications,
    canReceive: state.canReceiveNotification,
    isInDnd: state.isInDndPeriod,
  })));
};

/**
 * Hook for encryption preferences only
 */
export const useEncryptionPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.encryption,
    keyStatus: state.encryptionKeys,
    update: state.updateEncryption,
    updateLocalSettings: state.updateEncryptionLocalSettings,
    sync: state.syncEncryption,
    syncKeys: state.syncEncryptionKeys,
    shouldShowWarning: state.shouldShowEncryptionWarning,
  })));
};

/**
 * Hook for privacy preferences only
 */
export const usePrivacyPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.privacy,
    update: state.updatePrivacy,
    sync: state.syncPrivacy,
  })));
};

/**
 * Hook for language preferences only
 */
export const useLanguagePreferencesFromStore = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.language,
    update: state.updateLanguage,
  })));
};

/**
 * Hook for story preferences only
 */
export const useStoryPreferences = () => {
  return useUserPreferencesStore(useShallow(state => ({
    preferences: state.story,
    update: state.updateStory,
  })));
};

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize preferences store when user logs in
 * Call this from the auth flow after successful login
 */
export const initializeUserPreferences = async () => {
  const store = useUserPreferencesStore.getState();
  if (!store.isInitialized) {
    await store.initialize();
  }
};

/**
 * Reset preferences store when user logs out
 * Call this from the auth flow on logout
 */
export const resetUserPreferences = () => {
  useUserPreferencesStore.getState().reset();
};
