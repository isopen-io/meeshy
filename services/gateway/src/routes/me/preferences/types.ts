/**
 * Type definitions for /me/preferences routes
 * Defines DTOs, request/response types, and validation schemas
 */

// ============================================================================
// NOTIFICATION PREFERENCES TYPES
// ============================================================================

export interface NotificationPreferencesDTO {
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
  dndStartTime: string | null;
  dndEndTime: string | null;

  // Metadata
  isDefault: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface UpdateNotificationPreferencesDTO {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  soundEnabled?: boolean;
  newMessageEnabled?: boolean;
  missedCallEnabled?: boolean;
  systemEnabled?: boolean;
  conversationEnabled?: boolean;
  replyEnabled?: boolean;
  mentionEnabled?: boolean;
  reactionEnabled?: boolean;
  contactRequestEnabled?: boolean;
  memberJoinedEnabled?: boolean;
  dndEnabled?: boolean;
  dndStartTime?: string | null;
  dndEndTime?: string | null;
}

// ============================================================================
// ENCRYPTION PREFERENCES TYPES
// ============================================================================

export type EncryptionPreference = 'disabled' | 'optional' | 'always';

export interface EncryptionPreferencesDTO {
  encryptionPreference: EncryptionPreference;
  hasSignalKeys: boolean;
  signalRegistrationId: number | null;
  signalPreKeyBundleVersion: number | null;
  lastKeyRotation: Date | null;
}

export interface UpdateEncryptionPreferenceDTO {
  encryptionPreference: EncryptionPreference;
}

// ============================================================================
// THEME PREFERENCES TYPES
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';
export type FontFamily = 'inter' | 'nunito' | 'poppins' | 'open-sans' | 'lato' | 'comic-neue' | 'lexend' | 'roboto' | 'geist-sans';
export type FontSize = 'small' | 'medium' | 'large';

export interface ThemePreferencesDTO {
  theme: Theme;
  fontFamily: FontFamily;
  fontSize: FontSize;
  compactMode: boolean;
}

export interface UpdateThemePreferencesDTO {
  theme?: Theme;
  fontFamily?: FontFamily;
  fontSize?: FontSize;
  compactMode?: boolean;
}

// ============================================================================
// LANGUAGE PREFERENCES TYPES
// ============================================================================

export interface LanguagePreferencesDTO {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslate: boolean;
}

export interface UpdateLanguagePreferencesDTO {
  systemLanguage?: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string;
  autoTranslate?: boolean;
}

// ============================================================================
// PRIVACY PREFERENCES TYPES
// ============================================================================

export interface PrivacyPreferencesDTO {
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

export interface UpdatePrivacyPreferencesDTO {
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  showReadReceipts?: boolean;
  showTypingIndicator?: boolean;
  allowContactRequests?: boolean;
  allowGroupInvites?: boolean;
  saveMediaToGallery?: boolean;
  allowAnalytics?: boolean;
}

// ============================================================================
// COMMON API RESPONSE TYPES
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ResetResponse {
  message: string;
}
