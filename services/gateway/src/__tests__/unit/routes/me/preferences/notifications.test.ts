/**
 * Integration tests for /me/preferences/notifications routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import { userPreferencesRoutes } from '../../../../../routes/me/preferences';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@meeshy/shared/types/preferences';

// Mock Prisma and authentication
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

describe('Notification Preferences Routes', () => {
  let app: FastifyInstance;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn()
      }
    };

    app = Fastify();
    app.decorate('prisma', mockPrisma);

    // Mock authentication - set auth context directly
    app.addHook('preHandler', async (request: any, reply: any) => {
      request.auth = {
        isAuthenticated: true,
        registeredUser: true,
        userId: 'user-123',
        isAnonymous: false
      };
    });

    // Add error handler for validation errors
    app.setErrorHandler((error: any, request, reply) => {
      if (error.validation) {
        return reply.status(400).send({
          success: false,
          message: error.message || 'Validation error'
        });
      }
      return reply.status(500).send({
        success: false,
        message: error.message || 'Internal server error'
      });
    });

    await app.register(userPreferencesRoutes, { prefix: '/preferences' });
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /preferences/notification', () => {
    it('should return stored preferences', async () => {
      const mockPreferences = {
        userId: 'user-123',
        notification: {
          ...NOTIFICATION_PREFERENCE_DEFAULTS
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userPreferences = {
        findUnique: jest.fn().mockResolvedValue(mockPreferences)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/preferences/notification'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(NOTIFICATION_PREFERENCE_DEFAULTS);
    });

    it('should return defaults when no preferences exist', async () => {
      mockPrisma.userPreferences = {
        findUnique: jest.fn().mockResolvedValue(null)
      };

      const response = await app.inject({
        method: 'GET',
        url: '/preferences/notification'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject(NOTIFICATION_PREFERENCE_DEFAULTS);
    });

    it('should require authentication', async () => {
      // Create a new app instance with failed authentication
      const unauthApp = Fastify();
      unauthApp.decorate('prisma', mockPrisma);

      // Mock authentication middleware that fails
      unauthApp.addHook('preHandler', async (request: any, reply: any) => {
        request.auth = {
          isAuthenticated: false
        };
      });

      await unauthApp.register(userPreferencesRoutes, { prefix: '/preferences' });

      const response = await unauthApp.inject({
        method: 'GET',
        url: '/preferences/notification'
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);

      await unauthApp.close();
    });
  });

  describe('PUT /preferences/notification', () => {
    it('should update notification preferences', async () => {
      const updateData = { ...NOTIFICATION_PREFERENCE_DEFAULTS, pushEnabled: false, emailEnabled: true };
      const mockUpdated = {
        userId: 'user-123',
        notification: updateData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userPreferences = {
        upsert: jest.fn().mockResolvedValue(mockUpdated)
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/notification',
        payload: updateData
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.pushEnabled).toBe(false);
      expect(body.data.emailEnabled).toBe(true);
    });

    it('should validate DND time format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/preferences/notification',
        payload: { ...NOTIFICATION_PREFERENCE_DEFAULTS, dndStartTime: 'invalid-time' }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('PATCH /preferences/notification', () => {
    it('should partially update notification preferences', async () => {
      const updateData = { soundEnabled: false };
      const mockUpdated = {
        userId: 'user-123',
        notification: {
          ...NOTIFICATION_PREFERENCE_DEFAULTS,
          soundEnabled: false
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.userPreferences = {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(mockUpdated)
      };

      const response = await app.inject({
        method: 'PATCH',
        url: '/preferences/notification',
        payload: updateData
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.soundEnabled).toBe(false);
    });
  });

  describe('DELETE /preferences/notification', () => {
    it('should reset notification preferences', async () => {
      mockPrisma.userPreferences = {
        update: jest.fn().mockResolvedValue({ userId: 'user-123', notification: null })
      };

      const response = await app.inject({
        method: 'DELETE',
        url: '/preferences/notification'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('reset to defaults');
    });
  });
});
