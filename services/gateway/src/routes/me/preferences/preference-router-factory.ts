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
import { zodIssueSchema, issuesServies } from '../../../utils/zod-issue-schema';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { withMutationLog } from '../../../utils/withMutationLog';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendInternalError } from '../../../utils/response.js';
import { depreciee, type AdresseDepreciee } from '../../../utils/deprecation';
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
 * L'annonce de sursis d'un alias — déléguée au site UNIQUE (`utils/deprecation`,
 * #4274), jamais réimplémentée ici.
 *
 * Ce module en portait sa PROPRE version (`Deprecation: 'true'` posé à la main
 * par un hook `onSend`) : le brouillon 2019, écrit avant que le site unique
 * n'existe. Le jour où il a existé, les deux ont coexisté JUMELLES et
 * DIVERGENTES — exactement ce que la dimension 11 (maintenabilité, UNE source
 * de vérité) interdit, et exactement ce qu'un correctif de #4181 ne peut pas
 * laisser derrière lui : sept catégories × quatre verbes auraient été la SEULE
 * famille d'adresses dépréciées du dépôt à ne pas porter la forme RFC 9745
 * (`Deprecation: @<secondes-epoch>`, une date structurée) que portent déjà
 * `reports.ts`, `users-write.ts`, `profile.ts`, `register.ts`, `sharing.ts`,
 * `feed.ts`, `friends.ts`. Pas de `retraitLe` : la date de retrait n'est pas
 * connue, elle est CONDITIONNÉE au compteur d'accès de #4275. L'annoncer avant
 * qu'il ne l'établisse serait pire que le silence — un client qui la lit et
 * cesse d'appeler perdrait ses écritures hors ligne le jour où elle passe.
 */
const ALIAS_DEPRECIE: AdresseDepreciee = {
  depuis: '2026-08-29',
  successeur: '/api/v1/me/preferences',
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

    // `onRequest`, pas `onSend` : c'est le choix documenté par
    // `utils/deprecation.ts` lui-même — l'annonce doit sortir AVANT toute
    // garde (auth, débit, rôle), quel que soit le verdict rendu ensuite.
    fastify.addHook('onRequest', depreciee(ALIAS_DEPRECIE));

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
            400: {
              ...errorResponseSchema,
              properties: {
                ...errorResponseSchema.properties,
                issues: {
                  type: 'array',
                  items: zodIssueSchema,
                  description: 'Une entrée par champ refusé — une clé inconnue vit dans `keys` (#4589)',
                },
              },
            },
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
          // Validation Zod, STRICTE (#4589) : une clé non déclarée LÈVE ici
          // plutôt que d'être retirée en silence par le mode *strip*.
          const validated = schema.strict().parse(request.body);

          // #4578 — la garde lit les clés que le corps NOMME, pas celles que
          // `schema.parse` vient d'injecter depuis les `default()`. Sur ce
          // verbe la distinction est encore plus nette : `parse` REMPLIT le
          // document, si bien qu'un `PUT {"theme":"dark"}` arrivait à la garde
          // en affirmant les vingt autres clés — dont `telemetryEnabled: true`.
          // Voir le commentaire détaillé sur le PATCH ci-dessous.
          const consentViolations = await consentService.validatePreferences(
            userId,
            category,
            submittedFrom(schema, request.body) as Record<string, any>
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
            // #4589 — le refus NOMME ce qu'il refuse. Il servait
            // `VALIDATION_ERROR` nu : le serveur savait exactement quelle clé
            // était en cause, et ne le disait pas. Même défaut que #4487 sur
            // `/me/consents`, et même correctif — `details` étale à la racine,
            // et `issues` est DÉCLARÉ au schéma de réponse ci-dessus, sans quoi
            // `fast-json-stringify` l'effacerait au dernier mètre.
            return sendBadRequest(reply, 'VALIDATION_ERROR', {
              details: { issues: issuesServies(error.issues ?? []) },
            });
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
            400: {
              ...errorResponseSchema,
              properties: {
                ...errorResponseSchema.properties,
                issues: {
                  type: 'array',
                  items: zodIssueSchema,
                  description: 'Une entrée par champ refusé — une clé inconnue vit dans `keys` (#4589)',
                },
              },
            },
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

          // #4578 — la garde de consentement lit ce que le corps NOMME, jamais
          // le document fusionné ni les défauts du schéma.
          //
          // Mesuré sur staging le 2026-08-31, sur un compte créé pour
          // l'occasion : un `PATCH {"theme":"dark"}` était REFUSÉ en nommant
          // `telemetryEnabled`, une clé que le corps ne portait pas. Trois
          // catégories sur sept étaient inaccessibles à un compte neuf —
          // `application`, `privacy`, `audio` — parce que cinq préférences
          // gardées par un consentement valent `true` PAR DÉFAUT. L'utilisateur
          // ne pouvait ni changer son thème, ni sa visibilité, ni sa qualité
          // audio, et le refus nommait un champ qu'il n'avait pas touché.
          //
          // Le commentaire qui justifiait la lecture fusionnée disait : « une
          // clé absente n'est pas éteinte, elle relève de son défaut — et c'est
          // ce défaut qui sera servi et appliqué ». La seconde moitié est ce
          // qu'il fallait vérifier, et la mesure la partage en deux :
          //
          //  · AUDIO — `transcriptionEnabled`, `audioTranslationEnabled`,
          //    `ttsEnabled` : une garde d'USAGE existe et fait le travail
          //    (`routes/attachments/translation.ts:186`/`:365`,
          //    `MessageTranslationService.ts:2439`). Stocker `true` sans le
          //    consentement voix n'applique RIEN — la garde d'écriture était
          //    redondante, et c'est elle qui verrouillait les réglages.
          //  · TÉLÉMÉTRIE / ANALYTIQUE — `telemetryEnabled`, `allowAnalytics` :
          //    AUCUN lecteur d'usage dans le dépôt. La garde d'écriture était
          //    donc la seule, et la retirer laisserait un document affirmant
          //    `true` pour un non-consentant. C'est pourquoi ces deux-là
          //    passent à `false` PAR DÉFAUT dans le même lot : un système dont
          //    l'état PAR DÉFAUT viole son propre modèle de consentement n'a
          //    pas un problème de validation, il a un problème de défaut.
          //
          // L'invariant qui en résulte est gardé par
          // `consent-gated-defaults-invariant.test.ts` : aucune préférence
          // gardée ne peut valoir `true` par défaut sans garde d'usage.
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
            // #4589 — le refus NOMME ce qu'il refuse. Il servait
            // `VALIDATION_ERROR` nu : le serveur savait exactement quelle clé
            // était en cause, et ne le disait pas. Même défaut que #4487 sur
            // `/me/consents`, et même correctif — `details` étale à la racine,
            // et `issues` est DÉCLARÉ au schéma de réponse ci-dessus, sans quoi
            // `fast-json-stringify` l'effacerait au dernier mètre.
            return sendBadRequest(reply, 'VALIDATION_ERROR', {
              details: { issues: issuesServies(error.issues ?? []) },
            });
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
