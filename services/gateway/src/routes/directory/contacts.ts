import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ContactDirectoryService, type DirectoryFilter, type SyncMode } from '../../services/ContactDirectoryService';
import { directoryEntrySchema } from '../users/contacts-schemas';
import { viewerFromRequest } from '../users/presence-gate';
import type { AuthenticatedRequest } from '../users/types';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { callerRateKey } from '../../utils/client-rate-key';
import { sendWithETag } from '../../utils/etag';
import { validatePagination } from '../../utils/pagination';
import { synchroniser } from './contacts-sync';

/**
 * Le plafond de page, PORTÉ PAR LA ROUTE.
 *
 * `ContactDirectoryService.list` bornait déjà à 200 — silencieusement. Un
 * client qui demandait 500 en recevait 200 sans jamais l'apprendre, et
 * paginait ensuite sur une taille qu'il ne connaissait pas. La borne du service
 * reste (elle protège tout autre appelant) ; celle-ci REFUSE, ce qui est le
 * rôle d'un contrat.
 */
export const LIMITE_MAX_CONTACTS = 100;
const LIMITE_DEFAUT_CONTACTS = 50;

const VALID_FILTERS: DirectoryFilter[] = ['all', 'meeshy', 'invitable'];
/** Tolérance d'horloge cliente pour `syncStartedAt` — au-delà, 400. */
const TOLERANCE_HORLOGE_MS = 5_000;

function filtre(valeur: unknown): DirectoryFilter {
  return VALID_FILTERS.includes(valeur as DirectoryFilter) ? (valeur as DirectoryFilter) : 'all';
}

function acteur(request: FastifyRequest): string | null {
  const ctx = (request as AuthenticatedRequest).authContext;
  return ctx?.isAuthenticated && ctx.registeredUser ? (ctx.userId ?? null) : null;
}

const corpsSynchronisation = {
  type: 'object',
  required: ['contacts'],
  properties: {
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          displayName: { type: 'string' },
          phoneNumbers: { type: 'array', items: { type: 'string' } },
          emails: { type: 'array', items: { type: 'string' } },
          usernames: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    defaultCountry: { type: 'string' },
    syncStartedAt: {
      type: 'string',
      format: 'date-time',
      description:
        'Watermark (ISO 8601), identical across every batch of one sync — echoed by the first batch. Rejected if more than 5s in the future.',
    },
    isFinalBatch: {
      type: 'boolean',
      description: 'True on the last batch — triggers the purge of entries untouched since `syncStartedAt`.',
    },
  },
} as const;

const reponseSynchronisation = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        totalContacts: { type: 'number' },
        processedContacts: { type: 'number' },
        syncedCount: { type: 'number' },
        matchedCount: { type: 'number' },
        removedCount: { type: 'number' },
        syncStartedAt: { type: 'string' },
        // La réponse d'écriture SUFFIT : le client n'a plus à relire son
        // carnet entier après une synchronisation. Ce qu'il ignorait — quelles
        // lignes ont bougé — se lit par `?updatedSince=` sur la lecture, en un
        // aller-retour borné, jamais par un rapatriement complet.
        appliedAt: {
          type: 'string',
          description: 'Server clock after the write — pass it as `updatedSince` to read back only what moved.',
        },
      },
    },
  },
} as const;

/**
 * Le carnet d'adresses, par DELTA (#4163).
 *
 * ## Ce que ces routes remplacent
 *
 * Trois routes synchronisaient et lisaient le carnet, et **le répertoire entier
 * était retéléchargé à chaque revalidation** : iOS paginait par 200 jusqu'à 250
 * pages, sans delta ni ETag, et faisait suivre CHAQUE synchronisation d'une
 * relecture complète.
 *
 * ## Le mode devient le VERBE
 *
 * `PUT` remplace, `PATCH` fusionne. Le mode voyageait dans le CORPS — un champ
 * `mode: 'merge'|'replace'` qu'aucun intermédiaire ne peut lire, et qui rendait
 * indiscernables deux requêtes dont l'une PURGE.
 *
 * La tolérance existante est conservée telle quelle : **un lot tronqué ne peut
 * jamais être final**. `normalizeContacts` jette des fiches en silence au-delà
 * de la borne ; purger sur un tel lot amputerait le carnet de données qu'aucun
 * envoi n'a reçues.
 */
export async function directoryContactsRoutes(fastify: FastifyInstance) {
  const parLecture = createCustomRateLimiter(
    { max: 60, windowMs: 60_000, keyPrefix: 'dir:contacts:u', message: 'Trop de lectures du carnet. Patientez une minute.', keyGenerator: callerRateKey },
    fastify.redis ?? undefined
  );
  const parEcriture = createCustomRateLimiter(
    { max: 10, windowMs: 60_000, keyPrefix: 'dir:contacts:write:u', message: 'Trop de synchronisations. Patientez une minute.', keyGenerator: callerRateKey },
    fastify.redis ?? undefined
  );

  // ─── Lire ──────────────────────────────────────────────────────────────────

  fastify.get('/contacts', {
    onRequest: [fastify.authenticate],
    preHandler: [parLecture.middleware()],
    schema: {
      description: 'Read the persisted address book by cursor, optionally only what changed since a watermark.',
      tags: ['directory'],
      summary: 'Read the address book',
      querystring: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: `One of ${VALID_FILTERS.join(', ')} — anything else falls back to "all"` },
          q: { type: 'string' },
          cursor: { type: 'string', description: 'Id of the last row of the previous page' },
          limit: { type: 'string', description: `1..${LIMITE_MAX_CONTACTS}` },
          updatedSince: { type: 'string', format: 'date-time', description: 'Return only entries changed after this instant' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: directoryEntrySchema },
            pagination: {
              type: 'object',
              properties: {
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string', nullable: true },
                limit: { type: 'number' },
              },
            },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const moi = acteur(request);
      if (!moi) return sendUnauthorized(reply, 'Authentication required');

      const query = (request.query ?? {}) as Record<string, unknown>;

      // Le décodage passe par le SITE UNIQUE ; le REFUS s'en dérive. Le service
      // RABOTE, cette route REFUSE — un `limit=500` silencieusement ramené à
      // 200 ment sur ce qu'il a servi.
      const brut = typeof query.limit === 'string' ? query.limit : undefined;
      const { limit: taille } = validatePagination('0', brut, {
        defaultLimit: LIMITE_DEFAUT_CONTACTS,
        maxLimit: LIMITE_MAX_CONTACTS,
      });
      if (brut !== undefined && String(taille) !== brut.trim()) {
        return sendBadRequest(reply, `limit must be an integer between 1 and ${LIMITE_MAX_CONTACTS}`);
      }

      let updatedSince: Date | undefined;
      if (typeof query.updatedSince === 'string' && query.updatedSince.length > 0) {
        const borne = new Date(query.updatedSince);
        if (Number.isNaN(borne.getTime())) return sendBadRequest(reply, 'Invalid updatedSince');
        updatedSince = borne;
      }

      const service = new ContactDirectoryService(fastify.prisma);
      const { contacts, hasMore, nextCursor } = await service.page({
        ownerId: moi,
        viewer: viewerFromRequest(request),
        limit: taille,
        cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
        filter: filtre(query.filter),
        query: typeof query.q === 'string' ? query.q : undefined,
        updatedSince,
      });

      const pagination = { hasMore, nextCursor, limit: taille };
      const charge = { success: true, data: contacts, pagination };

      // `private, no-cache` : le carnet change sous la main de son
      // propriétaire, donc on revalide toujours — et le 304 fait de cette
      // revalidation un aller-retour SANS corps. C'est là que se paie le
      // rapatriement complet que ce lot supprime.
      if (sendWithETag(request, reply, charge)) return reply;

      return sendSuccess(reply, contacts, { pagination } as never);
    } catch (error) {
      logError(fastify.log, '[DIR-CONTACTS] Error reading directory', error);
      return sendInternalError(reply, 'Failed to load contacts');
    }
  });

  // ─── Synchroniser : le mode est le VERBE ───────────────────────────────────

  for (const [verbe, mode] of [['PUT', 'replace'], ['PATCH', 'merge']] as const) {
    fastify.route({
      method: verbe,
      url: '/contacts',
      onRequest: [fastify.authenticate],
      preHandler: [parEcriture.middleware()],
      schema: {
        description: verbe === 'PUT'
          ? 'Replace the address book with this payload — purges entries absent from it.'
          : 'Merge this payload into the address book — never purges.',
        tags: ['directory'],
        summary: verbe === 'PUT' ? 'Replace the address book' : 'Merge into the address book',
        body: corpsSynchronisation,
        response: {
          200: reponseSynchronisation,
          400: errorResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      handler: async (request: FastifyRequest, reply: FastifyReply) =>
        synchroniser(fastify, request, reply, mode),
    });
  }

  // ─── Effacer ───────────────────────────────────────────────────────────────

  fastify.delete('/contacts', {
    onRequest: [fastify.authenticate],
    preHandler: [parEcriture.middleware()],
    schema: {
      description: 'Erase the persisted address book (right to withdrawal).',
      tags: ['directory'],
      summary: 'Erase the address book',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', properties: { removedCount: { type: 'number' } } },
          },
        },
        401: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const moi = acteur(request);
      if (!moi) return sendUnauthorized(reply, 'Authentication required');

      const removedCount = await new ContactDirectoryService(fastify.prisma).clear(moi);
      return sendSuccess(reply, { removedCount });
    } catch (error) {
      logError(fastify.log, '[DIR-CONTACTS] Error clearing directory', error);
      return sendInternalError(reply, 'Failed to clear contacts');
    }
  });
}
