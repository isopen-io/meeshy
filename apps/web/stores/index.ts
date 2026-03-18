/**
 * Pure Zustand stores - Efficient state management for Meeshy application
 */

// Auth Store
export {
  useAuthStore,
  useUser,
  useIsAuthenticated,
  useIsAuthChecking,
  useAuthActions,
} from './auth-store';

// App Store
export {
  useAppStore,
  useTheme,
  useIsOnline,
  useNotifications,
  useIsInitialized,
  useAppActions,
} from './app-store';

// Language Store
export {
  useLanguageStore,
  useCurrentInterfaceLanguage,
  useAvailableLanguages,
  useUserLanguageConfig,
  useLanguageActions,
} from './language-store';

// Conversation UI Store
export {
  useConversationUIStore,
  useCurrentConversationId,
  useTypingUsersForConversation,
  useDraftMessage,
  useReplyingTo,
  useReadStatusSummary,
} from './conversation-ui-store';

// User Preferences Store (Unified)
export {
  useUserPreferencesStore,
  useNotificationPreferences,
  useEncryptionPreferences,
  usePrivacyPreferences,
  useLanguagePreferencesFromStore,
  initializeUserPreferences,
  resetUserPreferences,
  type NotificationPreferences,
  type EncryptionPreferences,
  type PrivacyPreferences,
  type LanguagePreferences,
  type EncryptionPreference,
} from './user-preferences-store';

// Store Initializer
export { StoreInitializer } from './store-initializer';
