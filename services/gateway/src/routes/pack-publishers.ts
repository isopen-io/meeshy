/**
 * LES ÉDITEURS DE PACKS — `/publishers` (#16274).
 *
 *   - `GET /publishers/me`     l'éditeur du compte connecté (`null` s'il n'en a pas encore) ;
 *   - `GET /publishers/admin`  tous les éditeurs AVEC leur compte propriétaire (BIGBOSS/ADMIN seulement) ;
 *   - `GET /publishers/:slug`  un éditeur tel que la boutique le montre : nom de boutique, jamais le compte ;
 *   - `GET /publishers/:slug/page`  la page éditeur (#16433) : l'identité de boutique ET le profil Meeshy qui l'édite.
 *
 * Le nom, le site et le logo s'écrivent toujours par `PUT /lens/partners/me`
 * (#11327), chemin gardé pour les clients publiés. Au montage, l'éditeur
 * « Meeshy » est lié au compte officiel configuré (`MEESHY_OFFICIAL_ACCOUNT_ID`).
 * La loi vit dans `services/packs/PackPublishers.ts`. Comptes INSCRITS seulement.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PACK_PUBLISHER_LIMITS } from '@meeshy/shared/types/pack-publisher';

import { type UnifiedAuthRequest } from '../middleware/auth';
import { requireAdminRank } from '../middleware/authorize';
import { publisherPagePublishers, type PackPublishers } from '../services/packs/PackPublishers';
import { logError, logWarn } from '../utils/logger';
import { sendNotFound, sendSuccess } from '../utils/response.js';
import { PACK_ERRORS, packEnvelope, packPublisherJsonSchema, packRouteGuard } from './pack-routes';

export const PACK_PUBLISHER_NOT_FOUND = 'PUBLISHER_NOT_FOUND';

export type PackPublisherRoutesOptions = { readonly publishers?: PackPublishers };

const nullableString = { type: 'string', nullable: true } as const;

const adminViewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    slug: nullableString,
    displayName: { type: 'string' },
    verified: { type: 'boolean' },
    verifiedAt: nullableString,
    official: { type: 'boolean' },
    createdAt: nullableString,
    nameDisputedAt: nullableString,
    owner: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, username: nullableString } },
  },
} as const;

const publisherPageJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['publisher', 'owner', 'website'],
  properties: {
    publisher: packPublisherJsonSchema,
    owner: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['id', 'username', 'displayName', 'avatar'],
      properties: { id: { type: 'string' }, username: { type: 'string' }, displayName: nullableString, avatar: nullableString },
    },
    website: nullableString,
  },
} as const;

/** La page nomme un compte : 30 lectures par minute et par lecteur, de quoi parcourir une boutique, pas la moissonner. */
const pageRateLimit = {
  max: 30,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) => {
    const viewer = (request as UnifiedAuthRequest).authContext?.userId ?? `ip:${request.ip}`;
    return `publishers:page:${viewer}`;
  },
  errorResponseBuilder: () => ({ success: false, error: 'Trop de pages éditeur demandées. Patientez avant de réessayer.', code: 'RATE_LIMITED', statusCode: 429 }),
};

const slugParamsJsonSchema = {
  type: 'object',
  required: ['slug'],
  properties: { slug: { type: 'string', pattern: '^[a-z0-9-]+$', maxLength: PACK_PUBLISHER_LIMITS.maxSlugLength } },
} as const;

export async function packPublisherRoutes(fastify: FastifyInstance, options: PackPublisherRoutesOptions = {}) {
  const publishers = options.publishers ?? publisherPagePublishers(fastify.prisma);
  const guard = packRouteGuard(fastify, { internalErrorMessage: 'Error handling pack publishers' });
  const tags = ['packs'];

  if (options.publishers === undefined) {
    publishers
      .ensureOfficial()
      .then((outcome) => {
        if (outcome !== 'linked') logWarn(fastify.log, `[publishers] l'éditeur Meeshy n'est lié à aucun compte officiel : ${outcome}`);
      })
      .catch((error: unknown) => logError(fastify.log, '[publishers] liaison de l’éditeur Meeshy impossible', error));
  }

  fastify.get(
    '/me',
    {
      onRequest: [fastify.authenticate],
      schema: { description: 'L’éditeur du compte connecté (#16274), `null` s’il n’a encore rien proposé.', tags, summary: 'Get my publisher', response: { 200: packEnvelope({ ...packPublisherJsonSchema, nullable: true }), ...PACK_ERRORS } },
    },
    guard('[GET /publishers/me]', async (_request, reply, viewer) => sendSuccess(reply, await publishers.own(viewer.userId))),
  );

  fastify.get(
    '/admin',
    {
      onRequest: [fastify.authenticate, requireAdminRank()],
      schema: {
        description: 'Tous les éditeurs avec leur compte propriétaire et son nom d’utilisateur (#16274, BIGBOSS/ADMIN) — ce que la boutique ne montre jamais.',
        tags: [...tags, 'admin'],
        summary: 'List pack publishers with their owner account',
        response: { 200: packEnvelope({ type: 'array', items: adminViewJsonSchema }), ...PACK_ERRORS },
      },
    },
    guard('[GET /publishers/admin]', async (_request, reply) => sendSuccess(reply, await publishers.adminList())),
  );

  fastify.get<{ Params: { slug: string } }>(
    '/:slug',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Un éditeur tel que la boutique le montre (#16274) : son adresse et son nom de boutique, jamais le compte qui le possède.',
        tags,
        summary: 'Get a pack publisher',
        params: slugParamsJsonSchema,
        response: { 200: packEnvelope(packPublisherJsonSchema), ...PACK_ERRORS },
      },
    },
    guard('[GET /publishers/:slug]', async (request, reply) => {
      const publisher = await publishers.bySlug((request.params as { slug: string }).slug);
      if (publisher === null) return sendNotFound(reply, 'No publisher under this address', { code: PACK_PUBLISHER_NOT_FOUND });
      return sendSuccess(reply, publisher);
    }),
  );

  fastify.get<{ Params: { slug: string } }>(
    '/:slug/page',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: pageRateLimit },
      schema: {
        description: 'La page d’un éditeur (#16433) : son identité de boutique, son site et le profil Meeshy qui l’édite — `owner` nul si ce compte n’est plus actif, ou si lui et le lecteur se sont bloqués.',
        tags,
        summary: 'Get a pack publisher page',
        params: slugParamsJsonSchema,
        response: { 200: packEnvelope(publisherPageJsonSchema), ...PACK_ERRORS },
      },
    },
    guard('[GET /publishers/:slug/page]', async (request, reply, viewer) => {
      const page = await publishers.page((request.params as { slug: string }).slug, viewer.userId);
      if (page === null) return sendNotFound(reply, 'No publisher under this address', { code: PACK_PUBLISHER_NOT_FOUND });
      return sendSuccess(reply, page);
    }),
  );
}
