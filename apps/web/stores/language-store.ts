/**
 * Language Store - Language preferences with Zustand persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { INTERFACE_LANGUAGES } from '@/types/frontend';
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
} from '@/lib/i18n/locale-config';
import { logger } from '@/utils/logger';

/**
 * Mirrors the chosen interface language into a cookie so the SERVER can read it
 * when rendering metadata and the `<html lang>` attribute. Without this bridge
 * the language only lives in localStorage (client-only), and SSR cannot make
 * `<html lang>` / `og:locale` / titles coherent with what the user sees.
 */
const persistLocaleCookie = (language: string): void => {
  if (typeof document === 'undefined') return;
  if (!isSupportedLocale(language)) return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${language}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
};

interface UserLanguageConfig {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
}

interface LanguageState {
  currentInterfaceLanguage: string;
  availableLanguages: string[];
  userLanguageConfig: UserLanguageConfig;
}

interface LanguageActions {
  setInterfaceLanguage: (language: string) => void;
  setCustomDestinationLanguage: (language: string) => void;
  updateLanguageConfig: (config: Partial<UserLanguageConfig>) => void;
  detectAndSetBrowserLanguage: () => void;
  isLanguageSupported: (language: string) => boolean;
}

type LanguageStore = LanguageState & LanguageActions;

// Detect browser language
const detectBrowserLanguage = (): string => {
  if (typeof window === 'undefined') return 'en';

  const browserLang = navigator.language.split('-')[0];
  const supportedLanguages = INTERFACE_LANGUAGES.map(lang => lang.code);

  return supportedLanguages.includes(browserLang) ? browserLang : 'en';
};

const DEFAULT_LANGUAGE_CONFIG: UserLanguageConfig = {
  systemLanguage: 'fr',
  regionalLanguage: 'fr',
  customDestinationLanguage: undefined,
  autoTranslateEnabled: true,
};

const initialState: LanguageState = {
  currentInterfaceLanguage: 'en', // Will be overridden by persisted state or browser detection (matches detectBrowserLanguage fallback + SSR default)
  availableLanguages: INTERFACE_LANGUAGES.map(lang => lang.code), // Langues d'interface avec traductions complètes
  userLanguageConfig: DEFAULT_LANGUAGE_CONFIG,
};

export const useLanguageStore = create<LanguageStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setInterfaceLanguage: (language: string) => {
          if (!get().isLanguageSupported(language)) {
            if (process.env.NODE_ENV === 'development') {
              logger.warn('[LANGUAGE_STORE]', 'Unsupported interface language', { data: language });
            }
            return;
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          set({ currentInterfaceLanguage: language });
          persistLocaleCookie(language);
        },

        setCustomDestinationLanguage: (language: string) => {
          if (process.env.NODE_ENV === 'development') {
          }
          set((state) => ({
            userLanguageConfig: {
              ...state.userLanguageConfig,
              customDestinationLanguage: language,
            },
          }));
        },

        updateLanguageConfig: (config: Partial<UserLanguageConfig>) => {
          if (process.env.NODE_ENV === 'development') {
          }
          set((state) => ({
            userLanguageConfig: {
              ...state.userLanguageConfig,
              ...config,
            },
          }));
        },

        // PRISME LINGUISTIQUE: Browser locale is for UI rendering only.
        // Content language resolution uses systemLanguage/regionalLanguage via resolveUserLanguage().
        // This function MUST NEVER modify userLanguageConfig.
        detectAndSetBrowserLanguage: () => {
          const browserLang = detectBrowserLanguage();
          set({
            currentInterfaceLanguage: browserLang,
          });
          persistLocaleCookie(browserLang);
        },

        isLanguageSupported: (language: string): boolean => {
          return get().availableLanguages.includes(language);
        },
      }),
      {
        name: 'meeshy-language',
        version: 1, // Increment this to force re-initialization if needed
        partialize: (state) => ({
          currentInterfaceLanguage: state.currentInterfaceLanguage,
          userLanguageConfig: state.userLanguageConfig,
        }),
        migrate: (persistedState: any, version: number) => {
          // Si l'état persisté est invalide ou incomplet, retourner l'état initial
          if (!persistedState || typeof persistedState !== 'object') {
            return initialState;
          }

          // Si la version est différente, fusionner avec l'état par défaut
          if (version !== 1) {
            return {
              ...initialState,
              ...persistedState,
              userLanguageConfig: {
                ...DEFAULT_LANGUAGE_CONFIG,
                ...(persistedState.userLanguageConfig || {}),
              },
            };
          }

          // Version compatible, retourner tel quel
          return persistedState;
        },
        // Au retour d'hydratation, refléter la langue persistée dans le cookie
        // pour que le SSR de la prochaine navigation soit cohérent (lang, og:locale, meta).
        onRehydrateStorage: () => (state) => {
          if (state?.currentInterfaceLanguage) {
            persistLocaleCookie(state.currentInterfaceLanguage);
          }
        },
      }
    ),
    { name: 'LanguageStore' }
  )
);

// Accès hors React (services, helpers module-level) — composants : préférer les selector hooks
export const getCurrentInterfaceLocale = (): string =>
  useLanguageStore.getState().currentInterfaceLanguage;

// Selector hooks
export const useCurrentInterfaceLanguage = () => useLanguageStore((state) => state.currentInterfaceLanguage);
export const useAvailableLanguages = () => useLanguageStore((state) => state.availableLanguages);
export const useUserLanguageConfig = () => useLanguageStore((state) => state.userLanguageConfig);

// Use useShallow to prevent infinite loops when selecting multiple actions
export const useLanguageActions = () => useLanguageStore(
  useShallow((state) => ({
    setInterfaceLanguage: state.setInterfaceLanguage,
    setCustomDestinationLanguage: state.setCustomDestinationLanguage,
    updateLanguageConfig: state.updateLanguageConfig,
    detectAndSetBrowserLanguage: state.detectAndSetBrowserLanguage,
    isLanguageSupported: state.isLanguageSupported,
  }))
);