/**
 * End-to-End tests for /me/preferences flow
 * Tests complete user journey through all preference types
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import meRoutes from '../../routes/me';

describe('E2E: User Preferences Flow', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let authToken: string;
  const userId = 'test-user-123';

  beforeAll(async () => {
    // Setup Fastify app
    app = Fastify({ logger: false });

    // Setup Prisma
    prisma = new PrismaClient();
    await prisma.$connect();
    app.decorate('prisma', prisma);

    // Setup auth middleware
    app.decorate('authenticate', async (request: any, reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.status(401).send({ success: false, message: 'Missing auth' });
        }

        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, 'test-secret');

        request.authContext = {
          isAuthenticated: true,
          registeredUser: true,
          userId: (decoded as any).userId,
          isAnonymous: false
        };
      } catch (error) {
        return reply.status(401).send({ success: false, message: 'Invalid token' });
      }
    });

    // Register routes
    await app.register(meRoutes, { prefix: '/me' });

    // Generate test token
    authToken = jwt.sign({ userId }, 'test-secret', { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.userPreference.deleteMany({ where: { userId } });
    await prisma.userFeature.deleteMany({ where: { userId } });

    await prisma.$disconnect();
    await app.close();
  });

  describe('Complete User Journey', () => {
    it('should complete full preferences setup flow', async () => {
      // Step 1: Get root /me endpoint
      const meResponse = await app.inject({
        method: 'GET',
        url: '/me',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      // Note: /me endpoint might fail if user doesn't exist in DB
      // In real scenario, user would be created during registration

      // Step 2: Get available preference endpoints
      const endpointsResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(endpointsResponse.statusCode).toBe(200);
      const endpoints = JSON.parse(endpointsResponse.body);
      expect(endpoints.data.endpoints).toHaveLength(5);

      // Step 3: Setup notification preferences
      const notifSetupResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          pushEnabled: true,
          emailEnabled: false,
          soundEnabled: true,
          newMessageEnabled: true,
          dndEnabled: true,
          dndStartTime: '22:00',
          dndEndTime: '08:00'
        }
      });

      expect(notifSetupResponse.statusCode).toBe(200);
      const notifData = JSON.parse(notifSetupResponse.body);
      expect(notifData.data.pushEnabled).toBe(true);
      expect(notifData.data.dndEnabled).toBe(true);

      // Step 4: Get notification preferences to verify
      const notifGetResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(notifGetResponse.statusCode).toBe(200);
      const notifStored = JSON.parse(notifGetResponse.body);
      expect(notifStored.data.isDefault).toBe(false);
      expect(notifStored.data.dndStartTime).toBe('22:00');

      // Step 5: Partially update notification preferences
      const notifUpdateResponse = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          emailEnabled: true // Only update this field
        }
      });

      expect(notifUpdateResponse.statusCode).toBe(200);
      const notifUpdated = JSON.parse(notifUpdateResponse.body);
      expect(notifUpdated.data.emailEnabled).toBe(true);
      expect(notifUpdated.data.pushEnabled).toBe(true); // Unchanged

      // Step 6: Setup theme preferences
      const themeSetupResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/theme',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          theme: 'dark',
          fontFamily: 'inter',
          fontSize: 'large',
          compactMode: true
        }
      });

      expect(themeSetupResponse.statusCode).toBe(200);
      const themeData = JSON.parse(themeSetupResponse.body);
      expect(themeData.data.theme).toBe('dark');
      expect(themeData.data.compactMode).toBe(true);

      // Step 7: Setup privacy preferences
      const privacySetupResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/privacy',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          showOnlineStatus: false,
          showLastSeen: false,
          showReadReceipts: true,
          allowContactRequests: true
        }
      });

      expect(privacySetupResponse.statusCode).toBe(200);
      const privacyData = JSON.parse(privacySetupResponse.body);
      expect(privacyData.data.showOnlineStatus).toBe(false);
      expect(privacyData.data.showReadReceipts).toBe(true);

      // Step 8: Reset notification preferences
      const notifResetResponse = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(notifResetResponse.statusCode).toBe(200);

      // Step 9: Verify reset worked
      const notifAfterResetResponse = await app.inject({
        method: 'GET',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect(notifAfterResetResponse.statusCode).toBe(200);
      const notifAfterReset = JSON.parse(notifAfterResetResponse.body);
      expect(notifAfterReset.data.isDefault).toBe(true);
      expect(notifAfterReset.data.pushEnabled).toBe(true); // Default value
    });

    it('should handle validation errors correctly', async () => {
      // Invalid DND time format
      const invalidDndResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/notifications',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          dndStartTime: '25:99' // Invalid
        }
      });

      expect(invalidDndResponse.statusCode).toBe(400);
      const error = JSON.parse(invalidDndResponse.body);
      expect(error.success).toBe(false);
      expect(error.message).toContain('Invalid');

      // Invalid theme
      const invalidThemeResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/theme',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          theme: 'rainbow' // Not a valid theme
        }
      });

      expect(invalidThemeResponse.statusCode).toBe(400);

      // Invalid font family
      const invalidFontResponse = await app.inject({
        method: 'PUT',
        url: '/me/preferences/theme',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          fontFamily: 'comic-sans-ms' // Not in allowed list
        }
      });

      expect(invalidFontResponse.statusCode).toBe(400);
    });

    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        '/me/preferences/notifications',
        '/me/preferences/encryption',
        '/me/preferences/theme',
        '/me/preferences/languages',
        '/me/preferences/privacy'
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint
          // No authorization header
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
      }
    });

    it('should support concurrent preference updates', async () => {
      // Simulate multiple clients updating different preferences simultaneously
      const updates = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/notifications',
          headers: { authorization: `Bearer ${authToken}` },
          payload: { pushEnabled: false }
        }),
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/theme',
          headers: { authorization: `Bearer ${authToken}` },
          payload: { theme: 'light' }
        }),
        app.inject({
          method: 'PATCH',
          url: '/me/preferences/privacy',
          headers: { authorization: `Bearer ${authToken}` },
          payload: { showOnlineStatus: true }
        })
      ]);

      // All should succeed
      updates.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });

      // Verify all updates persisted
      const notifCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/notifications',
        headers: { authorization: `Bearer ${authToken}` }
      });
      expect(JSON.parse(notifCheck.body).data.pushEnabled).toBe(false);

      const themeCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/theme',
        headers: { authorization: `Bearer ${authToken}` }
      });
      expect(JSON.parse(themeCheck.body).data.theme).toBe('light');

      const privacyCheck = await app.inject({
        method: 'GET',
        url: '/me/preferences/privacy',
        headers: { authorization: `Bearer ${authToken}` }
      });
      expect(JSON.parse(privacyCheck.body).data.showOnlineStatus).toBe(true);
    });
  });
});
