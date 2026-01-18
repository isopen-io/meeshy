/**
 * Preference Router Factory
 * Génère automatiquement les routes CRUD pour chaque catégorie de préférences
 * Inclut la validation automatique des consentements GDPR
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodSchema } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ConsentValidationService } from '../../../services/ConsentValidationService';

type PreferenceCategory =
  | 'privacy'
  | 'audio'
  | 'message'
  | 'notification'
  | 'video'
  | 'document'
  | 'application';

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
                data: { type: 'object' }
              }
            },
            401: errorResponseSchema,
            500: errorResponseSchema
          }
        }
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        try {
          const prefs = await fastify.prisma.userPreferences.findUnique({
            where: { userId },
            select: { [category]: true }
          });

          // Si aucune préférence ou champ null, retourner les defaults
          const data = (prefs?.[category] as T) || defaults;

          return reply.send({
            success: true,
            data
          });
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error fetching preferences');
          return reply.status(500).send({
            success: false,
            error: 'FETCH_ERROR',
            message: error.message || 'Failed to fetch preferences'
          });
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
                data: { type: 'object' }
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
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
              violations: consentViolations
            });
          }

          // Upsert avec remplacement complet
          const updated = await fastify.prisma.userPreferences.upsert({
            where: { userId },
            create: {
              userId,
              [category]: validated as any
            },
            update: {
              [category]: validated as any
            },
            select: { [category]: true }
          });

          return reply.send({
            success: true,
            data: updated[category] as T
          });
        } catch (error: any) {
          if (error.name === 'ZodError') {
            return reply.status(400).send({
              success: false,
              error: 'VALIDATION_ERROR',
              message: 'Invalid preference data',
              details: error.errors
            });
          }

          fastify.log.error({ error, category }, 'Error updating preferences');
          return reply.status(500).send({
            success: false,
            error: 'UPDATE_ERROR',
            message: error.message || 'Failed to update preferences'
          });
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
                data: { type: 'object' }
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
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
          const current = (existing?.[category] as T) || defaults;
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
              violations: consentViolations
            });
          }

          // Upsert avec merge
          const updated = await fastify.prisma.userPreferences.upsert({
            where: { userId },
            create: {
              userId,
              [category]: merged as any
            },
            update: {
              [category]: merged as any
            },
            select: { [category]: true }
          });

          return reply.send({
            success: true,
            data: updated[category] as T
          });
        } catch (error: any) {
          if (error.name === 'ZodError') {
            return reply.status(400).send({
              success: false,
              error: 'VALIDATION_ERROR',
              message: 'Invalid preference data',
              details: error.errors
            });
          }

          fastify.log.error({ error, category }, 'Error partially updating preferences');
          return reply.status(500).send({
            success: false,
            error: 'UPDATE_ERROR',
            message: error.message || 'Failed to update preferences'
          });
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
        const userId = (request as any).auth?.userId;

        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        try {
          // Mettre le champ JSON à null (les defaults seront retournés au GET)
          await fastify.prisma.userPreferences.update({
            where: { userId },
            data: { [category]: null }
          });

          return reply.send({
            success: true,
            message: `${category} preferences reset to defaults`
          });
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error resetting preferences');
          return reply.status(500).send({
            success: false,
            error: 'RESET_ERROR',
            message: error.message || 'Failed to reset preferences'
          });
        }
      }
    );
  };
}
