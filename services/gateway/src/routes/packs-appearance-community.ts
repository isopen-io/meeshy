/**
 * Les routes des VENDEURS TIERS d'un domaine d'apparence (#10709) — montées
 * sous `/packs/wallpaper|avatar-ring|banner`, à côté de la boutique :
 *
 *   - `GET  /submissions`     les propositions de l'appelant, avec le mot du modérateur ;
 *   - `POST /submissions`     proposer un pack — corps JSON `{ slug, name, description?, author, contract }` ;
 *   - `GET  /pending`         la file de modération (`canModerateContent`) ;
 *   - `POST /:slug/review`    publier (`approve`, avec un prix facultatif) ou refuser (`reject`) — jamais sa propre proposition ;
 *   - `GET  /:slug/contract`  le contrat d'un pack visible du lecteur (en attente : auteur et modérateurs).
 *
 * La validation vit dans `packages/shared/types/community-appearance-pack.ts`,
 * la loi dans `services/packs/CommunityAppearancePacks.ts` ; ce fichier n'en fait
 * que la traduction HTTP. Comptes INSCRITS seulement.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { COMMUNITY_APPEARANCE_LIMITS, type CommunityAppearanceDomain } from '@meeshy/shared/types/community-appearance-pack';
import { PACK_LIMITS, PACK_PRICE_MAX } from '@meeshy/shared/types/content-pack';

import { requirePermission } from '../middleware/authorize';
import type { CommunityAppearancePacks } from '../services/packs/CommunityAppearancePacks';
import { sendBadRequest, sendConflict, sendForbidden, sendNotFound, sendSuccess } from '../utils/response.js';
import { gameRateLimitConfig } from './me/game-shared';
import { PACK_ERRORS, packEnvelope, packSlugParamsJsonSchema, type PackRouteGuard, type PackSlugRequest } from './pack-routes';

export const COMMUNITY_APPEARANCE_ERROR_CODES = {
  INVALID: 'APPEARANCE_PACK_INVALID',
  SLUG_TAKEN: 'APPEARANCE_PACK_SLUG_TAKEN',
  TOO_MANY_PENDING: 'APPEARANCE_PACK_TOO_MANY_PENDING',
  NOT_FOUND: 'APPEARANCE_PACK_NOT_FOUND',
  SELF_REVIEW: 'APPEARANCE_PACK_SELF_REVIEW',
} as const;

/** Le corps d'une proposition : le contrat et son enveloppe tiennent largement sous ce plafond. */
const SUBMISSION_BODY_LIMIT = COMMUNITY_APPEARANCE_LIMITS.maxContractBytes + 16_384;

const reviewBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(PACK_LIMITS.maxReviewNoteLength).optional(),
  price: z.number().int().min(1).max(PACK_PRICE_MAX).optional(),
});

const invalidJsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
    problems: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, code: { type: 'string' } } } },
  },
} as const;

export type CommunityAppearanceRoutesSpec = {
  readonly domain: CommunityAppearanceDomain;
  readonly guard: PackRouteGuard;
  readonly packs: CommunityAppearancePacks;
  readonly detailJsonSchema: object;
};

export function registerCommunityAppearanceRoutes(fastify: FastifyInstance, spec: CommunityAppearanceRoutesSpec): void {
  const { domain, guard, packs } = spec;
  const basePath = `/packs/${domain}`;
  const tags = ['packs'];
  const requireModerator = requirePermission('canModerateContent');
  const list = packEnvelope({ type: 'array', items: spec.detailJsonSchema });

  fastify.get(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      schema: { description: `Les packs de ${domain} proposés par l'appelant, avec leur état et le mot du modérateur (#10709).`, tags, summary: `List my ${domain} pack submissions`, response: { 200: list, ...PACK_ERRORS } },
    },
    guard(`[GET ${basePath}/submissions]`, async (_request, reply, viewer) => sendSuccess(reply, await packs.submissions(viewer.userId, domain))),
  );

  fastify.post<{ Body: unknown }>(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      bodyLimit: SUBMISSION_BODY_LIMIT,
      config: { rateLimit: gameRateLimitConfig(`pack-submit:${basePath}`, 5, true) },
      schema: {
        description:
          `Propose un pack de ${domain} d'un vendeur tiers (#10709). Le contrat est un DOCUMENT DE DONNÉES validé par le même schéma que les packs officiels ` +
          '(couleurs hex, chemins aux seules commandes SVG, plafonds de longueur et de densité) ; aucune couche animée. ' +
          'Le pack naît en attente de modération : rien n’est servi avant `approved`. 422 avec `problems` si le manifeste est refusé.',
        tags,
        summary: `Submit a ${domain} pack`,
        body: { type: 'object' },
        response: { 201: packEnvelope(spec.detailJsonSchema), 409: errorResponseSchema, 422: invalidJsonSchema, ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/submissions]`, async (request, reply, viewer) => {
      const outcome = await packs.submit(viewer.userId, domain, request.body);
      switch (outcome.kind) {
        case 'submitted':
          return sendSuccess(reply, outcome.pack, { statusCode: 201 });
        case 'invalid':
          return reply.status(422).send({ success: false, error: 'Invalid appearance pack', message: 'Invalid appearance pack', code: COMMUNITY_APPEARANCE_ERROR_CODES.INVALID, problems: outcome.problems });
        case 'slug-taken':
          return sendConflict(reply, 'This pack name is taken', { code: COMMUNITY_APPEARANCE_ERROR_CODES.SLUG_TAKEN });
        case 'too-many-pending':
          return sendConflict(reply, `At most ${COMMUNITY_APPEARANCE_LIMITS.maxPendingPerAuthor} packs can wait for review`, { code: COMMUNITY_APPEARANCE_ERROR_CODES.TOO_MANY_PENDING });
      }
    }),
  );

  fastify.get(
    '/pending',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: { description: `La file de modération des packs de ${domain}, la plus ancienne proposition d'abord (#10709).`, tags: [...tags, 'admin'], summary: `List ${domain} packs awaiting review`, response: { 200: list, ...PACK_ERRORS } },
    },
    guard(`[GET ${basePath}/pending]`, async (_request, reply, viewer) => sendSuccess(reply, await packs.pending(viewer.userId, domain))),
  );

  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/:slug/review',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description:
          'Publie (`approve`, avec un `price` facultatif en Meeshes : absent = gratuit) ou refuse (`reject`) un pack en attente, avec un mot facultatif pour son auteur (#10709). ' +
          'Le prix est fixé ICI, jamais par le vendeur. 403 APPEARANCE_PACK_SELF_REVIEW : un modérateur ne tranche pas sa propre proposition.',
        tags: [...tags, 'admin'],
        summary: `Review a ${domain} pack`,
        params: packSlugParamsJsonSchema,
        body: {
          type: 'object',
          required: ['decision'],
          properties: {
            decision: { type: 'string', enum: ['approve', 'reject'] },
            note: { type: 'string', maxLength: PACK_LIMITS.maxReviewNoteLength },
            price: { type: 'integer', minimum: 1, maximum: PACK_PRICE_MAX },
          },
        },
        response: { 200: packEnvelope(spec.detailJsonSchema), ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/:slug/review]`, async (request: PackSlugRequest, reply, viewer) => {
      const body = reviewBodySchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid review', { code: 'VALIDATION_ERROR' });
      const outcome = await packs.review(viewer.userId, domain, request.params.slug, { decision: body.data.decision, note: body.data.note ?? null, price: body.data.price ?? null });
      switch (outcome.kind) {
        case 'reviewed':
          return sendSuccess(reply, outcome.pack);
        case 'self-review':
          return sendForbidden(reply, 'A moderator cannot review their own pack', { code: COMMUNITY_APPEARANCE_ERROR_CODES.SELF_REVIEW });
        case 'not-found':
          return sendNotFound(reply, 'No pack awaiting review under this name', { code: COMMUNITY_APPEARANCE_ERROR_CODES.NOT_FOUND });
      }
    }),
  );

  fastify.get(
    '/:slug/contract',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          `Le contrat d'un pack de ${domain} d'un vendeur tiers (#10709), en JSON sérialisé — les octets que \`/pack-assets\` servira, à l'empreinte \`sha256\` : publié pour tous, en attente ou refusé pour son auteur et les modérateurs — ` +
          'la modération voit ce qu’elle publie. 404 pour un pack officiel (son contrat est servi par `/pack-assets`) ou invisible du lecteur.',
        tags,
        summary: `Read a community ${domain} pack contract`,
        params: packSlugParamsJsonSchema,
        response: {
          200: packEnvelope({
            type: 'object',
            additionalProperties: false,
            required: ['contractSchema', 'contractJson', 'sha256'],
            properties: { contractSchema: { type: 'integer' }, contractJson: { type: 'string' }, sha256: { type: 'string' } },
          }),
          ...PACK_ERRORS,
        },
      },
    },
    guard(`[GET ${basePath}/:slug/contract]`, async (request: PackSlugRequest, reply, viewer) => {
      const contract = await packs.contract(domain, request.params.slug, viewer);
      if (contract === null) return sendNotFound(reply, 'Pack not found', { code: COMMUNITY_APPEARANCE_ERROR_CODES.NOT_FOUND });
      return sendSuccess(reply, contract);
    }),
  );
}
