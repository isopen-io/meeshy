import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { adminReportActSchema, type AdminPostGesture, type AdminReportAction } from '@meeshy/shared/types/admin-publications';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { requirePermission } from '../../middleware/authorize';
import { judgeReason, sendReasonRefusal } from '../../middleware/sovereign-reason';
import { permissionsService as adminPermissionsService } from '../../services/admin/permissions.service';
import { PostCommentService } from '../../services/PostCommentService';
import { noticeAdminRemoval } from '../../services/moderation/adminRemovalNotices';
import { commentEventAudience } from '../../services/posts/commentHome';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { isNewlyResolvedReportTransition, notifyReportResolved } from '../../services/reports/reportResolvedNotification';
import { logError, logWarn } from '../../utils/logger';
import { sendBadRequest, sendConflict, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { adminPostModerationViewJsonSchema, applyPostGesture, type GestureRefusal } from './post-gestures';
import { actorOf, type ModerationActor } from './publication-moderation-writer';

/**
 * **UN SIGNALEMENT SE TRAITE EN UN GESTE** (#10394).
 *
 * - `POST /admin/reports/:reportId/act` — l'action sur le contenu signalé et la clôture
 *   du signalement partent ENSEMBLE : `take-offline` / `make-private` (une publication
 *   ou une story, par la loi des gestes de #10392 — même écrivain, même hiérarchie),
 *   `remove-comment` (le commentaire et ses réponses, retirés par la modération), ou
 *   `dismiss` (le signalement est classé, le contenu reste). Sur une publication, le
 *   statut du signalement s'écrit dans la MÊME transaction que le geste : un refus ou
 *   une publication changée entre-temps laissent le signalement ouvert.
 * - `POST /admin/comments/:commentId/remove` — le retrait d'un commentaire hors
 *   signalement (depuis la fiche de sa publication).
 *
 * `canModerateContent` ; motif exigé hors du rang souverain ; jamais sur soi
 * (`SELF_MODERATION`) ; hiérarchie sur l'auteur. Journal : `MODERATE_POST` par
 * publication (avec `reportId`), `REMOVE_CONTENT` pour un commentaire,
 * `ADMIN_REPORT_UPDATED` pour le signalement.
 */
const MOTIF_MINIMAL = 3;
const requireModeration = requirePermission('canModerateContent');
const POST_REPORT_TYPES: ReadonlySet<string> = new Set(['post', 'story']);

const reportSelect = {
  id: true,
  reportedType: true,
  reportedEntityId: true,
  reporterId: true,
  reportType: true,
  status: true,
  actionTaken: true,
  moderatorId: true,
} satisfies Prisma.ReportSelect;

type ReportRow = Prisma.ReportGetPayload<{ select: typeof reportSelect }>;

const closureOf = (action: AdminReportAction, actorId: string, now: Date) =>
  action === 'dismiss'
    ? { status: 'dismissed', actionTaken: 'none', moderatorId: actorId, resolvedAt: now }
    : { status: 'resolved', actionTaken: 'content_removed', moderatorId: actorId, resolvedAt: now };

const gestureOf = (action: 'take-offline' | 'make-private'): AdminPostGesture =>
  action === 'take-offline' ? { gesture: 'take-offline' } : { gesture: 'set-visibility', visibility: 'PRIVATE' };

function reportAudit(request: FastifyRequest, report: ReportRow, closure: ReturnType<typeof closureOf>, reason: string | null, action: AdminReportAction) {
  return {
    adminId: actorOf(request).id,
    userId: report.reportedEntityId,
    action: 'ADMIN_REPORT_UPDATED',
    entity: 'Report',
    entityId: report.id,
    changes: JSON.stringify({
      status: { before: report.status, after: closure.status },
      actionTaken: { before: report.actionTaken ?? null, after: closure.actionTaken },
    }),
    metadata: JSON.stringify({ act: action, reason }),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

async function announceClosure(fastify: FastifyInstance, report: ReportRow, status: string): Promise<void> {
  if (!isNewlyResolvedReportTransition(report.status, status)) return;
  await notifyReportResolved(fastify.prisma, {
    id: report.id,
    reporterId: report.reporterId,
    reportedType: report.reportedType,
    reportType: report.reportType,
    status: status as 'resolved' | 'dismissed',
    actionTaken: status === 'dismissed' ? 'none' : 'content_removed',
  }).catch((error: unknown) => logWarn(fastify.log, '[admin report act] reporter notification failed', error));
}

type CommentRemoval =
  | { readonly ok: true; readonly commentId: string; readonly removedAt: Date; readonly authorId: string; readonly postId: string }
  | { readonly ok: false; readonly status: 403 | 404; readonly code: string };

/** Le commentaire, son sous-arbre, les compteurs et l'annonce aux clients — par la modération. */
async function removeComment(fastify: FastifyInstance, commentId: string, actor: ModerationActor): Promise<CommentRemoval> {
  const comment = await fastify.prisma.postComment.findFirst({ where: { id: commentId, deletedAt: NOT_DELETED }, select: { id: true, authorId: true, postId: true } });
  if (comment === null) return { ok: false, status: 404, code: 'COMMENT_NOT_FOUND' };
  if (comment.authorId === actor.id) return { ok: false, status: 403, code: 'SELF_MODERATION' };
  const [author] = await fastify.prisma.user.findMany({ where: { id: { in: [comment.authorId] } }, select: { id: true, role: true }, take: 1 });
  const role = author?.role as UserRoleEnum | undefined;
  const manageable = role !== undefined && adminPermissionsService.getRoleLevel(role) > 0 && adminPermissionsService.canManageUser(actor.role, role);
  if (!manageable) return { ok: false, status: 403, code: 'FORBIDDEN' };

  const removed = await new PostCommentService(fastify.prisma).deleteComment(commentId, actor.id, undefined, { byModeration: true });
  if (removed === null) return { ok: false, status: 404, code: 'COMMENT_NOT_FOUND' };
  const post = await fastify.prisma.post.findUnique({
    where: { id: removed.postId },
    select: { authorId: true, commentCount: true, visibility: true, visibilityUserIds: true, isQuote: true, repostOfId: true },
  });
  if (post !== null && fastify.socialEvents !== undefined) {
    const audience = commentEventAudience(post);
    fastify.socialEvents
      .broadcastCommentDeleted(
        { postId: removed.postId, commentId, deletedCommentIds: removed.deletedCommentIds, ...(removed.parentId !== undefined ? { parentId: removed.parentId } : {}), commentCount: post.commentCount },
        post.authorId,
        audience.visibility,
        audience.visibilityUserIds,
      )
      .catch((error: unknown) => logWarn(fastify.log, '[admin comment removal] broadcast failed', error));
  }
  return { ok: true, commentId, removedAt: new Date(), authorId: comment.authorId, postId: removed.postId };
}

const commentAudit = (request: FastifyRequest, removal: Extract<CommentRemoval, { ok: true }>, reason: string | null, reportId: string | null) => ({
  adminId: actorOf(request).id,
  userId: removal.authorId,
  action: 'REMOVE_CONTENT',
  entity: 'Comment',
  entityId: removal.commentId,
  metadata: JSON.stringify({ reason, ...(reportId === null ? {} : { reportId }) }),
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'] ?? null,
});

const noticeCommentRemoval = (fastify: FastifyInstance, request: FastifyRequest, removal: Extract<CommentRemoval, { ok: true }>, reason: string | null) =>
  noticeAdminRemoval({ prisma: fastify.prisma }, { actorUserId: actorOf(request).id, authorUserId: removal.authorId, contentType: 'comment', contentId: removal.commentId, postId: removal.postId, reason });

const REFUSAL: Readonly<Record<GestureRefusal, 403 | 404 | 409>> = {
  NOT_FOUND: 404,
  SELF_MODERATION: 403,
  FORBIDDEN: 403,
  MODERATION_OUTRANKED: 403,
  AUDIENCE_WIDENING: 403,
  CONFLICT: 409,
};

function sendRefused(reply: FastifyReply, status: 403 | 404 | 409, code: string): void {
  if (status === 404) return sendNotFound(reply, 'Contenu introuvable', { code });
  if (status === 409) return sendConflict(reply, 'Le contenu a changé pendant le geste', { code });
  return sendForbidden(reply, 'Geste refusé sur ce contenu', { code });
}

const idParams = (name: string) => ({ type: 'object', properties: { [name]: { type: 'string' } }, required: [name] }) as const;

const removedCommentSchema = { type: 'object', required: ['commentId', 'removedAt'], properties: { commentId: { type: 'string' }, removedAt: { type: 'string' } } } as const;

export async function adminModerationActRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { reportId: string }; Body: unknown }>(
    '/reports/:reportId/act',
    {
      onRequest: [fastify.authenticate, requireModeration],
      schema: {
        description:
          "Traite un signalement en un geste : take-offline, make-private (publication), remove-comment (commentaire) ou dismiss. L'action et la clôture partent ensemble. Requiert canModerateContent.",
        tags: ['admin'],
        params: idParams('reportId'),
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  report: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' } } },
                  target: { anyOf: [adminPostModerationViewJsonSchema, removedCommentSchema, { type: 'null' }] },
                },
              },
            },
          },
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
      if (!isValidObjectId(request.params.reportId)) return sendBadRequest(reply, 'Identifiant de signalement invalide', { code: 'VALIDATION_ERROR' });
      const body = adminReportActSchema.safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, body.error.issues[0]?.message ?? 'Invalid body', { code: 'VALIDATION_ERROR' });
      const verdict = judgeReason(request, body.data.reason, MOTIF_MINIMAL);
      if (!verdict.ok) return sendReasonRefusal(reply, verdict.problem, { source: 'body', min: MOTIF_MINIMAL });
      const reason = verdict.reason ?? null;
      const { action } = body.data;

      try {
        const actor = actorOf(request);
        const report = await fastify.prisma.report.findUnique({ where: { id: request.params.reportId }, select: reportSelect });
        if (report === null) return sendNotFound(reply, 'Signalement non trouvé', { code: 'REPORT_NOT_FOUND' });
        if (report.reportedType === 'user' && report.reportedEntityId === actor.id) return sendForbidden(reply, 'Un signalement qui vous vise ne se traite pas par vous', { code: 'SELF_MODERATION' });
        const onPost = POST_REPORT_TYPES.has(report.reportedType);
        const applicable = action === 'dismiss' || (action === 'remove-comment' ? report.reportedType === 'comment' : onPost);
        if (!applicable) return sendBadRequest(reply, "Cette action ne vaut pas pour le contenu signalé", { code: 'ACTION_NOT_APPLICABLE' });

        const now = new Date();
        const closure = closureOf(action, actor.id, now);
        const close = async (tx: Prisma.TransactionClient) => {
          await tx.report.update({ where: { id: report.id }, data: closure });
          await tx.adminAuditLog.create({ data: reportAudit(request, report, closure, reason, action) });
        };

        if (action === 'dismiss') {
          await fastify.prisma.$transaction(async (tx) => close(tx));
          await announceClosure(fastify, report, closure.status);
          return sendSuccess(reply, { report: { id: report.id, status: closure.status }, target: null });
        }

        if (action === 'remove-comment') {
          const removal = await removeComment(fastify, report.reportedEntityId, actor);
          if ('code' in removal) return sendRefused(reply, removal.status, removal.code);
          await fastify.prisma.adminAuditLog.create({ data: commentAudit(request, removal, reason, report.id) });
          noticeCommentRemoval(fastify, request, removal, reason);
          await fastify.prisma.$transaction(async (tx) => close(tx));
          await announceClosure(fastify, report, closure.status);
          return sendSuccess(reply, { report: { id: report.id, status: closure.status }, target: { commentId: removal.commentId, removedAt: removal.removedAt.toISOString() } });
        }

        const [outcome] = await applyPostGesture(fastify, request, {
          gesture: gestureOf(action),
          postIds: [report.reportedEntityId],
          reason,
          actor,
          metadata: { reportId: report.id },
          extra: async (tx) => close(tx),
        });
        if (outcome === undefined) return sendRefused(reply, 404, 'NOT_FOUND');
        if (outcome.outcome === 'refused') return sendRefused(reply, REFUSAL[outcome.code], outcome.code);
        await announceClosure(fastify, report, closure.status);
        return sendSuccess(reply, { report: { id: report.id, status: closure.status }, target: outcome.view });
      } catch (error) {
        if (error instanceof z.ZodError) return sendError(reply, 400, 'Invalid body', { code: 'VALIDATION_ERROR' });
        logError(fastify.log, '[POST /admin/reports/:reportId/act]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );

  fastify.post<{ Params: { commentId: string }; Body: unknown }>(
    '/comments/:commentId/remove',
    {
      onRequest: [fastify.authenticate, requireModeration],
      schema: {
        description: 'Retire un commentaire (et ses réponses) par la modération. Journal REMOVE_CONTENT. Requiert canModerateContent.',
        tags: ['admin'],
        params: idParams('commentId'),
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' }, data: removedCommentSchema } },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!isValidObjectId(request.params.commentId)) return sendBadRequest(reply, 'Identifiant de commentaire invalide', { code: 'VALIDATION_ERROR' });
      const body = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
      if (!body.success) return sendBadRequest(reply, 'Invalid body', { code: 'VALIDATION_ERROR' });
      const verdict = judgeReason(request, body.data.reason, MOTIF_MINIMAL);
      if (!verdict.ok) return sendReasonRefusal(reply, verdict.problem, { source: 'body', min: MOTIF_MINIMAL });
      try {
        const removal = await removeComment(fastify, request.params.commentId, actorOf(request));
        if ('code' in removal) return sendRefused(reply, removal.status, removal.code);
        await fastify.prisma.adminAuditLog.create({ data: commentAudit(request, removal, verdict.reason ?? null, null) });
        noticeCommentRemoval(fastify, request, removal, verdict.reason ?? null);
        return sendSuccess(reply, { commentId: removal.commentId, removedAt: removal.removedAt.toISOString() });
      } catch (error) {
        logError(fastify.log, '[POST /admin/comments/:commentId/remove]', error);
        return sendInternalError(reply, 'Internal server error');
      }
    },
  );
}
