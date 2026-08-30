/**
 * ConsentValidationService Unit Tests
 *
 * Covers:
 * - getConsentStatus(): user-not-found, development mode, hierarchical consent computation,
 *   UserPreferences.audio/application override of User fields
 * - validateAudioPreferences(): transcription, audio translation, TTS, voice profile, voice cloning
 * - validateMessagePreferences(): autoTranslateIncoming, autoTranslateLanguages
 * - validatePrivacyPreferences(): allowAnalytics, shareUsageData
 * - validateVideoPreferences(): virtualBackgroundEnabled
 * - validateDocumentPreferences(): scanFilesForMalware
 * - validateApplicationPreferences(): telemetryEnabled, betaFeaturesEnabled
 * - validatePreferences(): routing dispatcher, unknown category
 *
 * @jest-environment node
 */

import { ConsentValidationService } from '../services/ConsentValidationService';

const NOW = new Date('2026-01-01T00:00:00Z');

function makePrisma(userOverrides?: object, userPrefsOverrides?: object | null) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(
        userOverrides !== undefined ? userOverrides : {
          dataProcessingConsentAt: null,
          voiceDataConsentAt: null,
          voiceProfileConsentAt: null,
          voiceCloningEnabledAt: null,
        }
      ),
    },
    userPreferences: {
      findUnique: jest.fn().mockResolvedValue(
        userPrefsOverrides !== undefined ? userPrefsOverrides : null
      ),
    },
  } as any;
}

describe('ConsentValidationService', () => {
  const userId = 'user_abc123';
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ---------------------------------------------------------------------------
  // getConsentStatus
  // ---------------------------------------------------------------------------
  describe('getConsentStatus', () => {
    it('throws when user not found', async () => {
      const prisma = makePrisma(null);
      const svc = new ConsentValidationService(prisma);
      await expect(svc.getConsentStatus(userId)).rejects.toThrow('User not found');
    });

    it('NODE_ENV=development n’accorde plus rien tout seul — un consentement se prouve par une donnée (#4348)', async () => {
      // Le court-circuit `NODE_ENV === 'development'` de #4348 est SUPPRIMÉ :
      // une base sans aucun consentement rend `false` partout, MÊME en
      // développement. Les comptes de développement passent désormais la
      // garde parce qu'ils ont une VRAIE colonne horodatée — voir
      // `packages/shared/seed.ts` (les sept comptes seed).
      process.env.NODE_ENV = 'development';
      const prisma = makePrisma({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status).toEqual({
        hasDataProcessingConsent: false,
        hasVoiceDataConsent: false,
        hasVoiceProfileConsent: false,
        hasVoiceCloningConsent: false,
        hasThirdPartyServicesConsent: false,
        canTranscribeAudio: false,
        canTranslateText: false,
        canTranslateAudio: false,
        canGenerateTranslatedAudio: false,
        canUseVoiceCloning: false,
      });
    });

    it('NODE_ENV=development lit la VRAIE colonne quand elle est posée — comme tout autre environnement', async () => {
      process.env.NODE_ENV = 'development';
      const now = new Date();
      const prisma = makePrisma({
        dataProcessingConsentAt: now,
        voiceDataConsentAt: now,
        voiceProfileConsentAt: now,
        voiceCloningEnabledAt: now,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.canUseVoiceCloning).toBe(true);
    });

    it('returns all-false when user has no consents and no preferences', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status).toEqual({
        hasDataProcessingConsent: false,
        hasVoiceDataConsent: false,
        hasVoiceProfileConsent: false,
        hasVoiceCloningConsent: false,
        hasThirdPartyServicesConsent: false,
        canTranscribeAudio: false,
        canTranslateText: false,
        canTranslateAudio: false,
        canGenerateTranslatedAudio: false,
        canUseVoiceCloning: false,
      });
    });

    it('hasDataProcessingConsent true when only base consent given on User', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma({
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.hasVoiceDataConsent).toBe(false);
      // Traduction texte = cœur du Prisme Linguistique : active par défaut
      // dès que le consentement de traitement des données est accordé.
      expect(status.canTranslateText).toBe(true);
    });

    it('hasVoiceDataConsent requires hasDataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      // voiceDataConsentAt set but dataProcessingConsentAt missing → no cascade
      const prisma = makePrisma({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: NOW,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceDataConsent).toBe(false);
    });

    it('hasVoiceProfileConsent requires hasVoiceDataConsent', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma({
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: NOW,
        voiceCloningEnabledAt: null,
      });
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceProfileConsent).toBe(false);
    });

    it('canTranscribeAudio requires audioTranscriptionEnabledAt and voiceDataConsent', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: { audioTranscriptionEnabledAt: NOW }, application: {} }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canTranscribeAudio).toBe(true);
    });

    it('canTranscribeAudio false when transcriptionEnabled is explicitly disabled', async () => {
      process.env.NODE_ENV = 'test';
      // Le AudioPreferenceSchema stocke des BOOLÉENS (transcriptionEnabled,
      // défaut true) — plus des timestamps que rien n'écrivait. Le gate
      // ne tombe à false que sur un opt-out explicite.
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: { transcriptionEnabled: false }, application: {} }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canTranscribeAudio).toBe(false);
    });

    it('canTranslateText requires textTranslationEnabledAt and dataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: { textTranslationEnabledAt: NOW }, application: {} }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canTranslateText).toBe(true);
    });

    it('canTranslateAudio requires canTranscribeAudio and canTranslateText', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        {
          audio: {
            audioTranscriptionEnabledAt: NOW,
            textTranslationEnabledAt: NOW,
            audioTranslationEnabledAt: NOW,
          },
          application: {}
        }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canTranslateAudio).toBe(true);
    });

    it('canTranslateAudio false when transcription disabled even with translation flags', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        {
          audio: {
            textTranslationEnabledAt: NOW,
            audioTranslationEnabledAt: NOW,
            transcriptionEnabled: false,
          },
          application: {}
        }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canTranslateAudio).toBe(false);
    });

    it('canGenerateTranslatedAudio requires canTranslateAudio and translatedAudioGenerationEnabledAt', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        {
          audio: {
            audioTranscriptionEnabledAt: NOW,
            textTranslationEnabledAt: NOW,
            audioTranslationEnabledAt: NOW,
            translatedAudioGenerationEnabledAt: NOW,
          },
          application: {}
        }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.canGenerateTranslatedAudio).toBe(true);
    });

    it('canUseVoiceCloning requires hasVoiceCloningConsent and voiceCloningEnabledAt on User', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: NOW, voiceCloningEnabledAt: NOW },
        { audio: {}, application: { voiceCloningConsentAt: NOW } }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceCloningConsent).toBe(true);
      expect(status.canUseVoiceCloning).toBe(true);
    });

    it('User.voiceCloningEnabledAt (POST /voice-profile/consent) vaut consentement clonage', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: NOW, voiceCloningEnabledAt: NOW },
        { audio: {}, application: {} } // applicationPrefs.voiceCloningConsentAt absent
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceCloningConsent).toBe(true);
      expect(status.canUseVoiceCloning).toBe(true);
    });

    it('canUseVoiceCloning false when no cloning consent anywhere', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: NOW, voiceCloningEnabledAt: null },
        { audio: {}, application: {} }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceCloningConsent).toBe(false);
      expect(status.canUseVoiceCloning).toBe(false);
    });

    it('hasThirdPartyServicesConsent requires dataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: { thirdPartyServicesConsentAt: NOW } }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasThirdPartyServicesConsent).toBe(false);
    });

    // #4180 — remplace l'ancien "UserPreferences.application overrides User
    // fields for dataProcessingConsentAt", qui GARDAIT le défaut : le blob
    // JSON de préférences n'a plus AUCUNE priorité, ni même aucun effet, sur
    // les quatre consentements de base. Seule `User.*ConsentAt` — la colonne
    // que `VoiceProfileService.updateConsent` horodate côté serveur — fait
    // foi. Un blob qui AFFIRME un consentement que la colonne ne porte pas
    // ne doit plus jamais l'accorder : c'est exactement ce qu'un client
    // malveillant (ou un vieux client qui parlait encore l'ancien contrat)
    // pourrait tenter.
    it('un blob application qui AFFIRME un consentement sans la colonne User ne l\'accorde plus', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: { dataProcessingConsentAt: NOW, voiceCloningConsentAt: NOW } }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasDataProcessingConsent).toBe(false);
      expect(status.hasVoiceCloningConsent).toBe(false);
    });

    // Le cas qui PROUVE la révocation (critère de fin #4180, § Témoins) :
    // un témoin posé seulement sur l'OCTROI ne tombait pas, l'ancien
    // fallback (`applicationPrefs.xxx || user.xxx`) et la lecture directe
    // rendant le même verdict quand les DEUX sources s'accordent. Ici elles
    // divergent délibérément — colonne User REVOQUÉE (`null`, posée par
    // `POST /voice/profile/consent { voiceCloningConsent: false }`), blob
    // application ENCORE daté d'AVANT la révocation (jamais nettoyé, puisque
    // cette route n'écrit que la colonne User) — et c'est le cas que
    // l'ancien code ratait : `applicationPrefs.voiceCloningConsentAt` gagnait
    // par `||`, donc `canUseVoiceCloning` restait `true` après retrait.
    it('une révocation sur la colonne User l\'emporte sur un blob application resté daté (stale)', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        {
          dataProcessingConsentAt: NOW,
          voiceDataConsentAt: NOW,
          voiceProfileConsentAt: NOW,
          voiceCloningEnabledAt: null, // révoqué via POST /voice/profile/consent
        },
        {
          audio: {},
          // Blob JAMAIS nettoyé par la révocation — daté AVANT le retrait.
          application: { voiceCloningConsentAt: NOW, voiceCloningEnabledAt: NOW },
        }
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasVoiceCloningConsent).toBe(false);
      expect(status.canUseVoiceCloning).toBe(false);
    });

    it('handles null userPreferences gracefully', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null // no userPreferences row
      );
      const svc = new ConsentValidationService(prisma);
      const status = await svc.getConsentStatus(userId);

      expect(status.hasDataProcessingConsent).toBe(true);
      // Défaut schema transcriptionEnabled=true + chaîne voix accordée.
      expect(status.canTranscribeAudio).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // validateAudioPreferences
  // ---------------------------------------------------------------------------
  describe('validateAudioPreferences', () => {
    function makeFullConsentPrisma() {
      return makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: NOW, voiceCloningEnabledAt: NOW },
        {
          audio: {
            audioTranscriptionEnabledAt: NOW,
            textTranslationEnabledAt: NOW,
            audioTranslationEnabledAt: NOW,
            translatedAudioGenerationEnabledAt: NOW,
          },
          application: { voiceCloningConsentAt: NOW }
        }
      );
    }

    function makeNoConsentPrisma() {
      return makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      );
    }

    it('returns no violations when all consents present and preferences enabled', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeFullConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, {
        transcriptionEnabled: true,
        audioTranslationEnabled: true,
        ttsEnabled: true,
        voiceProfileEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for transcriptionEnabled when canTranscribeAudio false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, { transcriptionEnabled: true });
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('transcriptionEnabled');
      expect(violations[0].requiredConsents).toContain('voiceDataConsentAt');
    });

    it('does not add transcription violation when transcriptionEnabled is false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, { transcriptionEnabled: false });
      expect(violations.find(v => v.field === 'transcriptionEnabled')).toBeUndefined();
    });

    it('adds violation for audioTranslationEnabled when canTranslateAudio false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, { audioTranslationEnabled: true });
      expect(violations.find(v => v.field === 'audioTranslationEnabled')).toBeDefined();
    });

    it('adds violation for ttsEnabled when canGenerateTranslatedAudio false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, { ttsEnabled: true });
      expect(violations.find(v => v.field === 'ttsEnabled')).toBeDefined();
    });

    it('adds violation for voiceProfileEnabled when hasVoiceProfileConsent false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, { voiceProfileEnabled: true });
      expect(violations.find(v => v.field === 'voiceProfileEnabled')).toBeDefined();
    });

    it('adds voiceCloneQuality violation when voiceProfileEnabled=true and canUseVoiceCloning false', async () => {
      process.env.NODE_ENV = 'test';
      const prisma = makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: NOW, voiceProfileConsentAt: NOW, voiceCloningEnabledAt: null },
        { audio: {}, application: {} }
      );
      const svc = new ConsentValidationService(prisma);
      const violations = await svc.validateAudioPreferences(userId, {
        voiceCloneQuality: 'high',
        voiceProfileEnabled: true,
      });
      expect(violations.find(v => v.field === 'voiceCloneQuality')).toBeDefined();
    });

    it('does not add voiceCloneQuality violation when voiceProfileEnabled is false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeNoConsentPrisma());
      const violations = await svc.validateAudioPreferences(userId, {
        voiceCloneQuality: 'high',
        voiceProfileEnabled: false,
      });
      expect(violations.find(v => v.field === 'voiceCloneQuality')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateMessagePreferences
  // ---------------------------------------------------------------------------
  describe('validateMessagePreferences', () => {
    function makeTextTranslationPrisma() {
      return makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: { textTranslationEnabledAt: NOW }, application: {} }
      );
    }

    it('returns no violations when canTranslateText and autoTranslateIncoming enabled', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeTextTranslationPrisma());
      const violations = await svc.validateMessagePreferences(userId, { autoTranslateIncoming: true });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for autoTranslateIncoming when canTranslateText false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateMessagePreferences(userId, { autoTranslateIncoming: true });
      expect(violations.find(v => v.field === 'autoTranslateIncoming')).toBeDefined();
    });

    it('adds violation for autoTranslateLanguages when canTranslateText false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateMessagePreferences(userId, { autoTranslateLanguages: ['fr', 'en'] });
      expect(violations.find(v => v.field === 'autoTranslateLanguages')).toBeDefined();
    });

    it('does not add autoTranslateLanguages violation for empty array', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateMessagePreferences(userId, { autoTranslateLanguages: [] });
      expect(violations.find(v => v.field === 'autoTranslateLanguages')).toBeUndefined();
    });

    it('does not add autoTranslateLanguages violation when canTranslateText true', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makeTextTranslationPrisma());
      const violations = await svc.validateMessagePreferences(userId, { autoTranslateLanguages: ['fr'] });
      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // validatePrivacyPreferences
  // ---------------------------------------------------------------------------
  describe('validatePrivacyPreferences', () => {
    it('returns no violations when dataProcessingConsent given and flags enabled', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePrivacyPreferences(userId, {
        allowAnalytics: true,
        shareUsageData: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for allowAnalytics without dataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePrivacyPreferences(userId, { allowAnalytics: true });
      expect(violations.find(v => v.field === 'allowAnalytics')).toBeDefined();
    });

    it('adds violation for shareUsageData without dataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePrivacyPreferences(userId, { shareUsageData: true });
      expect(violations.find(v => v.field === 'shareUsageData')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateVideoPreferences
  // ---------------------------------------------------------------------------
  describe('validateVideoPreferences', () => {
    it('returns no violations when thirdPartyServicesConsent given', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: { thirdPartyServicesConsentAt: NOW } }
      ));
      const violations = await svc.validateVideoPreferences(userId, { virtualBackgroundEnabled: true });
      expect(violations).toHaveLength(0);
    });

    it('returns no violations when only dataProcessingConsent given (either is sufficient)', async () => {
      process.env.NODE_ENV = 'test';
      // The condition is: !thirdParty AND !dataProcessing → violation
      // So dataProcessing alone → no violation
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: {} }
      ));
      const violations = await svc.validateVideoPreferences(userId, { virtualBackgroundEnabled: true });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for virtualBackgroundEnabled when both consents missing', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateVideoPreferences(userId, { virtualBackgroundEnabled: true });
      expect(violations.find(v => v.field === 'virtualBackgroundEnabled')).toBeDefined();
    });

    it('no violation when virtualBackgroundEnabled is false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateVideoPreferences(userId, { virtualBackgroundEnabled: false });
      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // validateDocumentPreferences
  // ---------------------------------------------------------------------------
  describe('validateDocumentPreferences', () => {
    it('returns no violations when thirdPartyServicesConsent given', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: { thirdPartyServicesConsentAt: NOW } }
      ));
      const violations = await svc.validateDocumentPreferences(userId, { scanFilesForMalware: true });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for scanFilesForMalware without thirdPartyServicesConsent', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateDocumentPreferences(userId, { scanFilesForMalware: true });
      expect(violations.find(v => v.field === 'scanFilesForMalware')).toBeDefined();
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('no violation when scanFilesForMalware is false', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateDocumentPreferences(userId, { scanFilesForMalware: false });
      expect(violations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // validateApplicationPreferences
  // ---------------------------------------------------------------------------
  describe('validateApplicationPreferences', () => {
    it('returns no violations when dataProcessingConsent and thirdParty consents given', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        { audio: {}, application: { thirdPartyServicesConsentAt: NOW } }
      ));
      const violations = await svc.validateApplicationPreferences(userId, {
        telemetryEnabled: true,
        betaFeaturesEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('adds violation for telemetryEnabled without dataProcessingConsent', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateApplicationPreferences(userId, { telemetryEnabled: true });
      expect(violations.find(v => v.field === 'telemetryEnabled')).toBeDefined();
    });

    it('adds violation for betaFeaturesEnabled without thirdPartyServicesConsent', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: NOW, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validateApplicationPreferences(userId, { betaFeaturesEnabled: true });
      expect(violations.find(v => v.field === 'betaFeaturesEnabled')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validatePreferences (dispatcher)
  // ---------------------------------------------------------------------------
  describe('validatePreferences', () => {
    it('routes "audio" category to validateAudioPreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'audio', { transcriptionEnabled: true });
      expect(violations.find(v => v.field === 'transcriptionEnabled')).toBeDefined();
    });

    it('routes "message" category to validateMessagePreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'message', { autoTranslateIncoming: true });
      expect(violations.find(v => v.field === 'autoTranslateIncoming')).toBeDefined();
    });

    it('routes "privacy" category to validatePrivacyPreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'privacy', { allowAnalytics: true });
      expect(violations.find(v => v.field === 'allowAnalytics')).toBeDefined();
    });

    it('routes "video" category to validateVideoPreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'video', { virtualBackgroundEnabled: true });
      expect(violations.find(v => v.field === 'virtualBackgroundEnabled')).toBeDefined();
    });

    it('routes "document" category to validateDocumentPreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'document', { scanFilesForMalware: true });
      expect(violations.find(v => v.field === 'scanFilesForMalware')).toBeDefined();
    });

    it('routes "application" category to validateApplicationPreferences', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'application', { telemetryEnabled: true });
      expect(violations.find(v => v.field === 'telemetryEnabled')).toBeDefined();
    });

    it('returns [] for "notification" category (no consent validation needed)', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'notification', { pushEnabled: true });
      expect(violations).toEqual([]);
    });

    it('returns [] for unknown category', async () => {
      process.env.NODE_ENV = 'test';
      const svc = new ConsentValidationService(makePrisma(
        { dataProcessingConsentAt: null, voiceDataConsentAt: null, voiceProfileConsentAt: null, voiceCloningEnabledAt: null },
        null
      ));
      const violations = await svc.validatePreferences(userId, 'unknown_category', { anything: true });
      expect(violations).toEqual([]);
    });
  });
});
