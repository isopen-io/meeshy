/**
 * Service de validation des fonctionnalités utilisateur
 *
 * Ce service vérifie les consentements GDPR et les dépendances entre features
 * avant d'autoriser certaines opérations (traduction, transcription, clonage vocal, etc.)
 *
 * Les features sont stockées dans la table UserFeature (1:1 avec User)
 * Pattern: DateTime? != null signifie activé/consenti
 *
 * @version 2.0.0 - Migré vers table UserFeature
 */

import { PrismaClient, UserFeature } from '@meeshy/shared/prisma/client';

// Types pour les résultats de validation
export interface FeatureValidationResult {
  allowed: boolean;
  reason?: string;
  missingConsents?: string[];
  missingFeatures?: string[];
}

export interface UserFeatureStatus {
  // Consents
  hasDataProcessingConsent: boolean;
  hasVoiceDataConsent: boolean;
  hasVoiceProfileConsent: boolean;
  hasVoiceCloningConsent: boolean;
  hasThirdPartyServicesConsent: boolean;
  isAgeVerified: boolean;

  // Security
  hasTwoFactorEnabled: boolean;
  encryptionPreference: string;

  // Text Translation
  canTranslateText: boolean;

  // Audio Transcription
  canTranscribeAudio: boolean;
  canUseSpeakerDiarization: boolean;

  // Audio Translation
  canTranslateAudio: boolean;
  canGenerateTranslatedAudio: boolean;

  // Voice Cloning
  canUseVoiceCloning: boolean;
  canAllowOthersCloneVoice: boolean;
  isVoiceProfileExpired: boolean;

  // Attachments
  canTranslateImageText: boolean;
  canTranslateDocuments: boolean;
  canTranslateVideoSubtitles: boolean;

  // Playback
  hasAutoplayAudio: boolean;
  hasAutoplayTranslatedAudio: boolean;
  prefersTranslatedAudio: boolean;
}

// Helper pour vérifier si un DateTime? est activé
const isEnabled = (field: Date | null | undefined): boolean => field != null;

export class UserFeaturesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Récupère ou crée les UserFeature d'un utilisateur
   */
  private async getOrCreateUserFeature(userId: string): Promise<UserFeature | null> {
    // Essayer de récupérer
    let userFeature = await this.prisma.userFeature.findUnique({
      where: { userId }
    });

    // Créer si n'existe pas
    if (!userFeature) {
      try {
        userFeature = await this.prisma.userFeature.create({
          data: { userId }
        });
      } catch (error) {
        // Peut échouer si l'user n'existe pas
        console.error('[UserFeatures] Error creating UserFeature:', error);
        return null;
      }
    }

    return userFeature;
  }

  /**
   * Récupère le statut complet des features d'un utilisateur
   */
  async getFeatureStatus(userId: string): Promise<UserFeatureStatus | null> {
    const userFeature = await this.getOrCreateUserFeature(userId);

    if (!userFeature) return null;

    const now = new Date();

    // Consents de base
    const hasDataProcessingConsent = isEnabled(userFeature.dataProcessingConsentAt);
    const hasVoiceDataConsent = isEnabled(userFeature.voiceDataConsentAt);
    const hasVoiceProfileConsent = isEnabled(userFeature.voiceProfileConsentAt);
    const hasVoiceCloningConsent = isEnabled(userFeature.voiceCloningConsentAt);
    const hasThirdPartyServicesConsent = isEnabled(userFeature.thirdPartyServicesConsentAt);
    const isAgeVerified = isEnabled(userFeature.ageVerifiedAt);

    // Voice profile expiration
    const isVoiceProfileExpired = userFeature.voiceProfileExpiresAt
      ? userFeature.voiceProfileExpiresAt < now
      : false;

    return {
      // Consents
      hasDataProcessingConsent,
      hasVoiceDataConsent,
      hasVoiceProfileConsent,
      hasVoiceCloningConsent,
      hasThirdPartyServicesConsent,
      isAgeVerified,

      // Security
      hasTwoFactorEnabled: isEnabled(userFeature.twoFactorEnabledAt),
      encryptionPreference: userFeature.encryptionPreference,

      // Text Translation: requiert dataProcessingConsent
      canTranslateText: hasDataProcessingConsent && isEnabled(userFeature.textTranslationEnabledAt),

      // Audio Transcription: requiert voiceDataConsent
      canTranscribeAudio: hasVoiceDataConsent && isEnabled(userFeature.audioTranscriptionEnabledAt),
      canUseSpeakerDiarization: hasVoiceDataConsent
        && isEnabled(userFeature.audioTranscriptionEnabledAt)
        && isEnabled(userFeature.speakerDiarizationEnabledAt),

      // Audio Translation: requiert transcription + textTranslation
      canTranslateAudio: hasVoiceDataConsent
        && isEnabled(userFeature.audioTranscriptionEnabledAt)
        && hasDataProcessingConsent
        && isEnabled(userFeature.textTranslationEnabledAt)
        && isEnabled(userFeature.audioTranslationEnabledAt),

      canGenerateTranslatedAudio: hasVoiceDataConsent
        && isEnabled(userFeature.audioTranscriptionEnabledAt)
        && hasDataProcessingConsent
        && isEnabled(userFeature.textTranslationEnabledAt)
        && isEnabled(userFeature.audioTranslationEnabledAt)
        && isEnabled(userFeature.translatedAudioGenerationEnabledAt),

      // Voice Cloning: requiert consentement spécifique + profil non expiré
      canUseVoiceCloning: hasVoiceCloningConsent
        && isEnabled(userFeature.voiceCloningEnabledAt)
        && !isVoiceProfileExpired,

      canAllowOthersCloneVoice: hasVoiceCloningConsent
        && isEnabled(userFeature.voiceCloningEnabledAt)
        && isEnabled(userFeature.allowOthersCloneMyVoiceAt)
        && !isVoiceProfileExpired,

      isVoiceProfileExpired,

      // Attachments
      canTranslateImageText: hasDataProcessingConsent
        && isEnabled(userFeature.textTranslationEnabledAt)
        && isEnabled(userFeature.imageTextTranslationEnabledAt),

      canTranslateDocuments: hasDataProcessingConsent
        && isEnabled(userFeature.textTranslationEnabledAt)
        && isEnabled(userFeature.documentTranslationEnabledAt),

      canTranslateVideoSubtitles: hasVoiceDataConsent
        && isEnabled(userFeature.audioTranscriptionEnabledAt)
        && hasDataProcessingConsent
        && isEnabled(userFeature.textTranslationEnabledAt)
        && isEnabled(userFeature.videoSubtitleTranslationEnabledAt),

      // Playback
      hasAutoplayAudio: isEnabled(userFeature.autoplayAudioEnabledAt),
      hasAutoplayTranslatedAudio: isEnabled(userFeature.translatedAudioGenerationEnabledAt)
        && isEnabled(userFeature.autoplayTranslatedAudioEnabledAt),
      prefersTranslatedAudio: isEnabled(userFeature.translatedAudioGenerationEnabledAt)
        && isEnabled(userFeature.preferTranslatedAudioAt),
    };
  }

  // ============================================
  // MÉTHODES DE VALIDATION SPÉCIFIQUES
  // ============================================

  /**
   * Vérifie si l'utilisateur peut utiliser la traduction de texte
   */
  async canTranslateText(userId: string): Promise<FeatureValidationResult> {
    const userFeature = await this.getOrCreateUserFeature(userId);

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    const missingConsents: string[] = [];
    const missingFeatures: string[] = [];

    if (!isEnabled(userFeature.dataProcessingConsentAt)) {
      missingConsents.push('dataProcessingConsent');
    }

    if (!isEnabled(userFeature.textTranslationEnabledAt)) {
      missingFeatures.push('textTranslationEnabled');
    }

    if (missingConsents.length > 0 || missingFeatures.length > 0) {
      return {
        allowed: false,
        reason: 'Consentements ou features manquants',
        missingConsents,
        missingFeatures,
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifie si l'utilisateur peut utiliser la transcription audio
   */
  async canTranscribeAudio(userId: string): Promise<FeatureValidationResult> {
    const userFeature = await this.getOrCreateUserFeature(userId);

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    const missingConsents: string[] = [];
    const missingFeatures: string[] = [];

    if (!isEnabled(userFeature.voiceDataConsentAt)) {
      missingConsents.push('voiceDataConsent');
    }

    if (!isEnabled(userFeature.audioTranscriptionEnabledAt)) {
      missingFeatures.push('audioTranscriptionEnabled');
    }

    if (missingConsents.length > 0 || missingFeatures.length > 0) {
      return {
        allowed: false,
        reason: 'Consentements ou features manquants',
        missingConsents,
        missingFeatures,
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifie si l'utilisateur peut utiliser la traduction audio (audio → texte traduit)
   */
  async canTranslateAudio(userId: string): Promise<FeatureValidationResult> {
    const userFeature = await this.getOrCreateUserFeature(userId);

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    const missingConsents: string[] = [];
    const missingFeatures: string[] = [];

    // Vérifier les consentements
    if (!isEnabled(userFeature.dataProcessingConsentAt)) {
      missingConsents.push('dataProcessingConsent');
    }
    if (!isEnabled(userFeature.voiceDataConsentAt)) {
      missingConsents.push('voiceDataConsent');
    }

    // Vérifier les features (dans l'ordre de dépendance)
    if (!isEnabled(userFeature.textTranslationEnabledAt)) {
      missingFeatures.push('textTranslationEnabled');
    }
    if (!isEnabled(userFeature.audioTranscriptionEnabledAt)) {
      missingFeatures.push('audioTranscriptionEnabled');
    }
    if (!isEnabled(userFeature.audioTranslationEnabledAt)) {
      missingFeatures.push('audioTranslationEnabled');
    }

    if (missingConsents.length > 0 || missingFeatures.length > 0) {
      return {
        allowed: false,
        reason: 'Consentements ou features manquants pour la traduction audio',
        missingConsents,
        missingFeatures,
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifie si l'utilisateur peut générer des audios traduits (TTS)
   */
  async canGenerateTranslatedAudio(userId: string): Promise<FeatureValidationResult> {
    // D'abord vérifier qu'il peut traduire l'audio
    const audioTranslationResult = await this.canTranslateAudio(userId);
    if (!audioTranslationResult.allowed) {
      return audioTranslationResult;
    }

    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { translatedAudioGenerationEnabledAt: true }
    });

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    if (!isEnabled(userFeature.translatedAudioGenerationEnabledAt)) {
      return {
        allowed: false,
        reason: 'Génération d\'audio traduit non activée',
        missingFeatures: ['translatedAudioGenerationEnabled'],
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifie si l'utilisateur peut utiliser le clonage vocal
   */
  async canUseVoiceCloning(userId: string): Promise<FeatureValidationResult> {
    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: {
        voiceProfileConsentAt: true,
        voiceCloningConsentAt: true,
        voiceCloningEnabledAt: true,
        voiceProfileExpiresAt: true,
      }
    });

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    const missingConsents: string[] = [];
    const missingFeatures: string[] = [];

    if (!isEnabled(userFeature.voiceProfileConsentAt)) {
      missingConsents.push('voiceProfileConsent');
    }
    if (!isEnabled(userFeature.voiceCloningConsentAt)) {
      missingConsents.push('voiceCloningConsent');
    }

    if (!isEnabled(userFeature.voiceCloningEnabledAt)) {
      missingFeatures.push('voiceCloningEnabled');
    }

    // Vérifier expiration du profil vocal
    if (userFeature.voiceProfileExpiresAt && userFeature.voiceProfileExpiresAt < new Date()) {
      return {
        allowed: false,
        reason: 'Profil vocal expiré - recalibration nécessaire',
        missingFeatures: ['voiceProfileNotExpired'],
      };
    }

    if (missingConsents.length > 0 || missingFeatures.length > 0) {
      return {
        allowed: false,
        reason: 'Consentements ou features manquants pour le clonage vocal',
        missingConsents,
        missingFeatures,
      };
    }

    return { allowed: true };
  }

  /**
   * Vérifie si les autres utilisateurs peuvent entendre la voix clonée de cet utilisateur
   */
  async canOthersHearClonedVoice(userId: string): Promise<FeatureValidationResult> {
    const voiceCloningResult = await this.canUseVoiceCloning(userId);
    if (!voiceCloningResult.allowed) {
      return voiceCloningResult;
    }

    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { allowOthersCloneMyVoiceAt: true }
    });

    if (!userFeature) {
      return { allowed: false, reason: 'Utilisateur non trouvé' };
    }

    if (!isEnabled(userFeature.allowOthersCloneMyVoiceAt)) {
      return {
        allowed: false,
        reason: 'L\'utilisateur n\'autorise pas les autres à entendre sa voix clonée',
        missingFeatures: ['allowOthersCloneMyVoice'],
      };
    }

    return { allowed: true };
  }

  // ============================================
  // MÉTHODES D'ACTIVATION/DÉSACTIVATION
  // ============================================

  /**
   * Active une feature pour un utilisateur (set DateTime to now())
   * Vérifie automatiquement les dépendances
   */
  async enableFeature(
    userId: string,
    feature: string
  ): Promise<{ success: boolean; error?: string }> {
    // Map des dépendances pour chaque feature
    const dependencies: Record<string, string[]> = {
      // Consents (pas de dépendances, ils sont à la base)
      'dataProcessingConsentAt': [],
      'voiceDataConsentAt': ['dataProcessingConsentAt'],
      'voiceProfileConsentAt': ['voiceDataConsentAt'],
      'voiceCloningConsentAt': ['voiceProfileConsentAt'],
      'thirdPartyServicesConsentAt': ['dataProcessingConsentAt'],

      // Security
      'twoFactorEnabledAt': [],

      // Features
      'textTranslationEnabledAt': ['dataProcessingConsentAt'],
      'audioTranscriptionEnabledAt': ['voiceDataConsentAt'],
      'speakerDiarizationEnabledAt': ['audioTranscriptionEnabledAt'],
      'audioTranslationEnabledAt': ['audioTranscriptionEnabledAt', 'textTranslationEnabledAt'],
      'translatedAudioGenerationEnabledAt': ['audioTranslationEnabledAt'],
      'voiceCloningEnabledAt': ['voiceCloningConsentAt'],
      'allowOthersCloneMyVoiceAt': ['voiceCloningEnabledAt'],
      'imageTextTranslationEnabledAt': ['textTranslationEnabledAt'],
      'documentTranslationEnabledAt': ['textTranslationEnabledAt'],
      'videoSubtitleTranslationEnabledAt': ['audioTranscriptionEnabledAt', 'textTranslationEnabledAt'],
      'autoplayAudioEnabledAt': [],
      'autoplayTranslatedAudioEnabledAt': ['translatedAudioGenerationEnabledAt'],
      'preferTranslatedAudioAt': ['translatedAudioGenerationEnabledAt'],
    };

    const requiredDeps = dependencies[feature];
    if (requiredDeps === undefined) {
      return { success: false, error: `Feature inconnue: ${feature}` };
    }

    // S'assurer que UserFeature existe
    const userFeature = await this.getOrCreateUserFeature(userId);
    if (!userFeature) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    // Vérifier que toutes les dépendances sont activées
    if (requiredDeps.length > 0) {
      const missingDeps = requiredDeps.filter(dep => !isEnabled((userFeature as any)[dep]));
      if (missingDeps.length > 0) {
        return {
          success: false,
          error: `Dépendances manquantes: ${missingDeps.join(', ')}`
        };
      }
    }

    // Activer la feature
    try {
      await this.prisma.userFeature.update({
        where: { userId },
        data: { [feature]: new Date() }
      });
      return { success: true };
    } catch (error) {
      console.error(`[UserFeatures] Error enabling ${feature}:`, error);
      return { success: false, error: 'Erreur lors de l\'activation' };
    }
  }

  /**
   * Désactive une feature pour un utilisateur (set to null)
   * Désactive automatiquement les features dépendantes
   */
  async disableFeature(
    userId: string,
    feature: string
  ): Promise<{ success: boolean; disabledFeatures?: string[]; error?: string }> {
    // Map des features qui dépendent de chaque feature
    const dependents: Record<string, string[]> = {
      'dataProcessingConsentAt': [
        'voiceDataConsentAt', 'thirdPartyServicesConsentAt', 'textTranslationEnabledAt'
      ],
      'voiceDataConsentAt': [
        'voiceProfileConsentAt', 'audioTranscriptionEnabledAt'
      ],
      'voiceProfileConsentAt': ['voiceCloningConsentAt'],
      'voiceCloningConsentAt': ['voiceCloningEnabledAt'],
      'textTranslationEnabledAt': [
        'audioTranslationEnabledAt', 'imageTextTranslationEnabledAt',
        'documentTranslationEnabledAt', 'videoSubtitleTranslationEnabledAt'
      ],
      'audioTranscriptionEnabledAt': [
        'speakerDiarizationEnabledAt', 'audioTranslationEnabledAt',
        'videoSubtitleTranslationEnabledAt'
      ],
      'audioTranslationEnabledAt': ['translatedAudioGenerationEnabledAt'],
      'translatedAudioGenerationEnabledAt': [
        'autoplayTranslatedAudioEnabledAt', 'preferTranslatedAudioAt'
      ],
      'voiceCloningEnabledAt': ['allowOthersCloneMyVoiceAt'],
    };

    // Collecter toutes les features à désactiver (récursif)
    const toDisable = new Set<string>([feature]);
    const queue = [feature];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = dependents[current] || [];
      for (const dep of deps) {
        if (!toDisable.has(dep)) {
          toDisable.add(dep);
          queue.push(dep);
        }
      }
    }

    // Désactiver toutes les features
    try {
      const updateData: Record<string, null> = {};
      for (const f of toDisable) {
        updateData[f] = null;
      }

      await this.prisma.userFeature.update({
        where: { userId },
        data: updateData
      });

      return {
        success: true,
        disabledFeatures: Array.from(toDisable)
      };
    } catch (error) {
      console.error(`[UserFeatures] Error disabling ${feature}:`, error);
      return { success: false, error: 'Erreur lors de la désactivation' };
    }
  }

  /**
   * Met à jour le encryptionPreference
   */
  async updateEncryptionPreference(
    userId: string,
    preference: 'disabled' | 'optional' | 'always'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userFeature = await this.getOrCreateUserFeature(userId);
      if (!userFeature) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      await this.prisma.userFeature.update({
        where: { userId },
        data: { encryptionPreference: preference }
      });

      return { success: true };
    } catch (error) {
      console.error('[UserFeatures] Error updating encryption preference:', error);
      return { success: false, error: 'Erreur lors de la mise à jour' };
    }
  }

  /**
   * Récupère la configuration de langue cible pour un utilisateur
   * Priorité: customDestinationLanguage > regionalLanguage > systemLanguage
   * Note: Ces champs restent sur User (pas dans UserFeature)
   */
  async getTargetLanguage(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        customDestinationLanguage: true,
        regionalLanguage: true,
        systemLanguage: true,
      }
    });

    if (!user) return 'en';

    return user.customDestinationLanguage
      || user.regionalLanguage
      || user.systemLanguage
      || 'en';
  }

  /**
   * Récupère la source de transcription préférée
   */
  async getTranscriptionSource(userId: string): Promise<'auto' | 'mobile' | 'server'> {
    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { transcriptionSource: true }
    });

    const source = userFeature?.transcriptionSource || 'auto';
    if (source === 'mobile' || source === 'server') return source;
    return 'auto';
  }

  /**
   * Récupère le format audio traduit préféré
   */
  async getTranslatedAudioFormat(userId: string): Promise<'mp3' | 'wav' | 'ogg'> {
    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { translatedAudioFormat: true }
    });

    const format = userFeature?.translatedAudioFormat || 'mp3';
    if (format === 'wav' || format === 'ogg') return format;
    return 'mp3';
  }

  /**
   * Récupère le encryptionPreference
   */
  async getEncryptionPreference(userId: string): Promise<'disabled' | 'optional' | 'always'> {
    const userFeature = await this.prisma.userFeature.findUnique({
      where: { userId },
      select: { encryptionPreference: true }
    });

    const pref = userFeature?.encryptionPreference || 'optional';
    if (pref === 'disabled' || pref === 'always') return pref;
    return 'optional';
  }
}
