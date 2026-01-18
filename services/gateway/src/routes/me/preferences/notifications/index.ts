/**
 * Notification Preferences Routes
 * Path: /me/preferences/notifications
 *
 * Manages user notification settings including:
 * - Push, email, and sound toggles
 * - Per-type notification preferences
 * - Do Not Disturb settings
 *
 * Operations:
 * - GET    /me/preferences/notifications - Get preferences (with defaults)
 * - PUT    /me/preferences/notifications - Update preferences (upsert)
 * - PATCH  /me/preferences/notifications - Partial update
 * - DELETE /me/preferences/notifications - Reset to defaults
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PreferencesService } from '../../../../services/preferences/PreferencesService';
import { UpdateNotificationPreferencesDTO } from '../types';
import {
  notificationPreferencesResponseSchema,
  updateNotificationPreferencesRequestSchema,
  successMessageResponseSchema,
  errorResponseSchema
} from '../schemas';

export default async function notificationPreferencesRoutes(fastify: FastifyInstance) {
  const preferencesService = new PreferencesService(fastify.prisma);

  /**
   * GET /me/preferences/notifications
   * Get notification preferences for the authenticated user
   */
  fastify.get(
    '/me/preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get notification preferences for the authenticated user. Returns stored values or defaults if not set.',
        tags: ['preferences', 'notifications', 'me'],
        summary: 'Get notification preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: notificationPreferencesResponseSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const preferences = await preferencesService.getNotificationPreferences(userId);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Error fetching notification preferences');
        return reply.status(500).send({
          success: false,
          message: 'Error fetching notification preferences'
        });
      }
    }
  );

  /**
   * PUT /me/preferences/notifications
   * Update notification preferences (full or partial update)
   */
  fastify.put<{ Body: UpdateNotificationPreferencesDTO }>(
    '/me/preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update notification preferences. Creates new record if none exists. Supports partial updates. All fields are optional.',
        tags: ['preferences', 'notifications', 'me'],
        summary: 'Update notification preferences',
        body: updateNotificationPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: notificationPreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateNotificationPreferencesDTO }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const data = request.body;

        const preferences = await preferencesService.updateNotificationPreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Error updating notification preferences');

        // Handle validation errors
        if (error.message?.includes('Invalid') || error.message?.includes('required')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating notification preferences'
        });
      }
    }
  );

  /**
   * PATCH /me/preferences/notifications
   * Partial update of notification preferences
   * (Same as PUT but semantically clearer for partial updates)
   */
  fastify.patch<{ Body: UpdateNotificationPreferencesDTO }>(
    '/me/preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Partially update notification preferences. Only provided fields will be updated. Creates record if none exists.',
        tags: ['preferences', 'notifications', 'me'],
        summary: 'Partial update notification preferences',
        body: updateNotificationPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: notificationPreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateNotificationPreferencesDTO }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const data = request.body;

        const preferences = await preferencesService.updateNotificationPreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error({ err: error }, 'Error updating notification preferences');

        if (error.message?.includes('Invalid') || error.message?.includes('required')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating notification preferences'
        });
      }
    }
  );

  /**
   * DELETE /me/preferences/notifications
   * Reset notification preferences to default values
   */
  fastify.delete(
    '/me/preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Reset notification preferences to default values by deleting stored preferences. Next GET request will return defaults.',
        tags: ['preferences', 'notifications', 'me'],
        summary: 'Reset notification preferences',
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        await preferencesService.resetNotificationPreferences(userId);

        return reply.send({
          success: true,
          data: { message: 'Notification preferences reset to defaults' }
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Error resetting notification preferences');
        return reply.status(500).send({
          success: false,
          message: 'Error resetting notification preferences'
        });
      }
    }
  );
}
