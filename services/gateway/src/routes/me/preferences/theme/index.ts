/**
 * Theme Preferences Routes
 * Path: /me/preferences/theme
 *
 * Manages user theme and appearance settings:
 * - Theme (light, dark, system)
 * - Font family and size
 * - Compact mode
 *
 * Operations:
 * - GET    /me/preferences/theme - Get theme preferences
 * - PUT    /me/preferences/theme - Update theme preferences
 * - PATCH  /me/preferences/theme - Partial update
 * - DELETE /me/preferences/theme - Reset to defaults
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PreferencesService } from '../../../../services/preferences/PreferencesService';
import { UpdateThemePreferencesDTO } from '../types';
import {
  themePreferencesResponseSchema,
  updateThemePreferencesRequestSchema,
  successMessageResponseSchema,
  errorResponseSchema
} from '../schemas';

export default async function themePreferencesRoutes(fastify: FastifyInstance) {
  const preferencesService = new PreferencesService(fastify.prisma);

  /**
   * GET /me/preferences/theme
   * Get theme preferences for the authenticated user
   */
  fastify.get(
    '/me/preferences/theme',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get theme and appearance preferences for the authenticated user. Returns current theme, font settings, and UI mode.',
        tags: ['preferences', 'theme', 'me'],
        summary: 'Get theme preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: themePreferencesResponseSchema
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
        const preferences = await preferencesService.getThemePreferences(userId);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error) {
        fastify.log.error('Error fetching theme preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error fetching theme preferences'
        });
      }
    }
  );

  /**
   * PUT /me/preferences/theme
   * Update theme preferences
   */
  fastify.put<{ Body: UpdateThemePreferencesDTO }>(
    '/me/preferences/theme',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update theme and appearance preferences. All fields are optional. Only provided fields will be updated.',
        tags: ['preferences', 'theme', 'me'],
        summary: 'Update theme preferences',
        body: updateThemePreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: themePreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateThemePreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updateThemePreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating theme preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating theme preferences'
        });
      }
    }
  );

  /**
   * PATCH /me/preferences/theme
   * Partial update of theme preferences
   */
  fastify.patch<{ Body: UpdateThemePreferencesDTO }>(
    '/me/preferences/theme',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Partially update theme preferences. Only provided fields will be updated.',
        tags: ['preferences', 'theme', 'me'],
        summary: 'Partial update theme preferences',
        body: updateThemePreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: themePreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateThemePreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updateThemePreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating theme preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating theme preferences'
        });
      }
    }
  );

  /**
   * DELETE /me/preferences/theme
   * Reset theme preferences to defaults
   */
  fastify.delete(
    '/me/preferences/theme',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Reset theme preferences to default values. Next GET request will return defaults.',
        tags: ['preferences', 'theme', 'me'],
        summary: 'Reset theme preferences',
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
        await preferencesService.resetThemePreferences(userId);

        return reply.send({
          success: true,
          data: { message: 'Theme preferences reset to defaults' }
        });
      } catch (error) {
        fastify.log.error('Error resetting theme preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error resetting theme preferences'
        });
      }
    }
  );
}
