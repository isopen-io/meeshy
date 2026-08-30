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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dataProcessingConsentAt: true,
        voiceDataConsentAt: true,
        voiceProfileConsentAt: true,
        voiceCloningEnabledAt: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Charger les préférences utilisateur pour récupérer les features audio/application
    const userPreferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        audio: true,
        application: true
      }
    });

    // Le court-circuit `NODE_ENV === 'development'` est SUPPRIMÉ (#4348) : un
    // consentement se prouve par une DONNÉE, jamais par un environnement
    // d'exécution — cette garde échouait OUVERT sur une variable qu'une
    // simple erreur de configuration suffit à poser (un `NODE_ENV` mal
    // positionné en production aurait réputé toute la population
    // consentante, sans trace ni horodatage). Les comptes de développement
    // reçoivent désormais un vrai consentement horodaté, écrit par le seed
    // (`packages/shared/seed.ts`) — ils passent la garde parce qu'ils ont
    // consenti, pas parce que le processus tourne quelque part.

    // Parser les préférences audio (JSON). `applicationPrefs` reste lu plus
    // bas pour `thirdPartyServicesConsentAt` (hors périmètre #4180) — plus
    // JAMAIS pour les quatre colonnes de consentement ci-dessous.
    const audioPrefs = userPreferences?.audio as any || {};
    const applicationPrefs = userPreferences?.application as any || {};

    // Consentements de base — SEULE la colonne `User` fait foi (#4180).
    //
    // Ce bloc donnait autrefois PRIORITÉ au blob JSON
    // (`applicationPrefs.xxx || user.xxx`) : `PATCH /me/preferences/application`
    // acceptait ces mêmes noms comme des champs de date LIBRES, si bien
    // qu'un client pouvait AFFIRMER un consentement — avec la date de SON
    // choix — sans jamais passer par `POST /voice/profile/consent`, le seul
    // écrivain qui horodate côté serveur. Pire : une RÉVOCATION posée sur la
    // colonne `User` (celle que cette route écrit réellement) restait
    // invisible tant que le blob gardait sa vieille date — un consentement
    // retiré sans effet observable. `ApplicationPreferenceSchema` REJETTE
    // désormais ces cinq clés (`z.never()`, #4180) : le blob ne peut plus
    // les porter, et cette lecture n'a donc plus de second hasard à départager.
    const dataProcessingConsentAt = user.dataProcessingConsentAt;
    const voiceDataConsentAt = user.voiceDataConsentAt;
    const voiceProfileConsentAt = user.voiceProfileConsentAt;
    const voiceCloningEnabledAt = user.voiceCloningEnabledAt;

    const hasDataProcessingConsent = !!dataProcessingConsentAt;
    const hasVoiceDataConsent = !!voiceDataConsentAt && hasDataProcessingConsent;
    const hasVoiceProfileConsent = !!voiceProfileConsentAt && hasVoiceDataConsent;

    // Features activées dans UserPreferences.audio.
    //
    // Les clients écrivent les BOOLÉENS du AudioPreferenceSchema
    // (`transcriptionEnabled`, `audioTranslationEnabled`, `ttsEnabled` —
    // cf. packages/shared/types/preferences/audio.ts) via
    // PATCH /me/preferences/audio ; les timestamps `…EnabledAt` historiques
    // ne sont écrits par aucune route. Sans cette dérivation, les gates
    // ci-dessous étaient TOUJOURS faux hors dev et le pipeline audio
    // (transcription/traduction) restait bloqué même consentement accordé.
    // Le timestamp legacy garde priorité s'il existe ; le booléen absent
    // retombe sur le défaut du schema (2026-08-09 : tous à true, aligné sur
    // le texte — un consentement voix manquant reste le seul verrou réel).
    const boolPref = (value: unknown, defaultValue: boolean): boolean =>
      typeof value === 'boolean' ? value : defaultValue;
    const audioTranscriptionEnabled =
      !!audioPrefs.audioTranscriptionEnabledAt || boolPref(audioPrefs.transcriptionEnabled, true);
    // La traduction texte est le cœur du Prisme Linguistique — active par
    // défaut, seul un timestamp legacy explicite peut la porter aussi.
    const textTranslationEnabled =
      !!audioPrefs.textTranslationEnabledAt || boolPref(audioPrefs.textTranslationEnabled, true);
    const audioTranslationEnabled =
      !!audioPrefs.audioTranslationEnabledAt || boolPref(audioPrefs.audioTranslationEnabled, true);
    const translatedAudioGenerationEnabled =
      !!audioPrefs.translatedAudioGenerationEnabledAt || boolPref(audioPrefs.ttsEnabled, true);

    // Consentement clonage — SEULE colonne : `User.voiceCloningEnabledAt`,
    // horodatée par `POST /voice/profile/consent { voiceCloningConsent }`
    // (#4180). Le blob `application.voiceCloningConsentAt` n'est plus lu —
    // il servait de repli qui masquait exactement une révocation (colonne
    // remise à `null`, blob encore daté ⇒ `hasVoiceCloningConsent` restait
    // vrai).
    //
    // `thirdPartyServicesConsentAt` NE PEUT PAS entrer dans ce blob — ce
    // commentaire affirmait le contraire (« reste dans le blob ») avant
    // #4343, ce qui était faux : `ApplicationPreferenceSchema` ne déclare
    // pas cette clé, donc Zod la STRIPPE en silence (mode par défaut) sur
    // les deux chemins d'écriture de `PATCH`/`PUT /me/preferences/application`
    // — un client qui l'envoie reçoit `200` et la clé disparaît sans jamais
    // atteindre Mongo. Il n'a pas non plus de colonne `User` miroir, ce qui
    // reste vrai. La lecture ci-dessous ne trouve donc RIEN, TOUJOURS :
    // `hasThirdPartyServicesConsent` (ligne suivante) vaut `false` pour tout
    // le monde, sans exception, ce qui bloque `betaFeaturesEnabled` et
    // `scanFilesForMalware` pour quiconque. L'arbitrage — (a) un vrai
    // consentement avec sa colonne, (b) le retrait de l'exigence, (c) son
    // rattachement à `hasDataProcessingConsent` — est ouvert sous #4343.
    const thirdPartyServicesConsentAt = applicationPrefs.thirdPartyServicesConsentAt;

    const hasVoiceCloningConsent = !!voiceCloningEnabledAt && hasVoiceProfileConsent;
    const hasThirdPartyServicesConsent = !!thirdPartyServicesConsentAt && hasDataProcessingConsent;

    // Calculer les capacités selon la hiérarchie de consentements
    const canTranscribeAudio = audioTranscriptionEnabled && hasVoiceDataConsent;
    const canTranslateText = textTranslationEnabled && hasDataProcessingConsent;
    const canTranslateAudio = audioTranslationEnabled && canTranscribeAudio && canTranslateText;
    const canGenerateTranslatedAudio = translatedAudioGenerationEnabled && canTranslateAudio;
    const canUseVoiceCloning = !!voiceCloningEnabledAt && hasVoiceCloningConsent;

    return {
      hasDataProcessingConsent,
      hasVoiceDataConsent,
      hasVoiceProfileConsent,
      hasVoiceCloningConsent,
      hasThirdPartyServicesConsent,
      canTranscribeAudio,
      canTranslateText,
      canTranslateAudio,
      canGenerateTranslatedAudio,
      canUseVoiceCloning
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

    // Chaîne évaluée sur l'état STORED ∪ INCOMING : une même requête active
    // légitimement plusieurs maillons d'un coup (popup iOS 2026-07-08 —
    // transcription + traduction audio + TTS dans un seul PATCH). Évaluer
    // chaque maillon uniquement sur l'état stocké rejetterait la requête qui
    // contient elle-même le maillon précédent. Les CONSENTEMENTS, eux,
    // restent exigés tels que stockés (catégorie application / User).
    const effCanTranscribe = status.hasVoiceDataConsent &&
      (preferences.transcriptionEnabled === true || status.canTranscribeAudio);
    const effCanTranslateAudio = effCanTranscribe && status.canTranslateText &&
      (preferences.audioTranslationEnabled === true || status.canTranslateAudio);
    const effCanGenerateTranslatedAudio = effCanTranslateAudio &&
      (preferences.ttsEnabled === true || status.canGenerateTranslatedAudio);

    // Transcription requiert voiceDataConsent
    if (preferences.transcriptionEnabled === true && !effCanTranscribe) {
      violations.push({
        field: 'transcriptionEnabled',
        message: 'Audio transcription requires voice data consent and feature activation',
        requiredConsents: ['voiceDataConsentAt', 'audioTranscriptionEnabledAt']
      });
    }

    // Traduction audio requiert transcription + traduction texte
    if (preferences.audioTranslationEnabled === true && !effCanTranslateAudio) {
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
    if (preferences.ttsEnabled === true && !effCanGenerateTranslatedAudio) {
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

    // #4180 — l'octroi same-request (« le corps du PATCH accorde LUI-MÊME
    // le consentement ») est SUPPRIMÉ, pas seulement devenu sans effet.
    // `preferences.dataProcessingConsentAt` était le point d'entrée exact du
    // défaut : un client posait sa PROPRE date dans le même PATCH que la
    // préférence qu'il voulait débloquer, et cette ligne l'acceptait comme
    // une preuve. `ApplicationPreferenceSchema` REJETTE désormais ce champ
    // (`z.never()`) — un appelant qui passe encore par
    // `preference-router-factory.ts` ne peut plus faire parvenir cette clé
    // jusqu'ici — mais cette méthode reste appelable directement avec un
    // `Record<string, any>` arbitraire (ni Zod ni les tests ne le lui
    // interdisent) : la retirer ICI ferme le contournement pour de bon,
    // plutôt que de compter sur une garde amont qui n'est pas la sienne.
    // Seul l'état STOCKÉ (`status.hasDataProcessingConsent`, lu depuis
    // `User.dataProcessingConsentAt`) accorde désormais la télémétrie.
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
