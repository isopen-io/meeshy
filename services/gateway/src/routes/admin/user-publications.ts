import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PostType, PostVisibility, Prisma } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';
import { requireHierarchy, requirePermission } from '../../middleware/authorize';
import { judgeReason, sendReasonRefusal } from '../../middleware/sovereign-reason';
import {
  nextModerationState,
  POST_MODERATION_ACTIONS,
  POST_MODERATION_BATCH_MAX,
  publicationStateOf,
  type PostModerationState,
} from '../../services/admin/publication-moderation';
import { noticeWithdrawals } from '../../services/moderation/adminRemovalNotices';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendForbidden, sendInternalError, sendPaginatedSuccess, sendSuccess } from '../../utils/response';
import {
  actorOf,
  announceWithdrawals,
  copyPlans,
  moderationSelect,
  outrankedPlans,
  stateOf,
  writeModerationPlans,
  type ModerationPlan as Plan,
} from './publication-moderation-writer';

/**
 * **LES PUBLICATIONS D'UN MEMBRE, VUES ET MODÉRÉES DEPUIS SA FICHE** (#10315).
 *
 * Le porteur a dû retirer d'urgence, par la base de production, des
 * publications d'une utilisatrice : aucune porte d'administration ne les
 * listait par auteur, et le seul geste servi (`DELETE /admin/posts/:postId`)
 * était unitaire et définitif.
 *
 * - `GET /admin/users/:userId/publications` — ses publications récentes (posts,
 *   réels, stories, statuts), vignette, date, type, audience, état.
 * - `POST /admin/users/:userId/publications/moderation` — un geste sur une
 *   sélection : `make-private`, `take-offline`, `restore` (la loi :
 *   `services/admin/publication-moderation.ts`).
 *
 * Les deux portes demandent `canModerateContent` (BIGBOSS, ADMIN, MODERATOR —
 * la permission que porte déjà le retrait unitaire). L'écriture ajoute la
 * hiérarchie sur l'AUTEUR : un modérateur n'agit pas sur les publications d'un
 * rang égal ou supérieur. Le motif est exigé sauf du rang souverain
 * (spec 2026-10-04 § 4), comme pour le retrait unitaire.
 *
 * Chaque publication changée laisse UNE ligne `AdminAuditLog` (qui, quand, quoi,
 * l'état d'avant et d'après), écrite dans la MÊME transaction que le changement :
 * un geste de modération sans trace n'a pas eu lieu.
 */

const MOTIF_MINIMAL = 3;
const LISTE_PAR_DEFAUT = 24;
const LISTE_MAX = 50;
const APERCU = 160;
const TYPES: readonly PostType[] = ['POST', 'REEL', 'STORY', 'STATUS'];

const requireModeration = requirePermission('canModerateContent');

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LISTE_MAX).default(LISTE_PAR_DEFAUT),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['POST', 'REEL', 'STORY', 'STATUS']).optional(),
});

const moderationBodySchema = z.object({
  action: z.enum(POST_MODERATION_ACTIONS),
  postIds: z.array(z.string().refine(isValidObjectId, 'Identifiant de publication invalide')).min(1).max(POST_MODERATION_BATCH_MAX),
  reason: z.string().max(500).optional(),
});

const publicationSelect = {
  id: true,
  type: true,
  visibility: true,
  content: true,
  createdAt: true,
  expiresAt: true,
  deletedAt: true,
  moderationHiddenAt: true,
  moderationPriorVisibility: true,
  media: { select: { mimeType: true, fileUrl: true, thumbnailUrl: true }, orderBy: { order: 'asc' }, take: 1 },
  _count: { select: { media: true } },
} satisfies Prisma.PostSelect;

type PublicationRow = Prisma.PostGetPayload<{ select: typeof publicationSelect }>;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

function servePublication(row: PublicationRow, now: Date) {
  const first = row.media[0];
  return {
    id: row.id,
    type: row.type,
    visibility: row.visibility,
    state: publicationStateOf(row, now),
    contentPreview: row.content === null ? null : sliceCodePoints(row.content, APERCU),
    createdAt: row.createdAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    deletedAt: iso(row.deletedAt),
    moderationHiddenAt: iso(row.moderationHiddenAt),
    moderationPriorVisibility: row.moderationPriorVisibility,
    mediaCount: row._count.media,
    thumbnail: first === undefined ? null : { url: first.thumbnailUrl ?? first.fileUrl, mimeType: first.mimeType },
  };
}

const nullableString = { type: ['string', 'null'] } as const;

const publicationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: TYPES },
    visibility: { type: 'string' },
    state: { type: 'string', enum: ['deleted', 'offline', 'expired', 'private', 'online'] },
    contentPreview: nullableString,
    createdAt: { type: 'string' },
    expiresAt: nullableString,
    deletedAt: nullableString,
    moderationHiddenAt: nullableString,
    moderationPriorVisibility: nullableString,
    mediaCount: { type: 'number' },
    thumbnail: {
      type: ['object', 'null'],
      properties: { url: { type: 'string' }, mimeType: { type: 'string' } },
    },
  },
} as const;

const listResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'array', items: publicationSchema },
    pagination: {
      type: 'object',
      properties: { total: { type: 'number' }, limit: { type: 'number' }, offset: { type: 'number' }, hasMore: { type: 'boolean' } },
    },
  },
} as const;

const moderationResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        updated: { type: 'number' },
        unchanged: { type: 'number' },
        skipped: { type: 'number' },
        outrankedCopies: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              postId: { type: 'string' },
              outcome: { type: 'string', enum: ['updated', 'unchanged', 'skipped', 'outranked', 'conflict'] },
              visibility: nullableString,
              moderationHiddenAt: nullableString,
            },
          },
        },
      },
    },
  },
} as const;

const userIdParams = {
  type: 'object',
  properties: { userId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
  required: ['userId'],
} as const;

/** Pourquoi une publication du lot n'a pas changé — dit, jamais tu. */
type Outcome = 'updated' | 'unchanged' | 'skipped' | 'outranked' | 'conflict';

export function registerUserPublicationRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { userId: string }; Querystring: Record<string, unknown> }>(
    '/admin/users/:userId/publications',
    {
      onRequest: [fastify.authenticate, requireModeration],
      // Lire les publications PRIVÉES d'un rang égal ou supérieur n'est pas du ressort d'un modérateur.
      preHandler: [requireHierarchy({ param: 'userId' })],
      schema: {
        description: "Publications récentes d'un membre (posts, réels, stories, statuts) avec leur audience et leur état. Requiert canModerateContent.",
        tags: ['admin'],
        params: userIdParams,
        response: { 200: listResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const query = listQuerySchema.safeParse(request.query ?? {});
      if (!query.success) return sendBadRequest(reply, query.error.issues[0]?.message ?? 'Invalid query', { code: 'VALIDATION_ERROR' });
      try {
        const { limit, offset, type } = query.data;
        const where: Prisma.PostWhereInput = { authorId: request.params.userId, ...(type === undefined ? {} : { type }) };
        const [rows, total] = await Promise.all([
          fastify.prisma.post.findMany({ where, select: publicationSelect, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
          fastify.prisma.post.count({ where }),
        ]);
        const now = new Date();
        return sendPaginatedSuccess(reply, rows.map((row) => servePublication(row, now)), {
          total,
          limit,
          offset,
          hasMore: offset + rows.length < total,
        });
      } catch (error) {
        logError(fastify.log, '[GET /admin/users/:userId/publications]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/admin/users/:userId/publications/moderation',
    {
      onRequest: [fastify.authenticate, requireModeration],
      preHandler: [requireHierarchy({ param: 'userId' })],
      schema: {
        description: "Un geste de modération sur une sélection de publications d'un membre : make-private, take-offline, restore. Réversible, journalisé. Requiert canModerateContent et la hiérarchie sur l'auteur.",
        tags: ['admin'],
        params: userIdParams,
        response: { 200: moderationResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 500: errorResponseSchema },
      },
    },
    async (request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>, reply: FastifyReply) => {
      const body = moderationBodySchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, body.error.issues[0]?.message ?? 'Invalid body', { code: 'VALIDATION_ERROR' });
      const verdict = judgeReason(request, body.data.reason, MOTIF_MINIMAL);
      if (!verdict.ok) return sendReasonRefusal(reply, verdict.problem, { source: 'body', min: MOTIF_MINIMAL });

      try {
        const { userId } = request.params;
        const { action } = body.data;
        const actor = actorOf(request);
        // On ne modère pas ses propres publications depuis l'administration : sans
        // cette garde, un modérateur levait le retrait que son supérieur venait de
        // poser sur lui (la hiérarchie laisse passer « soi »).
        if (userId === actor.id) return sendForbidden(reply, 'Self moderation is not allowed', { code: 'SELF_MODERATION' });
        const ids = [...new Set(body.data.postIds)];
        const rows = await fastify.prisma.post.findMany({
          where: { id: { in: ids }, authorId: userId, deletedAt: NOT_DELETED },
          select: moderationSelect,
          take: POST_MODERATION_BATCH_MAX,
        });
        const now = new Date();
        const plans: Plan[] = rows.map((row) => ({ row, before: stateOf(row), after: nextModerationState(action, stateOf(row), { now, actorId: actor.id }) }));
        const outranked = await outrankedPlans(fastify, plans, actor);
        const candidates = plans.filter((plan) => plan.after !== null && !outranked.has(plan.row.id));
        const copies = await copyPlans(fastify, action, candidates, { now, actor });

        // Écriture conditionnelle en transaction, journal par publication : le site unique
        // `writeModerationPlans` (#10392) — partagé avec la liste et les signalements.
        const writes = [...candidates, ...copies.plans];
        const applied = await writeModerationPlans(fastify, request, {
          writes,
          actorId: actor.id,
          metadataOf: () => ({ action, reason: verdict.reason ?? null }),
        });
        announceWithdrawals(fastify, action !== 'restore', applied);
        noticeWithdrawals({ prisma: fastify.prisma }, applied, { actorUserId: actor.id, reason: verdict.reason ?? null });

        const appliedIds = new Set(applied.filter((plan) => plan.copyOf === undefined).map((plan) => plan.row.id));
        const byId = new Map(plans.map((plan) => [plan.row.id, plan]));
        const results = ids.map((postId) => {
          const plan = byId.get(postId);
          if (plan === undefined) return { postId, outcome: 'skipped' as Outcome, visibility: null, moderationHiddenAt: null };
          const outcome: Outcome = appliedIds.has(postId) ? 'updated' : outranked.has(postId) ? 'outranked' : plan.after === null ? 'unchanged' : 'conflict';
          const final = outcome === 'updated' ? (plan.after as PostModerationState) : plan.before;
          return { postId, outcome, visibility: final.visibility as PostVisibility, moderationHiddenAt: iso(final.moderationHiddenAt) };
        });
        const count = (outcome: Outcome) => results.filter((result) => result.outcome === outcome).length;

        fastify.log.info({ action: 'admin_publications_moderation', moderation: action, userId, adminId: actor.id, updated: appliedIds.size, copies: applied.length - appliedIds.size, requested: ids.length });

        return sendSuccess(reply, {
          action,
          updated: count('updated'),
          unchanged: count('unchanged'),
          skipped: count('skipped') + count('outranked') + count('conflict'),
          outrankedCopies: copies.outranked,
          results,
        });
      } catch (error) {
        logError(fastify.log, '[POST /admin/users/:userId/publications/moderation]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );
}
