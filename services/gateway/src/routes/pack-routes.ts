/**
 * LA FABRIQUE des routes d'un domaine de packs (#10148, LP0, § 5.10.4) —
 * boutique, packs installés, détail, installation et retrait, les mêmes pour
 * les stickers (`/sticker-packs`), les cadres de gloire
 * (`/packs/glory-frame`) et, au lot LC, les cadres de capture.
 *
 *   - `GET    /`                 la boutique, `Cache-Control: private, no-cache` ;
 *   - `GET    /installed`        les packs installés, avec leur contenu ;
 *   - `GET    /:slug`            un pack ; 404 pour un slug inconnu du domaine ;
 *   - `PUT    /:slug/install`    l'installer ; `DELETE` le retirer — 404 pour un
 *                                slug inconnu, non publié ou masqué non installé,
 *                                409 pour le retrait d'un pack non retirable.
 *
 * Un montage PAR DOMAINE, jamais un paramètre `:domain` : le manifeste des
 * routes et les catalogues d'endpoints générés restent explicites. Réservé
 * aux comptes INSCRITS ; le texte, les codes et les schémas sont ceux de la
 * spec du domaine — ceux des stickers sont figés à l'octet
 * (`__tests__/unit/routes/sticker-packs-frozen-responses.test.ts`).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { PACK_LIMITS, PACK_SLUG_PATTERN } from '@meeshy/shared/types/content-pack';
import type { UserRoleEnum } from '@meeshy/shared/types';

import { isRegisteredUser, type UnifiedAuthRequest } from '../middleware/auth';
import { permissionsService } from '../services/admin/permissions.service';
import type { PackCatalog, PackInstallationBroadcast, PackViewer } from '../services/packs/PackCatalog';
import { logError } from '../utils/logger';
import { sendConflict, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../utils/response.js';
import { gameRateLimitConfig, refusalResponse } from './me/game-shared';
import { broadcastToUser } from '../utils/socket-broadcast';

/** Installer ou choisir un pack payant qu'on ne possède pas (#10632, § 4.2). */
export const PACK_NOT_OWNED_CODE = 'PACK_NOT_OWNED';

export const packEnvelope = (data: object) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

export const PACK_ERRORS = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 500: errorResponseSchema } as const;

/** Sans point et 24 caractères au plus : aucune clé `<domaine>.<slug>` ne passe, par construction. */
export const packSlugParamsJsonSchema = {
  type: 'object',
  required: ['slug'],
  properties: { slug: { type: 'string', pattern: PACK_SLUG_PATTERN.source, maxLength: PACK_LIMITS.maxSlugLength } },
} as const;

export type PackSlugRequest = FastifyRequest<{ Params: { slug: string } }>;

export function packViewerOf(request: FastifyRequest): PackViewer | null {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !isRegisteredUser(authContext) || !authContext.registeredUser) return null;
  const role = (authContext.registeredUser.role ?? 'USER') as UserRoleEnum;
  return { userId: authContext.registeredUser.id, canModerate: permissionsService.hasPermission(role, 'canModerateContent') };
}

/** La diffusion `pack:installation-updated` sur la room personnelle — best-effort, jamais une raison d'échouer l'écriture. */
export const packInstallationBroadcaster =
  (fastify: FastifyInstance): PackInstallationBroadcast =>
  (userId, event) => {
    broadcastToUser(fastify, userId, SERVER_EVENTS.PACK_INSTALLATION_UPDATED, event);
  };

export type PackRouteGuard = <R extends FastifyRequest>(
  label: string,
  handle: (request: R, reply: FastifyReply, viewer: PackViewer) => Promise<unknown>,
) => (request: R, reply: FastifyReply) => Promise<unknown>;

/** Comptes inscrits seulement (403 `REGISTERED_USER_REQUIRED`), et une panne journalisée rend un 500 au format du dépôt. */
export function packRouteGuard(
  fastify: FastifyInstance,
  options: { readonly internalErrorMessage: string; readonly onError?: (error: unknown, reply: FastifyReply) => unknown },
): PackRouteGuard {
  return (label, handle) => async (request, reply) => {
    const viewer = packViewerOf(request);
    if (!viewer) return sendForbidden(reply, 'Registered user required', { code: 'REGISTERED_USER_REQUIRED' });
    try {
      return await handle(request, reply, viewer);
    } catch (error) {
      const handled = options.onError?.(error, reply);
      if (handled !== undefined) return handled;
      logError(fastify.log, label, error);
      return sendInternalError(reply, options.internalErrorMessage);
    }
  };
}

type RouteText = { readonly description: string; readonly summary: string };

export type PackRoutesSpec<S, D extends S> = {
  readonly catalog: PackCatalog<S, D>;
  readonly guard: PackRouteGuard;
  /** Le chemin servi, pour les étiquettes de journal (`/sticker-packs`, `/packs/glory-frame`). */
  readonly basePath: string;
  readonly tags: readonly string[];
  readonly summaryJsonSchema: object;
  readonly detailJsonSchema: object;
  readonly notFound: { readonly message: string; readonly code: string };
  /** `null` : le domaine n'a aucun pack non retirable ni garde (le 409 n'est alors pas déclaré). */
  readonly notRemovable: { readonly message: string; readonly code: string } | null;
  readonly texts: { readonly list: RouteText; readonly installed: RouteText; readonly detail: RouteText; readonly install: RouteText; readonly uninstall: RouteText };
};

/** Les cinq routes de lecture et d'installation communes à tous les domaines. */
export function registerPackRoutes<S, D extends S>(fastify: FastifyInstance, spec: PackRoutesSpec<S, D>): void {
  const { catalog, guard, basePath, texts } = spec;
  const tags = [...spec.tags];

  fastify.get(
    '/',
    {
      onRequest: [fastify.authenticate],
      schema: { description: texts.list.description, tags, summary: texts.list.summary, response: { 200: packEnvelope({ type: 'array', items: spec.summaryJsonSchema }), ...PACK_ERRORS } },
    },
    guard(`[GET ${basePath}]`, async (_request, reply, viewer) => {
      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, await catalog.catalogue(viewer.userId));
    }),
  );

  fastify.get(
    '/installed',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: texts.installed.description,
        tags,
        summary: texts.installed.summary,
        response: { 200: packEnvelope({ type: 'array', items: spec.detailJsonSchema }), ...PACK_ERRORS },
      },
    },
    guard(`[GET ${basePath}/installed]`, async (_request, reply, viewer) => {
      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, await catalog.installed(viewer.userId));
    }),
  );

  fastify.get(
    '/:slug',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: texts.detail.description,
        tags,
        summary: texts.detail.summary,
        params: packSlugParamsJsonSchema,
        response: { 200: packEnvelope(spec.detailJsonSchema), ...PACK_ERRORS },
      },
    },
    guard(`[GET ${basePath}/:slug]`, async (request: PackSlugRequest, reply, viewer) => {
      const pack = await catalog.detail(request.params.slug, viewer);
      if (!pack) return sendNotFound(reply, spec.notFound.message, { code: spec.notFound.code });
      return sendSuccess(reply, pack);
    }),
  );

  const install = (installed: boolean) =>
    guard(`[${installed ? 'PUT' : 'DELETE'} ${basePath}/:slug/install]`, async (request: PackSlugRequest, reply, viewer) => {
      const outcome = await catalog.setInstalled(viewer.userId, request.params.slug, installed);
      if (outcome.kind === 'done') return sendSuccess(reply, outcome.pack);
      if (outcome.kind === 'not-owned') return sendForbidden(reply, 'Pack not owned', { code: PACK_NOT_OWNED_CODE });
      if (outcome.kind === 'not-removable' && spec.notRemovable !== null) {
        return sendConflict(reply, spec.notRemovable.message, { code: spec.notRemovable.code });
      }
      return sendNotFound(reply, spec.notFound.message, { code: spec.notFound.code });
    });

  const installSchema = (installed: boolean) => ({
    onRequest: [fastify.authenticate],
    schema: {
      description: installed ? texts.install.description : texts.uninstall.description,
      tags,
      summary: installed ? texts.install.summary : texts.uninstall.summary,
      params: packSlugParamsJsonSchema,
      response: { 200: packEnvelope(spec.summaryJsonSchema), ...(spec.notRemovable === null ? {} : { 409: errorResponseSchema }), ...PACK_ERRORS },
    },
  });

  fastify.put<{ Params: { slug: string } }>('/:slug/install', installSchema(true), install(true));
  fastify.delete<{ Params: { slug: string } }>('/:slug/install', installSchema(false), install(false));
}

const purchaseBodyJsonSchema = {
  type: 'object',
  required: ['requestId'],
  additionalProperties: false,
  properties: { requestId: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' } },
} as const;

export type PackPurchaseRouteSpec<S, D extends S> = {
  readonly catalog: PackCatalog<S, D>;
  readonly guard: PackRouteGuard;
  readonly basePath: string;
  readonly tags: readonly string[];
  readonly summaryJsonSchema: object;
  readonly notFound: { readonly message: string; readonly code: string };
};

/**
 * `POST /:slug/purchase` (#10632, § 4.3) : l'achat en Meeshes d'un pack payant.
 * Corps `{ requestId }` généré par le client AU GESTE ; la dépense est
 * idempotente par `(compte, requestId)` — un rejeu rend le même pack, sans
 * second débit. Le prix est lu au registre. 409 : `PACK_IS_FREE`,
 * `PACK_ALREADY_OWNED`, `INSUFFICIENT_MEESHES` (avec `balance`), `REQUEST_ID_CONFLICT`
 * (un `requestId` déjà dépensé pour autre chose). Seau de débit
 * propre (10 par minute et par compte), FERMÉ en cas de panne du magasin.
 */
export function registerPackPurchaseRoute<S, D extends S>(fastify: FastifyInstance, spec: PackPurchaseRouteSpec<S, D>): void {
  fastify.post<{ Params: { slug: string }; Body: { requestId: string } }>(
    '/:slug/purchase',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: gameRateLimitConfig(`pack-purchase:${spec.basePath}`, 10, true) },
      schema: {
        description: 'Achète un pack payant en Meeshes (#10632). Idempotent par `requestId` ; le prix est celui du registre.',
        tags: [...spec.tags],
        summary: 'Purchase a pack',
        params: packSlugParamsJsonSchema,
        body: purchaseBodyJsonSchema,
        response: {
          200: packEnvelope({ type: 'object', properties: { pack: spec.summaryJsonSchema, balance: { type: 'number' } } }),
          409: refusalResponse,
          ...PACK_ERRORS,
        },
      },
    },
    spec.guard(`[POST ${spec.basePath}/:slug/purchase]`, async (request: FastifyRequest<{ Params: { slug: string }; Body: { requestId: string } }>, reply, viewer) => {
      const outcome = await spec.catalog.purchase(viewer.userId, request.params.slug, request.body.requestId);
      switch (outcome.kind) {
        case 'done':
          return sendSuccess(reply, { pack: outcome.pack, balance: outcome.balance });
        case 'not-found':
          return sendNotFound(reply, spec.notFound.message, { code: spec.notFound.code });
        case 'free':
          return sendConflict(reply, 'Pack is free', { code: 'PACK_IS_FREE' });
        case 'already-owned':
          return sendConflict(reply, 'Pack already owned', { code: 'PACK_ALREADY_OWNED' });
        case 'request-id-conflict':
          return sendConflict(reply, 'Request id already used by another spend', { code: 'REQUEST_ID_CONFLICT' });
        case 'insufficient':
          return sendError(reply, 409, 'INSUFFICIENT_MEESHES', { code: 'INSUFFICIENT_MEESHES', details: { balance: outcome.balance } });
      }
    }),
  );
}
