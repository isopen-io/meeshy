/**
 * Integration tests for /me/preferences flow
 * Tests complete user journey through all preference types with mocked dependencies
 */

import Fastify, { FastifyInstance } from 'fastify';
import meRoutes from '../../routes/me';

// Mock Prisma
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any, reply: any) => {
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
    validatePreferences: jest.fn().mockResolvedValue([]) // No violations by default
  }))
}));

describe('Integration: User Preferences Flow', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  const userId = 'test-user-123';

  beforeAll(async () => {
    // Setup mocked Prisma
    mockPrisma = {
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn()
      },
      userFeature: {
        deleteMany: jest.fn()
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          username: 'testuser',
          email: 'test@example.com',
          displayName: 'Test User',
          avatar: null,
          role: 'user'
        })
      }
    };

    // Setup Fastify app
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);

    // Mock authenticate decorator
    app.decorate('authenticate', async (request: any, reply: any) => {
      request.authContext = {
        isAuthenticated: true,
        registeredUser: true,
        userId,
        isAnonymous: false
      };
    });

    // Register routes
    await app.register(meRoutes, { prefix: '/me' });
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete User Journey', () => {
    it('should complete full preferences setup flow', async () => {
      // Setup mock responses
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
      mockPrisma.userPreferences.upsert.mockImplementation((args: any) => {
        return Promise.resolve({ userId, ...args.create });
      });

      // Step 1: Get all preferences (not available in this test, routes are registered under /preferences)
      // We'll skip this and go directly to specific preference endpoints

      // Step 2: Setup notification preferences
      const notificationData = {
        pushEnabled: true,
        emailEnabled: false,
        soundEnabled: true,
        newMessageEnabled: true,
        dndEnabled: true,
        dndStartTime: '22:00',
        dndEndTime: '08:00'
      };

      // Mock upsert - The factory uses select: { [category]: true }
      // So upsert returns only: { notification: {...} }
      mockPrisma.userPreferences.upsert.mockResolvedValueOnce({
        notification: notificationData
      });

      const notifSetupResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/notification',
        payload: notificationData
      });

      expect(notifSetupResponse.statusCode).toBe(200);
      const notifData = JSON.parse(notifSetupResponse.body);

      // Debug: log the response
      if (!notifData.success || !notifData.data) {
        console.log('Response body:', notifSetupResponse.body);
        console.log('Parsed:', notifData);
      }

      expect(notifData.success).toBe(true);
      expect(notifData.data).toBeDefined();
      expect(notifData.data.pushEnabled).toBe(true);
      expect(notifData.data.dndEnabled).toBe(true);

      // Step 4: Get notification preferences to verify
      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        notification: notificationData
      });

      const notifGetResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences/notification'
      });

      expect(notifGetResponse.statusCode).toBe(200);
      const notifStored = JSON.parse(notifGetResponse.body);
      expect(notifStored.data.dndStartTime).toBe('22:00');

      // Step 5: Partially update notification preferences
      const updatedNotificationData = { ...notificationData, emailEnabled: true };
      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        notification: notificationData
      });
      mockPrisma.userPreferences.upsert.mockResolvedValueOnce({
        userId,
        notification: updatedNotificationData
      });

      const notifUpdateResponse = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/notification',
        payload: {
          emailEnabled: true
        }
      });

      expect(notifUpdateResponse.statusCode).toBe(200);
      const notifUpdated = JSON.parse(notifUpdateResponse.body);
      expect(notifUpdated.data.emailEnabled).toBe(true);
      expect(notifUpdated.data.pushEnabled).toBe(true);

      // Step 6: Setup privacy preferences
      const privacyData = {
        showOnlineStatus: false,
        showLastSeen: false,
        showReadReceipts: true,
        allowContactRequests: true
      };

      mockPrisma.userPreferences.upsert.mockResolvedValueOnce({
        userId,
        privacy: privacyData
      });

      const privacySetupResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        payload: privacyData
      });

      expect(privacySetupResponse.statusCode).toBe(200);
      const privacyDataResp = JSON.parse(privacySetupResponse.body);
      expect(privacyDataResp.data.showOnlineStatus).toBe(false);
      expect(privacyDataResp.data.showReadReceipts).toBe(true);

      // Step 7: Reset notification preferences
      mockPrisma.userPreferences.update.mockResolvedValueOnce({
        userId,
        notification: null
      });

      const notifResetResponse = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/notification'
      });

      expect(notifResetResponse.statusCode).toBe(200);

      // Step 8: Verify reset worked (returns defaults)
      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        notification: null
      });

      const notifAfterResetResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences/notification'
      });

      expect(notifAfterResetResponse.statusCode).toBe(200);
      const notifAfterReset = JSON.parse(notifAfterResetResponse.body);
      expect(notifAfterReset.data.pushEnabled).toBe(true); // Default value
    });

    it('should handle validation errors correctly', async () => {
      // Invalid DND time format
      const invalidDndResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/notification',
        payload: {
          dndStartTime: '25:99' // Invalid
        }
      });

      expect(invalidDndResponse.statusCode).toBe(400);
      const error = JSON.parse(invalidDndResponse.body);
      expect(error.success).toBe(false);
    });

    it('should support concurrent preference updates', async () => {
      // Setup mocks for concurrent updates - mock findUnique to return existing preferences
      mockPrisma.userPreferences.findUnique.mockImplementation(() => {
        return Promise.resolve({
          userId,
          notification: { pushEnabled: true },
          audio: { transcriptionEnabled: true },
          privacy: { showOnlineStatus: false }
        });
      });

      // Mock upsert to return updated values
      mockPrisma.userPreferences.upsert.mockImplementation((args: any) => {
        return Promise.resolve({
          userId,
          ...args.create
        });
      });

      // Simulate multiple clients updating different preferences simultaneously
      const updates = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/notification',
          payload: { pushEnabled: false }
        }),
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/audio',
          payload: { transcriptionEnabled: false }
        }),
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/privacy',
          payload: { showOnlineStatus: true }
        })
      ]);

      // All should succeed
      updates.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });

      // Verify all updates persisted
      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        notification: { pushEnabled: false }
      });
      const notifCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/notification'
      });
      expect(JSON.parse(notifCheck.body).data.pushEnabled).toBe(false);

      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        audio: { transcriptionEnabled: false }
      });
      const audioCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/audio'
      });
      expect(JSON.parse(audioCheck.body).data.transcriptionEnabled).toBe(false);

      mockPrisma.userPreferences.findUnique.mockResolvedValueOnce({
        userId,
        privacy: { showOnlineStatus: true }
      });
      const privacyCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/privacy'
      });
      expect(JSON.parse(privacyCheck.body).data.showOnlineStatus).toBe(true);
    });
  });
});
