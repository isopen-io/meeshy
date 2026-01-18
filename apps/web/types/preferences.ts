/**
 * Types pour les préférences utilisateur
 * Support des catégories de préférences avec validation stricte
 */

// ===== TYPES DES CATÉGORIES DE PRÉFÉRENCES =====

/**
 * Catégories de préférences disponibles
 */
export type PreferenceCategory =
  | 'privacy'
  | 'notifications'
  | 'language'
  | 'accessibility'
  | 'audio'
  | 'video'
  | 'translation';

/**
 * Préférences de confidentialité
 */
export interface PrivacyPreferences {
  profileVisibility: 'public' | 'friends' | 'private';
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
  allowMessageRequests: boolean;
  blockedUsers: string[];
}

/**
 * Préférences de notifications
 */
export interface NotificationPreferences {
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableSmsNotifications: boolean;
  messageNotifications: boolean;
  mentionNotifications: boolean;
  reactionNotifications: boolean;
  groupInviteNotifications: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string; // Format HH:mm
  quietHoursEnd?: string;   // Format HH:mm
  notificationSound: string;
  vibrationEnabled: boolean;
}

/**
 * Préférences de langue
 */
export interface LanguagePreferences {
  interfaceLanguage: string;
  spokenLanguage: string;
  receiveLanguage: string;
  autoDetectLanguage: boolean;
  translationEnabled: boolean;
}

/**
 * Préférences d'accessibilité
 */
export interface AccessibilityPreferences {
  fontSize: 'small' | 'medium' | 'large' | 'x-large';
  highContrast: boolean;
  reduceMotion: boolean;
  screenReaderOptimized: boolean;
  keyboardShortcutsEnabled: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

/**
 * Préférences audio
 */
export interface AudioPreferences {
  enableVoiceMessages: boolean;
  autoPlayVoiceMessages: boolean;
  voiceMessageSpeed: number; // 0.5 to 2.0
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  voiceQuality: 'low' | 'medium' | 'high';
}

/**
 * Préférences vidéo
 */
export interface VideoPreferences {
  enableVideoCall: boolean;
  preferredVideoQuality: '360p' | '720p' | '1080p';
  cameraDeviceId?: string;
  backgroundBlurEnabled: boolean;
  virtualBackgroundUrl?: string;
  autoStartVideo: boolean;
  mirrorVideo: boolean;
}

/**
 * Préférences de traduction
 */
export interface TranslationPreferences {
  autoTranslate: boolean;
  transcriptionEnabled: boolean;
  voiceDataConsentAt?: Date;
  audioTranscriptionEnabledAt?: Date;
  preferredTranslationEngine: 'google' | 'deepl' | 'azure';
  showOriginalText: boolean;
  translateInRealtime: boolean;
}

/**
 * Map de tous les types de préférences par catégorie
 */
export interface PreferenceTypeMap {
  privacy: PrivacyPreferences;
  notifications: NotificationPreferences;
  language: LanguagePreferences;
  accessibility: AccessibilityPreferences;
  audio: AudioPreferences;
  video: VideoPreferences;
  translation: TranslationPreferences;
}

// ===== ERREURS ET VIOLATIONS =====

/**
 * Violation de consentement
 */
export interface ConsentViolation {
  field: string;
  message: string;
  requiredConsents: string[];
}

/**
 * Erreur de consentement requis
 */
export interface ConsentRequiredError {
  success: false;
  error: 'CONSENT_REQUIRED';
  violations: ConsentViolation[];
}

/**
 * Réponse d'erreur API
 */
export interface PreferenceErrorResponse {
  success: false;
  error: string;
  message?: string;
  violations?: ConsentViolation[];
}

/**
 * Réponse réussie de l'API
 */
export interface PreferenceSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Réponse de l'API (union)
 */
export type PreferenceResponse<T> =
  | PreferenceSuccessResponse<T>
  | PreferenceErrorResponse;

// ===== HOOKS OPTIONS =====

/**
 * Options pour le hook usePreferences
 */
export interface UsePreferencesOptions {
  /**
   * Désactiver la récupération automatique au montage
   */
  enabled?: boolean;

  /**
   * Callback en cas d'erreur
   */
  onError?: (error: Error | ConsentRequiredError) => void;

  /**
   * Callback en cas de succès de mise à jour
   */
  onSuccess?: (data: any) => void;

  /**
   * Callback lors d'une violation de consentement
   */
  onConsentRequired?: (violations: ConsentViolation[]) => void;

  /**
   * Intervalle de revalidation en ms (0 = désactivé)
   */
  revalidateInterval?: number;
}

/**
 * Résultat du hook usePreferences
 */
export interface UsePreferencesResult<T> {
  /**
   * Données des préférences
   */
  data: T | undefined;

  /**
   * État de chargement initial
   */
  isLoading: boolean;

  /**
   * État d'erreur
   */
  error: Error | null;

  /**
   * État de mutation en cours
   */
  isUpdating: boolean;

  /**
   * Mettre à jour partiellement les préférences
   */
  updatePreferences: (updates: Partial<T>) => Promise<T>;

  /**
   * Remplacer complètement les préférences
   */
  replacePreferences: (data: T) => Promise<T>;

  /**
   * Revalider les données
   */
  refetch: () => Promise<void>;

  /**
   * Violations de consentement si erreur 403
   */
  consentViolations: ConsentViolation[] | null;
}

// ===== UTILITAIRES DE TYPE =====

/**
 * Type helper pour extraire le type de préférence d'une catégorie
 */
export type PreferenceDataType<C extends PreferenceCategory> = PreferenceTypeMap[C];

/**
 * Garde de type pour vérifier si une erreur est une ConsentRequiredError
 */
export function isConsentRequiredError(error: unknown): error is ConsentRequiredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    (error as any).error === 'CONSENT_REQUIRED' &&
    'violations' in error
  );
}

/**
 * Garde de type pour vérifier si c'est une PreferenceErrorResponse
 */
export function isPreferenceErrorResponse(
  response: unknown
): response is PreferenceErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as any).success === false
  );
}
