/**
 * Language Preferences Routes
 * Path: /me/preferences/languages
 *
 * Manages user language settings:
 * - System/UI language
 * - Regional/native language
 * - Custom translation language
 * - Auto-translate preference
 *
 * Operations:
 * - GET   /me/preferences/languages - Get language preferences
 * - PUT   /me/preferences/languages - Update language preferences
 * - PATCH /me/preferences/languages - Partial update
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PreferencesService } from '../../../../services/preferences/PreferencesService';
import { UpdateLanguagePreferencesDTO } from '../types';
import {
  languagePreferencesResponseSchema,
  updateLanguagePreferencesRequestSchema,
  errorResponseSchema
} from '../schemas';

export default async function languagePreferencesRoutes(fastify: FastifyInstance) {
  const preferencesService = new PreferencesService(fastify.prisma);

  /**
   * GET /me/preferences/languages
   * Get language preferences for the authenticated user
   */
  fastify.get(
    '/me/preferences/languages',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get language preferences for the authenticated user. Returns system language, regional language, custom translation language, and auto-translate setting.',
        tags: ['preferences', 'languages', 'me'],
        summary: 'Get language preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: languagePreferencesResponseSchema
            }
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
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
        const preferences = await preferencesService.getLanguagePreferences(userId);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error fetching language preferences:', error);

        if (error.message === 'User not found') {
          return reply.status(404).send({
            success: false,
            message: 'User not found'
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error fetching language preferences'
        });
      }
    }
  );

  /**
   * PUT /me/preferences/languages
   * Update language preferences
   */
  fastify.put<{ Body: UpdateLanguagePreferencesDTO }>(
    '/me/preferences/languages',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update language preferences. All fields are optional. Only provided fields will be updated.',
        tags: ['preferences', 'languages', 'me'],
        summary: 'Update language preferences',
        body: updateLanguagePreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: languagePreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateLanguagePreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updateLanguagePreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating language preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating language preferences'
        });
      }
    }
  );

  /**
   * PATCH /me/preferences/languages
   * Partial update of language preferences
   */
  fastify.patch<{ Body: UpdateLanguagePreferencesDTO }>(
    '/me/preferences/languages',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Partially update language preferences. Only provided fields will be updated.',
        tags: ['preferences', 'languages', 'me'],
        summary: 'Partial update language preferences',
        body: updateLanguagePreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: languagePreferencesResponseSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateLanguagePreferencesDTO }>, reply: FastifyReply) => {
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

        const preferences = await preferencesService.updateLanguagePreferences(userId, data);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error updating language preferences:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating language preferences'
        });
      }
    }
  );
}
