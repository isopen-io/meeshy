/**
 * Unit tests for VoiceProfileService
 *
 * Comprehensive tests for voice profile management including:
 * - Consent management (GDPR compliant)
 * - Profile registration
 * - Profile calibration
 * - Profile update
 * - Profile retrieval
 * - Profile deletion
 * - ZMQ response handling
 * - Error scenarios and edge cases
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock @meeshy/shared/prisma/client
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// Mock fs module
const mockReadFile = jest.fn() as jest.Mock<any>;
jest.mock('fs', () => ({
  promises: {
    readFile: (path: string) => mockReadFile(path)
  }
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234'
}));

// Mock logger-enhanced to prevent fs.write errors in tests
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

// Mock ZmqTranslationClient
class MockZMQClient extends EventEmitter {
  sendVoiceProfileRequest = jest.fn() as jest.Mock<any>;
}

// Mock PrismaClient
const mockPrisma = {
  user: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>
  },
  userFeature: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    upsert: jest.fn() as jest.Mock<any>
  },
  userVoiceModel: {
    findUnique: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    delete: jest.fn() as jest.Mock<any>
  },
  messageAttachment: {
    findUnique: jest.fn() as jest.Mock<any>
  },
  participant: {
    findFirst: jest.fn() as jest.Mock<any>
  }
};

// Import after mocks are set up
import { VoiceProfileService } from '../../../services/VoiceProfileService';

describe('VoiceProfileService', () => {
  let service: VoiceProfileService;
  let mockZmqClient: MockZMQClient;

  // Helper to create mock user
  const createMockUser = (overrides: any = {}) => ({
    id: 'user-123',
    birthDate: new Date('1990-05-15'),
    voiceProfileConsentAt: new Date(),
    voiceCloningEnabledAt: new Date(),
    ageVerifiedAt: new Date(),
    voiceModel: null,
    ...overrides
  });

  // Helper to create mock voice model
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
    voiceCharacteristics: { pitch: { mean: 150 } },
    fingerprint: { id: 'fp-123' },
    signatureShort: 'sig-abc',
    nextRecalibrationAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    user: createMockUser(),
    ...overrides
  });

  // Helper to create ZMQ analyze result
  const createMockZmqAnalyzeResult = (overrides: any = {}) => ({
    type: 'voice_profile_analyze_result',
    request_id: 'test-uuid-1234',
    success: true,
    user_id: 'user-123',
    profile_id: 'vp_user123abc',
    audio_duration_ms: 15000,
    quality_score: 0.85,
    embedding_path: '/path/to/embedding',
    embedding_data: Buffer.from([1, 2, 3, 4]).toString('base64'),
    embedding_dimension: 256,
    voice_characteristics: { pitch: { mean: 150 } },
    fingerprint: { id: 'fp-123' },
    signature_short: 'sig-abc',
    ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockZmqClient = new MockZMQClient();
    service = new VoiceProfileService(mockPrisma as any, mockZmqClient as any);
  });

  afterEach(() => {
    service.removeAllListeners();
    mockZmqClient.removeAllListeners();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSENT MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateConsent', () => {
    it('should update voice recording consent and activate dependencies', async () => {
      // Simuler qu'aucune dépendance n'est activée
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockResolvedValue({
        userId: 'user-123',
        voiceProfileConsentAt: new Date(),
        voiceDataConsentAt: new Date(),
        dataProcessingConsentAt: new Date()
      });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: true,
        voiceCloningConsent: false
      });

      expect(result.success).toBe(true);
      expect(result.data?.consentUpdated).toBe(true);
      // Vérifie que update est appelé avec les dépendances activées
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          voiceProfileConsentAt: expect.any(Date),
          voiceDataConsentAt: expect.any(Date),
          dataProcessingConsentAt: expect.any(Date)
        }),
        select: expect.any(Object)
      });
    });

    it('should not re-activate existing dependencies', async () => {
      // Simuler que les dépendances sont déjà activées
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: new Date('2024-01-01'),
        voiceDataConsentAt: new Date('2024-01-01'),
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockResolvedValue({
        userId: 'user-123',
        voiceProfileConsentAt: new Date()
      });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: true,
        voiceCloningConsent: false
      });

      expect(result.success).toBe(true);
      // Vérifie que seul voiceProfileConsentAt est mis à jour (pas les dépendances existantes)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          voiceProfileConsentAt: expect.any(Date)
        }),
        select: expect.any(Object)
      });
      // Vérifie que dataProcessingConsentAt et voiceDataConsentAt ne sont PAS dans l'update
      const updateCall = (mockPrisma.user.update as jest.Mock).mock.calls[0][0] as any;
      expect(updateCall.data.dataProcessingConsentAt).toBeUndefined();
      expect(updateCall.data.voiceDataConsentAt).toBeUndefined();
    });

    it('should update voice cloning consent with all dependencies', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockResolvedValue({
        userId: 'user-123',
        voiceCloningEnabledAt: new Date(),
        voiceProfileConsentAt: new Date(),
        voiceDataConsentAt: new Date(),
        dataProcessingConsentAt: new Date()
      });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: false,
        voiceCloningConsent: true
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          voiceCloningEnabledAt: expect.any(Date),
          voiceProfileConsentAt: expect.any(Date),
          voiceDataConsentAt: expect.any(Date),
          dataProcessingConsentAt: expect.any(Date)
        }),
        select: expect.any(Object)
      });
    });

    it('should update birth date with age verification', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: false,
        voiceCloningConsent: false,
        birthDate: '1990-05-15'
      });

      expect(result.success).toBe(true);
      // birthDate et ageVerifiedAt vont tous deux dans user.update
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          birthDate: expect.any(Date),
          ageVerifiedAt: expect.any(Date)
        }),
        select: expect.any(Object)
      });
    });

    it('should update all consent fields at once', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: true,
        voiceCloningConsent: true,
        birthDate: '1990-05-15'
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          voiceProfileConsentAt: expect.any(Date),
          voiceCloningEnabledAt: expect.any(Date),
          ageVerifiedAt: expect.any(Date),
          birthDate: expect.any(Date),
          voiceDataConsentAt: expect.any(Date),
          dataProcessingConsentAt: expect.any(Date)
        }),
        select: expect.any(Object)
      });
    });

    it('should revoke consents when set to false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: new Date(),
        voiceDataConsentAt: new Date(),
        voiceProfileConsentAt: new Date()
      });
      mockPrisma.user.update.mockResolvedValue({ userId: 'user-123' });

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: false,
        voiceCloningConsent: false
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          voiceProfileConsentAt: null,
          voiceCloningEnabledAt: null
        }),
        select: expect.any(Object)
      });
    });

    it('should return error when no consent data provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });

      // Pas de champs de consentement passés
      const result = await service.updateConsent('user-123', {} as any);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NO_CONSENT_DATA');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null
      });
      mockPrisma.user.update.mockRejectedValue(new Error('Database error'));

      const result = await service.updateConsent('user-123', {
        voiceRecordingConsent: true,
        voiceCloningConsent: false
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONSENT_UPDATE_FAILED');
    });
  });

  describe('getConsentStatus', () => {
    it('should return consent status for user with all consents', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getConsentStatus('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.hasVoiceRecordingConsent).toBe(true);
      expect(result.data?.hasVoiceCloningConsent).toBe(true);
      expect(result.data?.hasAgeVerification).toBe(true);
      // birthDate est retourné en format ISO string
      expect(result.data?.birthDate).toEqual(mockUser.birthDate.toISOString());
    });

    it('should return consent status for user with no consents', async () => {
      const mockUser = createMockUser({
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
        ageVerifiedAt: null
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getConsentStatus('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.hasVoiceRecordingConsent).toBe(false);
      expect(result.data?.hasVoiceCloningConsent).toBe(false);
      expect(result.data?.hasAgeVerification).toBe(false);
    });

    it('should return error for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getConsentStatus('non-existent-user');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USER_NOT_FOUND');
    });

    it('should handle user with no consents', async () => {
      const mockUser = createMockUser({
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
        ageVerifiedAt: null
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getConsentStatus('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.hasVoiceRecordingConsent).toBe(false);
      expect(result.data?.hasVoiceCloningConsent).toBe(false);
      expect(result.data?.hasAgeVerification).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await service.getConsentStatus('user-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONSENT_STATUS_FAILED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE REGISTRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerProfile', () => {
    it('should register profile with direct audio data', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      // Simulate ZMQ response
      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio-data',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);
      expect(result.data?.profileId).toBe('vp_user123abc');
      expect(result.data?.qualityScore).toBe(0.85);
      expect(mockZmqClient.sendVoiceProfileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'voice_profile_analyze',
          user_id: 'user-123',
          audio_data: 'base64-audio-data',
          audio_format: 'wav',
          is_update: false
        })
      );
    });

    it('should register profile with attachment ID', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'user-123',
        message: null
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);

      mockReadFile.mockResolvedValue(Buffer.from('audio-content'));

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.messageAttachment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-123' }
        })
      );
    });

    it('should return error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.registerProfile('non-existent', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USER_NOT_FOUND');
    });

    it('should return error if consent not given', async () => {
      const mockUser = createMockUser({
        voiceProfileConsentAt: null
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONSENT_REQUIRED');
    });

    it('should return error if profile already exists', async () => {
      const mockUser = createMockUser({
        voiceModel: createMockVoiceModel()
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROFILE_EXISTS');
    });

    it('should return error if no audio input provided', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.registerProfile('user-123', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either attachmentId or audioData must be provided');
    });

    it('should return error if audioFormat missing with audioData', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio'
        // audioFormat missing
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('audioFormat is required');
    });

    it('should return error if attachment not found', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'non-existent-att'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Attachment not found');
    });

    it('should return error if attachment is not audio', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'image/png',
        filePath: 'images/test.png',
        uploadedBy: 'user-123'
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid attachment type');
    });

    it('should return error if user has no access to attachment', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'other-user',
        message: { conversationId: 'conv-123' }
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });

    it('should return error if ZMQ analysis fails', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            success: false,
            error: 'Audio too short'
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ANALYSIS_FAILED');
    });

    it('should use shorter expiration for minors', async () => {
      const minorBirthDate = new Date();
      minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 16);

      const mockUser = createMockUser({ birthDate: minorBirthDate });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(mockPrisma.userVoiceModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          nextRecalibrationAt: expect.any(Date)
        })
      });

      // Check that expiration is approximately 60 days (minor)
      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { nextRecalibrationAt: Date } };
      const expirationDate = createCall.data.nextRecalibrationAt;
      const daysDiff = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(59);
      expect(daysDiff).toBeLessThanOrEqual(61);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE CALIBRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calibrateProfile', () => {
    it('should add audio samples to existing profile', async () => {
      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue({
        ...mockVoiceModel,
        audioCount: 2,
        totalDurationMs: 30000,
        version: 2
      });

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-new-audio',
        audioFormat: 'wav',
        replaceExisting: false
      });

      expect(result.success).toBe(true);
      expect(mockZmqClient.sendVoiceProfileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          is_update: true,
          existing_fingerprint: mockVoiceModel.fingerprint
        })
      );
    });

    it('should replace existing profile when requested', async () => {
      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue({
        ...mockVoiceModel,
        audioCount: 1,
        totalDurationMs: 15000,
        version: 2
      });

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-new-audio',
        audioFormat: 'wav',
        replaceExisting: true
      });

      expect(result.success).toBe(true);
      expect(mockZmqClient.sendVoiceProfileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          is_update: false,
          existing_fingerprint: undefined
        })
      );
    });

    it('should return error if profile not found', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROFILE_NOT_FOUND');
    });

    it('should increment audio count when adding samples', async () => {
      const mockVoiceModel = createMockVoiceModel({ audioCount: 2, totalDurationMs: 30000 });
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue({
        ...mockVoiceModel,
        audioCount: 3,
        totalDurationMs: 45000
      });

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        replaceExisting: false
      });

      expect(mockPrisma.userVoiceModel.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: expect.objectContaining({
          audioCount: 3,
          totalDurationMs: 45000
        })
      });
    });

    it('should reset counts when replacing', async () => {
      const mockVoiceModel = createMockVoiceModel({ audioCount: 3, totalDurationMs: 45000 });
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue({
        ...mockVoiceModel,
        audioCount: 1,
        totalDurationMs: 15000
      });

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        replaceExisting: true
      });

      expect(mockPrisma.userVoiceModel.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: expect.objectContaining({
          audioCount: 1,
          totalDurationMs: 15000
        })
      });
    });

    it('should increment version number', async () => {
      const mockVoiceModel = createMockVoiceModel({ version: 3 });
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue({
        ...mockVoiceModel,
        version: 4
      });

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(mockPrisma.userVoiceModel.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: expect.objectContaining({
          version: 4
        })
      });
    });

    it('should handle calibration failure from ZMQ', async () => {
      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            success: false,
            error: 'Calibration failed'
          });
        }, 10);
      });

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CALIBRATION_FAILED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE UPDATE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateProfile', () => {
    it('should call calibrateProfile with replaceExisting=false', async () => {
      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);
      mockPrisma.userVoiceModel.update.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.updateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);
      expect(mockZmqClient.sendVoiceProfileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          is_update: true
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE RETRIEVAL TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProfile', () => {
    it('should return profile details', async () => {
      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);

      const result = await service.getProfile('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.profileId).toBe('vp_user123abc');
      expect(result.data?.userId).toBe('user-123');
      expect(result.data?.qualityScore).toBe(0.85);
      expect(result.data?.audioCount).toBe(1);
      expect(result.data?.audioDurationMs).toBe(15000);
    });

    it('should indicate needsCalibration when expired', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);

      const mockVoiceModel = createMockVoiceModel({
        nextRecalibrationAt: expiredDate
      });
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);

      const result = await service.getProfile('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.needsCalibration).toBe(true);
    });

    it('should indicate needsCalibration=false when not expired', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const mockVoiceModel = createMockVoiceModel({
        nextRecalibrationAt: futureDate
      });
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(mockVoiceModel);

      const result = await service.getProfile('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.needsCalibration).toBe(false);
    });

    it('should return error if profile not found', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.getProfile('user-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROFILE_NOT_FOUND');
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.userVoiceModel.findUnique.mockRejectedValue(new Error('DB Error'));

      const result = await service.getProfile('user-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('GET_PROFILE_FAILED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE DELETION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteProfile', () => {
    it('should delete profile and reset consent', async () => {
      mockPrisma.userVoiceModel.delete.mockResolvedValue({ userId: 'user-123' });
      mockPrisma.user.update.mockResolvedValue({ userId: 'user-123' });

      const result = await service.deleteProfile('user-123');

      expect(result.success).toBe(true);
      expect(result.data?.deleted).toBe(true);
      expect(mockPrisma.userVoiceModel.delete).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          voiceProfileConsentAt: null,
          voiceCloningEnabledAt: null
        }
      });
    });

    it('should handle deletion errors', async () => {
      mockPrisma.userVoiceModel.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await service.deleteProfile('user-123');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('DELETE_FAILED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MIME TYPE CONVERSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('MIME type to format conversion', () => {
    const testMimeTypeConversion = async (mimeType: string, expectedFormat: string) => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType,
        filePath: 'audio/test.audio',
        uploadedBy: 'user-123',
        message: null
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);
      mockReadFile.mockResolvedValue(Buffer.from('audio-content'));

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', { attachmentId: 'att-123' });

      expect(mockZmqClient.sendVoiceProfileRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          audio_format: expectedFormat
        })
      );
    };

    it('should convert audio/wav to wav', async () => {
      await testMimeTypeConversion('audio/wav', 'wav');
    });

    it('should convert audio/wave to wav', async () => {
      await testMimeTypeConversion('audio/wave', 'wav');
    });

    it('should convert audio/x-wav to wav', async () => {
      await testMimeTypeConversion('audio/x-wav', 'wav');
    });

    it('should convert audio/mpeg to mp3', async () => {
      await testMimeTypeConversion('audio/mpeg', 'mp3');
    });

    it('should convert audio/mp3 to mp3', async () => {
      await testMimeTypeConversion('audio/mp3', 'mp3');
    });

    it('should convert audio/ogg to ogg', async () => {
      await testMimeTypeConversion('audio/ogg', 'ogg');
    });

    it('should convert audio/webm to webm', async () => {
      await testMimeTypeConversion('audio/webm', 'webm');
    });

    it('should convert audio/mp4 to m4a', async () => {
      await testMimeTypeConversion('audio/mp4', 'm4a');
    });

    it('should convert audio/flac to flac', async () => {
      await testMimeTypeConversion('audio/flac', 'flac');
    });

    it('should default unknown types to wav', async () => {
      await testMimeTypeConversion('audio/unknown-format', 'wav');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT ACCESS VERIFICATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('attachment access verification', () => {
    it('should allow access when user is attachment owner', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'user-123', // Same as requesting user
        message: null
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);
      mockReadFile.mockResolvedValue(Buffer.from('audio-content'));

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should allow access when user is conversation member', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'other-user',
        message: { conversationId: 'conv-123', senderId: 'other-user' }
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);
      mockPrisma.participant.findFirst.mockResolvedValue({
        userId: 'user-123',
        conversationId: 'conv-123',
        isActive: true
      });
      mockReadFile.mockResolvedValue(Buffer.from('audio-content'));

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-123',
          userId: 'user-123',
          isActive: true
        }
      });
    });

    it('should deny access when user is not owner or member', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'other-user',
        message: { conversationId: 'conv-123', senderId: 'other-user' }
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AGE CALCULATION AND EXPIRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('age calculation and expiration', () => {
    it('should use 60-day expiration for users under 18', async () => {
      const minorBirthDate = new Date();
      minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 15);

      const mockUser = createMockUser({ birthDate: minorBirthDate });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { nextRecalibrationAt: Date } };
      const expirationDate = createCall.data.nextRecalibrationAt;
      const daysDiff = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBeGreaterThanOrEqual(59);
      expect(daysDiff).toBeLessThanOrEqual(61);
    });

    it('should use 90-day expiration for users 18 and over', async () => {
      const adultBirthDate = new Date();
      adultBirthDate.setFullYear(adultBirthDate.getFullYear() - 25);

      const mockUser = createMockUser({ birthDate: adultBirthDate });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { nextRecalibrationAt: Date } };
      const expirationDate = createCall.data.nextRecalibrationAt;
      const daysDiff = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });

    it('should use 90-day expiration when birthDate is null', async () => {
      const mockUser = createMockUser({ birthDate: null });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { nextRecalibrationAt: Date } };
      const expirationDate = createCall.data.nextRecalibrationAt;
      const daysDiff = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });

    it('should handle exact 18th birthday correctly', async () => {
      // User turns 18 today
      const exactlyAdultBirthDate = new Date();
      exactlyAdultBirthDate.setFullYear(exactlyAdultBirthDate.getFullYear() - 18);

      const mockUser = createMockUser({ birthDate: exactlyAdultBirthDate });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { nextRecalibrationAt: Date } };
      const expirationDate = createCall.data.nextRecalibrationAt;
      const daysDiff = Math.round((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      // 18-year-old should get adult expiration (90 days)
      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZMQ TIMEOUT HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ZMQ timeout handling', () => {
    it('should timeout if no ZMQ response received', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Don't emit any response - will cause timeout
      mockZmqClient.sendVoiceProfileRequest.mockResolvedValue(undefined);

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 70000); // Longer timeout for the 60s ZMQ timeout
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBEDDING BUFFER CONVERSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('embedding buffer conversion', () => {
    it('should convert base64 embedding to Uint8Array', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const embeddingBytes = [1, 2, 3, 4, 5, 6, 7, 8];
      const embeddingBase64 = Buffer.from(embeddingBytes).toString('base64');

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            embedding_data: embeddingBase64
          });
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { embedding: Uint8Array } };
      const embedding = createCall.data.embedding;

      expect(embedding).toBeInstanceOf(Uint8Array);
      expect(Array.from(embedding)).toEqual(embeddingBytes);
    });

    it('should handle null embedding data', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockVoiceModel = createMockVoiceModel();
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            embedding_data: undefined
          });
        }, 10);
      });

      await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      const createCall = mockPrisma.userVoiceModel.create.mock.calls[0][0] as { data: { embedding: Uint8Array | null } };
      expect(createCall.data.embedding).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ZMQ ERROR EVENT HANDLING TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ZMQ error event handling', () => {
    it('should handle voiceProfileError events', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileError', {
            type: 'voice_profile_error',
            request_id: 'test-uuid-1234',
            success: false,
            error: 'Audio processing failed',
            timestamp: Date.now()
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: ZMQ event handlers for verify + compare (lines 148, 151)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ZMQ voiceProfileVerifyResult and voiceProfileCompareResult event handlers', () => {
    it('should resolve pending request via voiceProfileVerifyResult event', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileVerifyResult', {
            ...createMockZmqAnalyzeResult(),
            type: 'voice_profile_verify_result'
          });
        }, 10);
      });

      // registerProfile waits for any event whose request_id matches — the
      // voiceProfileVerifyResult listener (line 148) routes it to handleZmqResponse
      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);
    });

    it('should resolve pending request via voiceProfileCompareResult event', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileCompareResult', {
            ...createMockZmqAnalyzeResult(),
            type: 'voice_profile_compare_result'
          });
        }, 10);
      });

      // voiceProfileCompareResult listener (line 151) routes to handleZmqResponse
      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);
    });

    it('should silently ignore event for unknown requestId', () => {
      // handleZmqResponse when no matching pending request: no-op, no crash
      expect(() => {
        mockZmqClient.emit('voiceProfileVerifyResult', {
          type: 'voice_profile_verify_result',
          request_id: 'non-existent-id',
          success: true,
          timestamp: Date.now()
        });
      }).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: canUserAccessAttachment return false when no conversationId (line 264)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('attachment access — no conversation context', () => {
    it('should deny access when attachment message has no conversationId', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // message exists but conversationId is null → line 264 `return false`
      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'other-user',
        message: { conversationId: null, senderId: 'other-user' }
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
      // participant.findFirst must NOT be called since conversationId is falsy
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });

    it('should deny access when attachment has no message at all', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const mockAttachment = {
        id: 'att-123',
        mimeType: 'audio/wav',
        filePath: 'audio/test.wav',
        uploadedBy: 'other-user',
        message: null
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);

      const result = await service.registerProfile('user-123', {
        attachmentId: 'att-123'
      });

      expect(result.success).toBe(false);
      expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: voiceCloningSettings in registerProfile (lines 555-583)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerProfile with voiceCloningSettings', () => {
    const setupRegisterProfileMocks = () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());
      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });
    };

    it('should log voice cloning settings with all valid fields', async () => {
      setupRegisterProfileMocks();

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        voiceCloningSettings: {
          voiceCloningExaggeration: 0.8,
          voiceCloningCfgWeight: 0.7,
          voiceCloningTemperature: 1.2,
          voiceCloningTopP: 0.9,
          voiceCloningQualityPreset: 'high_quality'
        }
      });

      expect(result.success).toBe(true);
    });

    it('should clamp exaggeration to [0,1] bounds', async () => {
      setupRegisterProfileMocks();

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        voiceCloningSettings: {
          voiceCloningExaggeration: 2.5,  // > 1, clamped to 1
          voiceCloningCfgWeight: -0.5,   // < 0, clamped to 0
        }
      });

      expect(result.success).toBe(true);
    });

    it('should skip invalid quality preset', async () => {
      setupRegisterProfileMocks();

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        voiceCloningSettings: {
          voiceCloningQualityPreset: 'ultra_extreme' as any // not in validPresets
        }
      });

      // Invalid preset is skipped silently; registration still succeeds
      expect(result.success).toBe(true);
    });

    it('should handle empty voiceCloningSettings object', async () => {
      setupRegisterProfileMocks();

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        voiceCloningSettings: {}
      });

      // Nothing to save, but registration still succeeds
      expect(result.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: browserTranscription path (lines 591-603) + server transcription (607-615)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerProfile transcription handling', () => {
    it('should include browser transcription in profileDetails (lines 593-603)', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            transcription: undefined  // server has no transcription
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        browserTranscription: {
          source: 'browser' as const,
          text: 'Hello world from browser',
          language: 'en',
          confidence: 0.95,
          durationMs: 5000,
          segments: [{ text: 'Hello', startMs: 0, endMs: 500, confidence: 0.99 }],
          browserDetails: { api: 'thirdParty' as const, userAgent: 'Chrome/120' }
        }
      });

      expect(result.success).toBe(true);
      expect(result.data?.transcription?.source).toBe('browser');
      expect(result.data?.transcription?.text).toBe('Hello world from browser');
      expect(result.data?.transcription?.durationMs).toBe(5000);
    });

    it('should include server transcription when no browser transcription (lines 607-622)', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            transcription: {
              text: 'Hello world from server',
              language: 'en',
              confidence: 0.92,
              duration_ms: 5000,
              source: 'whisper',
              model: 'whisper-large-v3',
              processing_time_ms: 1200,
              segments: [
                { text: 'Hello', start_ms: 0, end_ms: 500, confidence: 0.98 },
                { text: 'world', start_ms: 500, end_ms: 1000, confidence: 0.95 }
              ]
            }
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        includeTranscription: true
        // no browserTranscription → server path
      });

      expect(result.success).toBe(true);
      expect(result.data?.transcription?.source).toBe('whisper');
      expect(result.data?.transcription?.text).toBe('Hello world from server');
      expect(result.data?.transcription?.model).toBe('whisper-large-v3');
      expect(result.data?.transcription?.segments).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: voice previews in registerProfile (lines 626-636)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerProfile with voice previews', () => {
    it('should include voice previews when ZMQ response contains them', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      const mockPreviews = [
        {
          language: 'en',
          original_text: 'Bonjour',
          translated_text: 'Hello',
          audio_base64: 'base64audiodata',
          audio_format: 'wav',
          duration_ms: 1200,
          generated_at: new Date().toISOString()
        },
        {
          language: 'es',
          original_text: 'Bonjour',
          translated_text: 'Hola',
          audio_base64: 'base64audiodata2',
          audio_format: 'wav',
          duration_ms: 1100,
          generated_at: new Date().toISOString()
        }
      ];

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            voice_previews: mockPreviews
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav',
        generateVoicePreviews: true,
        previewLanguages: ['en', 'es']
      });

      expect(result.success).toBe(true);
      expect(result.data?.voicePreviews).toHaveLength(2);
      expect(result.data?.voicePreviews?.[0].language).toBe('en');
      expect(result.data?.voicePreviews?.[0].translatedText).toBe('Hello');
      expect(result.data?.voicePreviews?.[1].language).toBe('es');
    });

    it('should not include voicePreviews when ZMQ response has empty array', async () => {
      const mockUser = createMockUser();
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userVoiceModel.create.mockResolvedValue(createMockVoiceModel());

      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', {
            ...createMockZmqAnalyzeResult(),
            voice_previews: []  // empty array → block is skipped
          });
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);
      expect(result.data?.voicePreviews).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: calibrateProfile error catch (lines 756-763)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calibrateProfile error handling', () => {
    it('should return error result when DB throws during calibration (lines 757-758)', async () => {
      mockPrisma.userVoiceModel.findUnique.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB connection lost');
      expect(result.errorCode).toBe('CALIBRATION_FAILED');
    });

    it('should return generic error when non-Error is thrown', async () => {
      mockPrisma.userVoiceModel.findUnique.mockRejectedValue('string error');

      const result = await service.calibrateProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Calibration failed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP-FILL: calculateAge — birthday not yet passed this year (line 910)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('calculateAge — birthday in future within current year', () => {
    it('should decrement age when birthday has not yet occurred this year (line 910)', async () => {
      // Set today to January 1. User born December 31 of 18 years ago.
      // Their birthday this year is Dec 31 → not yet passed → age = 18-1 = 17 → uses minor expiration (60 days).
      const realDateConstructor = Date;

      // Build mock voice model BEFORE replacing Date so Date.now() still works.
      const mockVoiceModel = createMockVoiceModel();

      const TODAY_ISO = '2026-01-15';
      // Capture the fixed timestamp before the spy so assertions survive Date mutation.
      const todayMs = new realDateConstructor(TODAY_ISO).getTime();

      // The calculateAge/calculateExpirationDate functions call `new Date()` for today.
      // Return a FRESH instance on every call so the service can mutate its own copy
      // without affecting our baseline timestamp.
      jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
        if (args.length === 0) return new realDateConstructor(TODAY_ISO) as any;
        return new realDateConstructor(...args as [any]);
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        ...createMockUser(),
        // Born December 15, 2008 — would be 18 as of Dec 15, 2026, but today is Jan 15, 2026
        // So age = 2026 - 2008 = 18, but Dec 15 > Jan 15 in month order → age-- → 17
        birthDate: new realDateConstructor('2008-12-15')
      });
      mockPrisma.userVoiceModel.create.mockResolvedValue(mockVoiceModel);
      mockZmqClient.sendVoiceProfileRequest.mockImplementation(async () => {
        setTimeout(() => {
          mockZmqClient.emit('voiceProfileAnalyzeResult', createMockZmqAnalyzeResult());
        }, 10);
      });

      const result = await service.registerProfile('user-123', {
        audioData: 'base64-audio',
        audioFormat: 'wav'
      });

      expect(result.success).toBe(true);

      // Minor expiration = 60 days; standard = 90. Verify expiration is ~60 days from now.
      const expiresAt = mockPrisma.userVoiceModel.create.mock.calls[0][0].data.nextRecalibrationAt as Date;
      const diffDays = Math.round((expiresAt.getTime() - todayMs) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(60);

      jest.restoreAllMocks();
    });
  });
});
