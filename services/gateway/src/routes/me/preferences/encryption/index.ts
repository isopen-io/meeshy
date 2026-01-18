/**
 * Encryption Preferences Routes
 * Path: /me/preferences/encryption
 *
 * Manages user encryption settings:
 * - Encryption preference level (disabled, optional, always)
 * - Signal Protocol key status
 *
 * Operations:
 * - GET /me/preferences/encryption - Get encryption preferences
 * - PUT /me/preferences/encryption - Update encryption preference
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PreferencesService } from '../../../../services/preferences/PreferencesService';
import { UpdateEncryptionPreferenceDTO } from '../types';
import {
  encryptionPreferencesResponseSchema,
  updateEncryptionPreferenceRequestSchema,
  errorResponseSchema
} from '../schemas';

export default async function encryptionPreferencesRoutes(fastify: FastifyInstance) {
  const preferencesService = new PreferencesService(fastify.prisma);

  /**
   * GET /me/preferences/encryption
   * Get encryption preferences for the authenticated user
   */
  fastify.get(
    '/me/preferences/encryption',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get encryption preferences and Signal Protocol key status for the authenticated user. Returns encryption level, key generation status, and key rotation information.',
        tags: ['preferences', 'encryption', 'me'],
        summary: 'Get encryption preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: encryptionPreferencesResponseSchema
            }
          },
          401: errorResponseSchema,
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Anonymous users cannot manage encryption preferences' }
            }
          },
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;

        // Anonymous users don't have encryption preferences
        if (!authContext?.isAuthenticated || authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            message: 'Anonymous users cannot manage encryption preferences'
          });
        }

        const userId = authContext.userId;
        const preferences = await preferencesService.getEncryptionPreferences(userId);

        return reply.send({
          success: true,
          data: preferences
        });
      } catch (error: any) {
        fastify.log.error('Error fetching encryption preferences:', error);

        if (error.message === 'User not found') {
          return reply.status(404).send({
            success: false,
            message: 'User not found'
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error fetching encryption preferences'
        });
      }
    }
  );

  /**
   * PUT /me/preferences/encryption
   * Update encryption preference level
   */
  fastify.put<{ Body: UpdateEncryptionPreferenceDTO }>(
    '/me/preferences/encryption',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update encryption preference level. Controls whether E2EE is disabled, optional, or enforced for all messages. Anonymous users cannot manage encryption settings.',
        tags: ['preferences', 'encryption', 'me'],
        summary: 'Update encryption preference',
        body: updateEncryptionPreferenceRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  encryptionPreference: {
                    type: 'string',
                    enum: ['disabled', 'optional', 'always'],
                    description: 'Updated encryption preference'
                  }
                }
              },
              message: { type: 'string', example: 'Encryption preference updated successfully' }
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Anonymous users cannot manage encryption preferences' }
            }
          },
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: UpdateEncryptionPreferenceDTO }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;

        // Anonymous users don't have encryption preferences
        if (!authContext?.isAuthenticated || authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            message: 'Anonymous users cannot manage encryption preferences'
          });
        }

        const userId = authContext.userId;
        const data = request.body;

        const result = await preferencesService.updateEncryptionPreference(userId, data);

        return reply.send({
          success: true,
          data: result,
          message: 'Encryption preference updated successfully'
        });
      } catch (error: any) {
        fastify.log.error('Error updating encryption preference:', error);

        if (error.message?.includes('Invalid')) {
          return reply.status(400).send({
            success: false,
            message: error.message
          });
        }

        return reply.status(500).send({
          success: false,
          message: 'Error updating encryption preference'
        });
      }
    }
  );
}
