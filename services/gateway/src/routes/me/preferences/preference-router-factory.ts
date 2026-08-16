/**
 * Preference Router Factory
 * Génère automatiquement les routes CRUD pour chaque catégorie de préférences
 * Inclut la validation automatique des consentements GDPR
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodSchema } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { withMutationLog } from '../../../utils/withMutationLog';
import { invalidatePrivacyPreferences } from '../../../services/preferences/privacy-cache';
import { emitPreferenceCategoryUpdated } from '../../../services/preferences/preferences-broadcast';
import { sendSuccess, sendForbidden, sendBadRequest, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import type { PreferenceCategory } from '../../../services/preferences/preferences-broadcast';

/**
 * Factory qui crée un plugin Fastify avec routes CRUD complètes
 * pour une catégorie de préférences
 *
 * @param category - Nom de la catégorie (doit matcher le champ JSON dans Prisma)
 * @param schema - Schema Zod de validation
 * @param defaults - Valeurs par défaut si aucune préférence n'est settée
 */
export function createPreferenceRouter<T>(
  category: PreferenceCategory,
  schema: ZodSchema<T>,
  defaults: T
) {
  return async function (fastify: FastifyInstance) {
    // Instancier le service de validation de consentement
    const consentService = new ConsentValidationService(fastify.prisma);

    const isEmpty = (obj: any): boolean => {
      return !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
    };

    /**
     * Six portes de diffusion mémoïsent la confidentialité pendant cinq minutes
     * (`services/preferences/privacy-cache`). Sans cette purge, couper ses
     * accusés de lecture ne prenait effet qu'après ce délai — le serveur
     * continuait de diffuser ce que l'utilisateur venait de demander de taire,
     * l'écran lui confirmant l'inverse.
     *
     * Seule la confidentialité a une mémoire côté serveur : les autres
     * catégories ne sont relues que par le `GET` de cette même porte.
     */
    const invalidateServerCache = (userId: string) => {
      if (category === 'privacy') invalidatePrivacyPreferences(userId);
    };

    const emitPreferencesUpdated = (userId: string) =>
      emitPreferenceCategoryUpdated(fastify, userId, category);
    // GET /me/preferences/{category}
    fastify.get(
      '/',
      {
        schema: {
          description: `Récupérer les préférences ${category}`,
          tags: ['preferences'],
          summary: `Get ${category} preferences`,
          response: {
            200: {
              description: 'Préférences récupérées avec succès',
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object', additionalProperties: true }
              }
            },
            401: errorResponseSchema,
            500: errorResponseSchema
          }
        }
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        try {
          const prefs = await fastify.prisma.userPreferences.findUnique({
            where: { userId },
            select: { [category]: true }
          });

          // Si aucune préférence ou champ null/vide, retourner les defaults
          const data = isEmpty(prefs?.[category]) ? defaults : (prefs[category] as T);

          return sendSuccess(reply, data);
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error fetching preferences');
          return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch preferences' });
        }
      }
    );

    // PUT /me/preferences/{category} - Remplacement complet
    fastify.put<{ Body: T }>(
      '/',
      {
        schema: {
          description: `Remplacer complètement les préférences ${category}`,
          tags: ['preferences'],
          summary: `Replace ${category} preferences`,
          body: { type: 'object' },
          response: {
            200: {
              description: 'Préférences mises à jour',
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object', additionalProperties: true }
              }
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: {
              description: 'Consentements requis manquants',
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string', example: 'CONSENT_REQUIRED' },
                message: { type: 'string' },
                violations: { type: 'array' }
              }
            },
            500: errorResponseSchema
          }
        }
      },
      async (request, reply) => {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        try {
          // Validation Zod
          const validated = schema.parse(request.body);

          // Validation des consentements GDPR
          const consentViolations = await consentService.validatePreferences(
            userId,
            category,
            validated as Record<string, any>
          );

          if (consentViolations.length > 0) {
            return reply.status(403).send({
              success: false,
              error: 'CONSENT_REQUIRED',
              message: 'Missing required consents for requested preferences',
              violations: consentViolations,
            });
          }

          // Idempotent via clientMutationId. The MutationLog row keys
          // off (userId, cmid) so the same PUT replayed via the offline
          // outbox doesn't fire the SocketIO `preferences:updated`
          // broadcast twice.
          const updated = await withMutationLog({
            request,
            fastify,
            userId,
            kind: `updateSettings:${category}`,
            op: async () => {
              const u = await fastify.prisma.userPreferences.upsert({
                where: { userId },
                create: {
                  userId,
                  [category]: validated as any
                },
                update: {
                  [category]: validated as any
                },
                select: { [category]: true, id: true }
              });
              return u as typeof u & { id: string };
            },
            onDuplicate: async () => {
              const u = await fastify.prisma.userPreferences.findUnique({
                where: { userId },
                select: { [category]: true, id: true }
              });
              return u as (typeof u & { id: string }) | null;
            },
          });

          invalidateServerCache(userId);
          emitPreferencesUpdated(userId);

          return sendSuccess(reply, (updated as any)[category] as T);
        } catch (error: any) {
          if (error.name === 'ZodError') {
            return sendBadRequest(reply, 'VALIDATION_ERROR');
          }

          fastify.log.error({ error, category }, 'Error updating preferences');
          return sendInternalError(reply, 'UPDATE_ERROR', { message: 'Failed to update preferences' });
        }
      }
    );

    // PATCH /me/preferences/{category} - Mise à jour partielle
    fastify.patch<{ Body: Partial<T> }>(
      '/',
      {
        schema: {
          description: `Mettre à jour partiellement les préférences ${category}`,
          tags: ['preferences'],
          summary: `Partially update ${category} preferences`,
          body: { type: 'object' },
          response: {
            200: {
              description: 'Préférences mises à jour partiellement',
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object', additionalProperties: true }
              }
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: {
              description: 'Consentements requis manquants',
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string', example: 'CONSENT_REQUIRED' },
                message: { type: 'string' },
                violations: { type: 'array' }
              }
            },
            500: errorResponseSchema
          }
        }
      },
      async (request, reply) => {
        const userId = request.auth?.userId;

        if (!userId) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        try {
          // Validation partielle Zod
          const validated = (schema as any).partial().parse(request.body);

          // Récupérer les préférences existantes
          const existing = await fastify.prisma.userPreferences.findUnique({
            where: { userId },
            select: { [category]: true }
          });

          // Merger avec les defaults puis avec les nouvelles valeurs
          const current = isEmpty(existing?.[category]) ? defaults : (existing[category] as T);
          const merged = { ...current, ...validated };

          // Validation des consentements GDPR sur les données mergées
          const consentViolations = await consentService.validatePreferences(
            userId,
            category,
            merged as Record<string, any>
          );

          if (consentViolations.length > 0) {
            return reply.status(403).send({
              success: false,
              error: 'CONSENT_REQUIRED',
              message: 'Missing required consents for requested preferences',
              violations: consentViolations,
            });
          }

          // Idempotent via clientMutationId — same reasoning as PUT.
          const updated = await withMutationLog({
            request,
            fastify,
            userId,
            kind: `updateSettings:${category}`,
            op: async () => {
              const u = await fastify.prisma.userPreferences.upsert({
                where: { userId },
                create: {
                  userId,
                  [category]: merged as any
                },
                update: {
                  [category]: merged as any
                },
                select: { [category]: true, id: true }
              });
              return u as typeof u & { id: string };
            },
            onDuplicate: async () => {
              const u = await fastify.prisma.userPreferences.findUnique({
                where: { userId },
                select: { [category]: true, id: true }
              });
              return u as (typeof u & { id: string }) | null;
            },
          });

          invalidateServerCache(userId);
          emitPreferencesUpdated(userId);

          return sendSuccess(reply, (updated as any)[category] as T);
        } catch (error: any) {
          if (error.name === 'ZodError') {
            return sendBadRequest(reply, 'VALIDATION_ERROR');
          }

          fastify.log.error({ error, category }, 'Error partially updating preferences');
          return sendInternalError(reply, 'UPDATE_ERROR', { message: 'Failed to update preferences' });
        }
      }
    );

    // DELETE /me/preferences/{category} - Reset aux defaults
    fastify.delete(
      '/',
      {
        schema: {
          description: `Réinitialiser les préférences ${category} aux valeurs par défaut`,
          tags: ['preferences'],
          summary: `Reset ${category} preferences to defaults`,
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
          return sendUnauthorized(reply, 'Authentication required');
        }

        try {
          // Mettre le champ JSON à null (les defaults seront retournés au GET).
          //
          // `updateMany` et non `update` : rien ne crée la ligne
          // `UserPreferences` à l'inscription — ses seuls créateurs sont les
          // `upsert` de PUT/PATCH. `update` y levait `P2025`, rendu en 500,
          // exactement pour l'utilisateur qui n'a jamais rien écrit, donc qui
          // EST déjà aux valeurs par défaut. `updateMany` rend `{ count: 0 }`
          // sans lever, et ne crée aucune ligne vide pour le dire.
          await fastify.prisma.userPreferences.updateMany({
            where: { userId },
            data: { [category]: null }
          });

          invalidateServerCache(userId);
          emitPreferencesUpdated(userId);

          return sendSuccess(reply, undefined, { message: `${category} preferences reset to defaults` });
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error resetting preferences');
          return sendInternalError(reply, 'RESET_ERROR', { message: 'Failed to reset preferences' });
        }
      }
    );
  };
}
