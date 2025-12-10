/**
 * Language Store - Language preferences with Zustand persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { INTERFACE_LANGUAGES } from '@/types/frontend';

interface UserLanguageConfig {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
}

interface LanguageState {
  currentInterfaceLanguage: string;
  currentMessageLanguage: string;
  availableLanguages: string[];
  userLanguageConfig: UserLanguageConfig;
}

interface LanguageActions {
  setInterfaceLanguage: (language: string) => void;
  setMessageLanguage: (language: string) => void;
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
  translateToSystemLanguage: true,
  translateToRegionalLanguage: false,
  useCustomDestination: false,
};

const initialState: LanguageState = {
  currentInterfaceLanguage: 'fr', // Will be overridden by persisted state or browser detection
  currentMessageLanguage: 'fr', // Will be overridden by persisted state or browser detection
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
              console.warn(`[LANGUAGE_STORE] Unsupported interface language: ${language}`);
            }
            return;
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          set({ currentInterfaceLanguage: language });
        },

        setMessageLanguage: (language: string) => {
          if (!get().isLanguageSupported(language)) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[LANGUAGE_STORE] Unsupported message language: ${language}`);
            }
            return;
          }
          
          if (process.env.NODE_ENV === 'development') {
          }
          set({ currentMessageLanguage: language });
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

        detectAndSetBrowserLanguage: () => {
          const browserLang = detectBrowserLanguage();
          if (process.env.NODE_ENV === 'development') {
          }
          
          set({
            currentInterfaceLanguage: browserLang,
            currentMessageLanguage: browserLang,
          });
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
          currentMessageLanguage: state.currentMessageLanguage,
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
      }
    ),
    { name: 'LanguageStore' }
  )
);

// Selector hooks
export const useCurrentInterfaceLanguage = () => useLanguageStore((state) => state.currentInterfaceLanguage);
export const useCurrentMessageLanguage = () => useLanguageStore((state) => state.currentMessageLanguage);
export const useAvailableLanguages = () => useLanguageStore((state) => state.availableLanguages);
export const useUserLanguageConfig = () => useLanguageStore((state) => state.userLanguageConfig);

// Use useShallow to prevent infinite loops when selecting multiple actions
export const useLanguageActions = () => useLanguageStore(
  useShallow((state) => ({
    setInterfaceLanguage: state.setInterfaceLanguage,
    setMessageLanguage: state.setMessageLanguage,
    setCustomDestinationLanguage: state.setCustomDestinationLanguage,
    updateLanguageConfig: state.updateLanguageConfig,
    detectAndSetBrowserLanguage: state.detectAndSetBrowserLanguage,
    isLanguageSupported: state.isLanguageSupported,
  }))
);