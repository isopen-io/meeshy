/**
 * L'ADMINISTRATION DU REGISTRE DES PACKS, SANS DÉPLOIEMENT (#11275) —
 * `/api/v1/admin/packs` :
 *
 *   - `GET    /registry?domain=`                  chaque pack du dépôt : sa base, sa surcharge, son entrée servie ;
 *   - `PUT    /registry/:domain/:slug`            surcharger — `{ expectedRevision, hidden?, order?, price?, availability?, targeting? }`,
 *                                                 `null` retire un prix, une fenêtre ou un ciblage ; publier = `hidden: false`, retirer = `hidden: true` ;
 *   - `DELETE /registry/:domain/:slug?expectedRevision=`  revenir au registre du dépôt.
 *
 * `canManageGame` (BIGBOSS, ADMIN) — le prix est l'économie du Jeu (Meeshes).
 * Chaque action est JOURNALISÉE (`AdminAuditLog`) AVANT d'agir, avec l'état
 * d'avant : un journal indisponible n'écrit rien. Un refus (révision périmée,
 * fusion illégale) est journalisé aussi. 404 pour un pack absent du dépôt : une
 * surcharge ne crée jamais un pack.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isPackDomain, PACK_DOMAINS, PACK_SLUG_PATTERN, type PackDomain } from '@meeshy/shared/types/content-pack';
import type { PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import { PackRegistryOverrideSchema, type PackRegistryOverride } from '@meeshy/shared/types/pack-registry-override';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { requirePermission } from '../../middleware/authorize';
import { liveRegistryOverrides, startupBasePackIndex, type PackIndex } from '../../services/packs/PackIndex';
import { overlayPackIndex, type PackRegistryOverrides } from '../../services/packs/PackRegistryOverrides';
import { logError } from '../../utils/logger';

export const requirePackAdmin = requirePermission('canManageGame');

export type PacksRegistryAdminOptions = {
  readonly index?: PackIndex;
  readonly overrides?: PackRegistryOverrides;
};

const actorOf = (request: FastifyRequest): string | null => {
  const ctx = (request as UnifiedAuthRequest).authContext;
  return ctx?.registeredUser?.id ?? null;
};

const fail = (reply: FastifyReply, status: number, error: string, message?: string) =>
  reply.status(status).send({ success: false, error, message: message ?? error });

/** Une ligne de journal, ÉCRITE avant d'agir : si elle ne s'écrit pas, on n'agit pas. */
async function journal(
  request: FastifyRequest,
  prisma: PrismaClient,
  entry: { readonly action: string; readonly entityId: string; readonly changes?: unknown; readonly metadata?: unknown },
): Promise<boolean> {
  const actor = actorOf(request);
  if (actor === null) return false;
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: actor,
        userId: actor,
        action: entry.action,
        entity: 'PackRegistryEntry',
        entityId: entry.entityId,
        changes: entry.changes === undefined ? undefined : JSON.stringify(entry.changes),
        metadata: entry.metadata === undefined ? undefined : JSON.stringify(entry.metadata),
        ipAddress: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
      },
    });
    return true;
  } catch (error) {
    logError('pack registry audit write failed', error, { source: 'admin-packs-registry', action: entry.action });
    return false;
  }
}

/** Les champs que l'administration surcharge, tels qu'une entrée les porte. */
const editableOf = (entry: PackIndexEntry) => ({
  hidden: entry.hidden,
  order: entry.order,
  price: entry.price ?? null,
  availability: entry.availability ?? null,
  targeting: entry.targeting ?? null,
});

const windowJsonSchema = { type: ['object', 'null'], properties: { startsAt: { type: 'string' }, endsAt: { type: 'string' } } } as const;
const targetingJsonSchema = {
  type: ['object', 'null'],
  properties: { communities: { type: 'array', items: { type: 'string' } }, countries: { type: 'array', items: { type: 'string' } }, languages: { type: 'array', items: { type: 'string' } } },
} as const;
const editableJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { hidden: { type: 'boolean' }, order: { type: 'integer' }, price: { type: ['integer', 'null'] }, availability: windowJsonSchema, targeting: targetingJsonSchema },
} as const;
const overrideJsonSchema = { ...editableJsonSchema, type: ['object', 'null'] } as const;

const rowJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domain: { type: 'string' },
    slug: { type: 'string' },
    origin: { type: 'string' },
    revision: { type: 'integer' },
    base: editableJsonSchema,
    override: overrideJsonSchema,
    effective: editableJsonSchema,
  },
} as const;

const errorJsonSchema = { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } } } as const;
const errors = { 400: errorJsonSchema, 401: errorJsonSchema, 403: errorJsonSchema, 404: errorJsonSchema, 409: errorJsonSchema, 422: errorJsonSchema, 500: errorJsonSchema } as const;
const ok = (data: object) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

const paramsJsonSchema = {
  type: 'object',
  required: ['domain', 'slug'],
  properties: { domain: { type: 'string', maxLength: 32 }, slug: { type: 'string', pattern: PACK_SLUG_PATTERN.source, maxLength: 64 } },
} as const;

type RegistryParams = { readonly domain: string; readonly slug: string };

export async function packsRegistryAdminRoutes(fastify: FastifyInstance, options: PacksRegistryAdminOptions = {}) {
  const prisma = fastify.prisma as PrismaClient;
  const base = options.index ?? startupBasePackIndex();
  const overrides = options.overrides ?? liveRegistryOverrides(prisma);
  const guard = { onRequest: [fastify.authenticate, requirePackAdmin] };

  const rowOf = (domain: PackDomain, entry: PackIndexEntry) => {
    const snapshot = overrides.snapshot();
    const found = snapshot.get(`${domain}.${entry.slug}`) ?? null;
    const effective = overlayPackIndex(base, () => snapshot).entries(domain).find((candidate) => candidate.slug === entry.slug) ?? entry;
    return { domain, slug: entry.slug, origin: entry.origin, revision: found?.revision ?? 0, base: editableOf(entry), override: found?.override ?? null, effective: editableOf(effective) };
  };

  fastify.get<{ Querystring: { domain?: string } }>(
    '/registry',
    { ...guard, schema: { tags: ['admin', 'packs'], summary: 'Read the pack registry with its overrides', querystring: { type: 'object', properties: { domain: { type: 'string', maxLength: 32 } } }, response: { 200: ok({ type: 'array', items: rowJsonSchema }), ...errors } } },
    async (request, reply) => {
      try {
        await overrides.refresh();
        const wanted = request.query.domain;
        const domains = wanted !== undefined && isPackDomain(wanted) ? [wanted] : PACK_DOMAINS;
        return reply.send({ success: true, data: domains.flatMap((domain) => base.entries(domain).map((entry) => rowOf(domain, entry))) });
      } catch (error) {
        logError('pack registry read failed', error, { source: 'admin-packs-registry' });
        return fail(reply, 500, 'PACK_REGISTRY_READ_FAILED');
      }
    },
  );

  fastify.put<{ Params: RegistryParams; Body: Record<string, unknown> }>(
    '/registry/:domain/:slug',
    {
      ...guard,
      schema: {
        tags: ['admin', 'packs'],
        summary: 'Override a pack of the registry (publish, withdraw, date, target, price, order)',
        params: paramsJsonSchema,
        body: { type: 'object', required: ['expectedRevision'], properties: { expectedRevision: { type: 'integer', minimum: 0 } } },
        response: { 200: ok(rowJsonSchema), ...errors },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      if (actor === null) return fail(reply, 401, 'unauthorized');
      const { domain, slug } = request.params;
      if (!isPackDomain(domain)) return fail(reply, 404, 'PACK_NOT_FOUND');
      const { expectedRevision, ...fields } = request.body;
      const patch = PackRegistryOverrideSchema.safeParse(fields);
      if (!patch.success || typeof expectedRevision !== 'number') return fail(reply, 400, 'VALIDATION_ERROR', 'Seuls hidden, order, price, availability et targeting se surchargent.');
      const entityId = `${domain}.${slug}`;
      try {
        const before = await overrides.read(domain, slug);
        const journaled = await journal(request, prisma, { action: 'PACK_REGISTRY_UPDATE', entityId, changes: { before: before?.override ?? null, patch: patch.data, expectedRevision } });
        if (!journaled) return fail(reply, 500, 'audit-unavailable', 'Le journal d’audit est indisponible : rien n’a été écrit.');
        const outcome = await overrides.write({ base, domain, slug, patch: patch.data as PackRegistryOverride, expectedRevision, actorId: actor });
        if (outcome.kind !== 'written') {
          await journal(request, prisma, { action: 'PACK_REGISTRY_UPDATE_REFUSED', entityId, metadata: { reason: outcome.kind } });
          if (outcome.kind === 'not-found') return fail(reply, 404, 'PACK_NOT_FOUND', 'Aucun pack du dépôt sous ce nom : une surcharge ne crée pas de pack.');
          if (outcome.kind === 'revision-conflict') return fail(reply, 409, 'revision-conflict', 'Le registre a changé depuis votre lecture : rechargez.');
          return fail(reply, 422, 'PACK_OVERRIDE_UNLAWFUL', 'Cette surcharge viole une loi du registre (prix d’un pack intégré, fenêtre inversée…).');
        }
        const entry = base.entries(domain).find((candidate) => candidate.slug === slug) as PackIndexEntry;
        return reply.send({ success: true, data: rowOf(domain, entry) });
      } catch (error) {
        await journal(request, prisma, { action: 'PACK_REGISTRY_UPDATE_FAILED', entityId, metadata: { error: 'write-failed' } });
        logError('pack registry write failed', error, { source: 'admin-packs-registry' });
        return fail(reply, 500, 'PACK_REGISTRY_WRITE_FAILED');
      }
    },
  );

  fastify.delete<{ Params: RegistryParams; Querystring: { expectedRevision?: string } }>(
    '/registry/:domain/:slug',
    {
      ...guard,
      schema: {
        tags: ['admin', 'packs'],
        summary: 'Reset a pack to the versioned registry',
        params: paramsJsonSchema,
        querystring: { type: 'object', required: ['expectedRevision'], properties: { expectedRevision: { type: 'string', pattern: '^\\d{1,9}$' } } },
        response: { 200: ok({ type: 'object', properties: { domain: { type: 'string' }, slug: { type: 'string' } } }), ...errors },
      },
    },
    async (request, reply) => {
      const { domain, slug } = request.params;
      if (!isPackDomain(domain)) return fail(reply, 404, 'PACK_NOT_FOUND');
      const expectedRevision = Number(request.query.expectedRevision);
      const entityId = `${domain}.${slug}`;
      try {
        const before = await overrides.read(domain, slug);
        const journaled = await journal(request, prisma, { action: 'PACK_REGISTRY_RESET', entityId, changes: { before: before?.override ?? null, expectedRevision } });
        if (!journaled) return fail(reply, 500, 'audit-unavailable', 'Le journal d’audit est indisponible : rien n’a été écrit.');
        const outcome = await overrides.reset({ domain, slug, expectedRevision });
        if (outcome.kind !== 'reset') {
          await journal(request, prisma, { action: 'PACK_REGISTRY_RESET_REFUSED', entityId, metadata: { reason: outcome.kind } });
          return outcome.kind === 'not-found' ? fail(reply, 404, 'PACK_OVERRIDE_NOT_FOUND') : fail(reply, 409, 'revision-conflict');
        }
        return reply.send({ success: true, data: { domain, slug } });
      } catch (error) {
        logError('pack registry reset failed', error, { source: 'admin-packs-registry' });
        return fail(reply, 500, 'PACK_REGISTRY_WRITE_FAILED');
      }
    },
  );
}
