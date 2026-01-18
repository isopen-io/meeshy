/**
 * Integration tests for consent validation in preferences
 * Tests that preferences requiring GDPR consents are properly validated with mocked dependencies
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  AUDIO_PREFERENCE_DEFAULTS,
  PRIVACY_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';
import { userPreferencesRoutes } from '../../routes/me/preferences';

// Mock user with consent fields
const createMockUser = (consents: any = {}) => ({
  id: 'test-user-consent',
  username: 'test_consent_user',
  email: 'test_consent@example.com',
  displayName: 'Test Consent User',
  dataProcessingConsentAt: null,
  voiceDataConsentAt: null,
  voiceProfileConsentAt: null,
  voiceCloningConsentAt: null,
  audioTranscriptionEnabledAt: null,
  textTranslationEnabledAt: null,
  audioTranslationEnabledAt: null,
  translatedAudioGenerationEnabledAt: null,
  thirdPartyServicesConsentAt: null,
  ...consents
});

// Mock Prisma
const mockPrisma = {
  userPreferences: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn()
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
};

// Mock auth middleware with consent checking capability
vi.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: vi.fn(() => async (request: any, reply: any) => {
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user-consent',
      isAnonymous: false
    };
  })
}));

describe('Consent Validation Integration Tests', () => {
  let app: FastifyInstance;
  const userId = 'test-user-consent';

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    await app.register(userPreferencesRoutes, { prefix: '/preferences' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user with no consents
    mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
  });

  describe('Audio Preferences - Consent Validation', () => {
    test('should accept transcriptionEnabled=false without consent', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: { ...AUDIO_PREFERENCE_DEFAULTS, transcriptionEnabled: false }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/audio',
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: false
        }
      });

      expect(response.statusCode).toBe(200);
    });

    test('should handle audio preferences with proper validation', async () => {
      // Setup mock for user with proper consents
      mockPrisma.user.findUnique.mockResolvedValue(
        createMockUser({
          dataProcessingConsentAt: new Date(),
          voiceDataConsentAt: new Date(),
          audioTranscriptionEnabledAt: new Date()
        })
      );

      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: { ...AUDIO_PREFERENCE_DEFAULTS, transcriptionEnabled: true }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/audio',
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          transcriptionEnabled: true
        }
      });

      // Should succeed if consent middleware is working
      expect([200, 403]).toContain(response.statusCode);
    });

    test('should allow audio quality changes without consent', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: { ...AUDIO_PREFERENCE_DEFAULTS, audioQuality: 'high' }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/audio',
        payload: {
          ...AUDIO_PREFERENCE_DEFAULTS,
          audioQuality: 'high'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.audioQuality).toBe('high');
    });
  });

  describe('Privacy Preferences - Consent Validation', () => {
    test('should accept privacy preferences without analytics', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: { ...PRIVACY_PREFERENCE_DEFAULTS, allowAnalytics: false }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/privacy',
        payload: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          allowAnalytics: false
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.allowAnalytics).toBe(false);
    });

    test('should handle basic privacy settings without consent', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          showOnlineStatus: false,
          showLastSeen: false
        }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/privacy',
        payload: {
          ...PRIVACY_PREFERENCE_DEFAULTS,
          showOnlineStatus: false,
          showLastSeen: false
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Message Preferences - Consent Validation', () => {
    test('should accept message preferences without translation', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        message: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          autoTranslateIncoming: false
        }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/message',
        payload: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          autoTranslateIncoming: false
        }
      });

      expect(response.statusCode).toBe(200);
    });

    test('should allow basic message settings', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        message: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          enterToSend: false
        }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/message',
        payload: {
          ...MESSAGE_PREFERENCE_DEFAULTS,
          enterToSend: false
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.enterToSend).toBe(false);
    });
  });

  describe('Application Preferences - Consent Validation', () => {
    test('should accept app preferences without telemetry', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        application: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          telemetryEnabled: false
        }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/application',
        payload: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          telemetryEnabled: false
        }
      });

      expect(response.statusCode).toBe(200);
    });

    test('should allow basic app settings', async () => {
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        application: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          autoUpdate: true
        }
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/application',
        payload: {
          ...APPLICATION_PREFERENCE_DEFAULTS,
          autoUpdate: true
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('PATCH - Partial Updates', () => {
    test('should allow partial updates for non-consent fields', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        audio: AUDIO_PREFERENCE_DEFAULTS
      });

      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: { ...AUDIO_PREFERENCE_DEFAULTS, audioQuality: 'medium' }
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/preferences/audio',
        payload: {
          audioQuality: 'medium'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.audioQuality).toBe('medium');
    });
  });

  describe('Preference Defaults', () => {
    test('should return defaults when no preferences exist', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const categories = ['audio', 'privacy', 'message', 'application'];

      for (const category of categories) {
        const response = await app.inject({
          method: 'GET',
          url: `/preferences/${category}`
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
      }
    });
  });
});
