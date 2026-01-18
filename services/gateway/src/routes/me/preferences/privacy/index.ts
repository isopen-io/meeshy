/**
 * Privacy Preferences Routes
 * Path: /me/preferences/privacy
 *
 * Manages user privacy settings:
 * - Profile visibility (online status, last seen, read receipts, typing)
 * - Contact settings (requests, group invites)
 * - Data settings (media saving, analytics)
 *
 * Operations:
 * - GET    /me/preferences/privacy - Get privacy preferences
 * - PUT    /me/preferences/privacy - Update privacy preferences
 * - PATCH  /me/preferences/privacy - Partial update
 * - DELETE /me/preferences/privacy - Reset to defaults
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PreferencesService } from '../../../../services/preferences/PreferencesService';
import { UpdatePrivacyPreferencesDTO } from '../types';
import {
  privacyPreferencesResponseSchema,
  updatePrivacyPreferencesRequestSchema,
  successMessageResponseSchema,
  errorResponseSchema
} from '../schemas';

export default async function privacyPreferencesRoutes(fastify: FastifyInstance) {
  const preferencesService = new PreferencesService(fastify.prisma);

  /**
   * GET /me/preferences/privacy
   * Get privacy preferences for the authenticated user
   */
  fastify.get(
    '/me/preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get privacy preferences for the authenticated user. Returns visibility settings, contact permissions, and data preferences.',
        tags: ['preferences', 'privacy', 'me'],
        summary: 'Get privacy preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: privacyPreferencesResponseSchema
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
        const preferences = await preferencesService.getPrivacyPreferences(userId);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error) {
        fastify.log.error('Error fetching privacy preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error fetching privacy preferences'
        });
      }
    }
  );

  /**
   * PUT /me/preferences/privacy
   * Update privacy preferences
   */
  fastify.put<{ Body: UpdatePrivacyPreferencesDTO }>(
    '/me/preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update privacy preferences. All fields are optional. Only provided fields will be updated.',
        tags: ['preferences', 'privacy', 'me'],
        summary: 'Update privacy preferences',
        body: updatePrivacyPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: privacyPreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdatePrivacyPreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updatePrivacyPreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating privacy preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating privacy preferences'
        });
      }
    }
  );

  /**
   * PATCH /me/preferences/privacy
   * Partial update of privacy preferences
   */
  fastify.patch<{ Body: UpdatePrivacyPreferencesDTO }>(
    '/me/preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Partially update privacy preferences. Only provided fields will be updated.',
        tags: ['preferences', 'privacy', 'me'],
        summary: 'Partial update privacy preferences',
        body: updatePrivacyPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: privacyPreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdatePrivacyPreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updatePrivacyPreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating privacy preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating privacy preferences'
        });
      }
    }
  );

  /**
   * DELETE /me/preferences/privacy
   * Reset privacy preferences to defaults
   */
  fastify.delete(
    '/me/preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Reset privacy preferences to default values. Next GET request will return defaults.',
        tags: ['preferences', 'privacy', 'me'],
        summary: 'Reset privacy preferences',
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
        await preferencesService.resetPrivacyPreferences(userId);

        return reply.send({
          success: true,
          data: { message: 'Privacy preferences reset to defaults' }
        });
      } catch (error) {
        fastify.log.error('Error resetting privacy preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error resetting privacy preferences'
        });
      }
    }
  );
}
