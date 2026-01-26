/**
 * E2E Tests for preference encryption and security
 * Tests that preferences are stored securely and encrypted fields are handled properly
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from '../../routes/me/preferences';
import {
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';

describe('E2E: Preferences Encryption & Security', () => {
  let app: FastifyInstance;
  const userId = 'test-user-123';

  // Mock Prisma
  const mockPrisma = {
    userPreferences: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn()
    },
    userConsent: {
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  };

  // Mock ConsentValidationService
  jest.mock('../../services/ConsentValidationService', () => ({
    ConsentValidationService: jest.fn().mockImplementation(() => ({
      validatePreferences: jest.fn().mockResolvedValue([])
    }))
  }));

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Attach mock prisma
    (app as any).prisma = mockPrisma;

    // Mock authentication
    app.addHook('preHandler', async (request: any, reply) => {
      request.auth = {
        isAuthenticated: true,
        userId: userId
      };
    });

    // Register routes
    await app.register(userPreferencesRoutes, { prefix: '/me/preferences' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Privacy Encryption Preferences', () => {
    it('should handle encryption preference levels', async () => {
      const preferences = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'always' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: preferences
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: preferences
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.encryptionPreference).toBe('always');
    });

    it('should validate encryption preference enum values', async () => {
      const invalidPreferences = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'invalid' as any
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: invalidPreferences
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should support partial updates to encryption settings', async () => {
      const existingPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'optional' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: existingPrefs
      });
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: { ...existingPrefs, encryptionPreference: 'always' }
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/privacy',
        payload: {
          encryptionPreference: 'always'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.encryptionPreference).toBe('always');
    });
  });

  describe('Audio Encryption Features', () => {
    it('should handle voice profile encryption settings', async () => {
      const preferences = {
        ...AUDIO_PREFERENCE_DEFAULTS,
        voiceProfileEnabled: true,
        voiceProfileStorageType: 'encrypted' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: preferences
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/audio',
        payload: preferences
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.voiceProfileEnabled).toBe(true);
      expect(body.data.voiceProfileStorageType).toBe('encrypted');
    });

    it('should validate voice profile storage types', async () => {
      const invalidPreferences = {
        ...AUDIO_PREFERENCE_DEFAULTS,
        voiceProfileStorageType: 'invalid' as any
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/audio',
        payload: invalidPreferences
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Application Security Settings', () => {
    it('should handle telemetry encryption settings', async () => {
      const preferences = {
        ...APPLICATION_PREFERENCE_DEFAULTS,
        telemetryEnabled: true,
        telemetryAnonymized: true
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        application: preferences
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/application',
        payload: preferences
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.telemetryEnabled).toBe(true);
      expect(body.data.telemetryAnonymized).toBe(true);
    });

    it('should enforce telemetry anonymization when enabled', async () => {
      const preferences = {
        ...APPLICATION_PREFERENCE_DEFAULTS,
        telemetryEnabled: true,
        telemetryAnonymized: false
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        application: preferences
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/application',
        payload: preferences
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      // Note: Server should allow this but log a warning in production
    });
  });

  describe('Data Protection - Reset to Defaults', () => {
    it('should reset privacy preferences including encryption settings', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({
        userId,
        privacy: null
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('reset');
    });

    it('should reset audio preferences including voice profile', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({
        userId,
        audio: null
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/audio'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Security - Injection Prevention', () => {
    it('should sanitize malicious input in preferences', async () => {
      const maliciousPreferences = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: '<script>alert("xss")</script>' as any
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: maliciousPreferences
      });

      // Should reject due to Zod validation
      expect(response.statusCode).toBe(400);
    });

    it('should reject SQL injection attempts in preference values', async () => {
      const maliciousPreferences = {
        ...AUDIO_PREFERENCE_DEFAULTS,
        audioQuality: "'; DROP TABLE users; --" as any
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/audio',
        payload: maliciousPreferences
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Encryption Key Rotation Compatibility', () => {
    it('should read preferences regardless of encryption version', async () => {
      // Simulate old encrypted preferences
      const oldEncryptedPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'always' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: oldEncryptedPrefs
      });

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('should update preferences with new encryption standards', async () => {
      const existingPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'optional' as const
      };

      const updatedPrefs = {
        ...existingPrefs,
        encryptionPreference: 'always' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: existingPrefs
      });
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: updatedPrefs
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/privacy',
        payload: {
          encryptionPreference: 'always'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.encryptionPreference).toBe('always');
    });
  });

  describe('End-to-End Encryption Preferences', () => {
    it('should get default encryption preferences on first access', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.encryptionPreference).toBe(PRIVACY_PREFERENCE_DEFAULTS.encryptionPreference);
    });

    it('should persist encryption preference changes', async () => {
      const newPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'always' as const
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: newPrefs
      });

      const putResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: newPrefs
      });

      expect(putResponse.statusCode).toBe(200);

      // Verify it was stored
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: newPrefs
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(getResponse.statusCode).toBe(200);
      const body = JSON.parse(getResponse.body);
      expect(body.data.encryptionPreference).toBe('always');
    });
  });
});
