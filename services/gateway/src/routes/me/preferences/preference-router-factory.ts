/**
 * Preference Router Factory — les VINGT-HUIT alias par catégorie.
 *
 * Génère `GET`/`PUT`/`PATCH`/`DELETE` pour une catégorie de préférences. Depuis
 * #4181, ces routes sont des ALIAS : la surface vivante est
 * `GET`/`PATCH`/`DELETE /me/preferences` (`unified-routes.ts`), qui fait tout ce
 * qu'elles font, en un appel, avec un débit par compte et un `If-None-Match`.
 * Elles restent montées, marquées `Deprecation`, tant que le compteur d'accès
 * par route n'est pas tombé à zéro sur deux versions publiées de CHAQUE client —
 * iOS (dont l'outbox porte des mutations écrites HORS LIGNE), web et Android.
 *
 * Ce qu'elles gardent en propre : leur `schema` et leurs `defaults` viennent de
 * leurs PARAMÈTRES, pas du registre. Un témoin qui monte un routeur `audio` sur
 * le schéma de `privacy` doit obéir à ce qu'on lui passe. Ce qu'elles ne gardent
 * PAS en propre : les RÈGLES — complétion par défauts, réduction aux clés
 * soumises, lecture de la colonne JSON, et les trois gestes d'après-écriture.
 * Toutes vivent dans `preference-registry.ts` et sont partagées avec les routes
 * unifiées. C'est la seule forme où une fusion ne peut pas faire diverger les
 * deux surfaces pendant la période d'alias.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { withMutationLog } from '../../../utils/withMutationLog';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import {
  applyCategoryWriteEffects,
  readJsonPreferenceColumn,
  resolveComplete,
  submittedFrom,
  type CategoryStorage,
  type PreferenceCategory,
  type PreferenceDocument,
  type PreferenceSchema,
} from './preference-registry';

export type { CategoryStorage };

/**
 * En-tête posé sur CHAQUE réponse d'un alias (RFC 8594 / draft-deprecation).
 *
 * Il n'y a volontairement pas de `Sunset` : la date de retrait n'est pas connue,
 * elle est CONDITIONNÉE au compteur d'accès. Annoncer une date qu'on ne tiendra
 * pas serait pire que n'en annoncer aucune — un client qui la lit et cesse
 * d'appeler perdrait ses écritures hors ligne le jour où elle passe.
 */
const DEPRECATION_HEADERS: Readonly<Record<string, string>> = {
  Deprecation: 'true',
  Link: '</api/v1/me/preferences>; rel="successor-version"',
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
export function createPreferenceRouter(
  category: PreferenceCategory,
  schema: PreferenceSchema,
  defaults: PreferenceDocument,
  storage?: CategoryStorage
) {
  return async function (fastify: FastifyInstance) {
    // Instancier le service de validation de consentement
    const consentService = new ConsentValidationService(fastify.prisma);

    fastify.addHook('onSend', async (_request, reply, payload) => {
      for (const [name, value] of Object.entries(DEPRECATION_HEADERS)) {
        reply.header(name, value);
      }
      return payload;
    });

    /**
     * L'UNIQUE lecture de l'état stocké — partagée par le `GET` et par la base
     * de fusion du `PATCH`. Les deux divergeaient : le `GET` rendait le
     * document brut, le `PATCH` le complétait par les défauts. Un document
     * partiel se lisait donc différemment selon le verbe qui le regardait.
     */
    const readStored = async (userId: string): Promise<PreferenceDocument | null> =>
      storage
        ? storage.readStored(fastify.prisma, userId)
        : readJsonPreferenceColumn(fastify.prisma, userId, category);

    /**
     * L'état complet servi au client : les défauts, comblés par le stocké.
     * La complétion elle-même est le SITE UNIQUE du registre — l'agrégat la
     * réimplémentait, et un défaut ajouté n'apparaissait alors que d'un côté.
     */
    const resolveCompleteFor = async (userId: string): Promise<PreferenceDocument> =>
      resolveComplete(defaults, await readStored(userId));

    /**
     * Les TROIS gestes d'après-écriture, en UN appel : retrait des lignes
     * héritées de janvier 2026, purge du cache des portes de diffusion,
     * diffusion `preferences:updated`. Partagés avec les routes unifiées
     * (`preference-registry.ts`) — en perdre un d'un seul côté est le défaut le
     * plus silencieux du module.
     */
    const afterWrite = (userId: string) =>
      applyCategoryWriteEffects(fastify, userId, [category]);
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
          return sendSuccess(reply, await resolveCompleteFor(userId));
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error fetching preferences');
          return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch preferences' });
        }
      }
    );

    // PUT /me/preferences/{category} - Remplacement complet
    fastify.put<{ Body: PreferenceDocument }>(
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
                  [category]: validated
                },
                update: {
                  [category]: validated
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

          await afterWrite(userId);

          return sendSuccess(reply, (updated as Record<string, unknown> | null)?.[category]);
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
    fastify.patch<{ Body: PreferenceDocument }>(
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
          // Même site que le `mode=merge` unifié — l'`any` qui traînait ici
          // était le seul endroit du module où le schéma perdait son type.
          const validated = submittedFrom(schema, request.body);

          // La base de fusion est CE QUE LE SERVEUR OBÉIT, pas ce que le seul
          // document dit : sinon une clé absente du document repart au défaut,
          // et un réglage qu'on ne touchait pas se trouve levé en silence.
          const merged = { ...(await resolveCompleteFor(userId)), ...validated };

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
                  [category]: merged
                },
                update: {
                  [category]: merged
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

          await afterWrite(userId);

          return sendSuccess(reply, (updated as Record<string, unknown> | null)?.[category]);
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

          await afterWrite(userId);

          return sendSuccess(reply, undefined, { message: `${category} preferences reset to defaults` });
        } catch (error: any) {
          fastify.log.error({ error, category }, 'Error resetting preferences');
          return sendInternalError(reply, 'RESET_ERROR', { message: 'Failed to reset preferences' });
        }
      }
    );
  };
}
