import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PostType, PostVisibility, Prisma } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';
import { requireHierarchy, requirePermission } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { judgeReason, sendReasonRefusal } from '../../middleware/sovereign-reason';
import {
  nextModerationState,
  POST_MODERATION_ACTIONS,
  POST_MODERATION_BATCH_MAX,
  liftsSomeoneElsesHold,
  publicationStateOf,
  withdrawsAudience,
  type PostModerationAction,
  type PostModerationState,
} from '../../services/admin/publication-moderation';
import { getSharedNotificationService } from '../../services/notifications/notification-service-registry';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { retractPostNotifications } from '../../services/posts/retractPostNotifications';
import { broadcastPostRemoval } from '../../socketio/broadcastPostRemoval';
import { announceCitedPostWithdrawal } from '../../socketio/announceCitedPostWithdrawal';
import { logError, logWarn } from '../../utils/logger';
import { sendBadRequest, sendForbidden, sendInternalError, sendPaginatedSuccess, sendSuccess } from '../../utils/response';
import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService as adminPermissionsService } from '../../services/admin/permissions.service';

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

/** P2034 (conflit d'écriture / interblocage) : la transaction n'a rien écrit, le lot se dit en conflit. */
const isWriteConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034';

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

const moderationSelect = {
  id: true,
  authorId: true,
  type: true,
  visibility: true,
  visibilityUserIds: true,
  moderationHiddenAt: true,
  moderationHiddenById: true,
  moderationPriorVisibility: true,
  repostOfId: true,
  originalRepostOfId: true,
} satisfies Prisma.PostSelect;

type ModerationRow = Prisma.PostGetPayload<{ select: typeof moderationSelect }>;

type Plan = {
  readonly row: ModerationRow;
  readonly before: PostModerationState;
  readonly after: PostModerationState | null;
  /** La publication retirée dont cette ligne est la COPIE (republication d'une story ou d'un statut). */
  readonly copyOf?: string;
};

/** Pourquoi une publication du lot n'a pas changé — dit, jamais tu. */
type Outcome = 'updated' | 'unchanged' | 'skipped' | 'outranked' | 'conflict';

const stateOf = (row: ModerationRow): PostModerationState => ({
  visibility: row.visibility,
  moderationHiddenAt: row.moderationHiddenAt,
  moderationHiddenById: row.moderationHiddenById,
  moderationPriorVisibility: row.moderationPriorVisibility,
});

const changesOf = (before: PostModerationState, after: PostModerationState) => ({
  visibility: { before: before.visibility, after: after.visibility },
  moderationHiddenAt: { before: iso(before.moderationHiddenAt), after: iso(after.moderationHiddenAt) },
  moderationHiddenById: { before: before.moderationHiddenById, after: after.moderationHiddenById },
  moderationPriorVisibility: { before: before.moderationPriorVisibility, after: after.moderationPriorVisibility },
});

function actorOf(request: FastifyRequest): { readonly id: string; readonly role: UserRoleEnum } {
  const user = (request as UnifiedAuthRequest).authContext.registeredUser!;
  return { id: user.id, role: (user.role ?? 'USER') as UserRoleEnum };
}

/**
 * Les retraits que l'acteur n'a pas le rang de lever (#10315, revue de sécurité) :
 * un retrait posé par un autre ne se lève que d'un rang au moins égal au sien.
 * Un signataire INCONNU — retrait antérieur à la signature, ou compte disparu —
 * exige le rang souverain : fail-closed, sans rendre le retrait impossible à lever.
 */
async function outrankedPlans(fastify: FastifyInstance, plans: readonly Plan[], actor: { readonly id: string; readonly role: UserRoleEnum }): Promise<ReadonlySet<string>> {
  const lifts = plans.filter((plan) => plan.after !== null && liftsSomeoneElsesHold(plan.before, plan.after, actor.id));
  if (lifts.length === 0) return new Set();
  const hiderIds = [...new Set(lifts.map((plan) => plan.before.moderationHiddenById).filter((id): id is string => id !== null))];
  const hiders =
    hiderIds.length === 0 ? [] : await fastify.prisma.user.findMany({ where: { id: { in: hiderIds } }, select: { id: true, role: true }, take: hiderIds.length });
  const levelOf = new Map(hiders.map((hider) => [hider.id, adminPermissionsService.getRoleLevel(hider.role as UserRoleEnum)]));
  const sovereign = adminPermissionsService.getRoleLevel(UserRoleEnum.BIGBOSS);
  const mine = adminPermissionsService.getRoleLevel(actor.role);
  const required = (plan: Plan): number => (plan.before.moderationHiddenById === null ? sovereign : (levelOf.get(plan.before.moderationHiddenById) ?? sovereign));
  return new Set(lifts.filter((plan) => required(plan) > mine).map((plan) => plan.row.id));
}

const EPHEMERAL_TYPES: ReadonlySet<string> = new Set(['STORY', 'STATUS']);
const COPIES_MAX = 500;

/**
 * **LES COPIES SUIVENT LEUR SOURCE** (contre-audit #10315, B-1). Republier une
 * story ou un statut en DUPLIQUE le contenu (médias, texte, effets) dans la
 * republication d'un autre : retirer la source sans ses copies laissait le contenu
 * servi partout. La mise hors ligne les retire avec elle, datée et signée comme
 * elle ; la remise en ligne ne rend que celles que CE retrait avait emportées
 * (même date, même signataire) — jamais une copie retirée pour elle-même.
 */
async function copyPlans(
  fastify: FastifyInstance,
  action: PostModerationAction,
  primary: readonly Plan[],
  context: { readonly now: Date; readonly actorId: string },
): Promise<Plan[]> {
  if (action === 'make-private') return [];
  const sources = primary.filter((plan) => plan.after !== null && EPHEMERAL_TYPES.has(plan.row.type));
  if (sources.length === 0) return [];
  const sourceIds = sources.map((plan) => plan.row.id);
  const copies = await fastify.prisma.post.findMany({
    where: { OR: [{ repostOfId: { in: sourceIds } }, { originalRepostOfId: { in: sourceIds } }], isQuote: false, deletedAt: NOT_DELETED },
    select: moderationSelect,
    take: COPIES_MAX,
  });
  const byId = new Map(sources.map((plan) => [plan.row.id, plan]));
  return copies.flatMap((copy): Plan[] => {
    const source = byId.get(copy.originalRepostOfId ?? '') ?? byId.get(copy.repostOfId ?? '');
    if (source === undefined || byId.has(copy.id)) return [];
    const before = stateOf(copy);
    const sameHold =
      before.moderationHiddenAt !== null &&
      source.before.moderationHiddenAt !== null &&
      before.moderationHiddenAt.getTime() === source.before.moderationHiddenAt.getTime() &&
      before.moderationHiddenById === source.before.moderationHiddenById;
    if (action === 'restore' && !sameHold) return [];
    const after = nextModerationState(action, before, context);
    return after === null ? [] : [{ row: copy, before, after, copyOf: source.row.id }];
  });
}

/** Ce que les CLIENTS doivent oublier, et ce que l'inbox doit retirer : effets hors transaction, jamais bloquants. */
function announceWithdrawals(fastify: FastifyInstance, action: PostModerationAction, applied: readonly Plan[]): void {
  applied
    .filter((plan) => plan.after !== null && withdrawsAudience(plan.before, plan.after))
    .forEach((plan) =>
      broadcastPostRemoval(
        fastify.socialEvents,
        { id: plan.row.id, authorId: plan.row.authorId, type: plan.row.type, visibility: plan.before.visibility, visibilityUserIds: plan.row.visibilityUserIds },
        (err) => logWarn(fastify.log, '[admin publications] broadcast withdrawal failed', err),
      ),
    );

  const withdrawn = applied.filter((plan) => plan.after !== null && plan.after.visibility === 'PRIVATE' && action !== 'restore');
  if (withdrawn.length === 0) return;
  // Les citations ouvertes dans les conversations se disent retirées sur-le-champ, comme au retrait définitif.
  const io = fastify.socketIOHandler?.getManager?.()?.getIO();
  withdrawn
    .filter((plan) => plan.after?.moderationHiddenAt != null)
    .forEach((plan) =>
      announceCitedPostWithdrawal({ prisma: fastify.prisma, io, post: { id: plan.row.id, type: plan.row.type, moderationHiddenAt: plan.after?.moderationHiddenAt ?? null } }).catch((err) =>
        logWarn(fastify.log, '[admin publications] cited withdrawal announce failed', err),
      ),
    );
  retractPostNotifications(
    fastify.prisma,
    withdrawn.map((plan) => plan.row.id),
    getSharedNotificationService(),
  ).catch((err) => logWarn(fastify.log, '[admin publications] notification retraction failed', err));
}

/** L'état LU, posé en condition de l'écriture : une valeur absente du document vaut `null` lu. */
function expectedStateWhere(plan: Plan): Prisma.PostWhereInput {
  const nullable = (field: 'moderationHiddenAt' | 'moderationHiddenById' | 'moderationPriorVisibility', value: unknown): Prisma.PostWhereInput =>
    value === null ? { OR: [{ [field]: null }, { [field]: { isSet: false } }] } : { [field]: value };
  return {
    id: plan.row.id,
    authorId: plan.row.authorId,
    deletedAt: NOT_DELETED,
    visibility: plan.before.visibility,
    AND: [
      nullable('moderationHiddenAt', plan.before.moderationHiddenAt),
      nullable('moderationHiddenById', plan.before.moderationHiddenById),
      nullable('moderationPriorVisibility', plan.before.moderationPriorVisibility),
    ],
  };
}

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
        const copies = await copyPlans(fastify, action, candidates, { now, actorId: actor.id });

        // Écriture CONDITIONNELLE et SÉQUENTIELLE dans une transaction : chaque
        // mise à jour ne porte que sur l'état lu (audience, retrait, signataire) ;
        // une publication changée entre-temps n'est pas écrasée et se dit
        // `conflict`. Le journal n'écrit que ce qui a changé. Une transaction
        // avortée par un conflit d'écriture concurrent rend `conflict` à tout le
        // lot, jamais un 500 ni un changement partiel.
        const writes = [...candidates, ...copies];
        const applied: readonly Plan[] =
          writes.length === 0
            ? []
            : await fastify.prisma
                .$transaction(async (tx) => {
                  const done: Plan[] = [];
                  for (const plan of writes) {
                    const result = await tx.post.updateMany({ where: expectedStateWhere(plan), data: plan.after as PostModerationState });
                    if (result.count === 1) done.push(plan);
                  }
                  if (done.length > 0) {
                    await tx.adminAuditLog.createMany({
                      data: done.map((plan) => ({
                        userId: plan.row.authorId,
                        adminId: actor.id,
                        action: 'MODERATE_POST',
                        entity: 'Post',
                        entityId: plan.row.id,
                        changes: JSON.stringify(changesOf(plan.before, plan.after as PostModerationState)),
                        metadata: JSON.stringify({ action, type: plan.row.type, reason: verdict.reason ?? null, ...(plan.copyOf === undefined ? {} : { copyOf: plan.copyOf }) }),
                        ipAddress: request.ip,
                        userAgent: request.headers['user-agent'] ?? null,
                      })),
                    });
                  }
                  return done;
                })
                .catch((error: unknown) => {
                  if (isWriteConflict(error)) return [];
                  throw error;
                });
        announceWithdrawals(fastify, action, applied);

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
          results,
        });
      } catch (error) {
        logError(fastify.log, '[POST /admin/users/:userId/publications/moderation]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );
}
