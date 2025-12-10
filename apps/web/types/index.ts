/**
 * Types Frontend Meeshy
 * 
 * Ce fichier ré-exporte les types partagés et ajoute les types spécifiques au frontend
 */

// Import des types partagés
import type {
  SocketIOUser,
  TranslationData
} from '@meeshy/shared/types';

// Import des types de messages consolidés
import type {
  Message,
  MessageWithTranslations,
  UITranslationState,
  UIMessage,
  GatewayMessage
} from '@meeshy/shared/types';

// Ré-export des types partagés essentiels
export * from '@meeshy/shared/types';

// Export des types spécifiques frontend
export type { CreateUserDto, ChatRoom } from './frontend';

// Export des constantes spécifiques frontend
export { INTERFACE_LANGUAGES } from './frontend';

// Export des types i18n
export type {
  SupportedLanguage,
  Language,
  TranslationModule,
  LoadedModules,
  TranslationParams,
  I18nState,
  I18nActions,
  I18nStore,
  TranslationModuleName,
} from './i18n';

// Types spécifiques au frontend uniquement
export interface FrontendConfig {
  apiUrl: string;
  wsUrl: string;
  translationUrl: string;
  environment: 'development' | 'production' | 'test';
}

// Types pour les composants UI spécifiques au frontend (mis à jour)
export interface BubbleMessageProps {
  message: UIMessage;
  currentUser: SocketIOUser;
  userLanguage: string;
  usedLanguages: string[];
  onForceTranslation?: (messageId: string, targetLanguage: string) => Promise<void>;
}

// Types pour les hooks spécifiques au frontend (mis à jour)
export interface UseMessageLoaderOptions {
  currentUser: SocketIOUser;
  conversationId?: string;
}

export interface UseMessageLoaderReturn {
  messages: GatewayMessage[];
  translatedMessages: UIMessage[];
  isLoadingMessages: boolean;
  loadMessages: (conversationId: string, clearExisting?: boolean) => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: GatewayMessage) => void;
  updateMessageTranslations: (messageId: string, translations: TranslationData[]) => void;
}

// Types pour les services frontend
export interface FrontendApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

// Types pour les événements frontend
export interface FrontendEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
}

// Types pour les préférences utilisateur frontend
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    showLastSeen: boolean;
    allowDirectMessages: boolean;
  };
}

// Types pour les notifications frontend
export interface FrontendNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Types pour les routes et navigation
export interface RouteConfig {
  path: string;
  component: React.ComponentType;
  requiresAuth: boolean;
  roles?: string[];
}

// Types pour les formulaires frontend
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'radio';
  required: boolean;
  validation?: {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    custom?: (value: unknown) => string | null;
  };
  options?: Array<{ value: string; label: string }>;
}

// Types pour les modales et dialogs
export interface ModalConfig {
  id: string;
  title: string;
  content: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose?: () => void;
  onConfirm?: () => void;
}

// Types pour les animations et transitions
export interface AnimationConfig {
  duration: number;
  easing: string;
  delay?: number;
  direction?: 'in' | 'out' | 'both';
}

// Types pour les tests frontend
export interface TestConfig {
  mockApi: boolean;
  mockWebSocket: boolean;
  mockTranslation: boolean;
  debugMode: boolean;
}

// Types pour les performances frontend
export interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  memoryUsage: number;
  networkRequests: number;
}

// Types pour l'accessibilité
export interface AccessibilityConfig {
  highContrast: boolean;
  largeText: boolean;
  screenReader: boolean;
  keyboardNavigation: boolean;
}

// Types pour l'internationalisation frontend
export interface I18nConfig {
  locale: string;
  fallbackLocale: string;
  messages: Record<string, Record<string, string>>;
}

// User Language Configuration Interface
export interface UserLanguageConfig {
  systemLanguage: string;              // Default: "fr"
  regionalLanguage: string;            // Default: "fr"
  customDestinationLanguage?: string;  // Optional
  autoTranslateEnabled: boolean;       // Default: true
  translateToSystemLanguage: boolean;  // Default: true
  translateToRegionalLanguage: boolean; // Default: false
  useCustomDestination: boolean;       // Default: false
}

// Types pour les erreurs frontend
export interface FrontendError {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
  timestamp: Date;
}

// Types pour les logs frontend
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

// Types pour les analytics frontend
export interface AnalyticsEvent {
  name: string;
  properties: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
}

// Types pour les caches frontend
export interface CacheConfig {
  maxSize: number;
  ttl: number;
  strategy: 'lru' | 'fifo' | 'lfu';
}

// Types pour les workers frontend
export interface WorkerConfig {
  enabled: boolean;
  maxWorkers: number;
  timeout: number;
}

// Types pour les PWA
export interface PWAConfig {
  name: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
  }>;
}

// Types pour les mises à jour
export interface UpdateInfo {
  version: string;
  changelog: string[];
  mandatory: boolean;
  downloadUrl?: string;
  releaseDate: Date;
}

// Types pour les diagnostics
export interface DiagnosticInfo {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  cookiesEnabled: boolean;
  localStorageEnabled: boolean;
  sessionStorageEnabled: boolean;
  webGLSupported: boolean;
  serviceWorkerSupported: boolean;
  pushNotificationSupported: boolean;
}
