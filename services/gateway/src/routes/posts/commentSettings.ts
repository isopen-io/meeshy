import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { postInclude } from '../../services/posts/postIncludes';
import { withMentions } from '../../services/posts/postReferences';
import { WIRE_BROADCAST } from '../../services/posts/storyEffectsV3';
import { admitThirdPartyRemoval } from '../../services/moderation/contentRemoval';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';
import { logError, logWarn } from '../../utils/logger.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { postIdParamsSchema, type PostParams } from './types';
import { hoistLocation, hoistTrackingLinks } from './publication';

/**
 * #16541 — fermer ou rouvrir les commentaires d'une publication (post, reel,
 * story, statut) APRÈS sa publication.
 *
 * Qui : l'AUTEUR, ou un tiers admis par la règle unique du retrait par un tiers
 * (`admitThirdPartyRemoval` : `canModerateContent` ET rang supérieur à
 * l'auteur). Un tiers laisse une trace `AdminAuditLog`.
 *
 * L'écriture ne touche QUE `commentsDisabled` : pas d'`isEdited`, pas de
 * relance du Prisme, pas de remise à zéro d'engagement — ce n'est pas une
 * édition du contenu. La garde d'admission des commentaires
 * (`admitCommentHome`) lit déjà la colonne : fermer ici refuse dès la
 * requête suivante.
 */
export const CommentSettingsSchema = z.object({ commentsDisabled: z.boolean() }).strict();

type Actor = { readonly id: string; readonly role?: string | null };
type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** La réponse est FERMÉE : `{ postId, commentsDisabled }`, rien d'autre ne part. */
const commentSettingsSuccessSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        postId: { type: 'string' },
        commentsDisabled: { type: 'boolean' },
      },
      required: ['postId', 'commentsDisabled'],
    },
  },
} as const;
type AdmittedAs = 'author' | 'moderation' | 'refused';
type Broadcaster = Pick<FastifyInstance['socialEvents'], 'broadcastPostUpdated' | 'broadcastStoryUpdated' | 'broadcastStatusUpdated'>;

async function admitCommentSettingsChange(prisma: PrismaClient, actor: Actor, authorId: string): Promise<AdmittedAs> {
  if (actor.id === authorId) return 'author';
  return (await admitThirdPartyRemoval(prisma, { actorRole: actor.role, authorId })) ? 'moderation' : 'refused';
}

async function recordModerationToggle(prisma: PrismaClient, params: { actorId: string; authorId: string; postId: string; commentsDisabled: boolean }): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId: params.actorId,
      userId: params.authorId,
      action: params.commentsDisabled ? 'DISABLE_COMMENTS' : 'ENABLE_COMMENTS',
      entity: 'Post',
      entityId: params.postId,
      metadata: JSON.stringify({ via: 'app' }),
    },
  });
}

/** Relit la publication entière et la diffuse sur le canal de son type — même forme que `notifyPostReaders`. */
async function broadcastCommentSettings(prisma: PrismaClient, social: Broadcaster | undefined, postId: string): Promise<void> {
  if (!social) return;
  const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED }, select: postInclude });
  if (!post) return;
  // Même hissage que la diffusion de l'édition (`PUT /posts/:postId`) : sans lui,
  // un client qui remplace la carte par l'événement y perdrait le lieu et les liens.
  const wire = withMentions(hoistLocation(hoistTrackingLinks(post as unknown as Record<string, unknown>)), WIRE_BROADCAST) as unknown as Post;
  if (post.type === 'STORY') return social.broadcastStoryUpdated(wire, post.authorId, { engagementReset: false });
  if (post.type === 'STATUS') return social.broadcastStatusUpdated(wire, post.authorId);
  return social.broadcastPostUpdated(wire, post.authorId);
}

export function registerCommentSettingsRoutes(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: AuthHook) {
  fastify.patch('/posts/:postId/comment-settings', {
    schema: {
      params: postIdParamsSchema,
      response: {
        200: commentSettingsSuccessSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const actor = authContext?.registeredUser;
      if (!actor) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = CommentSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      const { commentsDisabled } = parsed.data;
      const { postId } = request.params;

      const target = await prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED }, select: { id: true, authorId: true, commentsDisabled: true } });
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const admittedAs = await admitCommentSettingsChange(prisma, { id: actor.id, role: actor.role }, target.authorId);
      if (admittedAs === 'refused') {
        return sendForbidden(reply, 'Not authorized to change comment settings on this post', { code: 'FORBIDDEN' });
      }

      // Rien à changer : aucune écriture, aucune trace, aucune rediffusion à
      // toute l'audience — une bascule répétée ne coûte qu'une lecture.
      if (target.commentsDisabled === commentsDisabled) {
        return sendSuccess(reply, { postId, commentsDisabled });
      }

      const written = await prisma.post.updateMany({ where: { id: postId, deletedAt: NOT_DELETED }, data: { commentsDisabled } });
      if (written.count === 0) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      if (admittedAs === 'moderation') {
        recordModerationToggle(prisma, { actorId: actor.id, authorId: target.authorId, postId, commentsDisabled })
          .catch((err) => logWarn(fastify.log, '[PATCH /posts/:postId/comment-settings]: audit log write failed', err));
      }
      broadcastCommentSettings(prisma, fastify.socialEvents, postId)
        .catch((err) => logWarn(fastify.log, '[PATCH /posts/:postId/comment-settings]: broadcast failed', err));

      return sendSuccess(reply, { postId, commentsDisabled });
    } catch (error) {
      logError(fastify.log, '[PATCH /posts/:postId/comment-settings] Error', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
