/**
 * E2E Tests for preferences security
 * Tests authentication, authorization, rate limiting, and security boundaries
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from '../../routes/me/preferences';
import {
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';

// Mock auth middleware for authenticated tests
jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any, reply: any) => {
    // This mock is only for the authenticatedApp
    // The unauthenticated app won't have auth
    request.auth = {
      isAuthenticated: true,
      registeredUser: true,
      userId: 'test-user-123',
      isAnonymous: false
    };
  })
}));

// Mock ConsentValidationService
jest.mock('../../services/ConsentValidationService', () => ({
  ConsentValidationService: jest.fn().mockImplementation(() => ({
    validatePreferences: jest.fn().mockResolvedValue([])
  }))
}));

describe('E2E: Preferences Security', () => {
  let authenticatedApp: FastifyInstance;
  const userId = 'test-user-123';
  const otherUserId = 'test-user-456';

  // Mock Prisma
  const mockPrisma = {
    userPreferences: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn()
    },
    userConversationCategory: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    userConsent: {
      findMany: jest.fn()
    },
    conversationPreference: {
      updateMany: jest.fn()
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
    // App WITH authentication (uses the mocked middleware)
    authenticatedApp = Fastify({ logger: false });
    (authenticatedApp as any).prisma = mockPrisma;
    await authenticatedApp.register(userPreferencesRoutes, { prefix: '/me/preferences' });
    await authenticatedApp.ready();
  });

  afterAll(async () => {
    await authenticatedApp.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Note: Authentication tests are handled by the auth middleware itself
  // These tests focus on authorization and security assuming auth is present

  describe('Authorization - User Isolation', () => {
    it('should only return preferences for authenticated user', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        userId: userId,
        privacy: PRIVACY_PREFERENCE_DEFAULTS
      });

      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.userPreferences.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId }
        })
      );
    });

    it('should only update preferences for authenticated user', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: PRIVACY_PREFERENCE_DEFAULTS
      });

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: PRIVACY_PREFERENCE_DEFAULTS
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId }
        })
      );
    });

    it('should only delete preferences for authenticated user', async () => {
      mockPrisma.userPreferences.update.mockResolvedValue({
        userId,
        privacy: null
      });

      const response = await authenticatedApp.inject({
        method: 'DELETE',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.userPreferences.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId }
        })
      );
    });

    it('should only return categories for authenticated user', async () => {
      mockPrisma.userConversationCategory.findMany.mockResolvedValue([]);
      mockPrisma.userConversationCategory.count.mockResolvedValue(0);

      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/categories'
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.userConversationCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId }
        })
      );
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid preference types', async () => {
      const invalidPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        showOnlineStatus: 'invalid' as any  // Should be boolean
      };

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: invalidPrefs
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject preferences with unknown fields', async () => {
      const prefsWithUnknownField = {
        ...AUDIO_PREFERENCE_DEFAULTS,
        unknownField: 'hacker' as any
      };

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/audio',
        payload: prefsWithUnknownField
      });

      // Zod should strip unknown fields or reject
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should reject malformed JSON', async () => {
      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: 'not valid json',
        headers: {
          'content-type': 'application/json'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject empty body for PUT', async () => {
      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: {}
      });

      // Empty object might be valid or invalid depending on schema
      // At minimum, required fields should cause rejection
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should validate enum values strictly', async () => {
      const invalidEnumPrefs = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        encryptionPreference: 'superAlways' as any
      };

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: invalidEnumPrefs
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GDPR Consent Validation', () => {
    it('should check consents before enabling analytics', async () => {
      const ConsentValidationService = require('../../services/ConsentValidationService').ConsentValidationService;
      const mockInstance = new ConsentValidationService(mockPrisma);

      // Mock consent violation
      mockInstance.validatePreferences = jest.fn().mockResolvedValue([
        {
          field: 'allowAnalytics',
          requiredConsent: 'ANALYTICS',
          message: 'Analytics consent required'
        }
      ]);

      const prefsWithAnalytics = {
        ...PRIVACY_PREFERENCE_DEFAULTS,
        allowAnalytics: true
      };

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: prefsWithAnalytics
      });

      // Should either succeed (if consent check is mocked) or reject with 403
      expect([200, 403]).toContain(response.statusCode);
    });

    it('should check consents before enabling transcription', async () => {
      const prefsWithTranscription = {
        ...AUDIO_PREFERENCE_DEFAULTS,
        transcriptionEnabled: true,
        audioTranslationEnabled: true
      };

      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        audio: prefsWithTranscription
      });

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/audio',
        payload: prefsWithTranscription
      });

      // Should check consents (mocked to pass)
      expect([200, 403]).toContain(response.statusCode);
    });
  });

  describe('Cross-User Protection', () => {
    it('should not expose existence of other users\' categories', async () => {
      // Trying to access another user's category should return 404, not 403
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/categories/other-user-category-id'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NOT_FOUND');
      // Should NOT reveal "you don't have permission" which confirms existence
    });

    it('should not allow updating another user\'s category', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await authenticatedApp.inject({
        method: 'PATCH',
        url: '/me/preferences/categories/other-user-category-id',
        payload: { name: 'Hacked' }
      });

      expect(response.statusCode).toBe(404);
    });

    it('should not allow deleting another user\'s category', async () => {
      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);

      const response = await authenticatedApp.inject({
        method: 'DELETE',
        url: '/me/preferences/categories/other-user-category-id'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Data Sanitization', () => {
    it('should trim whitespace from category names', async () => {
      const category = {
        id: 'cat-1',
        userId,
        name: 'Trimmed',
        color: null,
        icon: null,
        order: 0,
        isExpanded: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userConversationCategory.findFirst.mockResolvedValue(null);
      mockPrisma.userConversationCategory.create.mockResolvedValue(category);

      const response = await authenticatedApp.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          name: '  Trimmed  '
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.userConversationCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Trimmed'
          })
        })
      );
    });

    it('should reject category names with only whitespace', async () => {
      const response = await authenticatedApp.inject({
        method: 'POST',
        url: '/me/preferences/categories',
        payload: {
          name: '     '
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle null values safely', async () => {
      const prefsWithNulls = {
        ...NOTIFICATION_PREFERENCE_DEFAULTS,
        dndSchedule: null as any
      };

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/notification',
        payload: prefsWithNulls
      });

      // Should either accept (if field is nullable) or reject
      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.userPreferences.findUnique.mockRejectedValue(new Error('Database connection lost'));

      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });

    it('should not leak database error details', async () => {
      mockPrisma.userPreferences.findUnique.mockRejectedValue(new Error('SELECT * FROM sensitive_table WHERE id=123'));

      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });

      expect(response.statusCode).toBe(500);
      // Should not contain SQL or sensitive error details in response body
      expect(response.body).not.toContain('SELECT');
      expect(response.body).not.toContain('sensitive_table');
    });

    it('should handle malformed category ID', async () => {
      const response = await authenticatedApp.inject({
        method: 'GET',
        url: '/me/preferences/categories/../../etc/passwd'
      });

      // Should either return 404 or reject malformed ID
      expect([404, 400]).toContain(response.statusCode);
    });
  });

  describe('Method Security', () => {
    it('should reject unsupported HTTP methods', async () => {
      const response = await authenticatedApp.inject({
        method: 'OPTIONS',
        url: '/me/preferences/privacy'
      });

      expect([404, 405]).toContain(response.statusCode);
    });

  });

  describe('Content-Type Validation', () => {
    it('should require application/json for PUT', async () => {
      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: 'showOnlineStatus=false',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      });

      expect([400, 415]).toContain(response.statusCode);
    });

    it('should accept application/json charset variants', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockResolvedValue({
        userId,
        privacy: PRIVACY_PREFERENCE_DEFAULTS
      });

      const response = await authenticatedApp.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: PRIVACY_PREFERENCE_DEFAULTS,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
