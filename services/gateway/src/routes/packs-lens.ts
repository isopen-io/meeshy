/**
 * Les packs de LENS des partenaires — `/packs/lens` (#11271, MeeshyLens v1).
 *
 *   - `GET    /packs/lens`                  la boutique : les lens publiées, offertes maintenant à l'appelant ;
 *   - `GET    /packs/lens/installed`        les lens installées ;
 *   - `GET    /packs/lens/:slug`            une lens visible de l'appelant ;
 *   - `PUT    /packs/lens/:slug/install`    l'installer (404 hors fenêtre ou hors communauté) ; `DELETE` la retirer ;
 *   - `GET    /packs/lens/submissions`      les propositions de l'appelant ;
 *   - `POST   /packs/lens/submissions`      proposer : `{ document, assets: { "<sha16>.<ext>": base64 } }` ;
 *   - `GET    /packs/lens/pending`          la file de modération (`canModerateContent`) ;
 *   - `POST   /packs/lens/:slug/review`     publier ou refuser, en FIXANT la fenêtre et les communautés ;
 *   - `POST   /packs/lens/:slug/withdraw`   retirer une lens publiée (`canModerateContent`) ;
 *   - `POST   /packs/lens/:slug/restore`    rétablir une lens retirée (`canModerateContent`, #12321) ;
 *   - `GET    /packs/lens/:slug/document`   le document servi, pour l'auteur, la modération, et à qui la lens est offerte.
 *
 * Chaque geste de modération s'écrit au journal d'audit AVANT d'agir : journal
 * indisponible ⇒ 500 `LENS_AUDIT_UNAVAILABLE`, rien n'a bougé.
 *
 * La loi vit dans `services/packs/LensPacks.ts` et dans `@meeshy/shared`
 * (`lens-format.ts`, `lens-pack.ts`) ; ce fichier n'en fait que la traduction
 * HTTP. Comptes INSCRITS seulement. Une lens est gratuite : aucune route
 * d'achat, et la revue n'accepte aucun prix.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { LENS_LIMITS, LENS_PATTERNS } from '@meeshy/shared/types/lens-format';
import { LENS_PACK_LIMITS } from '@meeshy/shared/types/lens-pack';
import type { PackAudience } from '@meeshy/shared/types/pack-availability';

import { requirePermission } from '../middleware/authorize';
import { PackCatalog } from '../services/packs/PackCatalog';
import { LensPacks, type LensPackDetail } from '../services/packs/LensPacks';
import { readPackAudience } from '../services/packs/packAudience';
import { sendBadRequest, sendConflict, sendError, sendForbidden, sendNotFound, sendSuccess } from '../utils/response.js';
import { gameRateLimitConfig } from './me/game-shared';
import {
  PACK_ERRORS,
  packEnvelope,
  packInstallationBroadcaster,
  packRouteGuard,
  packSlugParamsJsonSchema,
  registerPackRoutes,
  type PackSlugRequest,
} from './pack-routes';

export const LENS_PACK_ERROR_CODES = {
  NOT_FOUND: 'LENS_NOT_FOUND',
  INVALID: 'LENS_INVALID',
  FORBIDDEN: 'LENS_FORBIDDEN',
  UPDATE_REQUIRED: 'LENS_UPDATE_REQUIRED',
  COST_UNDERSTATED: 'LENS_COST_UNDERSTATED',
  ASSET_REFUSED: 'LENS_ASSET_REFUSED',
  SLUG_TAKEN: 'LENS_SLUG_TAKEN',
  TOO_MANY_PENDING: 'LENS_TOO_MANY_PENDING',
  SELF_REVIEW: 'LENS_SELF_REVIEW',
  INVALID_WINDOW: 'LENS_INVALID_WINDOW',
  AUDIT_UNAVAILABLE: 'LENS_AUDIT_UNAVAILABLE',
} as const;

/** Le document, ses fichiers en base64 (4/3 des octets) et l'enveloppe. */
const SUBMISSION_BODY_LIMIT = LENS_PACK_LIMITS.maxDocumentBytes + Math.ceil((LENS_PACK_LIMITS.maxTotalAssetBytes * 4) / 3) + 16_384;

const submissionSchema = z.object({
  document: z.unknown(),
  assets: z.record(z.string().max(32), z.string()).default({}),
});

const withdrawSchema = z.object({ note: z.string().max(LENS_PACK_LIMITS.maxReviewNoteLength).optional() });

const isoInstant = z.iso.datetime();
const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(LENS_PACK_LIMITS.maxReviewNoteLength).optional(),
  window: z.object({ startsAt: isoInstant, endsAt: isoInstant }).optional(),
  communities: z.array(z.string().regex(LENS_PATTERNS.community)).max(LENS_LIMITS.maxCommunities).optional(),
});

const nullableString = { type: 'string', nullable: true } as const;
const assetRef = { type: 'object', additionalProperties: false, properties: { src: { type: 'string' }, bytes: { type: 'integer' }, sha256: { type: 'string' } } } as const;

export const lensPackJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    author: { type: 'string' },
    builtin: { type: 'boolean' },
    status: { type: 'string' },
    itemCount: { type: 'integer' },
    coverUrl: nullableString,
    installed: { type: 'boolean' },
    installCount: { type: 'integer' },
    domain: { type: 'string' },
    origin: { type: 'string' },
    version: { type: 'integer' },
    downloadBytes: { type: 'object', additionalProperties: false, properties: { story: { type: 'integer' }, square: { type: 'integer', nullable: true } } },
    removable: { type: 'boolean' },
    names: { type: 'object', additionalProperties: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } },
    price: { type: 'integer', nullable: true },
    owned: { type: 'boolean' },
    preview: { ...assetRef, nullable: true },
    cost: { type: 'string', enum: ['light', 'standard', 'rich'] },
    surfaces: { type: 'array', items: { type: 'string' } },
    availability: { type: 'object', additionalProperties: false, properties: { startsAt: { type: 'string' }, endsAt: { type: 'string' } } },
    document: assetRef,
    reviewNote: nullableString,
  },
} as const;

const refusalJsonSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    requiredSchema: { type: 'integer' },
    declared: { type: 'string' },
    measured: { type: 'string' },
    src: { type: 'string' },
    reason: { type: 'string' },
  },
} as const;

export type LensPacksRoutesOptions = {
  readonly packs?: LensPacks;
  readonly now?: () => Date;
  readonly audience?: (userId: string) => Promise<PackAudience>;
};

/** Le moteur des packs pour le domaine `lens` : aucun registre officiel, le seul magasin des partenaires. */
export function lensPackCatalog(fastify: FastifyInstance, options: LensPacksRoutesOptions = {}): { readonly catalog: PackCatalog<LensPackDetail, LensPackDetail>; readonly packs: LensPacks } {
  const now = options.now ?? (() => new Date());
  const packs = options.packs ?? new LensPacks({ prisma: fastify.prisma, now, broadcast: packInstallationBroadcaster(fastify) });
  const audience = options.audience ?? ((userId: string) => readPackAudience(fastify.prisma, userId));
  const catalog = new PackCatalog<LensPackDetail, LensPackDetail>({
    prisma: fastify.prisma,
    now,
    audience,
    broadcast: packInstallationBroadcaster(fastify),
    spec: { domain: 'lens', registry: [], community: packs.store({ audience }), removalGuard: null, toSummary: (detail) => detail },
  });
  return { catalog, packs };
}

export async function lensPacksRoutes(fastify: FastifyInstance, options: LensPacksRoutesOptions = {}) {
  const { catalog, packs } = lensPackCatalog(fastify, options);
  const guard = packRouteGuard(fastify, { internalErrorMessage: 'Error handling lens packs' });
  const requireModerator = requirePermission('canModerateContent');
  const tags = ['packs'];
  const basePath = '/packs/lens';
  const list = packEnvelope({ type: 'array', items: lensPackJsonSchema });
  const notFound = { message: 'Lens not found', code: LENS_PACK_ERROR_CODES.NOT_FOUND };
  const auditUnavailable = (reply: Parameters<typeof sendNotFound>[0]) =>
    sendError(reply, 500, 'The audit log is unavailable: nothing was changed', { code: LENS_PACK_ERROR_CODES.AUDIT_UNAVAILABLE });

  fastify.get(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      schema: { description: 'Les lens proposées par l’appelant, avec leur état et le mot du modérateur (#11271).', tags, summary: 'List my lens submissions', response: { 200: list, ...PACK_ERRORS } },
    },
    guard(`[GET ${basePath}/submissions]`, async (_request, reply, viewer) => sendSuccess(reply, await packs.submissions(viewer.userId))),
  );

  fastify.post<{ Body: unknown }>(
    '/submissions',
    {
      onRequest: [fastify.authenticate],
      bodyLimit: SUBMISSION_BODY_LIMIT,
      config: { rateLimit: gameRateLimitConfig(`pack-submit:${basePath}`, 5, true) },
      schema: {
        description:
          'Propose une lens MeeshyLens v1 (#11271) : `document` (lu par `parseLens` : ni shader, ni script, ni URL, ni réseau, ni 3D) et ' +
          '`assets`, chaque fichier que les couches nomment, en base64, sous son adresse `<sha16>.<ext>`. Le coût déclaré doit couvrir le coût MESURÉ ; ' +
          'les fichiers sont ré-encodés et renommés par leur empreinte. La lens naît en attente de modération. 422 avec le code du refus.',
        tags,
        summary: 'Submit a lens',
        body: { type: 'object', required: ['document'], properties: { document: { type: 'object' }, assets: { type: 'object', additionalProperties: { type: 'string' } } } },
        response: { 201: packEnvelope(lensPackJsonSchema), 409: errorResponseSchema, 422: refusalJsonSchema, ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/submissions]`, async (request, reply, viewer) => {
      const body = submissionSchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid lens submission', { code: 'VALIDATION_ERROR' });
      const outcome = await packs.submit(viewer.userId, { document: body.data.document, assets: body.data.assets });
      const refuse = (code: string, extra: object = {}) => reply.status(422).send({ success: false, error: 'Lens refused', message: 'Lens refused', code, ...extra });
      switch (outcome.kind) {
        case 'submitted':
          return sendSuccess(reply, outcome.pack, { statusCode: 201 });
        case 'invalid':
          return refuse(LENS_PACK_ERROR_CODES.INVALID);
        case 'forbidden':
          return refuse(LENS_PACK_ERROR_CODES.FORBIDDEN, { reasons: outcome.reasons });
        case 'update-required':
          return refuse(LENS_PACK_ERROR_CODES.UPDATE_REQUIRED, { requiredSchema: outcome.schema });
        case 'cost-understated':
          return refuse(LENS_PACK_ERROR_CODES.COST_UNDERSTATED, { declared: outcome.declared, measured: outcome.measured });
        case 'asset-refused':
          return refuse(LENS_PACK_ERROR_CODES.ASSET_REFUSED, { src: outcome.src, reason: outcome.reason });
        case 'slug-taken':
          return sendConflict(reply, 'This lens name is taken', { code: LENS_PACK_ERROR_CODES.SLUG_TAKEN });
        case 'too-many-pending':
          return sendConflict(reply, `At most ${LENS_PACK_LIMITS.maxPendingPerAuthor} lenses can wait for review`, { code: LENS_PACK_ERROR_CODES.TOO_MANY_PENDING });
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.get(
    '/pending',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: { description: 'La file de modération des lens, la plus ancienne proposition d’abord (#11271).', tags: [...tags, 'admin'], summary: 'List lenses awaiting review', response: { 200: list, ...PACK_ERRORS } },
    },
    guard(`[GET ${basePath}/pending]`, async (_request, reply, viewer) => sendSuccess(reply, await packs.pending(viewer.userId))),
  );

  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/:slug/review',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description:
          'Publie (`approve`) ou refuse (`reject`) une lens en attente (#11271), avec un mot facultatif. La publication FIXE la fenêtre (`window`, celle du document à défaut) ' +
          'et les communautés (`communities`, celles du document à défaut ; vide = tout le monde) ; le géo-créneau est retiré (décision #11251 en attente). ' +
          'Aucun prix : une lens est gratuite. 403 LENS_SELF_REVIEW : un modérateur ne tranche pas sa propre proposition.',
        tags: [...tags, 'admin'],
        summary: 'Review a lens',
        params: packSlugParamsJsonSchema,
        body: { type: 'object', required: ['decision'], properties: { decision: { type: 'string', enum: ['approve', 'reject'] } } },
        response: { 200: packEnvelope(lensPackJsonSchema), ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/:slug/review]`, async (request: PackSlugRequest, reply, viewer) => {
      const body = reviewSchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid review', { code: 'VALIDATION_ERROR' });
      const outcome = await packs.review(viewer.userId, request.params.slug, {
        decision: body.data.decision,
        note: body.data.note ?? null,
        ...(body.data.window === undefined ? {} : { window: body.data.window }),
        ...(body.data.communities === undefined ? {} : { communities: body.data.communities }),
      });
      switch (outcome.kind) {
        case 'reviewed':
          return sendSuccess(reply, outcome.pack);
        case 'self-review':
          return sendForbidden(reply, 'A moderator cannot review their own lens', { code: LENS_PACK_ERROR_CODES.SELF_REVIEW });
        case 'invalid-window':
          return sendBadRequest(reply, 'The window must end after it starts', { code: LENS_PACK_ERROR_CODES.INVALID_WINDOW });
        case 'not-found':
          return sendNotFound(reply, 'No lens awaiting review under this name', { code: LENS_PACK_ERROR_CODES.NOT_FOUND });
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/:slug/withdraw',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description:
          'Retire une lens PUBLIÉE (#11271, audit de #12293) avec un mot facultatif : elle quitte la boutique, les lens installées et le magasin des fichiers. ' +
          'Journalisé avant d’agir ; 404 si aucune lens publiée ne porte ce nom.',
        tags: [...tags, 'admin'],
        summary: 'Withdraw a published lens',
        params: packSlugParamsJsonSchema,
        body: { type: 'object', properties: { note: { type: 'string' } } },
        response: { 200: packEnvelope(lensPackJsonSchema), ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/:slug/withdraw]`, async (request: PackSlugRequest, reply, viewer) => {
      const body = withdrawSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, 'Invalid withdrawal', { code: 'VALIDATION_ERROR' });
      const outcome = await packs.withdraw(viewer.userId, request.params.slug, { note: body.data.note ?? null });
      switch (outcome.kind) {
        case 'withdrawn':
          return sendSuccess(reply, outcome.pack);
        case 'not-found':
          return sendNotFound(reply, 'No published lens under this name', { code: LENS_PACK_ERROR_CODES.NOT_FOUND });
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/:slug/restore',
    {
      onRequest: [fastify.authenticate, requireModerator],
      schema: {
        description:
          'Rétablit une lens RETIRÉE par erreur (#12321) avec un mot facultatif : elle revient publiée. Ses installations retirées ne reviennent pas — chacun la réinstalle. ' +
          'Journalisé avant d’agir, puis son issue ; 404 si aucune lens retirée ne porte ce nom.',
        tags: [...tags, 'admin'],
        summary: 'Restore a withdrawn lens',
        params: packSlugParamsJsonSchema,
        body: { type: 'object', properties: { note: { type: 'string' } } },
        response: { 200: packEnvelope(lensPackJsonSchema), ...PACK_ERRORS },
      },
    },
    guard(`[POST ${basePath}/:slug/restore]`, async (request: PackSlugRequest, reply, viewer) => {
      const body = withdrawSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, 'Invalid restoration', { code: 'VALIDATION_ERROR' });
      const outcome = await packs.restore(viewer.userId, request.params.slug, { note: body.data.note ?? null });
      switch (outcome.kind) {
        case 'restored':
          return sendSuccess(reply, outcome.pack);
        case 'not-found':
          return sendNotFound(reply, 'No withdrawn lens under this name', { code: LENS_PACK_ERROR_CODES.NOT_FOUND });
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.get(
    '/:slug/document',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Le document d’une lens (#11271), sérialisé tel que servi, avec son empreinte : publiée, à qui elle est offerte (fenêtre, communautés) ou qui l’a installée ; ' +
          'en attente, refusée ou retirée pour son auteur et la modération.',
        tags,
        summary: 'Read a lens document',
        params: packSlugParamsJsonSchema,
        response: {
          200: packEnvelope({ type: 'object', additionalProperties: false, required: ['documentJson', 'sha256'], properties: { documentJson: { type: 'string' }, sha256: { type: 'string' } } }),
          ...PACK_ERRORS,
        },
      },
    },
    guard(`[GET ${basePath}/:slug/document]`, async (request: PackSlugRequest, reply, viewer) => {
      const offered = await catalog.detail(request.params.slug, viewer);
      const document = offered === null ? null : await packs.document(request.params.slug, viewer);
      if (document === null) return sendNotFound(reply, notFound.message, { code: notFound.code });
      return sendSuccess(reply, document);
    }),
  );

  registerPackRoutes(fastify, {
    catalog,
    guard,
    basePath,
    tags,
    summaryJsonSchema: lensPackJsonSchema,
    detailJsonSchema: lensPackJsonSchema,
    notFound,
    notRemovable: null,
    texts: {
      list: { description: 'La boutique des lens (#11271) : les lens publiées, offertes maintenant à l’appelant (fenêtre, communautés).', summary: 'List lenses' },
      installed: { description: 'Les lens installées par l’appelant (#11271).', summary: 'List installed lenses' },
      detail: { description: 'Une lens visible de l’appelant (#11271).', summary: 'Get a lens' },
      install: { description: 'Installe une lens offerte à l’appelant (#11271) ; 404 hors de sa fenêtre ou de ses communautés.', summary: 'Install a lens' },
      uninstall: { description: 'Retire une lens installée (#11271).', summary: 'Uninstall a lens' },
    },
  });
}
