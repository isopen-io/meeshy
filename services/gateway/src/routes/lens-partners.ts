/**
 * LES PARTENAIRES DES LENS — `/lens` (#11327, S26).
 *
 *   - `GET    /lens/partners/me`              le profil partenaire de l'appelant (ou `null`) ;
 *   - `PUT    /lens/partners/me`              l'écrire : `{ displayName, website?, logo?: base64 | null }` ;
 *   - `GET    /lens/partners/pending`         la file de vérification (BIGBOSS/ADMIN), chaque profil avec sa `version` ;
 *   - `POST   /lens/partners/:userId/verify`  vérifier l'état VU `{ expected: { version } }` (BIGBOSS/ADMIN, jamais la sienne) ;
 *   - `POST   /lens/partners/:userId/revoke`  retirer une vérification (BIGBOSS/ADMIN) ;
 *   - `GET    /lens/partners/:partnerId/logo` le logo, par l'id OPAQUE du profil : vérifié pour tous, sinon propriétaire et BIGBOSS/ADMIN ;
 *   - `GET    /lens/credits?slugs=a,b`        « Lens par X » des médias reçus (`lensSlug`) ;
 *   - `POST   /lens/usage/:slug`              compter un usage `{ surface }` ;
 *   - `GET    /lens/usage/:slug`              l'agrégat k-anonyme, pour l'auteur et la modération.
 *
 * La loi vit dans `services/packs/LensPartners.ts` et `@meeshy/shared/types/lens-partner` ;
 * ce fichier n'en fait que la traduction HTTP. Comptes INSCRITS seulement.
 * Gratuit des deux côtés (#11251) : aucune route d'argent.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LENS_LIMITS, LENS_PATTERNS } from '@meeshy/shared/types/lens-format';
import { LENS_USAGE_SURFACES, PARTNER_PROFILE_LIMITS, parsePartnerProfileInput } from '@meeshy/shared/types/lens-partner';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

import { hasAdminRank, requireAdminRank } from '../middleware/authorize';
import { getCacheStore } from '../services/CacheStore';
import { LensPartners } from '../services/packs/LensPartners';
import { lensUsageDedupFrom } from '../services/packs/lensUsageDedup';
import { sendBadRequest, sendError, sendForbidden, sendNotFound, sendSuccess } from '../utils/response.js';
import { gameRateLimitConfig } from './me/game-shared';
import { PACK_ERRORS, packEnvelope, packRouteGuard, packSlugParamsJsonSchema, type PackSlugRequest } from './pack-routes';

export const LENS_PARTNER_ERROR_CODES = {
  NOT_FOUND: 'PARTNER_NOT_FOUND',
  PROFILE_CHANGED: 'PARTNER_PROFILE_CHANGED',
  SELF_VERIFY: 'PARTNER_SELF_VERIFY',
  LOGO_REFUSED: 'PARTNER_LOGO_REFUSED',
  AUDIT_UNAVAILABLE: 'PARTNER_AUDIT_UNAVAILABLE',
  LENS_NOT_FOUND: 'LENS_NOT_FOUND',
} as const;

const MAX_CREDIT_SLUGS = 50;
/** Court : une vérification retirée éteint le crédit chez les clients en une minute au plus. */
const CREDITS_CACHE_CONTROL = 'private, max-age=60';
const LOGO_BODY_LIMIT = Math.ceil((PARTNER_PROFILE_LIMITS.maxLogoBytes * 4) / 3) + 8_192;

const nullableString = { type: 'string', nullable: true } as const;

const profileJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    displayName: { type: 'string' },
    website: nullableString,
    logo: nullableString,
    verified: { type: 'boolean' },
    verifiedAt: nullableString,
    version: { type: 'string' },
  },
} as const;

const creditJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    partner: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: { id: { type: 'string' }, name: { type: 'string' }, logo: nullableString },
    },
    watermark: { type: 'object', additionalProperties: false, properties: { meeshy: { type: 'boolean' }, partnerLogo: nullableString } },
  },
} as const;

const usageJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    k: { type: 'integer' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { day: { type: 'string' }, surface: { type: 'string' }, devices: { type: 'integer' }, uses: { type: 'integer' } },
      },
    },
  },
} as const;

const userIdParamsJsonSchema = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', pattern: '^[0-9a-f]{24}$' } },
} as const;

const partnerIdParamsJsonSchema = {
  type: 'object',
  required: ['partnerId'],
  properties: { partnerId: { type: 'string', pattern: '^[0-9a-f]{24}$' } },
} as const;

const verifyBodyJsonSchema = {
  type: 'object',
  required: ['expected'],
  properties: { expected: { type: 'object', required: ['version'], properties: { version: { type: 'string', minLength: 1, maxLength: 64 } } } },
} as const;

const logoSchema = z.union([z.string().max(LOGO_BODY_LIMIT), z.null()]).optional();
const revokeSchema = z.object({ note: z.string().max(280).optional() });
const verifySchema = z.object({ expected: z.object({ version: z.string().min(1).max(64) }) });
const usageSchema = z.object({ surface: z.enum(LENS_USAGE_SURFACES) });
const slugsSchema = z
  .string()
  .max(MAX_CREDIT_SLUGS * (LENS_LIMITS.maxIdLength + 1))
  .transform((raw) => raw.split(',').filter((slug) => slug.length > 0))
  .pipe(z.array(z.string().max(LENS_LIMITS.maxIdLength).regex(LENS_PATTERNS.id)).max(MAX_CREDIT_SLUGS));

export type LensPartnerRoutesOptions = { readonly partners?: LensPartners };

type UserIdRequest = { Params: { userId: string } };
type PartnerIdRequest = { Params: { partnerId: string } };


export async function lensPartnerRoutes(fastify: FastifyInstance, options: LensPartnerRoutesOptions = {}) {
  const partners = options.partners ?? new LensPartners({ prisma: fastify.prisma, dedup: lensUsageDedupFrom(getCacheStore()) });
  const guard = packRouteGuard(fastify, { internalErrorMessage: 'Error handling lens partners' });
  const requireAdmin = requireAdminRank();
  const tags = ['packs'];
  const auditUnavailable = (reply: Parameters<typeof sendError>[0]) =>
    sendError(reply, 500, 'The audit log is unavailable: nothing was changed', { code: LENS_PARTNER_ERROR_CODES.AUDIT_UNAVAILABLE });
  const notFound = (reply: Parameters<typeof sendError>[0]) => sendNotFound(reply, 'No partner profile', { code: LENS_PARTNER_ERROR_CODES.NOT_FOUND });
  const profileChanged = (reply: Parameters<typeof sendError>[0]) =>
    sendError(reply, 409, 'The partner profile changed since it was read: read it again', { code: LENS_PARTNER_ERROR_CODES.PROFILE_CHANGED });

  fastify.get(
    '/partners/me',
    {
      onRequest: [fastify.authenticate],
      schema: { description: 'Le profil partenaire de l’appelant (#11327), `null` s’il n’en a pas.', tags, summary: 'Get my partner profile', response: { 200: packEnvelope({ ...profileJsonSchema, nullable: true }), ...PACK_ERRORS } },
    },
    guard('[GET /lens/partners/me]', async (_request, reply, viewer) => sendSuccess(reply, await partners.ownProfile(viewer.userId))),
  );

  fastify.put<{ Body: unknown }>(
    '/partners/me',
    {
      onRequest: [fastify.authenticate],
      bodyLimit: LOGO_BODY_LIMIT + 4_096,
      config: { rateLimit: gameRateLimitConfig('lens-partner:save', 10, true) },
      schema: {
        description:
          'Écrit le profil partenaire (#11327) : `displayName`, `website` (https), `logo` en base64 (absent : gardé ; `null` : retiré). ' +
          'Le logo est ré-encodé et renommé par son empreinte. Changer le nom ou le logo RETIRE la vérification. 422 PARTNER_LOGO_REFUSED ; ' +
          '409 PARTNER_PROFILE_CHANGED quand une autre écriture est passée entre la relecture et l’écriture (relire, puis réécrire).',
        tags,
        summary: 'Save my partner profile',
        body: { type: 'object', required: ['displayName'], properties: { displayName: { type: 'string' }, website: { type: 'string', nullable: true }, logo: { type: 'string', nullable: true } } },
        response: { 200: packEnvelope(profileJsonSchema), 409: errorResponseSchema, 422: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' }, reason: { type: 'string' } } }, ...PACK_ERRORS },
      },
    },
    guard('[PUT /lens/partners/me]', async (request, reply, viewer) => {
      const parsed = parsePartnerProfileInput(request.body);
      const body = (request.body ?? {}) as { logo?: unknown };
      const logo = logoSchema.safeParse(body.logo);
      if (!parsed.ok || !logo.success) return sendBadRequest(reply, 'Invalid partner profile', { code: 'VALIDATION_ERROR' });
      const bytes = typeof logo.data === 'string' ? Buffer.from(logo.data, 'base64') : logo.data;
      const outcome = await partners.saveOwnProfile(viewer.userId, { profile: parsed.profile, logo: bytes });
      if (outcome.kind === 'logo-refused') {
        return reply.status(422).send({ success: false, error: 'Logo refused', message: 'Logo refused', code: LENS_PARTNER_ERROR_CODES.LOGO_REFUSED, reason: outcome.reason });
      }
      if (outcome.kind === 'conflict') return profileChanged(reply);
      return sendSuccess(reply, outcome.profile);
    }),
  );

  fastify.get(
    '/partners/pending',
    {
      onRequest: [fastify.authenticate, requireAdmin],
      schema: { description: 'Les profils partenaires à vérifier, le plus ancien d’abord (#11327, BIGBOSS/ADMIN).', tags: [...tags, 'admin'], summary: 'List partner profiles awaiting verification', response: { 200: packEnvelope({ type: 'array', items: profileJsonSchema }), ...PACK_ERRORS } },
    },
    guard('[GET /lens/partners/pending]', async (_request, reply) => sendSuccess(reply, await partners.pending())),
  );

  fastify.post<UserIdRequest & { Body: unknown }>(
    '/partners/:userId/verify',
    {
      onRequest: [fastify.authenticate, requireAdmin],
      schema: {
        description:
          'Vérifie l’identité d’un partenaire (#11327, BIGBOSS/ADMIN) TELLE QUE L’ADMIN L’A VUE : `expected.version` est celle que sert la file. ' +
          'L’écriture est conditionnelle sur l’état relu et part dans la même transaction que sa ligne de journal (nom et empreinte du logo vérifiés). ' +
          '409 PARTNER_PROFILE_CHANGED : le profil a changé depuis — rien n’est vérifié ni journalisé. 403 PARTNER_SELF_VERIFY : personne ne vérifie sa propre identité.',
        tags: [...tags, 'admin'],
        summary: 'Verify a partner profile',
        params: userIdParamsJsonSchema,
        body: verifyBodyJsonSchema,
        response: { 200: packEnvelope(profileJsonSchema), 409: errorResponseSchema, ...PACK_ERRORS },
      },
    },
    guard('[POST /lens/partners/:userId/verify]', async (request, reply, viewer) => {
      const body = verifySchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'The verified state is required', { code: 'VALIDATION_ERROR' });
      const { userId } = request.params as UserIdRequest['Params'];
      const outcome = await partners.verify(viewer.userId, userId, body.data.expected);
      switch (outcome.kind) {
        case 'done':
          return sendSuccess(reply, outcome.profile);
        case 'self-verify':
          return sendForbidden(reply, 'Nobody verifies their own partner identity', { code: LENS_PARTNER_ERROR_CODES.SELF_VERIFY });
        case 'not-found':
          return notFound(reply);
        case 'profile-changed':
          return profileChanged(reply);
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.post<UserIdRequest & { Body: unknown }>(
    '/partners/:userId/revoke',
    {
      onRequest: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Retire la vérification d’un partenaire (#11327, BIGBOSS/ADMIN), avec un mot facultatif ; journalisé avant d’agir. Ses crédits s’éteignent.',
        tags: [...tags, 'admin'],
        summary: 'Revoke a partner verification',
        params: userIdParamsJsonSchema,
        body: { type: 'object', properties: { note: { type: 'string' } } },
        response: { 200: packEnvelope(profileJsonSchema), ...PACK_ERRORS },
      },
    },
    guard('[POST /lens/partners/:userId/revoke]', async (request, reply, viewer) => {
      const body = revokeSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, 'Invalid revocation', { code: 'VALIDATION_ERROR' });
      const { userId } = request.params as UserIdRequest['Params'];
      const outcome = await partners.revoke(viewer.userId, userId, body.data.note?.trim() || null);
      switch (outcome.kind) {
        case 'done':
          return sendSuccess(reply, outcome.profile);
        case 'not-found':
        case 'self-verify':
        case 'profile-changed':
          return notFound(reply);
        case 'audit-unavailable':
          return auditUnavailable(reply);
      }
    }),
  );

  fastify.get<PartnerIdRequest>(
    '/partners/:partnerId/logo',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Le logo d’un partenaire (#11327), par l’identifiant OPAQUE de son profil (`partner.id` des crédits) — jamais par son compte. ' +
          'Vérifié : servi à tous pour le filigrane, revalidé à chaque lecture (`no-cache` + ETag, 304). ' +
          'Non vérifié : servi à son propriétaire et à BIGBOSS/ADMIN seulement (`no-store`), pour que la vérification ne se fasse pas à l’aveugle ; 404 pour tout autre.',
        tags,
        summary: 'Get a partner logo',
        params: partnerIdParamsJsonSchema,
        response: { 200: { description: 'Les octets du logo (PNG ou WebP ré-encodé)', type: 'string', format: 'binary' }, ...PACK_ERRORS },
      },
    },
    guard('[GET /lens/partners/:partnerId/logo]', async (request, reply, viewer) => {
      const { partnerId } = request.params as PartnerIdRequest['Params'];
      const logo = await partners.logo({ userId: viewer.userId, isAdminRank: hasAdminRank(request) }, partnerId);
      if (logo === null) return notFound(reply);
      if (!logo.verified) return reply.header('Content-Type', logo.contentType).header('Cache-Control', 'no-store').send(logo.bytes);
      const etag = `"${logo.sha256.slice(0, 32)}"`;
      reply.header('Cache-Control', 'private, no-cache').header('ETag', etag);
      if (request.headers['if-none-match'] === etag) return reply.status(304).send();
      return reply.header('Content-Type', logo.contentType).send(logo.bytes);
    }),
  );

  fastify.get<{ Querystring: { slugs?: string } }>(
    '/credits',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description:
          'Le crédit « Lens par X » des lens nommées (#11327), au plus 50, séparées par des virgules — celles que portent les médias reçus (`lensSlug`, en clair, E2EE compris). ' +
          'Une lens non publiée est absente ; `partner: null` quand son auteur n’a pas d’identité vérifiée. Le filigrane Meeshy est toujours demandé.',
        tags,
        summary: 'Get lens credits',
        querystring: { type: 'object', properties: { slugs: { type: 'string' } } },
        response: { 200: packEnvelope({ type: 'array', items: creditJsonSchema }), ...PACK_ERRORS },
      },
    },
    guard('[GET /lens/credits]', async (request, reply) => {
      const slugs = slugsSchema.safeParse((request.query as { slugs?: string }).slugs ?? '');
      if (!slugs.success) return sendBadRequest(reply, 'Invalid lens list', { code: 'VALIDATION_ERROR' });
      reply.header('Cache-Control', CREDITS_CACHE_CONTROL);
      return sendSuccess(reply, await partners.credits([...new Set(slugs.data)]));
    }),
  );

  fastify.post<{ Params: { slug: string }; Body: unknown }>(
    '/usage/:slug',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig('lens-usage', 60, false) },
      schema: {
        description:
          'Compte un usage d’une lens installée (#11327) sur une surface (`camera`, `story`, `message`, `call`). Agrégé par lens × jour × surface, sans identité : ' +
          '`counted: false` quand le dédoublonnage n’a pas répondu — rien n’est alors compté. 404 pour une lens non publiée ou non installée.',
        tags,
        summary: 'Record a lens use',
        params: packSlugParamsJsonSchema,
        body: { type: 'object', required: ['surface'], properties: { surface: { type: 'string', enum: [...LENS_USAGE_SURFACES] } } },
        response: { 200: packEnvelope({ type: 'object', additionalProperties: false, properties: { counted: { type: 'boolean' } } }), ...PACK_ERRORS },
      },
    },
    guard('[POST /lens/usage/:slug]', async (request: PackSlugRequest, reply, viewer) => {
      const body = usageSchema.safeParse(request.body);
      if (!body.success) return sendBadRequest(reply, 'Invalid lens use', { code: 'VALIDATION_ERROR' });
      const outcome = await partners.recordUsage(viewer.userId, request.params.slug, body.data.surface);
      if (outcome.kind === 'not-found') return sendNotFound(reply, 'Lens not found', { code: LENS_PARTNER_ERROR_CODES.LENS_NOT_FOUND });
      return sendSuccess(reply, { counted: outcome.counted });
    }),
  );

  fastify.get<{ Params: { slug: string } }>(
    '/usage/:slug',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'L’usage agrégé d’une lens sur 90 jours (#11327), pour son auteur et la modération : aucune ligne sous `k` (20) appareils distincts.',
        tags,
        summary: 'Read lens usage',
        params: packSlugParamsJsonSchema,
        response: { 200: packEnvelope(usageJsonSchema), ...PACK_ERRORS },
      },
    },
    guard('[GET /lens/usage/:slug]', async (request: PackSlugRequest, reply, viewer) => {
      const report = await partners.usage(viewer, request.params.slug);
      if (report === null) return sendNotFound(reply, 'Lens not found', { code: LENS_PARTNER_ERROR_CODES.LENS_NOT_FOUND });
      return sendSuccess(reply, report);
    }),
  );
}
