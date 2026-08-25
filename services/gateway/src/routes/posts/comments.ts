import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostCommentService } from '../../services/PostCommentService';
import { retractReactionNotifications } from '../../services/notifications/retractReactionNotifications';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { PostAudioService } from '../../services/posts/PostAudioService';
import { CreateCommentSchema, UpdateCommentSchema, FeedQuerySchema, LikeSchema, PostParams, CommentParams } from './types';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError, sendConflict, sendGone } from '../../utils/response';
import { ConflictError } from '../../errors/custom-errors';
import { resolveMentionedUsers, MentionService } from '../../services/MentionService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog, MutationResultGone } from '../../utils/withMutationLog';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { hoistLocationOnto } from '../../services/location/sharedPlace';
import {
  loadCommentPostAcl,
  canUserConsumePost,
  canUserInteractWithPost,
  resolveInteractionTarget,
  resolveConsumptionTarget,
} from '../../services/posts/postVisibility';

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un commentaire — miroir exact du hoist des messages / posts. Permet
 * au destinataire de rendre le lien cliquable/tracé vers `/l/<token>` sans
 * réécrire l'URL. No-op si le commentaire ne porte aucun lien tracé.
 */
function hoistCommentTrackingLinks<T extends Record<string, unknown>>(comment: T): T {
  const metadata = comment?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...comment, trackingLinks: tl } as T;
  }
  return comment;
}

/**
 * Hisse `metadata.location` en top-level `location` sur un commentaire —
 * appliqué à la liste (GET), aux réponses (GET replies) ET à la réponse de
 * création (POST), en plus du payload socket. Source UNIQUE partagée avec
 * `core.ts` (via `hoistLocationDeep`, qui l'applique aussi aux commentaires
 * embarqués dans un post) — pas de copie locale de la logique de hoist.
 */
function hoistCommentLocation<T extends Record<string, unknown>>(comment: T): T {
  return hoistLocationOnto(comment);
}

export function registerCommentRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const commentService = new PostCommentService(prisma);
  const mentionService = new MentionService(prisma);

  // GET /posts/:postId/comments — Top-level comments, cursor-paginated
  fastify.get('/posts/:postId/comments', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const { postId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      // Le fil hérite de l'audience du post : lire les commentaires d'un post
      // qu'on n'a pas le droit de voir, c'est en lire le contenu. Refus en 404
      // et non 403 — distinguer révélerait l'existence du post.
      //
      // Repost simple → racine (tâche 9) : un repost `isQuote:false` n'a pas
      // de fil propre — lire ses commentaires renvoie ceux de sa RACINE
      // (`resolveConsumptionTarget`, même point unique que l'écriture ci-dessous,
      // avec le verdict de CONSOMMATION — amis ∪ contacts DM). Une citation
      // garde son propre fil.
      const target = await resolveConsumptionTarget(prisma, postId, currentUserId);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const result = await commentService.getComments(target.id, cursor, limit, currentUserId);

      const commentContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const mentionedUsers = commentContents.length > 0
        ? await resolveMentionedUsers(prisma, commentContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, result.items.map((c) => hoistCommentLocation(c as unknown as Record<string, unknown>)), {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId/comments] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/comments/:commentId/replies — Replies to a comment
  fastify.get('/posts/:postId/comments/:commentId/replies', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const { commentId } = request.params;
      const query = FeedQuerySchema.safeParse(request.query);
      const { cursor, limit } = query.success ? query.data : { cursor: undefined, limit: 20 };

      const authContext = (request as UnifiedAuthRequest).authContext;
      const currentUserId = authContext.type === 'user' && !authContext.isAnonymous ? authContext.userId : undefined;

      // Le post est résolu DEPUIS le commentaire : cette route n'adresse la
      // cible que par `commentId`, donc le `:postId` du chemin peut nommer
      // n'importe quel post public tout en visant le fil d'un post privé.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserConsumePost(prisma, thread.post, currentUserId))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.getReplies(commentId, cursor, limit, currentUserId);

      const replyContents = result.items
        .map((c: any) => c.content as string)
        .filter(Boolean);
      const replyMentionedUsers = replyContents.length > 0
        ? await resolveMentionedUsers(prisma, replyContents)
        : [];

      reply.header('Cache-Control', 'private, no-cache');
      return sendSuccess(reply, result.items.map((r) => hoistCommentLocation(r as unknown as Record<string, unknown>)), {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
        meta: { mentionedUsers: replyMentionedUsers },
      });
    } catch (error) {
      fastify.log.error(`[GET comments/:commentId/replies] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments — Add a comment
  fastify.post('/posts/:postId/comments', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('comment') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = CreateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      // Commenter est une INTERACTION : amis stricts, l'audience plus étroite
      // des deux (cf. `postVisibility.ts`). Un contact DM non-ami peut lire le
      // fil d'une story FRIENDS sans pouvoir y écrire. La garde précède
      // l'écriture — sans elle, le commentaire était persisté puis notifiait
      // l'auteur, qui découvrait un intrus dans un fil restreint.
      //
      // Repost simple → racine (tâche 9) : un repost `isQuote:false` n'a pas
      // de fil propre — le commentaire atterrit sur le fil de sa RACINE
      // (`resolveInteractionTarget`, même point unique que REST like/unlike
      // et le socket `post:reaction-add/remove`). Une citation garde son
      // propre fil. Racine invisible pour l'acteur → refus standard.
      const target = await resolveInteractionTarget(prisma, postId, authContext.registeredUser.id);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const targetPostId = target.id;

      // Idempotent via clientMutationId — replays return the same comment.
      type CommentResult = NonNullable<Awaited<ReturnType<typeof commentService.addComment>>>;
      const comment = await withMutationLog<CommentResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'createComment',
        // `diverges` — voir `ReplayCost` : chaque exécution INSÈRE une ligne.
        // Rejouer sur un résultat disparu fabriquerait un doublon (contenu
        // supprimé qui ressuscite), d'où le 410 rendu par le catch de la route.
        replayCost: 'diverges',
        op: async () => {
          const c = await commentService.addComment(
            targetPostId,
            authContext.registeredUser.id,
            SecuritySanitizer.sanitizeText(parsed.data.content),
            parsed.data.parentId,
            parsed.data.effectFlags,
            parsed.data.originalLanguage,
            // Un seul média par commentaire : on lie le premier id du tableau.
            parsed.data.attachmentIds?.[0],
            parsed.data.mobileTranscription,
            parsed.data.location,
          );
          if (!c) throw new Error('POST_NOT_FOUND');
          return c as CommentResult & { id: string };
        },
        onDuplicate: async (resultId) => {
          const existing = await prisma.postComment.findUnique({ where: { id: resultId } });
          return existing ? (existing as unknown as CommentResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });

      if (!comment) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast comment added via Socket.IO — porte l'id de la CIBLE réelle
      // (`targetPostId`, la racine pour un repost simple) : les clients
      // patchent l'original partout où il apparaît.
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: targetPostId },
        select: { authorId: true, commentCount: true, type: true, content: true, createdAt: true, expiresAt: true, visibility: true, visibilityUserIds: true },
      });
      if (socialEvents && post) {
        socialEvents.broadcastCommentAdded({
          postId: targetPostId,
          comment: hoistCommentLocation(hoistCommentTrackingLinks(comment as unknown as Record<string, unknown>)) as unknown as typeof comment,
          commentCount: post.commentCount,
          // L'écho porte le cmid du créateur : l'émetteur remplace sa ligne
          // optimiste (id local = cmid) au lieu d'en insérer un doublon.
          clientMutationId: request.clientMutationId,
        }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: broadcast comment added failed'));
      }

      const notifService = fastify.notificationService;

      // Mention persistence + notifications (Phase 2B) — resolved FIRST so the
      // mentioned users can be excluded from the lower-priority recipient buckets
      // (priority: user_mentioned > comment_reply > post_comment > story_new_comment
      // > story_thread_reply > friend_story_comment). Sans cette résolution amont,
      // répondre à un commentaire EN mentionnant son auteur lui envoyait DEUX
      // notifications (user_mentioned + comment_reply) au lieu de la seule mention.
      let mentionedUserIds: string[] = [];
      // `post` conditionne le lot : c'est lui qui porte l'audience. Sans lui, on
      // ne peut pas établir qui a le droit d'être prévenu — donc on ne prévient
      // personne, plutôt que de pousser un extrait à l'aveugle.
      if (parsed.data.content && notifService && post) {
        const mentionedUsernames = mentionService.extractMentions(parsed.data.content);
        if (mentionedUsernames.length > 0) {
          const resolvedUsers = await mentionService.resolveUsernames(mentionedUsernames);
          mentionedUserIds = Array.from(resolvedUsers.values()).map(u => u.id);

          if (mentionedUserIds.length > 0) {
            mentionService.createCommentMentions(comment.id, mentionedUserIds)
              .catch(err => fastify.log.error(`comment mention persistence failed: ${err}`));

            notifService.createCommentMentionNotificationsBatch({
              commentId: comment.id,
              postId: targetPostId,
              commenterId: authContext.registeredUser.id,
              mentionedUserIds,
              commentExcerpt: parsed.data.content?.slice(0, 100),
              // Discriminant d'entité → surface ouverte au tap côté client.
              postType: post?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
              // Un commentaire n'a pas d'audience propre : il hérite de celle du
              // post. Sans ce passage, nommer quelqu'un hors audience lui
              // poussait un extrait du commentaire — donc du fil d'un post qu'il
              // n'a pas le droit d'ouvrir.
              postAuthorId: post.authorId,
              visibility: post.visibility,
              visibilityUserIds: post.visibilityUserIds ?? [],
            }).catch(err => fastify.log.error(`comment mention notification failed: ${err}`));
          }
        }
      }

      // Notify post author (or parent comment author for replies) — but SKIP a
      // recipient already mentioned above: la mention (user_mentioned) prime sur
      // comment_reply / post_comment pour un même destinataire.
      if (notifService) {
        if (parsed.data.parentId) {
          // Reply to a comment — notify the parent comment author. Le contenu
          // du commentaire parent voyage en subtitle (« En réponse à « … » »)
          // pour que le destinataire sache À QUOI on lui répond.
          const parentComment = await fastify.prisma?.postComment?.findUnique({
            where: { id: parsed.data.parentId },
            select: { authorId: true, content: true },
          });
          if (parentComment?.authorId && !mentionedUserIds.includes(parentComment.authorId)) {
            notifService.createCommentReplyNotification({
              actorId: authContext.registeredUser.id,
              postId: targetPostId,
              commentAuthorId: parentComment.authorId,
              commentId: comment.id,
              parentCommentId: parsed.data.parentId,
              replyPreview: parsed.data.content,
              parentCommentPreview: parentComment.content?.slice(0, 80),
              // Précise « sur votre story/réel/… » + date côté client (du JJ/MM/AAAA HH:MM).
              postType: post?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
              postCreatedAt: post?.createdAt ?? undefined,
              postExpiresAt: post?.expiresAt ?? undefined,
            }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: notify comment reply failed'));
          }
        } else if (post?.authorId && post.type !== 'STORY' && !mentionedUserIds.includes(post.authorId)) {
          // Top-level comment on a regular post/mood/status — notify the
          // author with the typed subtitle. Pour une STORY, l'auteur est
          // notifié par le bucket story_new_comment du fan-out ci-dessous
          // (avant ce gate, il recevait DEUX notifications pour le même
          // commentaire : post_comment + story_new_comment).
          notifService.createPostCommentNotification({
            actorId: authContext.registeredUser.id,
            postId: targetPostId,
            postAuthorId: post.authorId,
            commentId: comment.id,
            commentPreview: parsed.data.content,
            postType: post.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
            postPreview: post.content?.slice(0, 80),
            postCreatedAt: post.createdAt ?? undefined,
            postExpiresAt: post.expiresAt ?? undefined,
          }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: notify post comment failed'));
        }
      }

      // Story comment fan-out notifications (Phase 1D)
      // excludeUserIds: skip users who already received user_mentioned (higher priority)
      if (notifService && post?.authorId && !parsed.data.parentId) {
        notifService.createStoryCommentNotificationsBatch({
          postId: targetPostId,
          commentId: comment.id,
          storyAuthorId: post.authorId,
          commenterId: authContext.registeredUser.id,
          commentExcerpt: parsed.data.content?.slice(0, 100),
          postType: post.type as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL',
          postCreatedAt: post.createdAt ?? undefined,
          postExpiresAt: post.expiresAt ?? undefined,
          excludeUserIds: mentionedUserIds,
          // Passée BRUTE : un `?? 'PUBLIC'` ici rétablirait, un étage plus haut
          // et hors de vue du build, le défaut permissif que le paramètre vient
          // de perdre. Une visibilité absente doit restreindre, pas ouvrir.
          visibility: post.visibility,
          visibilityUserIds: post.visibilityUserIds ?? [],
        }).catch(err => fastify.log.error(`story comment notification fan-out failed: ${err}`));
      }

      // Trigger async translation for comment content (fire-and-forget)
      if (parsed.data.content) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translateComment(
            comment.id,
            targetPostId,
            parsed.data.content,
            (comment as any).originalLanguage,
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments]: translate comment failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      // Pipeline audio pour un média de commentaire audio (fire-and-forget).
      // Réutilise PostAudioService : Whisper → NLLB → TTS pour les langues plateforme.
      // Le routing ZMQ passe par `postId`/`postMediaId` (= commentMedia.id) ; à
      // l'arrivée, PostAudioService désambiguïse via `PostMedia.commentId` et émet
      // `comment:media-updated`. Pas de re-transcription si mobileTranscription fournie.
      const linkedMedia = (comment as unknown as { media?: Array<{ id: string; mimeType?: string; fileUrl?: string }> }).media?.[0];
      if (
        linkedMedia
        && linkedMedia.mimeType?.startsWith('audio/')
        && !parsed.data.mobileTranscription
      ) {
        PostAudioService.shared.processPostAudio({
          postId: targetPostId,
          postMediaId: linkedMedia.id,
          fileUrl: linkedMedia.fileUrl ?? '',
          authorId: authContext.registeredUser.id,
        }).catch((err) => fastify.log.error(`comment audio processing failed: ${err}`));
      }

      const newCommentMentionedUsers = parsed.data.content
        ? await resolveMentionedUsers(prisma, [parsed.data.content])
        : [];

      return sendSuccess(reply, hoistCommentLocation(comment as unknown as Record<string, unknown>), { statusCode: 201, meta: { mentionedUsers: newCommentMentionedUsers } });
    } catch (error) {
      // Le cmid a bien été appliqué, mais son résultat n'est plus relisible
      // (contenu supprimé, expiré, ou hors de la tranche ACL du lecteur) et
      // l'op DIVERGE — la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit exactement : le geste a eu lieu, il n'y a
      // rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Comment already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      if (error instanceof Error && error.message === 'PARENT_NOT_FOUND') {
        return sendNotFound(reply, 'Parent comment not found', { code: 'COMMENT_NOT_FOUND' });
      }
      if (error instanceof Error && error.message === 'MEDIA_NOT_AVAILABLE') {
        return sendBadRequest(reply, 'Attached media not found or already linked', { code: 'MEDIA_NOT_AVAILABLE' });
      }
      fastify.log.error(`[POST /posts/:postId/comments] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // PATCH /posts/:postId/comments/:commentId — Edit own comment (content
  // and/or visual effects). isEdited passe à true ; un contenu modifié purge
  // les traductions et relance le pipeline (elles décrivaient l'ANCIEN texte).
  fastify.patch('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = UpdateCommentSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      const sanitizedContent = parsed.data.content !== undefined
        ? SecuritySanitizer.sanitizeText(parsed.data.content)
        : undefined;

      // Idempotent via clientMutationId — replays return the same comment.
      type UpdateResult = NonNullable<Awaited<ReturnType<typeof commentService.updateComment>>>;
      const comment = await withMutationLog<UpdateResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'updateComment',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const c = await commentService.updateComment(commentId, authContext.registeredUser.id, {
            content: sanitizedContent,
            effectFlags: parsed.data.effectFlags,
          });
          if (!c) throw new Error('COMMENT_NOT_FOUND');
          return c as UpdateResult & { id: string };
        },
        // Rejeu idempotent : relire au MÊME format que updateComment (author +
        // media + postId) — la ligne Prisma brute cassait le décodage client.
        onDuplicate: async (resultId) => {
          const existing = await commentService.getCommentAsUpdateResult(resultId);
          return existing ? (existing as unknown as UpdateResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'COMMENT_NOT_FOUND') return null;
        throw err;
      });

      if (!comment) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Broadcast comment:updated — mêmes rooms et même filtrage de visibilité
      // que comment:added ; visibilité passée BRUTE (jamais de défaut permissif).
      const socialEvents = fastify.socialEvents;
      const post = await fastify.prisma?.post?.findUnique({
        where: { id: comment.postId },
        select: { authorId: true, visibility: true, visibilityUserIds: true },
      });
      if (socialEvents && post) {
        socialEvents.broadcastCommentUpdated({
          postId: comment.postId,
          comment: hoistCommentLocation(hoistCommentTrackingLinks(comment as unknown as Record<string, unknown>)) as unknown as typeof comment,
        }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[PATCH /posts/:postId/comments/:commentId]: broadcast comment updated failed'));
      }

      // Contenu modifié → les traductions stockées ont été purgées par le
      // service ; relance du pipeline sur le NOUVEAU texte (fire-and-forget,
      // même chemin que la création).
      if (comment.contentChanged && sanitizedContent) {
        try {
          PostTranslationService.shared.translateComment(
            comment.id,
            comment.postId,
            sanitizedContent,
            (comment as { originalLanguage?: string | null }).originalLanguage ?? undefined,
          ).catch((err) => fastify.log.warn({ err }, '[PATCH /posts/:postId/comments/:commentId]: translate comment failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      return sendSuccess(reply, hoistCommentLocation(comment as unknown as Record<string, unknown>));
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to edit this comment', { code: 'FORBIDDEN' });
      }
      if (error instanceof Error && error.message === 'EMPTY_CONTENT') {
        return sendBadRequest(reply, 'A text comment cannot be edited to blank', { code: 'EMPTY_CONTENT' });
      }
      fastify.log.error(`[PATCH /posts/:postId/comments/:commentId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments/:commentId/translate — Traduction à la
  // demande vers UNE langue (miroir de POST /posts/:postId/translate). Le
  // résultat arrive via comment:translation-updated ; hors des 5 langues
  // pré-générées, c'était le SEUL recours manquant du Prisme côté commentaires.
  fastify.post('/posts/:postId/comments/:commentId/translate', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const body = (request.body ?? {}) as { targetLanguage?: unknown; force?: unknown };
      const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim() : '';
      if (targetLanguage.length < 2 || targetLanguage.length > 5) {
        return sendBadRequest(reply, 'Invalid targetLanguage', { code: 'VALIDATION_ERROR' });
      }
      const force = body.force === true;

      // Lecture-scope : même garde que le fil (un lecteur autorisé à VOIR le
      // fil peut en demander la traduction).
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserConsumePost(prisma, thread.post, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      try {
        PostTranslationService.shared.translateCommentOnDemand(commentId, targetLanguage, { force })
          .catch((err) => fastify.log.warn({ err }, '[POST comments/:commentId/translate]: on-demand translate failed'));
      } catch {
        // PostTranslationService not initialized — skip silently
      }

      return sendSuccess(reply, { requested: true, targetLanguage });
    } catch (error) {
      fastify.log.error(`[POST comments/:commentId/translate] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/comments/:commentId/like — Like a comment
  fastify.post('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      // Même verdict que le chemin socket (`CommentReactionHandler`) : réagir
      // est une interaction. Le post est résolu depuis le commentaire, jamais
      // depuis le `:postId` du chemin.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserInteractWithPost(prisma, thread.post, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.likeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // `thread.postId` et non `:postId` : la garde ci-dessus a déjà résolu le
      // post DEPUIS le commentaire, et c'est cette valeur qui fait autorité.
      // `broadcastCommentLiked` en fait une room (`ROOMS.post`) et les clients
      // une clé de cache (`patchCommentInPostCaches`) — servi depuis l'URL, que
      // l'appelant choisit librement, il diffuse dans une room où les lecteurs
      // du fil ne sont pas et écrit l'agrégation d'un commentaire dans le cache
      // d'un post étranger. Le cas se produit sans malveillance sur un repost
      // simple, dont le client affiche l'id alors que le commentaire vit sur la
      // racine. Jumeau REST de l'invariant que porte `CommentReactionHandler`.
      const commentPostId = thread.postId;

      // Broadcast comment liked via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents && result.authorId) {
        socialEvents.broadcastCommentLiked({
          postId: commentPostId,
          commentId,
          userId: authContext.registeredUser.id,
          emoji,
          likeCount: result.likeCount,
        }, result.authorId);
      }

      // Notify comment author — l'extrait du commentaire liké voyage en
      // subtitle pour identifier QUEL commentaire reçoit la réaction.
      const notifService = fastify.notificationService;
      if (notifService && result.authorId) {
        // Le type de l'entité portant le commentaire est le discriminant qui
        // décide de la surface ouverte au tap (lecteur de réel / viewer
        // éphémère / détail de post) — sans lui le client retombe sur une
        // heuristique de cache et peut ouvrir la mauvaise surface.
        const [likedComment, likedPost] = await Promise.all([
          fastify.prisma?.postComment?.findUnique({
            where: { id: commentId },
            select: { content: true },
          }),
          fastify.prisma?.post?.findUnique({
            where: { id: commentPostId },
            select: { type: true },
          }),
        ]);
        notifService.createCommentLikeNotification({
          actorId: authContext.registeredUser.id,
          postId: commentPostId,
          commentId,
          commentAuthorId: result.authorId,
          emoji,
          commentPreview: likedComment?.content?.slice(0, 80),
          postType: likedPost?.type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
        }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/comments/:commentId/like]: notify comment like failed'));
      }

      return sendSuccess(reply, { liked: true, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      // Plafond des cinq réactions par personne et par objet
      // (`packages/shared/utils/reaction-limit.ts`) : `PostCommentService.likeComment`
      // lève un `ConflictError` dédié — un refus légitime, pas une panne. Sans
      // cette branche il retombait sur le `sendInternalError` du bas.
      if (error instanceof ConflictError) {
        return sendConflict(reply, error.message, { code: error.code });
      }
      fastify.log.error(`[POST comments/:commentId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId/like — Unlike a comment
  fastify.delete('/posts/:postId/comments/:commentId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      // Retirer une réaction reste une interaction avec le fil — même garde
      // que la pose, pour que l'ACL ne dépende pas du sens du geste.
      const thread = await loadCommentPostAcl(prisma, commentId);
      if (!thread || !(await canUserInteractWithPost(prisma, thread.post, authContext.registeredUser.id))) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      const result = await commentService.unlikeComment(commentId, authContext.registeredUser.id, emoji);
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Jumelle descendante de la diffusion que fait la route de pose. Elle
      // manquait : le compteur d'un commentaire ne savait que MONTER en direct,
      // et l'écart tenait jusqu'au prochain REST (côté iOS jusqu'au prochain
      // REST *et* par-delà les redémarrages, la valeur reçue y étant persistée).
      // `thread.postId` et non `:postId`, pour la même raison qu'à la pose : la
      // garde d'audience a déjà résolu le post DEPUIS le commentaire, et c'est
      // cette valeur qui adresse la room et sert de clé de cache aux clients.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && result.authorId) {
        socialEvents.broadcastCommentUnliked({
          postId: thread.postId,
          commentId,
          userId: authContext.registeredUser.id,
          emoji,
          likeCount: result.likeCount,
        }, result.authorId);
      }

      // Le symétrique du `createCommentLikeNotification` de la route de pose :
      // la réaction défaite emporte la notification qu'elle avait produite.
      // Fire-and-forget, comme la notification jumelle — le dé-like est déjà
      // persisté et ne doit pas dépendre du retrait.
      const notifService = fastify.notificationService;
      void retractReactionNotifications(
        prisma,
        {
          subject: { kind: 'comment', id: commentId },
          actorId: authContext.registeredUser.id,
          emoji,
        },
        notifService
      ).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId/comments/:commentId/like]: retract comment like notification failed'));

      return sendSuccess(reply, { liked: false, likeCount: result.likeCount, reactionSummary: result.reactionSummary });
    } catch (error) {
      fastify.log.error(`[DELETE comments/:commentId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/comments/:commentId — Delete a comment
  fastify.delete('/posts/:postId/comments/:commentId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: CommentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { commentId } = request.params;
      // Le `:postId` du chemin n'est LU par rien ici : la cible est adressée
      // par `commentId` seul, et l'annonce l'est par le post que le service
      // rend. Cf. `GET .../replies`, qui pose la même règle pour la lecture.
      //
      // Idempotent via clientMutationId. The MutationLog row records
      // the deleted comment id so replays are observably consistent
      // (broadcast side-effect fires exactly once).
      type DeleteOutcome = {
        readonly postId?: string;
        readonly deletedCommentIds?: string[];
        readonly parentId?: string | null;
      };
      const result = await withMutationLog<DeleteOutcome>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'deleteComment',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const res = await commentService.deleteComment(commentId, authContext.registeredUser.id);
          if (!res) throw new Error('COMMENT_NOT_FOUND');
          return { id: commentId, ...res };
        },
        // Le rejeu n'exécute pas le service : sans cette relecture, l'annonce
        // n'aurait plus d'adresse dérivée du serveur. Le soft-delete n'efface
        // pas la ligne — `deletedAt` la marque — donc `postId` reste lisible,
        // contrairement au sous-arbre que `NOT_DELETED` masque désormais.
        onDuplicate: async () => {
          const row = await fastify.prisma?.postComment?.findUnique({
            where: { id: commentId },
            select: { postId: true },
          });
          return { id: commentId, ...(row?.postId ? { postId: row.postId } : {}) };
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'COMMENT_NOT_FOUND') return null;
        throw err;
      });
      if (!result) {
        return sendNotFound(reply, 'Comment not found', { code: 'COMMENT_NOT_FOUND' });
      }

      // Broadcast comment deleted via Socket.IO
      //
      // Le post vient du COMMENTAIRE, jamais du chemin. Il ne porte pas que
      // l'adresse : `authorId`, `visibility` et `visibilityUserIds` sont
      // l'AUDIENCE du fan-out, et `commentCount` le compteur annoncé. Les tirer
      // du `:postId` de l'URL laissait l'appelant choisir à qui sa propre
      // suppression était annoncée — et, sur un repost simple, l'annonçait à
      // une room où les lecteurs du fil ne sont pas.
      //
      // Adresse introuvable (ligne non relisable au rejeu) → aucune annonce.
      // Se taire laisse la ligne à l'écran ; l'annoncer à une audience nommée
      // par l'appelant l'y laisse AUSSI, en polluant un fil étranger.
      const socialEvents = fastify.socialEvents;
      const commentPostId = result.postId;
      if (socialEvents && commentPostId) {
        const post = await fastify.prisma?.post?.findUnique({
          where: { id: commentPostId },
          select: { authorId: true, commentCount: true, visibility: true, visibilityUserIds: true },
        });
        if (post) {
          // Le fil retiré, pas la seule cible : `deleteComment` soft-delete la
          // cible ET tous ses descendants. Un client qui avait déplié les
          // réponses garderait sinon à l'écran des lignes déjà retirées, sans
          // aucun refetch pour l'en débarrasser (`getComments` filtre
          // `parentId: null`, donc `getReplies` n'est plus appelé pour un parent
          // supprimé).
          //
          // Repli sur `[commentId]` : le rejeu idempotent (`onDuplicate`) ne
          // rend que l'id et l'ADRESSE — la suppression a déjà eu lieu et son
          // sous-arbre n'est plus reconstructible par une lecture vivante,
          // `NOT_DELETED` le masquant désormais (le `postId`, lui, survit sur
          // la ligne soft-supprimée : c'est ce qui permet de l'y relire). Le
          // repli reproduit exactement le comportement d'avant ce correctif ;
          // une liste vide, elle, ferait survivre la cible elle-même.
          const deletedCommentIds = result.deletedCommentIds ?? [commentId];
          // `parentId` est OMIS — jamais mis à `null` — quand le service ne le
          // rend pas, c'est-à-dire sur le rejeu idempotent : le décrément de
          // `replyCount` a déjà eu lieu en base, et un client qui le
          // reflèterait une seconde fois ferait dériver son compteur. La clé
          // absente est donc la garde, et `null` reste réservé à son sens
          // propre : « la cible était un commentaire racine, rien à
          // décrémenter ».
          socialEvents.broadcastCommentDeleted({
            postId: commentPostId,
            commentId,
            deletedCommentIds,
            ...(result.parentId !== undefined ? { parentId: result.parentId } : {}),
            commentCount: post.commentCount,
          }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId/comments/:commentId]: broadcast comment deleted failed'));
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to delete this comment', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[DELETE comments/:commentId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
