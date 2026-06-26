import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConsentValidationService } from '../../../services/ConsentValidationService';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

const NOW = new Date('2026-01-01T00:00:00Z');

const buildMockPrisma = () => ({
  user: { findUnique: jest.fn() as jest.Mock<any> },
  userPreferences: { findUnique: jest.fn() as jest.Mock<any> },
});

const noConsentsUser = () => ({
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningEnabledAt: null,
});

const fullConsentsUser = () => ({
  dataProcessingConsentAt: NOW,
  voiceDataConsentAt: NOW,
  voiceProfileConsentAt: NOW,
  voiceCloningEnabledAt: NOW,
});

const fullAudioPrefs = () => ({
  audio: {
    audioTranscriptionEnabledAt: NOW,
    textTranslationEnabledAt: NOW,
    audioTranslationEnabledAt: NOW,
    translatedAudioGenerationEnabledAt: NOW,
  },
  application: {
    voiceCloningConsentAt: NOW,
    thirdPartyServicesConsentAt: NOW,
  },
});

describe('ConsentValidationService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let service: ConsentValidationService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    service = new ConsentValidationService(mockPrisma as any);
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ── getConsentStatus ──────────────────────────────────────────────────────

  describe('getConsentStatus', () => {
    it('throws when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getConsentStatus('missing-user')).rejects.toThrow('User not found');
    });

    it('returns all-true in development mode regardless of stored consents', async () => {
      process.env.NODE_ENV = 'development';
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ audio: {}, application: {} });

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.hasVoiceDataConsent).toBe(true);
      expect(status.hasVoiceProfileConsent).toBe(true);
      expect(status.hasVoiceCloningConsent).toBe(true);
      expect(status.hasThirdPartyServicesConsent).toBe(true);
      expect(status.canTranscribeAudio).toBe(true);
      expect(status.canTranslateText).toBe(true);
      expect(status.canTranslateAudio).toBe(true);
      expect(status.canGenerateTranslatedAudio).toBe(true);
      expect(status.canUseVoiceCloning).toBe(true);
    });

    it('returns all-false when user has no consents and no preferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(false);
      expect(status.hasVoiceDataConsent).toBe(false);
      expect(status.hasVoiceProfileConsent).toBe(false);
      expect(status.hasVoiceCloningConsent).toBe(false);
      expect(status.hasThirdPartyServicesConsent).toBe(false);
      expect(status.canTranscribeAudio).toBe(false);
      expect(status.canTranslateText).toBe(false);
      expect(status.canTranslateAudio).toBe(false);
      expect(status.canGenerateTranslatedAudio).toBe(false);
      expect(status.canUseVoiceCloning).toBe(false);
    });

    it('enables text translation and third-party with only data processing consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: { textTranslationEnabledAt: NOW },
        application: { thirdPartyServicesConsentAt: NOW },
      });

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.canTranslateText).toBe(true);
      expect(status.hasThirdPartyServicesConsent).toBe(true);
      // Voice capabilities still blocked without voiceDataConsentAt
      expect(status.hasVoiceDataConsent).toBe(false);
      expect(status.canTranscribeAudio).toBe(false);
      expect(status.canTranslateAudio).toBe(false);
    });

    it('enables full capability chain when all consents and features present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(fullConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(fullAudioPrefs());

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.hasVoiceDataConsent).toBe(true);
      expect(status.hasVoiceProfileConsent).toBe(true);
      expect(status.hasVoiceCloningConsent).toBe(true);
      expect(status.hasThirdPartyServicesConsent).toBe(true);
      expect(status.canTranscribeAudio).toBe(true);
      expect(status.canTranslateText).toBe(true);
      expect(status.canTranslateAudio).toBe(true);
      expect(status.canGenerateTranslatedAudio).toBe(true);
      expect(status.canUseVoiceCloning).toBe(true);
    });

    it('prefers applicationPrefs.dataProcessingConsentAt over User field (progressive migration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {},
        application: { dataProcessingConsentAt: NOW.toISOString() },
      });

      const status = await service.getConsentStatus('user-123');
      expect(status.hasDataProcessingConsent).toBe(true);
    });

    it('blocks transcription when voiceDataConsent missing even with audioTranscriptionEnabledAt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: { audioTranscriptionEnabledAt: NOW },
        application: {},
      });

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(true);
      expect(status.hasVoiceDataConsent).toBe(false);
      expect(status.canTranscribeAudio).toBe(false);
    });

    it('blocks TTS when translatedAudioGenerationEnabledAt missing even with full consent chain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(fullConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {
          audioTranscriptionEnabledAt: NOW,
          textTranslationEnabledAt: NOW,
          audioTranslationEnabledAt: NOW,
          // translatedAudioGenerationEnabledAt absent
        },
        application: {},
      });

      const status = await service.getConsentStatus('user-123');

      expect(status.canTranslateAudio).toBe(true);
      expect(status.canGenerateTranslatedAudio).toBe(false);
    });

    it('blocks voiceCloningConsent when voiceProfileConsent missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: NOW,
        // voiceProfileConsentAt absent
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {},
        application: { voiceCloningConsentAt: NOW },
      });

      const status = await service.getConsentStatus('user-123');

      expect(status.hasVoiceDataConsent).toBe(true);
      expect(status.hasVoiceProfileConsent).toBe(false);
      expect(status.hasVoiceCloningConsent).toBe(false);
    });

    it('blocks thirdPartyServicesConsent when dataProcessingConsent missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {},
        application: { thirdPartyServicesConsentAt: NOW },
      });

      const status = await service.getConsentStatus('user-123');

      expect(status.hasDataProcessingConsent).toBe(false);
      expect(status.hasThirdPartyServicesConsent).toBe(false);
    });
  });

  // ── validateAudioPreferences ──────────────────────────────────────────────

  describe('validateAudioPreferences', () => {
    it('returns no violations when all preferences are disabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateAudioPreferences('user-123', {
        transcriptionEnabled: false,
        audioTranslationEnabled: false,
        ttsEnabled: false,
        voiceProfileEnabled: false,
      });
      expect(violations).toHaveLength(0);
    });

    it('returns transcriptionEnabled violation without voiceDataConsent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateAudioPreferences('user-123', {
        transcriptionEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('transcriptionEnabled');
      expect(violations[0].requiredConsents).toContain('voiceDataConsentAt');
      expect(violations[0].requiredConsents).toContain('audioTranscriptionEnabledAt');
    });

    it('returns audioTranslationEnabled violation without full audio chain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateAudioPreferences('user-123', {
        audioTranslationEnabled: true,
      });

      const fields = violations.map((v) => v.field);
      expect(fields).toContain('audioTranslationEnabled');
    });

    it('returns ttsEnabled violation without translatedAudioGenerationEnabledAt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateAudioPreferences('user-123', {
        ttsEnabled: true,
      });

      const fields = violations.map((v) => v.field);
      expect(fields).toContain('ttsEnabled');
    });

    it('returns voiceProfileEnabled violation without voiceProfileConsent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ audio: {}, application: {} });

      const violations = await service.validateAudioPreferences('user-123', {
        voiceProfileEnabled: true,
      });

      const fields = violations.map((v) => v.field);
      expect(fields).toContain('voiceProfileEnabled');
    });

    it('returns voiceCloneQuality violation when voiceProfileEnabled=true without cloningConsent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: NOW,
        voiceProfileConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ audio: {}, application: {} });

      const violations = await service.validateAudioPreferences('user-123', {
        voiceProfileEnabled: true,
        voiceCloneQuality: 'high',
      });

      const fields = violations.map((v) => v.field);
      expect(fields).toContain('voiceCloneQuality');
    });

    it('returns no violations when all features enabled with full consents and features', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(fullConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(fullAudioPrefs());

      const violations = await service.validateAudioPreferences('user-123', {
        transcriptionEnabled: true,
        audioTranslationEnabled: true,
        ttsEnabled: true,
        voiceProfileEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validateMessagePreferences ────────────────────────────────────────────

  describe('validateMessagePreferences', () => {
    it('returns violation when autoTranslateIncoming without text translation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateMessagePreferences('user-123', {
        autoTranslateIncoming: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('autoTranslateIncoming');
      expect(violations[0].requiredConsents).toContain('textTranslationEnabledAt');
    });

    it('returns violation when autoTranslateLanguages has entries without text translation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateMessagePreferences('user-123', {
        autoTranslateLanguages: ['fr', 'en'],
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('autoTranslateLanguages');
    });

    it('returns no violation when autoTranslateLanguages is empty array', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateMessagePreferences('user-123', {
        autoTranslateLanguages: [],
      });
      expect(violations).toHaveLength(0);
    });

    it('returns no violations when text translation enabled with data processing consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: { textTranslationEnabledAt: NOW },
        application: {},
      });

      const violations = await service.validateMessagePreferences('user-123', {
        autoTranslateIncoming: true,
        autoTranslateLanguages: ['fr'],
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validatePrivacyPreferences ────────────────────────────────────────────

  describe('validatePrivacyPreferences', () => {
    it('returns violation when allowAnalytics without data processing consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePrivacyPreferences('user-123', {
        allowAnalytics: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('allowAnalytics');
      expect(violations[0].requiredConsents).toContain('dataProcessingConsentAt');
    });

    it('returns violation when shareUsageData without data processing consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePrivacyPreferences('user-123', {
        shareUsageData: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('shareUsageData');
    });

    it('returns no violations when data processing consent present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ audio: {}, application: {} });

      const violations = await service.validatePrivacyPreferences('user-123', {
        allowAnalytics: true,
        shareUsageData: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('returns no violations when preferences are false (regardless of consent)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePrivacyPreferences('user-123', {
        allowAnalytics: false,
        shareUsageData: false,
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validateVideoPreferences ──────────────────────────────────────────────

  describe('validateVideoPreferences', () => {
    it('returns violation when virtualBackground enabled with no consents at all', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateVideoPreferences('user-123', {
        virtualBackgroundEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('virtualBackgroundEnabled');
      expect(violations[0].requiredConsents).toContain('dataProcessingConsentAt');
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('returns no violation when data processing consent is present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ audio: {}, application: {} });

      const violations = await service.validateVideoPreferences('user-123', {
        virtualBackgroundEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('returns no violation when virtualBackground is disabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateVideoPreferences('user-123', {
        virtualBackgroundEnabled: false,
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validateDocumentPreferences ───────────────────────────────────────────

  describe('validateDocumentPreferences', () => {
    it('returns violation when scanFilesForMalware without third-party consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateDocumentPreferences('user-123', {
        scanFilesForMalware: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('scanFilesForMalware');
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('returns no violation when third-party and data processing consents present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {},
        application: { thirdPartyServicesConsentAt: NOW },
      });

      const violations = await service.validateDocumentPreferences('user-123', {
        scanFilesForMalware: true,
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validateApplicationPreferences ───────────────────────────────────────

  describe('validateApplicationPreferences', () => {
    it('returns violation when telemetryEnabled without data processing consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateApplicationPreferences('user-123', {
        telemetryEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('telemetryEnabled');
      expect(violations[0].requiredConsents).toContain('dataProcessingConsentAt');
    });

    it('returns violation when betaFeaturesEnabled without third-party consent', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validateApplicationPreferences('user-123', {
        betaFeaturesEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('betaFeaturesEnabled');
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('returns no violations when all consents present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...noConsentsUser(),
        dataProcessingConsentAt: NOW,
      });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        audio: {},
        application: { thirdPartyServicesConsentAt: NOW },
      });

      const violations = await service.validateApplicationPreferences('user-123', {
        telemetryEnabled: true,
        betaFeaturesEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });
  });

  // ── validatePreferences (router) ──────────────────────────────────────────

  describe('validatePreferences', () => {
    it('routes audio to validateAudioPreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'audio', {
        transcriptionEnabled: true,
      });
      expect(violations.some((v) => v.field === 'transcriptionEnabled')).toBe(true);
    });

    it('routes message to validateMessagePreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'message', {
        autoTranslateIncoming: true,
      });
      expect(violations.some((v) => v.field === 'autoTranslateIncoming')).toBe(true);
    });

    it('routes privacy to validatePrivacyPreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'privacy', {
        allowAnalytics: true,
      });
      expect(violations.some((v) => v.field === 'allowAnalytics')).toBe(true);
    });

    it('routes video to validateVideoPreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'video', {
        virtualBackgroundEnabled: true,
      });
      expect(violations.some((v) => v.field === 'virtualBackgroundEnabled')).toBe(true);
    });

    it('routes document to validateDocumentPreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'document', {
        scanFilesForMalware: true,
      });
      expect(violations.some((v) => v.field === 'scanFilesForMalware')).toBe(true);
    });

    it('routes application to validateApplicationPreferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(noConsentsUser());
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const violations = await service.validatePreferences('user-123', 'application', {
        telemetryEnabled: true,
      });
      expect(violations.some((v) => v.field === 'telemetryEnabled')).toBe(true);
    });

    it('returns empty array for notification category (no consent needed)', async () => {
      const violations = await service.validatePreferences('user-123', 'notification', {
        pushEnabled: true,
      });
      expect(violations).toHaveLength(0);
    });

    it('returns empty array for unknown category', async () => {
      const violations = await service.validatePreferences('user-123', 'unknown-category', {
        something: true,
      });
      expect(violations).toHaveLength(0);
    });
  });
});
