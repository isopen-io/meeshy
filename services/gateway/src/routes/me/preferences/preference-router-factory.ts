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
import { submittedKeysOnly } from '../../../utils/partial-update';
import { invalidatePrivacyPreferences } from '../../../services/preferences/privacy-cache';
import { emitPreferenceCategoryUpdated } from '../../../services/preferences/preferences-broadcast';
import { sendSuccess, sendForbidden, sendBadRequest, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import type { PreferenceCategory } from '../../../services/preferences/preferences-broadcast';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Où vit l'état d'une catégorie, quand ce n'est pas seulement son champ JSON.
 *
 * Une seule catégorie a besoin de le dire : `privacy` possède, en plus de son
 * document, les lignes clé/valeur héritées de janvier 2026 que les six portes
 * de diffusion obéissent encore (`services/preferences/privacy-storage`).
 * Tant que la factory lisait le seul document, la route et les portes se
 * contredisaient — et le `PATCH`, reconstruisant sa base sur ce que la route
 * lisait, écrasait un opt-out que personne n'avait demandé de lever.
 *
 * Injecté plutôt que testé sur `category` : la factory n'a pas à connaître
 * l'histoire d'une catégorie, seulement à demander à qui la connaît.
 */
export type CategoryStorage<T> = {
  /** Ce que le serveur tient pour stocké — au-delà du seul document JSON. */
  readStored: (prisma: PrismaClient, userId: string) => Promise<Partial<T> | null>;
  /** Après CHAQUE écriture réussie, une fois le document autoritatif. */
  afterWrite?: (prisma: PrismaClient, userId: string) => Promise<void>;
};

/**
 * Factory qui crée un plugin Fastify avec routes CRUD complètes
 * pour une catégorie de préférences
 *
 * @param category - Nom de la catégorie (doit matcher le champ JSON dans Prisma)
 * @param schema - Schema Zod de validation
 * @param defaults - Valeurs par défaut si aucune préférence n'est settée
 * @param storage - Rangement de la catégorie ; le document JSON par défaut
 */
export function createPreferenceRouter<T>(
  category: PreferenceCategory,
  schema: ZodSchema<T>,
  defaults: T,
  storage?: CategoryStorage<T>
) {
  return async function (fastify: FastifyInstance) {
    // Instancier le service de validation de consentement
    const consentService = new ConsentValidationService(fastify.prisma);

    const isEmpty = (obj: any): boolean => {
      return !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
    };

    /**
     * L'UNIQUE lecture de l'état stocké — partagée par le `GET` et par la base
     * de fusion du `PATCH`. Les deux divergeaient : le `GET` rendait le
     * document brut, le `PATCH` le complétait par les défauts. Un document
     * partiel se lisait donc différemment selon le verbe qui le regardait.
     */
    const readStored = async (userId: string): Promise<Partial<T> | null> => {
      if (storage) return storage.readStored(fastify.prisma, userId);

      const prefs = await fastify.prisma.userPreferences.findUnique({
        where: { userId },
        select: { [category]: true }
      });

      return isEmpty(prefs?.[category]) ? null : (prefs[category] as Partial<T>);
    };

    /** L'état complet servi au client : les défauts, comblés par le stocké. */
    const resolveComplete = async (userId: string): Promise<T> => ({
      ...defaults,
      ...((await readStored(userId)) ?? {})
    });

    /**
     * Le rangement hérité disparaît dès qu'une écriture rend le document
     * autoritatif. Une panne ici rend 500 sans diffuser : sur la remise à zéro,
     * des lignes de janvier survivantes RESSUSCITERAIENT le réglage effacé —
     * annoncer un succès partiel serait annoncer l'inverse de ce qui s'est
     * passé. Les trois verbes sont idempotents, le client peut retenter.
     */
    const retireSupersededStorage = (userId: string) =>
      storage?.afterWrite ? storage.afterWrite(fastify.prisma, userId) : Promise.resolve();

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
          return sendSuccess(reply, await resolveComplete(userId));
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
              ...errorResponseSchema,
              properties: {
                ...errorResponseSchema.properties,
                error: { type: 'string', example: 'CONSENT_REQUIRED' },
                violations: { type: 'array' },
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
          // outbox n'écrit pas deux fois les préférences.
          //
          // ATTENTION — ce commentaire promettait aussi que le broadcast
          // `preferences:updated` ne partirait pas deux fois. Il part APRÈS le
          // journal, sans condition : un rejeu le refait. Même dette que la
          // route `like` (`routes/posts/interactions.ts`), même remède
          // disponible (`withMutationOutcome`, verdict `replayed`), non porté
          // ici — hors du fil rouge du repost.
          const updated = await withMutationLog({
            request,
            fastify,
            userId,
            kind: `updateSettings:${category}`,
            // `converges` — un upsert de préférences rend le même état.
            replayCost: 'converges',
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

          await retireSupersededStorage(userId);
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
              ...errorResponseSchema,
              properties: {
                ...errorResponseSchema.properties,
                error: { type: 'string', example: 'CONSENT_REQUIRED' },
                violations: { type: 'array' },
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
          // Validation partielle Zod, réduite aux clés que le corps nomme :
          // `partial()` ne retire pas les `default()`, et sans cette réduction
          // la fusion ci-dessous serait inerte (cf. `utils/partial-update`).
          const validated = submittedKeysOnly(
            (schema as any).partial().parse(request.body) as Record<string, unknown>,
            request.body
          );

          // La base de fusion est CE QUE LE SERVEUR OBÉIT, pas ce que le seul
          // document dit : sinon une clé absente du document repart au défaut,
          // et un réglage qu'on ne touchait pas se trouve levé en silence.
          const merged = { ...(await resolveComplete(userId)), ...validated };

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
            // `converges` — un upsert de préférences rend le même état.
            replayCost: 'converges',
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

          await retireSupersededStorage(userId);
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

          await retireSupersededStorage(userId);
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
