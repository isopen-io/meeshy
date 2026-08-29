/**
 * User Preferences Routes
 * Routes centralisées pour toutes les préférences utilisateur
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import { createPreferenceRouter } from './preference-router-factory';
import {
  resolveStoredPrivacyPreferences,
  retireLegacyPrivacyRows,
} from '../../../services/preferences/privacy-storage';
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
              // `additionalProperties: true` sur CHAQUE catégorie : un
              // `type: 'object'` sans `properties` ni cette clause fait
              // sérialiser `{}` par fast-json-stringify. Cette route rendait
              // donc sept objets vides — chaque réglage effacé à la sortie,
              // silencieusement. Le `GET` d'une seule catégorie, lui, l'a
              // toujours déclaré.
              data: {
                type: 'object',
                properties: {
                  privacy: { type: 'object', additionalProperties: true },
                  audio: { type: 'object', additionalProperties: true },
                  message: { type: 'object', additionalProperties: true },
                  notification: { type: 'object', additionalProperties: true },
                  video: { type: 'object', additionalProperties: true },
                  document: { type: 'object', additionalProperties: true },
                  application: { type: 'object', additionalProperties: true }
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
        // `privacy` a un SECOND rangement que les portes de diffusion obéissent
        // encore (cf. `services/preferences/privacy-storage`) : le lire par le
        // résolveur est la seule façon que cet écran montre ce que le serveur
        // fait. Les six autres catégories n'ont que leur document.
        const [prefs, privacy] = await Promise.all([
          prisma.userPreferences.findUnique({ where: { userId } }),
          resolveStoredPrivacyPreferences(prisma, userId)
        ]);

        // Les défauts comblent les clés muettes, comme au `GET` d'une seule
        // catégorie : un document partiel se lisait autrement selon la porte.
        const complete = <T extends object>(defaults: T, stored: unknown): T => ({
          ...defaults,
          ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {})
        });

        return sendSuccess(reply, {
          privacy: complete(PRIVACY_PREFERENCE_DEFAULTS, privacy),
          audio: complete(AUDIO_PREFERENCE_DEFAULTS, prefs?.audio),
          message: complete(MESSAGE_PREFERENCE_DEFAULTS, prefs?.message),
          notification: complete(NOTIFICATION_PREFERENCE_DEFAULTS, prefs?.notification),
          video: complete(VIDEO_PREFERENCE_DEFAULTS, prefs?.video),
          document: complete(DOCUMENT_PREFERENCE_DEFAULTS, prefs?.document),
          application: complete(APPLICATION_PREFERENCE_DEFAULTS, prefs?.application)
        });
      } catch (error: any) {
        fastify.log.error({ error }, 'Error fetching all preferences');
        return sendInternalError(reply, 'FETCH_ERROR', { message: error.message || 'Failed to fetch preferences' });
      }
    }
  );

  // ─── La remise à zéro GLOBALE a été RETIRÉE (#4186) ───────────────────────
  //
  // `DELETE /me/preferences` (sans catégorie) réinitialisait les sept blobs
  // d'un coup. Personne ne l'appelait — mesuré sur les trois clients : le SDK
  // iOS ne connaît que `resetPreferences(category:)`
  // (`PreferenceService.swift:131` → `/me/preferences/{catégorie}`), le web ne
  // compose que `/api/v1/me/preferences/${category}` (`hooks/use-preferences.ts`)
  // et Android n'expose aucun DELETE de préférence (`PreferencesApi.kt`).
  //
  // Rien de ce qu'elle faisait n'est perdu : le DELETE par CATÉGORIE de la
  // factory (`preference-router-factory.ts:383`) fait les MÊMES trois gestes —
  // `afterWrite` retire les lignes héritées de janvier 2026, le cache des
  // portes de diffusion est purgé, et `preferences:updated` part par catégorie.
  // La capacité « tout réinitialiser » coûte donc sept appels au lieu d'un, et
  // le lot L3 la rend en un seul sous un AUTRE contrat —
  // `DELETE /me/preferences?categories=` (absent = tout), qui absorbe du même
  // coup les sept DELETE par catégorie (`docs/product/api-simplification/me.md`
  // § « La surface cible »). Retirer ici n'est pas un aller-retour : c'est
  // libérer l'adresse pour la forme qui la mérite.
  //
  // Témoin d'absence : `__tests__/unit/routes/identity-twins-retired.test.ts`.

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
  //
  // La SEULE catégorie dont l'état ne tient pas dans son document : un endpoint
  // présent du 12 au 18 janvier 2026 a écrit des lignes clé/valeur, puis a été
  // retiré sans reprise de données. Les six portes de diffusion les obéissent
  // toujours ; sans ce rangement injecté, l'écran affichait le défaut « tout
  // visible » pendant que le serveur taisait, et le `PATCH` d'un réglage voisin
  // effaçait l'opt-out. `afterWrite` clôt la fenêtre au premier réglage écrit.
  fastify.register(
    createPreferenceRouter('privacy', PrivacyPreferenceSchema, PRIVACY_PREFERENCE_DEFAULTS, {
      readStored: resolveStoredPrivacyPreferences,
      afterWrite: retireLegacyPrivacyRows
    }),
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
