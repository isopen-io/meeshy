/**
 * I18n Types - Type definitions for internationalization system
 */

export type SupportedLanguage = 'fr' | 'en' | 'pt' | 'es' | 'zh';

export interface Language {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
}

export interface TranslationModule {
  [key: string]: string | TranslationModule | string[];
}

export interface LoadedModules {
  [language: string]: {
    [module: string]: TranslationModule;
  };
}

export interface TranslationParams {
  [key: string]: string | number;
}

export interface I18nState {
  currentLanguage: SupportedLanguage;
  availableLanguages: Language[];
  loadedModules: LoadedModules;
  isLoading: boolean;
  loadingModules: Set<string>;
  error: string | null;
}

export interface I18nActions {
  setLanguage: (language: SupportedLanguage) => void;
  loadModule: (module: string) => Promise<void>;
  translate: (key: string, params?: TranslationParams) => string;
  detectBrowserLanguage: () => void;
  isModuleLoaded: (module: string) => boolean;
  clearError: () => void;
}

export type I18nStore = I18nState & I18nActions;

// Available translation modules
export type TranslationModuleName =
  | 'common'
  | 'auth'
  | 'landing'
  | 'dashboard'
  | 'conversations'
  | 'settings'
  | 'pages'
  | 'components'
  | 'modals'
  | 'features'
  | 'legal'
  | 'header';

