/**
 * Compatibility hooks for existing components
 * These provide the same interface as the old Context API hooks but use Zustand stores
 */

import {
  useUser as useUserStore,
  useAuthActions,
  useCurrentInterfaceLanguage,
  useUserLanguageConfig,
  useLanguageActions,
} from '@/stores';
import { INTERFACE_LANGUAGES } from '@/types/frontend';

// Legacy useUser hook compatibility
export function useUser() {
  const user = useUserStore();
  const { setUser, logout } = useAuthActions();
  
  return {
    user,
    setUser,
    logout,
    isAuthChecking: false, // This is handled by the store now
  };
}

// Legacy useLanguage hook compatibility
export function useLanguage() {
  const currentInterfaceLanguage = useCurrentInterfaceLanguage();
  const userLanguageConfig = useUserLanguageConfig();
  const { setInterfaceLanguage, setCustomDestinationLanguage, isLanguageSupported } = useLanguageActions();
  
  return {
    userLanguageConfig,
    currentInterfaceLanguage,
    setCustomDestinationLanguage,
    setInterfaceLanguage,
    isLanguageSupported,
    // Interface languages with complete translation bundles. Sourced from the
    // canonical INTERFACE_LANGUAGES (same source the language store uses), so
    // this stays in sync as locale bundles are added (en, es, fr, pt today).
    getSupportedLanguages: () =>
      INTERFACE_LANGUAGES.map(({ code, name }) => ({
        code,
        name,
        nativeName: name,
      })),
  };
}
