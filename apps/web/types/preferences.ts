import type {
  PrivacyPreference,
  NotificationPreference,
  AudioPreference,
  VideoPreference,
  MessagePreference,
  DocumentPreference,
  ApplicationPreference,
} from '@meeshy/shared/types/preferences';

export type {
  PrivacyPreference,
  NotificationPreference,
  AudioPreference,
  VideoPreference,
  MessagePreference,
  DocumentPreference,
  ApplicationPreference,
} from '@meeshy/shared/types/preferences';

export type PreferenceCategory =
  | 'privacy'
  | 'notifications'
  | 'audio'
  | 'video'
  | 'message'
  | 'document'
  | 'application'
  | 'accessibility'
  | 'translation';

export type TranslationPreferences = Record<string, unknown>;
export type AccessibilityPreferences = Record<string, unknown>;

export interface PreferenceTypeMap {
  privacy: PrivacyPreference;
  notifications: NotificationPreference;
  audio: AudioPreference;
  video: VideoPreference;
  message: MessagePreference;
  document: DocumentPreference;
  application: ApplicationPreference;
  accessibility: AccessibilityPreferences;
  translation: TranslationPreferences;
}

export interface ConsentViolation {
  field: string;
  message: string;
  requiredConsents: string[];
}

export interface ConsentRequiredError {
  success: false;
  error: 'CONSENT_REQUIRED';
  violations: ConsentViolation[];
}

export interface PreferenceErrorResponse {
  success: false;
  error: string;
  message?: string;
  violations?: ConsentViolation[];
}

export interface PreferenceSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export type PreferenceResponse<T> =
  | PreferenceSuccessResponse<T>
  | PreferenceErrorResponse;

export interface UsePreferencesOptions {
  enabled?: boolean;
  onError?: (error: Error | ConsentRequiredError) => void;
  onSuccess?: (data: unknown) => void;
  onConsentRequired?: (violations: ConsentViolation[]) => void;
  revalidateInterval?: number;
}

export interface UsePreferencesResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  isUpdating: boolean;
  updatePreferences: (updates: Partial<T>) => Promise<T>;
  replacePreferences: (data: T) => Promise<T>;
  refetch: () => Promise<void>;
  consentViolations: ConsentViolation[] | null;
}

export type PreferenceDataType<C extends PreferenceCategory> = PreferenceTypeMap[C];

export function isConsentRequiredError(error: unknown): error is ConsentRequiredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    (error as Record<string, unknown>).error === 'CONSENT_REQUIRED' &&
    'violations' in error
  );
}

export function isPreferenceErrorResponse(
  response: unknown
): response is PreferenceErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as Record<string, unknown>).success === false
  );
}
