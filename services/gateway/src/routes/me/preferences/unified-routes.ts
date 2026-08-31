/**
 * Les TROIS routes qui remplacent les trente (#4181).
 *
 * ```
 * GET    /me/preferences?categories=a,b&fields=a.k   (If-None-Match)
 * PATCH  /me/preferences?mode=merge|replace          (corps multi-catégories)
 * DELETE /me/preferences?categories=a,b              (absent = tout)
 * ```
 *
 * ## Ce que les trente coûtaient
 *
 * `createPreferenceRouter` engendrait quatre verbes pour chacune des sept
 * catégories : la catégorie était un PARAMÈTRE déguisé en chemin. Vingt-huit
 * routes à garder, à documenter, à limiter en débit, à faire évoluer ensemble —
 * et deux routes d'agrégat par-dessus, dont l'une réimplémentait la complétion
 * par défauts. Les conséquences se mesuraient chez l'utilisateur :
 *
 *  • un écran de réglages qui touche DEUX catégories faisait DEUX écritures,
 *    donc deux allers-retours, deux diffusions, et une fenêtre où la moitié du
 *    geste était enregistrée et l'autre non ;
 *  • `GET /me/preferences` repatriait ~130 clés pour en afficher quinze, sans
 *    `If-None-Match` : rouvrir l'écran repayait le corps entier ;
 *  • `PUT` et `PATCH` n'avaient AUCUN limiteur par compte ;
 *  • « tout réinitialiser » coûtait sept appels — ou passait par un agrégat que
 *    personne n'appelait, retiré au lot précédent (#4186).
 *
 * ## `DELETE /me/preferences` REVIENT — et ce n'est pas un aller-retour
 *
 * Le lot précédent a retiré `DELETE /me/preferences` parce que la remise à zéro
 * GLOBALE n'avait aucun appelant sur les trois clients. L'adresse est reprise
 * ici sous un contrat DIFFÉRENT : `?categories=` nomme ce qu'on remet à zéro,
 * l'absence de liste valant « tout ». Ce n'est pas l'ancienne route rétablie —
 * c'est celle qui absorbe les SEPT `DELETE` par catégorie, et le retrait
 * précédent est ce qui a libéré l'adresse pour elle.
 *
 * ## Les trois gestes d'après-écriture ne sont pas ici
 *
 * `applyCategoryWriteEffects` (registre) les tient : retrait des lignes
 * héritées de janvier 2026, purge du cache des portes de diffusion, diffusion
 * par catégorie. Les quatre verbes des alias appellent la MÊME fonction. C'est
 * la seule forme où la fusion ne peut pas en égarer un — et en perdre un est le
 * défaut le plus silencieux du module : la remise à zéro qui ne remet rien,
 * l'opt-out toujours diffusé cinq minutes, l'écran voisin qui ne se rafraîchit
 * jamais.
 *
 * ## `mode=replace` ne réintroduit AUCUN défaut Zod
 *
 * C'est la différence de fond avec le `PUT` qu'il remplace. `PUT` parsait le
 * corps contre le schéma COMPLET : toute clé absente revenait à son `default()`
 * et était ÉCRITE — ni un remplacement fidèle, ni un `PATCH`, mais une
 * réinitialisation partielle silencieuse. `replace` écrit exactement les clés
 * que le corps nomme (`parseSubmittedKeys`), et sa réponse les rend telles
 * quelles : une clé absente du corps est ABSENTE de la réponse, pas remise à sa
 * valeur d'usine. En `merge`, la réponse reprend la forme du `GET`, complétée
 * par les défauts — le point 22 de l'audit reste vrai des deux côtés.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { zodIssueSchema, issuesServies } from '../../../utils/zod-issue-schema';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { withMutationLog } from '../../../utils/withMutationLog';
import { sendWithETag } from '../../../utils/etag';
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendInternalError,
} from '../../../utils/response.js';
import {
  PREFERENCE_REGISTRY,
  applyCategoryWriteEffects,
  isPreferenceCategory,
  parseSubmittedKeys,
  resolveComplete,
  resolveCompleteCategories,
  type PreferenceCategory,
  type PreferenceDocument,
} from './preference-registry';
import { parseSelection, projectSelection } from './preference-selection';
import { createPreferenceRateLimitConfig } from './preference-rate-limit';

type PreferenceQuery = { readonly categories?: string; readonly fields?: string; readonly mode?: string };

/**
 * Le corps d'une catégorie, par catégorie : `{ "application": { "theme": … } }`.
 * `unknown` et non `PreferenceDocument` — c'est le contrat AVANT validation.
 */
type MultiCategoryBody = Record<string, unknown>;

/** Réponse d'écriture et de lecture : un objet par catégorie servie. */
const categoriesResponseSchema = {
  type: 'object',
  properties: Object.fromEntries(
    Object.keys(PREFERENCE_REGISTRY).map((category) => [
      category,
      // `additionalProperties: true` sur CHAQUE catégorie. Sans cette clause,
      // fast-json-stringify sérialise `{}` pour un `type: 'object'` sans
      // `properties` — la route rendait sept objets VIDES, chaque réglage
      // effacé à la sortie, en silence. Le témoin qui l'attrape doit passer par
      // la ROUTE : un appel direct au validateur ne voit jamais le sérialiseur.
      { type: 'object', additionalProperties: true },
    ])
  ),
} as const;

const querystringDoc = {
  type: 'object',
  properties: {
    categories: { type: 'string', description: 'Liste CSV de catégories ; absente = toutes' },
    fields: { type: 'string', description: "Liste CSV de `catégorie.clé` ou `catégorie`" },
  },
} as const;

/**
 * Les valeurs d'énumération (`mode`) sont validées DANS le handler et non par
 * AJV : une violation de schéma de query rend l'enveloppe d'erreur native de
 * Fastify (`{statusCode, error, message}`), pas celle du dépôt
 * (`{success:false, error, message}`). Un client qui lit `success` verrait donc
 * une réponse dont il ne sait rien dire.
 */
type WriteMode = 'merge' | 'replace';

function parseMode(value: string | undefined): WriteMode | null {
  if (value === undefined || value === '' || value === 'merge') return 'merge';
  if (value === 'replace') return 'replace';
  return null;
}

type CategoryWrite = {
  readonly category: PreferenceCategory;
  /** Ce qui sera ÉCRIT dans la colonne JSON. */
  readonly stored: PreferenceDocument;
  /** L'état que le serveur OBÉIRA. */
  readonly effective: PreferenceDocument;
  /**
   * Ce que le CORPS NOMME — et c'est lui, depuis #4578, que la garde de
   * consentement lit. Voir le commentaire du site de validation plus bas.
   */
  readonly submitted: PreferenceDocument;
};

export async function unifiedPreferenceRoutes(fastify: FastifyInstance): Promise<void> {
  const consentService = new ConsentValidationService(fastify.prisma);

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /me/preferences — huit routes en une
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.get<{ Querystring: PreferenceQuery }>(
    '/',
    {
      config: { rateLimit: createPreferenceRateLimitConfig('read') },
      schema: {
        description:
          'Lire les préférences — toutes, ou celles que `categories`/`fields` nomment',
        tags: ['preferences'],
        summary: 'Get preferences',
        querystring: querystringDoc,
        response: {
          200: {
            description: 'Préférences servies, complétées par les défauts',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: categoriesResponseSchema,
            },
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
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Le plugin PARENT (`preferences/index.ts`) pose déjà
      // `createUnifiedAuthMiddleware({ requireAuth: true, allowAnonymous: false })`
      // en `preHandler` : `request.auth.userId` est garanti ici. Le contrôle
      // reste, inline et comme chez les routes voisines de ce répertoire — un
      // `require*` nommé aurait été une QUATORZIÈME garde locale, la famille que
      // #4153 a supprimée et qu'une garde de source interdit de rouvrir.
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      const parsed = parseSelection(request.query);
      if (parsed.ok === false) {
        return sendBadRequest(reply, parsed.failure.code, { message: parsed.failure.message });
      }

      try {
        const complete = await resolveCompleteCategories(
          fastify.prisma,
          userId,
          parsed.selection.categories
        );
        const payload = projectSelection(complete, parsed.selection);

        // L'ETag hache CE QUI EST SERVI, donc il varie avec `categories` et
        // `fields` sans qu'on ait à les mêler à la clé : deux écrans qui lisent
        // deux sous-ensembles ne s'invalident plus l'un l'autre.
        if (sendWithETag(request, reply, payload)) return;

        return sendSuccess(reply, payload);
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching preferences');
        return sendInternalError(reply, 'FETCH_ERROR', {
          message: 'Failed to fetch preferences',
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /me/preferences — quatorze routes en une
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.patch<{ Querystring: PreferenceQuery; Body: MultiCategoryBody }>(
    '/',
    {
      config: { rateLimit: createPreferenceRateLimitConfig('write') },
      schema: {
        description:
          'Écrire une ou plusieurs catégories en un seul appel (`mode=merge` par défaut, `replace`)',
        tags: ['preferences'],
        summary: 'Update preferences',
        querystring: {
          type: 'object',
          properties: {
            mode: { type: 'string', description: '`merge` (défaut) ou `replace`' },
          },
        },
        body: { type: 'object' },
        response: {
          200: {
            description: 'Préférences écrites',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: categoriesResponseSchema,
            },
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
            },
          },
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Le plugin PARENT (`preferences/index.ts`) pose déjà
      // `createUnifiedAuthMiddleware({ requireAuth: true, allowAnonymous: false })`
      // en `preHandler` : `request.auth.userId` est garanti ici. Le contrôle
      // reste, inline et comme chez les routes voisines de ce répertoire — un
      // `require*` nommé aurait été une QUATORZIÈME garde locale, la famille que
      // #4153 a supprimée et qu'une garde de source interdit de rouvrir.
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      const mode = parseMode(request.query.mode);
      if (mode === null) {
        return sendBadRequest(reply, 'VALIDATION_ERROR', {
          message: `Unknown mode '${request.query.mode}' — expected 'merge' or 'replace'`,
        });
      }

      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return sendBadRequest(reply, 'VALIDATION_ERROR', {
          message: 'Body must be an object keyed by preference category',
        });
      }

      const named = Object.keys(body);
      if (named.length === 0) {
        return sendBadRequest(reply, 'VALIDATION_ERROR', {
          message: 'Body names no preference category',
        });
      }

      const unknown = named.find((key) => !isPreferenceCategory(key));
      if (unknown !== undefined) {
        return sendBadRequest(reply, 'UNKNOWN_CATEGORY', {
          message: `Unknown preference category '${unknown}'`,
        });
      }

      const categories = named.filter(isPreferenceCategory);

      try {
        const base =
          mode === 'merge'
            ? await resolveCompleteCategories(fastify.prisma, userId, categories)
            : {};

        const writes: CategoryWrite[] = categories.map((category) => {
          const submitted = parseSubmittedKeys(category, body[category]);
          const stored =
            mode === 'merge' ? { ...(base[category] ?? {}), ...submitted } : submitted;
          return {
            category,
            stored,
            effective: resolveComplete(PREFERENCE_REGISTRY[category].defaults, stored),
            submitted,
          };
        });

        // #4578 — la garde lit `submitted`, pas `effective`.
        //
        // Elle lisait l'état OBÉI, au motif qu'« en `replace`, une clé absente
        // n'est pas éteinte, elle relève de son défaut — et c'est ce défaut qui
        // sera servi et appliqué ». La seconde moitié était l'affirmation à
        // vérifier, et la mesure sur staging l'a partagée en deux : pour la
        // famille AUDIO une garde d'USAGE existe et fait le travail, donc
        // stocker `true` n'applique rien ; pour `telemetryEnabled` et
        // `allowAnalytics` aucun lecteur d'usage n'existe — d'où leur passage à
        // `false` par défaut dans le même lot, plutôt qu'une garde d'écriture
        // qui verrouillait trois catégories de réglages sur sept pour un compte
        // neuf. Détail complet : `preference-router-factory.ts`, même lot.
        const violations = (
          await Promise.all(
            writes.map(async (write) =>
              (
                await consentService.validatePreferences(userId, write.category, write.submitted)
              ).map((violation) => ({ ...violation, category: write.category }))
            )
          )
        ).flat();

        if (violations.length > 0) {
          return reply.status(403).send({
            success: false,
            error: 'CONSENT_REQUIRED',
            message: 'Missing required consents for requested preferences',
            violations,
          });
        }

        const columns = Object.fromEntries(writes.map((w) => [w.category, w.stored]));
        const select = {
          id: true,
          ...Object.fromEntries(writes.map((w) => [w.category, true])),
        };

        const updated = await withMutationLog({
          request,
          fastify,
          userId,
          // Le journal s'indexe sur `(userId, clientMutationId)` — jamais sur
          // `kind`. Une mutation d'outbox rejouée par l'ANCIENNE adresse puis
          // par celle-ci se dédoublonne donc quand même : le `kind` ne sert
          // qu'à lire le journal.
          kind: `updateSettings:${categories.join('+')}`,
          replayCost: 'converges',
          op: async () => {
            const row = await fastify.prisma.userPreferences.upsert({
              where: { userId },
              create: { userId, ...columns },
              update: { ...columns },
              select,
            });
            return row as typeof row & { id: string };
          },
          onDuplicate: async () => {
            const row = await fastify.prisma.userPreferences.findUnique({
              where: { userId },
              select,
            });
            return row as (typeof row & { id: string }) | null;
          },
        });

        await applyCategoryWriteEffects(fastify, userId, categories);

        const row = (updated ?? {}) as Record<string, unknown>;
        const data = Object.fromEntries(
          writes.map(({ category }) => {
            const persisted = row[category] as PreferenceDocument | null | undefined;
            const served =
              mode === 'merge'
                ? resolveComplete(PREFERENCE_REGISTRY[category].defaults, persisted)
                : (persisted ?? {});
            return [category, served];
          })
        );

        return sendSuccess(reply, data);
      } catch (error) {
        const failure = error as { name?: string; message?: string };
        if (failure.name === 'ZodError') {
          // #4589 — le refus NOMME ce qu'il refuse. `failure.message` seul est
          // une prose Zod sérialisée : lisible par un humain qui la déplie,
          // inutilisable par un client qui veut pointer le champ fautif.
          // `issues` est déclaré au schéma 243 ci-dessus, sinon
          // `fast-json-stringify` l'effacerait.
          return sendBadRequest(reply, 'VALIDATION_ERROR', {
            message: failure.message,
            details: { issues: issuesServies((failure as { issues?: unknown[] }).issues ?? []) },
          });
        }

        fastify.log.error({ error }, 'Error updating preferences');
        return sendInternalError(reply, 'UPDATE_ERROR', {
          message: 'Failed to update preferences',
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /me/preferences — huit routes en une
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.delete<{ Querystring: PreferenceQuery }>(
    '/',
    {
      config: { rateLimit: createPreferenceRateLimitConfig('reset') },
      schema: {
        description:
          'Remettre aux valeurs par défaut les catégories nommées — sans liste, toutes',
        tags: ['preferences'],
        summary: 'Reset preferences',
        querystring: querystringDoc,
        response: {
          200: {
            description: 'Préférences réinitialisées',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: { categories: { type: 'array', items: { type: 'string' } } },
              },
            },
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
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Le plugin PARENT (`preferences/index.ts`) pose déjà
      // `createUnifiedAuthMiddleware({ requireAuth: true, allowAnonymous: false })`
      // en `preHandler` : `request.auth.userId` est garanti ici. Le contrôle
      // reste, inline et comme chez les routes voisines de ce répertoire — un
      // `require*` nommé aurait été une QUATORZIÈME garde locale, la famille que
      // #4153 a supprimée et qu'une garde de source interdit de rouvrir.
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'UNAUTHORIZED', { message: 'Authentication required' });
      }

      const parsed = parseSelection({ categories: request.query.categories });
      if (parsed.ok === false) {
        return sendBadRequest(reply, parsed.failure.code, { message: parsed.failure.message });
      }

      const categories = parsed.selection.categories;

      try {
        // `updateMany` et non `update` : rien ne crée la ligne `UserPreferences`
        // à l'inscription — ses seuls créateurs sont les `upsert` d'écriture.
        // `update` y lève `P2025`, rendu en 500, exactement pour l'utilisateur
        // qui n'a jamais rien écrit, donc qui EST déjà aux valeurs par défaut.
        await fastify.prisma.userPreferences.updateMany({
          where: { userId },
          data: Object.fromEntries(categories.map((category) => [category, null])),
        });

        await applyCategoryWriteEffects(fastify, userId, categories);

        return sendSuccess(
          reply,
          { categories: [...categories] },
          { message: `${categories.length} preference categories reset to defaults` }
        );
      } catch (error) {
        fastify.log.error({ error }, 'Error resetting preferences');
        return sendInternalError(reply, 'RESET_ERROR', {
          message: 'Failed to reset preferences',
        });
      }
    }
  );
}
