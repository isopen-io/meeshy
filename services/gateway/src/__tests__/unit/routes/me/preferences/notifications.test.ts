/**
 * Integration tests for /me/preferences/notifications routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import notificationPreferencesRoutes from '../../../../../routes/me/preferences/notifications';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOTIFICATION_PREFERENCES_DEFAULTS } from '../../../../../config/user-preferences-defaults';

// Mock Prisma and authentication
jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

describe('Notification Preferences Routes', () => {
  let app: FastifyInstance;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      notificationPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn()
      }
    };

    app = Fastify();
    app.decorate('prisma', mockPrisma);

    // Mock authentication middleware
    app.decorate('authenticate', async (request: any, reply: any) => {
      request.authContext = {
        isAuthenticated: true,
        registeredUser: true,
        userId: 'user-123',
        isAnonymous: false
      };
    });

    // Add error handler for validation errors
    app.setErrorHandler((error, request, reply) => {
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

    await app.register(notificationPreferencesRoutes);
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /me/preferences/notifications', () => {
    it('should return stored preferences', async () => {
      const mockPreferences = {
        id: 'pref-123',
        userId: 'user-123',
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.notificationPreference.findUnique.mockResolvedValue(mockPreferences);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/notifications'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.isDefault).toBe(false);
      expect(body.data.userId).toBe('user-123');
    });

    it('should return defaults when no preferences exist', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/me/preferences/notifications'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.isDefault).toBe(true);
      expect(body.data).toMatchObject(NOTIFICATION_PREFERENCES_DEFAULTS);
    });

    it('should require authentication', async () => {
      // Create a new app instance with failed authentication
      const unauthApp = Fastify();
      unauthApp.decorate('prisma', mockPrisma);

      // Mock authentication middleware that fails
      unauthApp.decorate('authenticate', async (request: any, reply: any) => {
        request.authContext = {
          isAuthenticated: false
        };
      });

      await unauthApp.register(notificationPreferencesRoutes);

      const response = await unauthApp.inject({
        method: 'GET',
        url: '/me/preferences/notifications'
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);

      await unauthApp.close();
    });
  });

  describe('PUT /me/preferences/notifications', () => {
    it('should update notification preferences', async () => {
      const updateData = { pushEnabled: false, emailEnabled: true };
      const mockUpdated = {
        id: 'pref-123',
        userId: 'user-123',
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.notificationPreference.upsert.mockResolvedValue(mockUpdated);

      const response = await app.inject({
        method: 'PUT',
        url: '/me/preferences/notifications',
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
        url: '/me/preferences/notifications',
        payload: { dndStartTime: 'invalid-time' }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid dndStartTime format');
    });
  });

  describe('PATCH /me/preferences/notifications', () => {
    it('should partially update notification preferences', async () => {
      const updateData = { soundEnabled: false };
      const mockUpdated = {
        id: 'pref-123',
        userId: 'user-123',
        ...NOTIFICATION_PREFERENCES_DEFAULTS,
        soundEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.notificationPreference.upsert.mockResolvedValue(mockUpdated);

      const response = await app.inject({
        method: 'PATCH',
        url: '/me/preferences/notifications',
        payload: updateData
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.soundEnabled).toBe(false);
    });
  });

  describe('DELETE /me/preferences/notifications', () => {
    it('should reset notification preferences', async () => {
      mockPrisma.notificationPreference.deleteMany.mockResolvedValue({ count: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: '/me/preferences/notifications'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('reset to defaults');
      expect(mockPrisma.notificationPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' }
      });
    });
  });
});
