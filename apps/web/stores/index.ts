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
  useCurrentMessageLanguage,
  useAvailableLanguages,
  useUserLanguageConfig,
  useLanguageActions,
} from './language-store';

// Conversation Store
export {
  useConversationStore,
  useConversations,
  useCurrentConversation,
  useConversationMessages,
  useConversationLoading,
  useTypingUsers,
  useConversationActions,
} from './conversation-store';

// Store Initializer
export { StoreInitializer } from './store-initializer';
