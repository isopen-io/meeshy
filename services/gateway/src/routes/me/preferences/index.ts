/**
 * User Preferences Routes
 * Routes centralisées pour toutes les préférences utilisateur
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import { createPreferenceRouter } from './preference-router-factory';
import { invalidatePrivacyPreferences } from '../../../services/preferences/privacy-cache';
import {
  PREFERENCE_CATEGORIES,
  emitPreferenceCategoryUpdated
} from '../../../services/preferences/preferences-broadcast';
import { categoriesRoutes } from './categories';
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
import { enhancedLogger } from '../../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'UserPreferencesRoutes' });

export async function userPreferencesRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  if (!prisma) {
    logger.error('Missing required service: prisma');
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
      const userId = request.auth?.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      try {
        const prefs = await prisma.userPreferences.findUnique({
          where: { userId }
        });

        return sendSuccess(reply, {
          privacy: prefs?.privacy || PRIVACY_PREFERENCE_DEFAULTS,
          audio: prefs?.audio || AUDIO_PREFERENCE_DEFAULTS,
          message: prefs?.message || MESSAGE_PREFERENCE_DEFAULTS,
          notification: prefs?.notification || NOTIFICATION_PREFERENCE_DEFAULTS,
          video: prefs?.video || VIDEO_PREFERENCE_DEFAULTS,
          document: prefs?.document || DOCUMENT_PREFERENCE_DEFAULTS,
          application: prefs?.application || APPLICATION_PREFERENCE_DEFAULTS
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error fetching all preferences');
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch preferences' });
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
      const userId = request.auth?.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      try {
        // `updateMany` et non `update` — même raison qu'au verbe DELETE d'une
        // catégorie : la ligne `UserPreferences` n'existe pas tant que rien
        // n'a été écrit, et `update` levait alors `P2025`, rendu en 500.
        await prisma.userPreferences.updateMany({
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

        // La remise à zéro globale efface AUSSI `privacy` : le cache partagé
        // des portes de diffusion doit l'apprendre, comme sur une écriture
        // ciblée (cf. `services/preferences/privacy-cache`).
        invalidatePrivacyPreferences(userId);

        // Et les autres appareils aussi. Le contrat client est par catégorie
        // (`queryKeys.preferences.category`), donc une émission par catégorie
        // effacée — cf. `services/preferences/preferences-broadcast`.
        for (const category of PREFERENCE_CATEGORIES) {
          emitPreferenceCategoryUpdated(fastify, userId, category);
        }

        return sendSuccess(reply, undefined, { message: 'All preferences reset to defaults' });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error resetting all preferences');
        return sendInternalError(reply, 'RESET_ERROR', { message: error.message || 'Failed to reset preferences' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /me/preferences/encryption - Préférence de chiffrement + état des clés
  //
  // Pas une catégorie de la factory : `encryptionPreference` vit dans le blob
  // `privacy` (PrivacyPreferenceSchema), et l'état des clés n'est pas une
  // préférence du tout — c'est l'existence d'une ligne `SignalPreKeyBundle`,
  // écrite par `POST /signal/keys` à chaque authentification du client.
  //
  // Cette ligne est la SEULE source de vérité de « cet utilisateur a des clés ».
  // Les colonnes `User.signalIdentityKeyPublic` / `signalRegistrationId` /
  // `signalPreKeyBundleVersion` / `lastKeyRotation` du schéma Prisma sont un
  // miroir qu'aucun chemin d'écriture n'alimente : les lire rendrait « pas de
  // clés » pour l'utilisateur dont le bundle est à une ligne de là.
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get(
    '/encryption',
    {
      schema: {
        description: 'Récupérer la préférence de chiffrement et l\'état des clés Signal de l\'utilisateur',
        tags: ['preferences', 'encryption'],
        summary: 'Get encryption preference and Signal key status',
        response: {
          200: {
            description: 'Préférence de chiffrement et état des clés',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  encryptionPreference: {
                    type: 'string',
                    enum: ['disabled', 'optional', 'always'],
                    description: 'Préférence stockée dans le blob privacy'
                  },
                  hasSignalKeys: {
                    type: 'boolean',
                    description: 'Un bundle de pré-clés actif existe pour cet utilisateur'
                  },
                  signalRegistrationId: {
                    type: 'number',
                    nullable: true,
                    description: 'Registration ID du bundle actif, null sans bundle'
                  },
                  lastKeyRotation: {
                    type: 'string',
                    format: 'date-time',
                    nullable: true,
                    description: 'Dernier téléversement du bundle, null sans bundle'
                  }
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
      const userId = request.auth?.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      try {
        const [prefs, bundle] = await Promise.all([
          prisma.userPreferences.findUnique({
            where: { userId },
            select: { privacy: true }
          }),
          prisma.signalPreKeyBundle.findUnique({
            where: { userId },
            select: { registrationId: true, isActive: true, lastRotatedAt: true }
          })
        ]);

        const privacy = (prefs?.privacy ?? {}) as Record<string, unknown>;
        const parsedPreference = PrivacyPreferenceSchema.shape.encryptionPreference.safeParse(
          privacy.encryptionPreference
        );

        const activeBundle = bundle?.isActive ? bundle : null;

        return sendSuccess(reply, {
          encryptionPreference: parsedPreference.success
            ? parsedPreference.data
            : PRIVACY_PREFERENCE_DEFAULTS.encryptionPreference,
          hasSignalKeys: activeBundle !== null,
          signalRegistrationId: activeBundle?.registrationId ?? null,
          lastKeyRotation: activeBundle?.lastRotatedAt ?? null
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error fetching encryption preferences');
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch encryption preferences' });
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

  // /me/preferences/categories
  // Note: Les catégories utilisent une table séparée (conversationCategory) et non un champ JSON,
  // donc elles ne peuvent pas utiliser la factory pattern des autres préférences
  fastify.register(categoriesRoutes, { prefix: '/categories' });
}
