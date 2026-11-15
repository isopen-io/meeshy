/**
 * #3735 — les cinq réglages fins `voiceCloning*` (exaggeration, cfgWeight,
 * temperature, topP, qualityPreset), validés par
 * `VoiceProfileService.registerProfile()`, sont enfin PERSISTÉS dans
 * `UserPreferences.audio` au lieu d'être seulement journalisés.
 *
 * `VoiceProfileService.test.ts` est gelé à sa taille exacte
 * (`gateway-test-file-size-budget.test.ts`, DETTE_HERITEE) : ce dossier de
 * tests dédié reprend le harnais minimal nécessaire plutôt que d'y ajouter
 * une ligne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

jest.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234'
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn()
    }))
  }
}));

class MockZMQClient extends EventEmitter {
  sendVoiceProfileRequest = jest.fn() as jest.Mock<any>;
}

const mockPrisma = {
  user: {
    findUnique: jest.fn() as jest.Mock<any>
  },
  userVoiceModel: {
    create: jest.fn() as jest.Mock<any>
  },
  userPreferences: {
    findUnique: jest.fn() as jest.Mock<any>,
    upsert: jest.fn() as jest.Mock<any>
  }
};

const mockBroadcastToUser = jest.fn();
jest.mock('../../../utils/socket-broadcast', () => ({
  broadcastToUser: (...args: any[]) => mockBroadcastToUser(...args)
}));

import { VoiceProfileService } from '../../../services/VoiceProfileService';

describe('VoiceProfileService — persistance des réglages de clonage vocal (#3735)', () => {
  let service: VoiceProfileService;
  let mockZmqClient: MockZMQClient;

  const createMockUser = (overrides: any = {}) => ({
    id: 'user-123',
    birthDate: new Date('1990-05-15'),
    voiceProfileConsentAt: new Date(),
    voiceCloningEnabledAt: new Date(),
    ageVerifiedAt: new Date(),
    voiceModel: null,
    ...overrides
  });

  const createMockVoiceModel = (overrides: any = {}) => ({
    id: 'vm-123',
    userId: 'user-123',
    profileId: 'vp_user123abc',
    embedding: new Uint8Array([1, 2, 3, 4]),
    embeddingDimension: 256,
    embeddingPath: '',
    audioCount: 1,
    totalDurationMs: 15000,
    qualityScore: 0.85,
    version: 1,
    voiceCharacteristics: null,
    fingerprint: null,
    signatureShort: null,
    nextRecalibrationAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    user: createMockUser(),
    ...overrides
  });

  const registerWithCloningSettings = async (voiceCloningSettings: Record<string, unknown>) => {
    mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
      setTimeout(() => {
        mockZmqClient.emit('voiceProfileAnalyzeResult', {
          type: 'voice_profile_analyze_result',
          request_id: 'test-uuid-1234',
          success: true,
          user_id: 'user-123',
          profile_id: 'vp_user123abc',
          audio_duration_ms: 15000,
          quality_score: 0.85,
          embedding_data: Buffer.from([1, 2, 3, 4]).toString('base64'),
          embedding_dimension: 256
        });
      }, 5);
    });

    return service.registerProfile('user-123', {
      audioData: 'base64-audio-data',
      audioFormat: 'wav',
      voiceCloningSettings: voiceCloningSettings as any
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockZmqClient = new MockZMQClient();
    mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
    mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({ userId: 'user-123', audio: {} });
    service = new VoiceProfileService(mockPrisma as any, mockZmqClient as any, { log: {} } as any);
  });

  afterEach(() => {
    service.removeAllListeners();
    mockZmqClient.removeAllListeners();
  });

  it('persiste les cinq réglages bornés dans UserPreferences.audio', async () => {
    const result = await registerWithCloningSettings({
      voiceCloningExaggeration: 0.7,
      voiceCloningCfgWeight: 0.3,
      voiceCloningTemperature: 1.4,
      voiceCloningTopP: 0.95,
      voiceCloningQualityPreset: 'high_quality'
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      create: {
        userId: 'user-123',
        audio: {
          voiceCloningExaggeration: 0.7,
          voiceCloningCfgWeight: 0.3,
          voiceCloningTemperature: 1.4,
          voiceCloningTopP: 0.95,
          voiceCloningQualityPreset: 'high_quality'
        }
      },
      update: {
        audio: {
          voiceCloningExaggeration: 0.7,
          voiceCloningCfgWeight: 0.3,
          voiceCloningTemperature: 1.4,
          voiceCloningTopP: 0.95,
          voiceCloningQualityPreset: 'high_quality'
        }
      }
    });
  });

  it('borne les valeurs hors plage avant de les persister', async () => {
    await registerWithCloningSettings({
      voiceCloningExaggeration: 5,
      voiceCloningCfgWeight: -1,
      voiceCloningTemperature: 0,
      voiceCloningTopP: 2
    });

    const upsertCall = (mockPrisma.userPreferences.upsert as jest.Mock).mock.calls[0][0] as any;
    expect(upsertCall.update.audio).toEqual({
      voiceCloningExaggeration: 1,
      voiceCloningCfgWeight: 0,
      voiceCloningTemperature: 0.1,
      voiceCloningTopP: 1
    });
  });

  it('rejette un preset de qualité inconnu — rien à persister pour cette clé', async () => {
    await registerWithCloningSettings({
      voiceCloningQualityPreset: 'ultra'
    });

    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('superpose les nouveaux réglages sur le document audio existant sans écraser les autres clés', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue({
      audio: { ttsEnabled: false, voiceCloningQualityPreset: 'fast' }
    });

    await registerWithCloningSettings({ voiceCloningQualityPreset: 'high_quality' });

    const upsertCall = (mockPrisma.userPreferences.upsert as jest.Mock).mock.calls[0][0] as any;
    expect(upsertCall.update.audio).toEqual({
      ttsEnabled: false,
      voiceCloningQualityPreset: 'high_quality'
    });
  });

  it("n'écrit rien quand aucun réglage de clonage n'est fourni", async () => {
    await registerWithCloningSettings({});

    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('diffuse preferences:updated (catégorie audio) après persistance, best-effort', async () => {
    await registerWithCloningSettings({ voiceCloningQualityPreset: 'balanced' });

    expect(mockBroadcastToUser).toHaveBeenCalledWith(
      expect.any(Object),
      'user-123',
      expect.stringContaining('preferences'),
      expect.objectContaining({ userId: 'user-123', category: 'audio' })
    );
  });

  it('ne lève pas quand le service est construit sans instance Fastify', async () => {
    service = new VoiceProfileService(mockPrisma as any, mockZmqClient as any);

    const result = await registerWithCloningSettings({ voiceCloningQualityPreset: 'balanced' });

    expect(result.success).toBe(true);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });
});
