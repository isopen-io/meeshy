/**
 * User Preferences Routes
 * Routes centralisées pour toutes les préférences utilisateur
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { createPreferenceRouter } from './preference-router-factory';
import {
  PrivacyPreferenceSchema,
  AudioPreferenceSchema,
  MessagePreferenceSchema,
  NotificationPreferenceSchema,
  VideoPreferenceSchema,
  DocumentPreferenceSchema,
  ApplicationPreferenceSchema,
  PRIVACY_PREFERENCE_DEFAULTS,
  AUDIO_PREFERENCE_DEFAULTS,
  MESSAGE_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  VIDEO_PREFERENCE_DEFAULTS,
  DOCUMENT_PREFERENCE_DEFAULTS,
  APPLICATION_PREFERENCE_DEFAULTS
} from '@meeshy/shared/types/preferences';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

export async function userPreferencesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[UserPreferences] Missing required service: prisma');
    return;
  }

  // Auth middleware pour toutes les routes
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  fastify.addHook('preHandler', authMiddleware);

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /me/preferences - Récupérer TOUTES les préférences
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get(
    '/',
    {
      schema: {
        description: 'Récupérer toutes les préférences utilisateur',
        tags: ['preferences'],
        summary: 'Get all preferences',
        response: {
          200: {
            description: 'Toutes les préférences',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  privacy: { type: 'object' },
                  audio: { type: 'object' },
                  message: { type: 'object' },
                  notification: { type: 'object' },
                  video: { type: 'object' },
                  document: { type: 'object' },
                  application: { type: 'object' }
                }
              }
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const userId = (request as any).auth?.userId;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      try {
        const prefs = await prisma.userPreferences.findUnique({
          where: { userId }
        });

        return reply.send({
          success: true,
          data: {
            privacy: prefs?.privacy || PRIVACY_PREFERENCE_DEFAULTS,
            audio: prefs?.audio || AUDIO_PREFERENCE_DEFAULTS,
            message: prefs?.message || MESSAGE_PREFERENCE_DEFAULTS,
            notification: prefs?.notification || NOTIFICATION_PREFERENCE_DEFAULTS,
            video: prefs?.video || VIDEO_PREFERENCE_DEFAULTS,
            document: prefs?.document || DOCUMENT_PREFERENCE_DEFAULTS,
            application: prefs?.application || APPLICATION_PREFERENCE_DEFAULTS
          }
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error fetching all preferences');
        return reply.status(500).send({
          success: false,
          error: 'FETCH_ERROR',
          message: error.message || 'Failed to fetch preferences'
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /me/preferences - Réinitialiser TOUTES les préférences
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.delete(
    '/',
    {
      schema: {
        description: 'Réinitialiser toutes les préférences aux valeurs par défaut',
        tags: ['preferences'],
        summary: 'Reset all preferences',
        response: {
          200: {
            description: 'Préférences réinitialisées',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string' }
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const userId = (request as any).auth?.userId;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      }

      try {
        await prisma.userPreferences.update({
          where: { userId },
          data: {
            privacy: null,
            audio: null,
            message: null,
            notification: null,
            video: null,
            document: null,
            application: null
          }
        });

        return reply.send({
          success: true,
          message: 'All preferences reset to defaults'
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error resetting all preferences');
        return reply.status(500).send({
          success: false,
          error: 'RESET_ERROR',
          message: error.message || 'Failed to reset preferences'
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUS-ROUTES PAR CATÉGORIE (factory pattern)
  // ═══════════════════════════════════════════════════════════════════════════

  // /me/preferences/privacy
  fastify.register(
    createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS),
    { prefix: '/privacy' }
  );

  // /me/preferences/audio
  fastify.register(
    createPreferenceRouter('audio', AudioPreferenceSchema, AUDIO_PREFERENCE_DEFAULTS),
    { prefix: '/audio' }
  );

  // /me/preferences/message
  fastify.register(
    createPreferenceRouter('message', MessagePreferenceSchema, MESSAGE_PREFERENCE_DEFAULTS),
    { prefix: '/message' }
  );

  // /me/preferences/notification
  fastify.register(
    createPreferenceRouter(
      'notification',
      NotificationPreferenceSchema,
      NOTIFICATION_PREFERENCE_DEFAULTS
    ),
    { prefix: '/notification' }
  );

  // /me/preferences/video
  fastify.register(
    createPreferenceRouter('video', VideoPreferenceSchema, VIDEO_PREFERENCE_DEFAULTS),
    { prefix: '/video' }
  );

  // /me/preferences/document
  fastify.register(
    createPreferenceRouter('document', DocumentPreferenceSchema, DOCUMENT_PREFERENCE_DEFAULTS),
    { prefix: '/document' }
  );

  // /me/preferences/application
  fastify.register(
    createPreferenceRouter(
      'application',
      ApplicationPreferenceSchema,
      APPLICATION_PREFERENCE_DEFAULTS
    ),
    { prefix: '/application' }
  );
}
