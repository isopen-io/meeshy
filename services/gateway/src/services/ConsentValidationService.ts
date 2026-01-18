/**
 * Consent Validation Service
 * Valide que l'utilisateur a les consentements requis pour activer certaines préférences
 *
 * Hiérarchie des consentements :
 * - dataProcessingConsentAt (BASE OBLIGATOIRE pour tout)
 *   ├─> voiceDataConsentAt (requis pour audio)
 *   │     ├─> audioTranscriptionEnabledAt
 *   │     │     └─> audioTranslationEnabledAt
 *   │     │           └─> translatedAudioGenerationEnabledAt
 *   │     └─> voiceProfileConsentAt
 *   │           └─> voiceCloningConsentAt
 *   │                 └─> voiceCloningEnabledAt
 *   └─> textTranslationEnabledAt
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';

export interface ConsentStatus {
  hasDataProcessingConsent: boolean;
  hasVoiceDataConsent: boolean;
  hasVoiceProfileConsent: boolean;
  hasVoiceCloningConsent: boolean;
  hasThirdPartyServicesConsent: boolean;
  canTranscribeAudio: boolean;
  canTranslateText: boolean;
  canTranslateAudio: boolean;
  canGenerateTranslatedAudio: boolean;
  canUseVoiceCloning: boolean;
}

export interface ConsentViolation {
  field: string;
  message: string;
  requiredConsents: string[];
}

export class ConsentValidationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Récupère le statut de consentement pour un utilisateur
   */
  async getConsentStatus(userId: string): Promise<ConsentStatus> {
    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: {
        dataProcessingConsentAt: true,
        voiceDataConsentAt: true,
        voiceProfileConsentAt: true,
        voiceCloningConsentAt: true,
        thirdPartyServicesConsentAt: true,
        audioTranscriptionEnabledAt: true,
        textTranslationEnabledAt: true,
        audioTranslationEnabledAt: true,
        translatedAudioGenerationEnabledAt: true,
        voiceCloningEnabledAt: true
      }
    });

    if (!userFeature) {
      throw new Error('User feature record not found');
    }

    const hasDataProcessingConsent = !!userFeature.dataProcessingConsentAt;
    const hasVoiceDataConsent = !!userFeature.voiceDataConsentAt && hasDataProcessingConsent;
    const hasVoiceProfileConsent = !!userFeature.voiceProfileConsentAt && hasVoiceDataConsent;
    const hasVoiceCloningConsent = !!userFeature.voiceCloningConsentAt && hasVoiceProfileConsent;

    return {
      hasDataProcessingConsent,
      hasVoiceDataConsent,
      hasVoiceProfileConsent,
      hasVoiceCloningConsent,
      hasThirdPartyServicesConsent: !!userFeature.thirdPartyServicesConsentAt && hasDataProcessingConsent,
      canTranscribeAudio: !!userFeature.audioTranscriptionEnabledAt && hasVoiceDataConsent,
      canTranslateText: !!userFeature.textTranslationEnabledAt && hasDataProcessingConsent,
      canTranslateAudio: !!userFeature.audioTranslationEnabledAt && !!userFeature.audioTranscriptionEnabledAt && !!userFeature.textTranslationEnabledAt,
      canGenerateTranslatedAudio: !!userFeature.translatedAudioGenerationEnabledAt && !!userFeature.audioTranslationEnabledAt,
      canUseVoiceCloning: !!userFeature.voiceCloningEnabledAt && hasVoiceCloningConsent
    };
  }

  /**
   * Valide les préférences audio contre les consentements
   */
  async validateAudioPreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Transcription requiert voiceDataConsent
    if (preferences.transcriptionEnabled === true && !status.canTranscribeAudio) {
      violations.push({
        field: 'transcriptionEnabled',
        message: 'Audio transcription requires voice data consent and feature activation',
        requiredConsents: ['voiceDataConsentAt', 'audioTranscriptionEnabledAt']
      });
    }

    // Traduction audio requiert transcription + traduction texte
    if (preferences.audioTranslationEnabled === true && !status.canTranslateAudio) {
      violations.push({
        field: 'audioTranslationEnabled',
        message: 'Audio translation requires text translation and audio transcription to be enabled',
        requiredConsents: [
          'audioTranscriptionEnabledAt',
          'textTranslationEnabledAt',
          'audioTranslationEnabledAt'
        ]
      });
    }

    // TTS (génération audio traduit) requiert traduction audio
    if (preferences.ttsEnabled === true && !status.canGenerateTranslatedAudio) {
      violations.push({
        field: 'ttsEnabled',
        message: 'TTS requires audio translation and translated audio generation to be enabled',
        requiredConsents: [
          'audioTranslationEnabledAt',
          'translatedAudioGenerationEnabledAt'
        ]
      });
    }

    // Profil vocal requiert voiceProfileConsent
    if (preferences.voiceProfileEnabled === true && !status.hasVoiceProfileConsent) {
      violations.push({
        field: 'voiceProfileEnabled',
        message: 'Voice profile requires voice profile consent',
        requiredConsents: ['voiceProfileConsentAt']
      });
    }

    // Clonage vocal requiert voiceCloningConsent et feature activée
    if (
      (preferences.voiceCloneQuality !== undefined || preferences.voiceProfileEnabled === true) &&
      !status.canUseVoiceCloning &&
      preferences.voiceProfileEnabled === true
    ) {
      violations.push({
        field: 'voiceCloneQuality',
        message: 'Voice cloning requires voice cloning consent and feature activation',
        requiredConsents: ['voiceCloningConsentAt', 'voiceCloningEnabledAt']
      });
    }

    return violations;
  }

  /**
   * Valide les préférences de messages contre les consentements
   */
  async validateMessagePreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Auto-traduction requiert textTranslationEnabled
    if (preferences.autoTranslateIncoming === true && !status.canTranslateText) {
      violations.push({
        field: 'autoTranslateIncoming',
        message: 'Auto-translation requires text translation feature to be enabled',
        requiredConsents: ['textTranslationEnabledAt']
      });
    }

    if (
      Array.isArray(preferences.autoTranslateLanguages) &&
      preferences.autoTranslateLanguages.length > 0 &&
      !status.canTranslateText
    ) {
      violations.push({
        field: 'autoTranslateLanguages',
        message: 'Auto-translate languages require text translation feature to be enabled',
        requiredConsents: ['textTranslationEnabledAt']
      });
    }

    return violations;
  }

  /**
   * Valide les préférences de confidentialité contre les consentements
   */
  async validatePrivacyPreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Analytics requiert dataProcessingConsent
    if (preferences.allowAnalytics === true && !status.hasDataProcessingConsent) {
      violations.push({
        field: 'allowAnalytics',
        message: 'Analytics requires data processing consent',
        requiredConsents: ['dataProcessingConsentAt']
      });
    }

    if (preferences.shareUsageData === true && !status.hasDataProcessingConsent) {
      violations.push({
        field: 'shareUsageData',
        message: 'Sharing usage data requires data processing consent',
        requiredConsents: ['dataProcessingConsentAt']
      });
    }

    return violations;
  }

  /**
   * Valide les préférences vidéo contre les consentements
   */
  async validateVideoPreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Background virtuel pourrait nécessiter du traitement tiers
    if (
      preferences.virtualBackgroundEnabled === true &&
      !status.hasThirdPartyServicesConsent &&
      !status.hasDataProcessingConsent
    ) {
      violations.push({
        field: 'virtualBackgroundEnabled',
        message: 'Virtual background may require third-party services consent',
        requiredConsents: ['dataProcessingConsentAt', 'thirdPartyServicesConsentAt']
      });
    }

    return violations;
  }

  /**
   * Valide les préférences de documents contre les consentements
   */
  async validateDocumentPreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Scan malware pourrait nécessiter services tiers
    if (preferences.scanFilesForMalware === true && !status.hasThirdPartyServicesConsent) {
      violations.push({
        field: 'scanFilesForMalware',
        message: 'Malware scanning requires third-party services consent',
        requiredConsents: ['thirdPartyServicesConsentAt']
      });
    }

    return violations;
  }

  /**
   * Valide les préférences d'application contre les consentements
   */
  async validateApplicationPreferences(
    userId: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    const status = await this.getConsentStatus(userId);
    const violations: ConsentViolation[] = [];

    // Télémétrie requiert dataProcessingConsent
    if (preferences.telemetryEnabled === true && !status.hasDataProcessingConsent) {
      violations.push({
        field: 'telemetryEnabled',
        message: 'Telemetry requires data processing consent',
        requiredConsents: ['dataProcessingConsentAt']
      });
    }

    // Features beta pourraient nécessiter consentement services tiers
    if (preferences.betaFeaturesEnabled === true && !status.hasThirdPartyServicesConsent) {
      violations.push({
        field: 'betaFeaturesEnabled',
        message: 'Beta features may require third-party services consent',
        requiredConsents: ['thirdPartyServicesConsentAt']
      });
    }

    return violations;
  }

  /**
   * Point d'entrée principal : valide n'importe quelle catégorie de préférences
   */
  async validatePreferences(
    userId: string,
    category: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]> {
    switch (category) {
      case 'audio':
        return this.validateAudioPreferences(userId, preferences);
      case 'message':
        return this.validateMessagePreferences(userId, preferences);
      case 'privacy':
        return this.validatePrivacyPreferences(userId, preferences);
      case 'video':
        return this.validateVideoPreferences(userId, preferences);
      case 'document':
        return this.validateDocumentPreferences(userId, preferences);
      case 'application':
        return this.validateApplicationPreferences(userId, preferences);
      case 'notification':
        return []; // Pas de validation de consentement pour les notifications
      default:
        return [];
    }
  }
}
