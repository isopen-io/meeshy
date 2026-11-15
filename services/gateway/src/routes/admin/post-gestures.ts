import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  ADMIN_POST_STATES,
  ADMIN_POST_VISIBILITIES,
  adminPostBatchGestureSchema,
  adminPostGestureSchema,
  adminPostStateOf,
  type AdminPostGesture,
  type AdminPostModerationView,
  type AdminPostState,
} from '@meeshy/shared/types/admin-publications';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { requirePermission } from '../../middleware/authorize';
import { judgeReason, sendReasonRefusal } from '../../middleware/sovereign-reason';
import { nextModerationState, nextVisibilityState, POST_MODERATION_BATCH_MAX, widensAuthorAudience, type PostModerationState } from '../../services/admin/publication-moderation';
import { noticeWithdrawals } from '../../services/moderation/adminRemovalNotices';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendConflict, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import {
  actorOf,
  announceWithdrawals,
  copyPlans,
  moderationSelect,
  outrankedPlans,
  stateOf,
  withinHierarchy,
  writeModerationPlans,
  type ModerationActor,
  type ModerationPlan,
} from './publication-moderation-writer';

/**
 * **LES GESTES DE PUBLICATION DEPUIS LA LISTE DE LA PLATEFORME** (#10392).
 *
 * - `POST /admin/posts/:postId/gestures` — un geste sur UNE publication, rend sa vue ;
 * - `POST /admin/posts/gestures` — le même geste sur un lot de 50 au plus, un verdict
 *   par publication (`applied`, `unchanged`, `refused` avec sa raison).
 *
 * Trois gestes (`@meeshy/shared/types/admin-publications`) : mettre hors ligne,
 * remettre en ligne (l'audience de l'auteur), changer l'audience (`PUBLIC`,
 * `FRIENDS`, `COMMUNITY`, `PRIVATE` — jamais plus large que l'audience de l'auteur,
 * `AUDIENCE_WIDENING`).
 *
 * Mêmes lois que la fiche d'un membre, par le même écrivain
 * (`publication-moderation-writer.ts`) : `canModerateContent`, motif exigé sauf
 * au rang souverain, jamais ses propres publications (`SELF_MODERATION`),
 * hiérarchie sur l'AUTEUR de chaque publication, hiérarchie sur le signataire
 * d'un retrait qu'on lève, écriture conditionnelle en transaction, une ligne
 * `MODERATE_POST` par publication changée (`{ gesture, from, to }`).
 */

const MOTIF_MINIMAL = 3;
const requireModeration = requirePermission('canModerateContent');

export type GestureRefusal = 'NOT_FOUND' | 'SELF_MODERATION' | 'FORBIDDEN' | 'MODERATION_OUTRANKED' | 'AUDIENCE_WIDENING' | 'CONFLICT';

export type GestureOutcome =
  | { readonly postId: string; readonly outcome: 'applied' | 'unchanged'; readonly view: AdminPostModerationView | null }
  | { readonly postId: string; readonly outcome: 'refused'; readonly code: GestureRefusal; readonly view: AdminPostModerationView | null };

const gestureSelect = { ...moderationSelect, expiresAt: true } satisfies Prisma.PostSelect;
type GestureRow = Prisma.PostGetPayload<{ select: typeof gestureSelect }>;

const viewSelect = {
  id: true,
  visibility: true,
  moderationHiddenAt: true,
  moderationPriorVisibility: true,
  deletedAt: true,
  expiresAt: true,
  updatedAt: true,
} satisfies Prisma.PostSelect;

type ViewRow = Prisma.PostGetPayload<{ select: typeof viewSelect }>;

const iso = (date: Date | null | undefined): string | null => (date === null || date === undefined ? null : date.toISOString());

function viewOf(row: ViewRow, now: Date): AdminPostModerationView {
  return {
    id: row.id,
    state: adminPostStateOf({ visibility: row.visibility, deletedAt: row.deletedAt ?? null, expiresAt: row.expiresAt ?? null, moderationHiddenAt: row.moderationHiddenAt ?? null }, now),
    visibility: row.visibility,
    moderationHiddenAt: iso(row.moderationHiddenAt),
    moderationPriorVisibility: row.moderationPriorVisibility ?? null,
    updatedAt: (row.updatedAt ?? now).toISOString(),
  };
}

const stateFromModeration = (state: PostModerationState, expiresAt: Date | null | undefined, now: Date): AdminPostState =>
  adminPostStateOf({ visibility: state.visibility, deletedAt: null, expiresAt: expiresAt ?? null, moderationHiddenAt: state.moderationHiddenAt }, now);

function afterOf(gesture: AdminPostGesture, before: PostModerationState, context: { readonly now: Date; readonly actorId: string }): PostModerationState | null {
  switch (gesture.gesture) {
    case 'take-offline':
      return nextModerationState('take-offline', before, context);
    case 'restore':
      return nextModerationState('restore', before, context);
    case 'set-visibility':
      return nextVisibilityState(before, gesture.visibility);
  }
}

/** Une écriture attendue n'a pas eu lieu : la transaction s'annule, le geste se dit en conflit. */
class GestureConflict extends Error {}

const withdraws = (gesture: AdminPostGesture): boolean =>
  gesture.gesture === 'take-offline' || (gesture.gesture === 'set-visibility' && gesture.visibility === 'PRIVATE');

/**
 * Le cœur des deux routes — et du traitement d'un signalement (`moderation-acts.ts`) :
 * un geste sur des publications, ses verdicts, et la vue de chacune après le geste.
 * `extra` écrit, dans la même transaction, ce que le geste engage à côté.
 */
export async function applyPostGesture(
  fastify: FastifyInstance,
  request: FastifyRequest,
  input: {
    readonly gesture: AdminPostGesture;
    readonly postIds: readonly string[];
    readonly reason: string | null;
    readonly actor: ModerationActor;
    readonly extra?: (tx: Prisma.TransactionClient, applied: readonly ModerationPlan[]) => Promise<void>;
    /** Ce que le journal de chaque publication porte en plus (le signalement d'origine). */
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<readonly GestureOutcome[]> {
  const { gesture, actor } = input;
  const ids = [...new Set(input.postIds)];
  const rows: readonly GestureRow[] = await fastify.prisma.post.findMany({
    where: { id: { in: ids }, deletedAt: NOT_DELETED },
    select: gestureSelect,
    take: POST_MODERATION_BATCH_MAX,
  });
  const now = new Date();
  const expiresOf = new Map(rows.map((row) => [row.id, row.expiresAt]));
  const others = rows.filter((row) => row.authorId !== actor.id);
  const widening = new Set(
    gesture.gesture === 'set-visibility' ? others.filter((row) => widensAuthorAudience(stateOf(row), gesture.visibility)).map((row) => row.id) : [],
  );
  const plans: ModerationPlan[] = others.map((row) => ({ row, before: stateOf(row), after: afterOf(gesture, stateOf(row), { now, actorId: actor.id }) }));
  const manageable = await withinHierarchy(fastify, plans, actor);
  const manageableIds = new Set(manageable.plans.map((plan) => plan.row.id));
  const inReach = plans.filter((plan) => manageableIds.has(plan.row.id));
  const outranked = await outrankedPlans(fastify, inReach, actor);
  const candidates = inReach.filter((plan) => plan.after !== null && !outranked.has(plan.row.id) && !widening.has(plan.row.id));
  const copies = gesture.gesture === 'set-visibility' ? { plans: [], outranked: 0 } : await copyPlans(fastify, gesture.gesture, candidates, { now, actor });

  // Ce que le geste engage À CÔTÉ (le statut d'un signalement) ne s'écrit que si le geste
  // s'applique à au moins une publication — jamais sur un refus — et s'annule avec lui :
  // une écriture attendue qui n'a pas eu lieu (publication changée entre-temps) avorte la
  // transaction entière, le signalement compris.
  const acceptable = inReach.filter((plan) => !outranked.has(plan.row.id) && !widening.has(plan.row.id));
  const extra = input.extra;
  const guardedExtra =
    extra === undefined || acceptable.length === 0
      ? undefined
      : async (tx: Prisma.TransactionClient, done: readonly ModerationPlan[]) => {
          if (candidates.length > 0 && done.every((plan) => plan.copyOf !== undefined)) throw new GestureConflict();
          await extra(tx, done);
        };
  const applied = await writeModerationPlans(fastify, request, {
    writes: [...candidates, ...copies.plans],
    actorId: actor.id,
    metadataOf: (plan) => ({
      gesture: gesture.gesture,
      from: stateFromModeration(plan.before, expiresOf.get(plan.row.id), now),
      to: stateFromModeration(plan.after as PostModerationState, expiresOf.get(plan.row.id), now),
      reason: input.reason,
      ...(gesture.gesture === 'set-visibility' ? { visibility: gesture.visibility } : {}),
      ...(input.metadata ?? {}),
    }),
    ...(guardedExtra === undefined ? {} : { extra: guardedExtra }),
  }).catch((error: unknown) => {
    if (error instanceof GestureConflict) return [] as readonly ModerationPlan[];
    throw error;
  });
  announceWithdrawals(fastify, withdraws(gesture), applied);
  noticeWithdrawals({ prisma: fastify.prisma }, applied, { actorUserId: actor.id, reason: input.reason });

  const found = new Set(rows.map((row) => row.id));
  const views: readonly ViewRow[] = found.size === 0 ? [] : await fastify.prisma.post.findMany({ where: { id: { in: [...found] } }, select: viewSelect, take: found.size });
  const viewById = new Map(views.map((row) => [row.id, viewOf(row, now)]));
  const appliedIds = new Set(applied.filter((plan) => plan.copyOf === undefined).map((plan) => plan.row.id));
  const planById = new Map(plans.map((plan) => [plan.row.id, plan]));
  const ownIds = new Set(rows.filter((row) => row.authorId === actor.id).map((row) => row.id));

  return ids.map((postId): GestureOutcome => {
    const view = viewById.get(postId) ?? null;
    const refuse = (code: GestureRefusal): GestureOutcome => ({ postId, outcome: 'refused', code, view });
    if (!found.has(postId)) return refuse('NOT_FOUND');
    if (ownIds.has(postId)) return refuse('SELF_MODERATION');
    if (!manageableIds.has(postId)) return refuse('FORBIDDEN');
    if (outranked.has(postId)) return refuse('MODERATION_OUTRANKED');
    if (widening.has(postId)) return refuse('AUDIENCE_WIDENING');
    if (appliedIds.has(postId)) return { postId, outcome: 'applied', view };
    if (planById.get(postId)?.after === null) return { postId, outcome: 'unchanged', view };
    return refuse('CONFLICT');
  });
}

const nullableString = { type: ['string', 'null'] } as const;

export const adminPostModerationViewJsonSchema = {
  type: 'object',
  // `required` n'est pas décoratif : dans un `anyOf` (l'acte sur un signalement), il est ce qui
  // empêche fast-json-stringify d'élire ce schéma pour un commentaire retiré et de le vider.
  required: ['id', 'state', 'visibility', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    state: { type: 'string', enum: [...ADMIN_POST_STATES] },
    visibility: { type: 'string', enum: [...ADMIN_POST_VISIBILITIES] },
    moderationHiddenAt: nullableString,
    moderationPriorVisibility: nullableString,
    updatedAt: { type: 'string' },
  },
} as const;

const postIdParams = {
  type: 'object',
  properties: { postId: { type: 'string' } },
  required: ['postId'],
} as const;

const REFUSAL_STATUS: Readonly<Record<GestureRefusal, { readonly status: 403 | 404 | 409; readonly message: string }>> = {
  NOT_FOUND: { status: 404, message: 'Publication introuvable' },
  SELF_MODERATION: { status: 403, message: 'Self moderation is not allowed' },
  FORBIDDEN: { status: 403, message: "Rang insuffisant sur l'auteur de cette publication" },
  MODERATION_OUTRANKED: { status: 403, message: 'Ce retrait a été posé par un rang supérieur' },
  AUDIENCE_WIDENING: { status: 403, message: "L'administration n'ouvre jamais une publication au-delà de l'audience choisie par son auteur" },
  CONFLICT: { status: 409, message: 'La publication a changé pendant le geste' },
};

function sendRefusal(reply: FastifyReply, code: GestureRefusal): void {
  const { status, message } = REFUSAL_STATUS[code];
  if (status === 404) return sendNotFound(reply, message, { code });
  if (status === 409) return sendConflict(reply, message, { code });
  return sendForbidden(reply, message, { code });
}

export async function adminPostGestureRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { postId: string }; Body: unknown }>(
    '/posts/gestures',
    {
      onRequest: [fastify.authenticate, requireModeration],
      schema: {
        description:
          'Un geste de publication sur un lot (50 au plus) : take-offline, restore, set-visibility (PUBLIC, FRIENDS, COMMUNITY, PRIVATE). Un verdict par publication. Requiert canModerateContent.',
        tags: ['admin'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        postId: { type: 'string' },
                        outcome: { type: 'string', enum: ['applied', 'unchanged', 'refused'] },
                        code: { type: 'string' },
                        view: adminPostModerationViewJsonSchema,
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = adminPostBatchGestureSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, body.error.issues[0]?.message ?? 'Invalid body', { code: 'VALIDATION_ERROR' });
      const verdict = judgeReason(request, body.data.reason, MOTIF_MINIMAL);
      if (!verdict.ok) return sendReasonRefusal(reply, verdict.problem, { source: 'body', min: MOTIF_MINIMAL });
      try {
        const { postIds, ...gesture } = body.data;
        const outcomes = await applyPostGesture(fastify, request, { gesture: gesture as AdminPostGesture, postIds, reason: verdict.reason ?? null, actor: actorOf(request) });
        const results = outcomes.map((outcome) => ({
          postId: outcome.postId,
          outcome: outcome.outcome,
          ...(outcome.outcome === 'refused' ? { code: outcome.code } : {}),
          ...(outcome.view === null ? {} : { view: outcome.view }),
        }));
        return sendSuccess(reply, { results });
      } catch (error) {
        logError(fastify.log, '[POST /admin/posts/gestures]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );

  fastify.post<{ Params: { postId: string }; Body: unknown }>(
    '/posts/:postId/gestures',
    {
      onRequest: [fastify.authenticate, requireModeration],
      schema: {
        description:
          "Un geste sur une publication : take-offline, restore, set-visibility (PUBLIC, FRIENDS, COMMUNITY, PRIVATE). Rend la vue de la publication après le geste. Requiert canModerateContent.",
        tags: ['admin'],
        params: postIdParams,
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' }, data: adminPostModerationViewJsonSchema } },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isValidObjectId(request.params.postId)) return sendBadRequest(reply, 'Identifiant de publication invalide', { code: 'VALIDATION_ERROR' });
      const body = adminPostGestureSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, body.error.issues[0]?.message ?? 'Invalid body', { code: 'VALIDATION_ERROR' });
      const verdict = judgeReason(request, body.data.reason, MOTIF_MINIMAL);
      if (!verdict.ok) return sendReasonRefusal(reply, verdict.problem, { source: 'body', min: MOTIF_MINIMAL });
      try {
        const [outcome] = await applyPostGesture(fastify, request, {
          gesture: body.data,
          postIds: [request.params.postId],
          reason: verdict.reason ?? null,
          actor: actorOf(request),
        });
        if (outcome === undefined) return sendRefusal(reply, 'NOT_FOUND');
        if (outcome.outcome === 'refused') return sendRefusal(reply, outcome.code);
        if (outcome.view === null) return sendRefusal(reply, 'NOT_FOUND');
        return sendSuccess(reply, outcome.view);
      } catch (error) {
        logError(fastify.log, '[POST /admin/posts/:postId/gestures]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );
}
