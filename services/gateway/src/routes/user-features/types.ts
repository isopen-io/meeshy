/**
 * Types and constants for user features and consents (GDPR)
 *
 * @version 1.0.0
 */

import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export interface FeatureParams {
  feature: string;
}

export interface ConsentParams {
  consentType: string;
}

export interface ConfigurationBody {
  customDestinationLanguage?: string;
  transcriptionSource?: 'auto' | 'mobile' | 'server';
  translatedAudioFormat?: 'mp3' | 'wav' | 'ogg';
  dataRetentionDays?: number;
  voiceDataRetentionDays?: number;
  // Voice Cloning Parameters
  voiceCloningExaggeration?: number;
  voiceCloningCfgWeight?: number;
  voiceCloningTemperature?: number;
  voiceCloningTopP?: number;
  voiceCloningQualityPreset?: 'fast' | 'balanced' | 'high_quality';
}

export interface AgeVerificationBody {
  birthDate: string; // ISO date string
}

// Liste des features activables
export const ACTIVATABLE_FEATURES = [
  // Text Translation
  'textTranslationEnabledAt',
  // Audio Transcription
  'audioTranscriptionEnabledAt',
  'speakerDiarizationEnabledAt',
  // Audio Translation
  'audioTranslationEnabledAt',
  'translatedAudioGenerationEnabledAt',
  // Voice Cloning
  'voiceCloningEnabledAt',
  'allowOthersCloneMyVoiceAt',
  // Attachments
  'imageTextTranslationEnabledAt',
  'documentTranslationEnabledAt',
  'videoSubtitleTranslationEnabledAt',
  // Playback
  'autoplayAudioEnabledAt',
  'autoplayTranslatedAudioEnabledAt',
  'preferTranslatedAudioAt',
  // Data management
  'autoDeleteExpiredDataAt',
] as const;

// Liste des consentements
export const CONSENT_TYPES = [
  'dataProcessingConsentAt',
  'voiceDataConsentAt',
  'voiceProfileConsentAt',
  'voiceCloningConsentAt',
  'thirdPartyServicesConsentAt',
] as const;

// Feature status response schema
export const featureStatusResponseSchema = {
  type: 'object',
  properties: {
    hasDataProcessingConsent: { type: 'boolean' },
    hasVoiceDataConsent: { type: 'boolean' },
    hasVoiceProfileConsent: { type: 'boolean' },
    hasVoiceCloningConsent: { type: 'boolean' },
    hasThirdPartyServicesConsent: { type: 'boolean' },
    isAgeVerified: { type: 'boolean' },
    canTranslateText: { type: 'boolean' },
    canTranscribeAudio: { type: 'boolean' },
    canUseSpeakerDiarization: { type: 'boolean' },
    canTranslateAudio: { type: 'boolean' },
    canGenerateTranslatedAudio: { type: 'boolean' },
    canUseVoiceCloning: { type: 'boolean' },
    canAllowOthersCloneVoice: { type: 'boolean' },
    isVoiceProfileExpired: { type: 'boolean' },
    canTranslateImageText: { type: 'boolean' },
    canTranslateDocuments: { type: 'boolean' },
    canTranslateVideoSubtitles: { type: 'boolean' },
    hasAutoplayAudio: { type: 'boolean' },
    hasAutoplayTranslatedAudio: { type: 'boolean' },
    prefersTranslatedAudio: { type: 'boolean' },
  }
} as const;

// Validation error response schemas
export { errorResponseSchema };
