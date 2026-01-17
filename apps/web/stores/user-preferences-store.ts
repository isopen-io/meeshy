/**
 * Unified User Preferences Store
 *
 * Centralized state management for all user-level preferences:
 * - Notification preferences
 * - Encryption preferences
 * - Privacy settings
 * - Language preferences (merged from language-store)
 *
 * This store provides a single source of truth for checking user preferences
 * across the entire application before displaying content or performing operations.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';
import type { EncryptionPreference } from '@meeshy/shared/types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Re-export from shared for backwards compatibility
export type { EncryptionPreference } from '@meeshy/shared/types';

export interface NotificationPreferences {
  // Global toggles
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;

  // Per-type preferences
  newMessageEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  replyEnabled: boolean;
  mentionEnabled: boolean;
  reactionEnabled: boolean;
  contactRequestEnabled: boolean;
  memberJoinedEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStartTime?: string;
  dndEndTime?: string;
}

export interface EncryptionPreferences {
  // Server-side preferences (synced with backend)
  encryptionPreference: EncryptionPreference;
  hasSignalKeys: boolean;
  signalRegistrationId: number | null;
  signalPreKeyBundleVersion: number | null;
  lastKeyRotation: string | null;

  // Local-only settings (not synced)
  localSettings: {
    autoEncryptNewConversations: boolean;
    showEncryptionStatus: boolean;
    warnOnUnencrypted: boolean;
  };
}

export interface PrivacyPreferences {
  // Profile visibility
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;

  // Contact settings
  allowContactRequests: boolean;
  allowGroupInvites: boolean;

  // Data settings
  saveMediaToGallery: boolean;
  allowAnalytics: boolean;
}

export interface LanguagePreferences {
  preferredLanguage: string;
  translationEnabled: boolean;
  autoTranslate: boolean;
  translationTargetLanguage: string;
}

export interface UserPreferencesState {
  // All preference categories
  notifications: NotificationPreferences;
  encryption: EncryptionPreferences;
  privacy: PrivacyPreferences;
  language: LanguagePreferences;

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
  syncPrivacy: () => Promise<void>;

  // Update preferences
  updateNotifications: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  updateEncryption: (prefs: Partial<EncryptionPreferences>) => Promise<void>;
  updateEncryptionLocalSettings: (settings: Partial<EncryptionPreferences['localSettings']>) => void;
  updatePrivacy: (prefs: Partial<PrivacyPreferences>) => Promise<void>;
  updateLanguage: (prefs: Partial<LanguagePreferences>) => void;

  // Utility checks
  shouldShowEncryptionWarning: (conversationEncrypted: boolean) => boolean;
  isInDndPeriod: () => boolean;
  canReceiveNotification: (type: keyof NotificationPreferences) => boolean;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
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
  hasSignalKeys: false,
  signalRegistrationId: null,
  signalPreKeyBundleVersion: null,
  lastKeyRotation: null,
  localSettings: {
    autoEncryptNewConversations: false,
    showEncryptionStatus: true,
    warnOnUnencrypted: false,
  },
};

const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
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

const DEFAULT_STATE: UserPreferencesState = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  encryption: DEFAULT_ENCRYPTION_PREFERENCES,
  privacy: DEFAULT_PRIVACY_PREFERENCES,
  language: DEFAULT_LANGUAGE_PREFERENCES,
  isLoading: false,
  isInitialized: false,
  lastSyncedAt: null,
  error: null,
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
          get().syncPrivacy(),
        ]);
      },

      syncNotifications: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          const response = await fetch(buildApiUrl('/user-preferences/notifications'), {
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
          const response = await fetch(buildApiUrl('/users/me/encryption-preferences'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              set(state => ({
                encryption: {
                  ...state.encryption,
                  encryptionPreference: data.data.encryptionPreference || 'optional',
                  hasSignalKeys: data.data.hasSignalKeys || false,
                  signalRegistrationId: data.data.signalRegistrationId,
                  signalPreKeyBundleVersion: data.data.signalPreKeyBundleVersion,
                  lastKeyRotation: data.data.lastKeyRotation,
                }
              }));
            }
          }
        } catch (error) {
          console.error('[UserPreferencesStore] Error syncing encryption:', error);
        }
      },

      syncPrivacy: async () => {
        const token = authManager.getAuthToken();
        if (!token) return;

        try {
          const response = await fetch(buildApiUrl('/user-preferences/privacy'), {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              const { id, userId, createdAt, updatedAt, ...prefs } = data.data;
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
          const response = await fetch(buildApiUrl('/user-preferences/notifications'), {
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

        // Only sync server-side preferences
        if (prefs.encryptionPreference) {
          try {
            const response = await fetch(buildApiUrl('/users/me/encryption-preferences'), {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ encryptionPreference: prefs.encryptionPreference }),
            });

            if (response.ok) {
              set(state => ({
                encryption: { ...state.encryption, ...prefs }
              }));
            } else {
              throw new Error('Failed to update encryption preferences');
            }
          } catch (error) {
            console.error('[UserPreferencesStore] Error updating encryption:', error);
            throw error;
          }
        }
      },

      updateEncryptionLocalSettings: (settings) => {
        set(state => ({
          encryption: {
            ...state.encryption,
            localSettings: { ...state.encryption.localSettings, ...settings }
          }
        }));
      },

      updatePrivacy: async (prefs) => {
        const token = authManager.getAuthToken();
        if (!token) return;

        // Optimistic update
        set(state => ({
          privacy: { ...state.privacy, ...prefs }
        }));

        try {
          const response = await fetch(buildApiUrl('/user-preferences/privacy'), {
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
      },

      updateLanguage: (prefs) => {
        set(state => ({
          language: { ...state.language, ...prefs }
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

        // Show warning based on local setting
        if (encryption.localSettings.warnOnUnencrypted && !conversationEncrypted) {
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
        const key = type as keyof NotificationPreferences;
        if (typeof notifications[key] === 'boolean') {
          return notifications[key] as boolean;
        }

        return true;
      },
    }),
    {
      name: 'meeshy-user-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        notifications: state.notifications,
        encryption: state.encryption,
        privacy: state.privacy,
        language: state.language,
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
    update: state.updateEncryption,
    updateLocalSettings: state.updateEncryptionLocalSettings,
    sync: state.syncEncryption,
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
