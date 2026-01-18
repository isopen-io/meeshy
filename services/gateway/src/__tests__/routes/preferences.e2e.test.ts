/**
 * Integration tests for /me/preferences routes
 * Tests CRUD operations for all preference categories with mocked dependencies
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';
import { userPreferencesRoutes } from '../../routes/me/preferences';

// Mock Prisma
const mockPrisma = {
  userPreferences: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn()
  }
};

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: vi.fn(() => async (request: any, reply: any) => {
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user-456',
      isAnonymous: false
    };
  })
}));

describe('/me/preferences API Integration Tests', () => {
  let app: FastifyInstance;
  const userId = 'test-user-456';

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
  });

  describe('GET /preferences', () => {
    test('should return all preferences with defaults', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/preferences'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.privacy).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
      expect(body.data.audio).toEqual(AUDIO_PREFERENCE_DEFAULTS);
    });
  });

  describe('GET /preferences/privacy', () => {
    test('should return defaults when no preferences exist', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual(PRIVACY_PREFERENCE_DEFAULTS);
    });

    test('should return stored preferences when they exist', async () => {
      const customPrivacy = { ...PRIVACY_PREFERENCE_DEFAULTS, showOnlineStatus: false };
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: customPrivacy
      });

      const response = await app.inject({
        method: 'GET',
        url: '/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.showOnlineStatus).toBe(false);
    });
  });

  describe('PUT /preferences/privacy', () => {
    test('should create/update complete preferences', async () => {
      const newPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        showOnlineStatus: false,
        allowContactRequests: false
      };

      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: newPrefs
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/privacy',
        payload: newPrefs
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.showOnlineStatus).toBe(false);
      expect(body.data.allowContactRequests).toBe(false);
    });

    test('should reject invalid data', async () => {
      const invalid = { showOnlineStatus: 'not-a-boolean' };

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/privacy',
        payload: invalid
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('PATCH /preferences/privacy', () => {
    test('should partially update preferences', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId,
        privacy: PRIVACY_PREFERENCE_DEFAULTS
      });

      const updatedPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        showOnlineStatus: false
      };

      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: updatedPrefs
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/preferences/privacy',
        payload: { showOnlineStatus: false }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.showOnlineStatus).toBe(false);
      expect(body.data.showLastSeen).toBe(PRIVACY_PREFERENCE_DEFAULTS.showLastSeen);
    });
  });

  describe('DELETE /preferences/privacy', () => {
    test('should reset to defaults', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({
        userId,
        privacy: null
      });

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/preferences/privacy'
      });

      expect(deleteResponse.statusCode).toBe(200);
      const body = JSON.parse(deleteResponse.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('reset to defaults');
    });
  });

  describe('DELETE /preferences (all)', () => {
    test('should reset all preferences', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({
        userId,
        privacy: null,
        audio: null,
        notification: null
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/preferences'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('All preference categories', () => {
    const categories = [
      'privacy',
      'audio',
      'message',
      'notification',
      'video',
      'document',
      'application'
    ];

    categories.forEach((category) => {
      test(`GET /preferences/${category} should work`, async () => {
        mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

        const response = await app.inject({
          method: 'GET',
          url: `/preferences/${category}`
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
      });
    });
  });

  describe('Validation of defaults', () => {
    test('PRIVACY defaults should be valid', () => {
      expect(PRIVACY_PREFERENCE_DEFAULTS.showOnlineStatus).toBe(true);
      expect(PRIVACY_PREFERENCE_DEFAULTS.allowAnalytics).toBe(true);
    });

    test('AUDIO defaults should be valid', () => {
      expect(AUDIO_PREFERENCE_DEFAULTS.transcriptionEnabled).toBe(true);
      expect(AUDIO_PREFERENCE_DEFAULTS.transcriptionSource).toBe('auto');
    });

    test('NOTIFICATION defaults should be valid', () => {
      expect(NOTIFICATION_PREFERENCE_DEFAULTS.pushEnabled).toBe(true);
      expect(NOTIFICATION_PREFERENCE_DEFAULTS.dndEnabled).toBe(false);
    });
  });
});
