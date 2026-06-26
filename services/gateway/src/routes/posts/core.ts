import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { CreatePostSchema, UpdatePostSchema, TranslatePostSchema, PostParams } from './types';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError, sendError } from '../../utils/response';
import { resolveMentionedUsers, MentionService } from '../../services/MentionService';
import { NotificationService } from '../../services/notifications/NotificationService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog } from '../../utils/withMutationLog';

/**
 * Hisse `metadata.trackingLinks` ([{ url, token }]) en top-level sur le payload
 * socket d'un post/story/status — miroir exact du hoist `trackingLinks` des
 * messages (`MessageHandler`). Le destinataire rend le lien (texte + façade
 * vidéo) vers `/l/<token>` sans réécrire l'URL. Les réponses REST exposent déjà
 * `metadata` ; ce hoist ne sert que les payloads temps réel. No-op si absent.
 */
function hoistTrackingLinks<T extends Record<string, unknown>>(post: T): T {
  const metadata = post?.metadata as Record<string, unknown> | null | undefined;
  const tl = metadata?.trackingLinks;
  if (Array.isArray(tl) && tl.length > 0) {
    return { ...post, trackingLinks: tl } as T;
  }
  return post;
}

export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);
  const mentionService = new MentionService(prisma);
  const notificationService = new NotificationService(prisma);

  // POST /posts — Create a new post
  //
  // Per-route bodyLimit 1MB : suffisant pour content (5KB max) + storyEffects
  // (256KB max via StoryEffectsSchema refine) + autres champs ≈ 300KB worst-case.
  // Le bodyLimit global serveur (50MB) reste actif pour les routes d'upload
  // audio/TUS qui en ont besoin ; ici on durcit avant que Zod parse, évite
  // le DoS où un attaquant force 50MB de JSON à parser (CPU/RAM).
  fastify.post('/posts', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('create') },
    bodyLimit: 1 * 1024 * 1024,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = CreatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      type CreatedPost = Awaited<ReturnType<typeof postService.createPost>>;
      const post = await withMutationLog<CreatedPost>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'createPost',
        op: () => postService.createPost({
          ...parsed.data,
          type: parsed.data.type ?? 'POST',
          visibility: parsed.data.visibility ?? (parsed.data.type === 'STORY' ? 'FRIENDS' : 'PUBLIC'),
        }, authContext.registeredUser.id) as Promise<CreatedPost & { id: string }>,
        onDuplicate: async (resultId) => {
          const replayed = await postService.getPostById(resultId, authContext.registeredUser.id);
          return replayed ? (replayed as unknown as CreatedPost & { id: string }) : null;
        },
      });

      // Broadcast via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const postType = parsed.data.type ?? 'POST';
        const broadcastPost = hoistTrackingLinks(post) as unknown as Post;
        if (postType === 'STORY') {
          socialEvents.broadcastStoryCreated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast story created failed'));
        } else if (postType === 'STATUS') {
          socialEvents.broadcastStatusCreated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast status created failed'));
        } else {
          // U1 — echo the request cmid so an offline author reconciles its
          // optimistic temp post (keyed by cmid) with this server post.
          socialEvents.broadcastPostCreated(broadcastPost, authContext.registeredUser.id, request.clientMutationId).catch((err) => fastify.log.warn({ err }, '[POST /posts]: broadcast post created failed'));
        }
      }

      // Trigger async translation for posts/stories with text content (fire-and-forget)
      const postType = parsed.data.type ?? 'POST';
      const shouldTranslateContent = Boolean(parsed.data.content) && (
        postType === 'POST' ||
        (postType === 'STORY' && parsed.data.content?.trim())
      );
      if (shouldTranslateContent) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translatePost(
            (post as any).id,
            parsed.data.content,
            parsed.data.originalLanguage ?? (post as any).originalLanguage,
            authContext.registeredUser.id,
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts]: translate post failed'));
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      const postContent = (post as any).content as string | undefined;
      const mentionedUsers = postContent
        ? await resolveMentionedUsers(prisma, [postContent])
        : [];

      let mentionedUserIdsForDedup: string[] = [];

      // Persist and notify post-body mentions (fire-and-forget)
      if (postContent) {
        const usernames = mentionService.extractMentions(postContent);
        if (usernames.length > 0) {
          const usernameMap = await mentionService.resolveUsernames(usernames);
          const mentionedUserIds = Array.from(usernameMap.values()).map((u) => u.id);
          if (mentionedUserIds.length > 0) {
            mentionedUserIdsForDedup = mentionedUserIds;
            const postId = (post as any).id as string;
            const posterId = authContext.registeredUser.id;
            mentionService.createPostMentions(postId, mentionedUserIds).catch((err: unknown) => {
              fastify.log.error(`[POST /posts] post mention persist failed: ${err}`);
            });
            notificationService.createPostMentionNotificationsBatch({
              postId,
              posterId,
              mentionedUserIds,
              postExcerpt: postContent.slice(0, 100),
            }).catch((err: unknown) => {
              fastify.log.error(`[POST /posts] post mention notify failed: ${err}`);
            });
          }
        }
      }

      // Fan-out to friends: user_mentioned takes priority (dedup via excludeUserIds)
      const postTypeForNotif = ((post as any).type ?? parsed.data.type ?? 'POST') as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
      notificationService.createFriendContentNotificationsBatch({
        postId: (post as any).id as string,
        authorId: authContext.registeredUser.id,
        contentType: postTypeForNotif,
        excerpt: postContent?.slice(0, 100),
        postCreatedAt: (post as any).createdAt ?? undefined,
        postExpiresAt: (post as any).expiresAt ?? undefined,
        excludeUserIds: mentionedUserIdsForDedup,
        visibility: (post as any).visibility as string | undefined,
        visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
      }).catch((err: unknown) => {
        fastify.log.error(`[POST /posts] friend content notification fan-out failed: ${err}`);
      });

      return sendSuccess(reply, post, { statusCode: 201, meta: { mentionedUsers } });
    } catch (error) {
      fastify.log.error(`[POST /posts] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId — Get post by ID
  fastify.get('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const viewerUserId = authContext?.registeredUser?.id;
      const { postId } = request.params;

      const post = await postService.getPostById(postId, viewerUserId);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      reply.header('Cache-Control', 'private, no-cache');

      const contentStrings: string[] = [];
      if ((post as any).content) contentStrings.push((post as any).content);
      const embeddedComments = (post as any).comments as Array<{ content?: string }> | undefined;
      if (embeddedComments) {
        for (const c of embeddedComments) {
          if (c.content) contentStrings.push(c.content);
        }
      }
      const mentionedUsers = contentStrings.length > 0
        ? await resolveMentionedUsers(prisma, contentStrings)
        : [];

      return sendSuccess(reply, post, { meta: { mentionedUsers } });
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /posts/:postId — Update a post (author only)
  // Per-route bodyLimit 1MB — voir POST /posts pour la justification.
  fastify.put('/posts/:postId', {
    preValidation: [requiredAuth],
    bodyLimit: 1 * 1024 * 1024,
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = UpdatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      const post = await postService.updatePost(postId, authContext.registeredUser.id, parsed.data);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      const updateContentStrings: string[] = [];
      if ((post as any).content) updateContentStrings.push((post as any).content);
      const updateComments = (post as any).comments as Array<{ content?: string }> | undefined;
      if (updateComments) {
        for (const c of updateComments) {
          if (c.content) updateContentStrings.push(c.content);
        }
      }
      const updateMentionedUsers = updateContentStrings.length > 0
        ? await resolveMentionedUsers(prisma, updateContentStrings)
        : [];

      // Persist and notify post-body mentions on edit (re-fires all; idempotent via P2002 swallow)
      const editedContent = (post as any).content as string | undefined;
      if (editedContent) {
        const editUsernames = mentionService.extractMentions(editedContent);
        if (editUsernames.length > 0) {
          const editUsernameMap = await mentionService.resolveUsernames(editUsernames);
          const editMentionedUserIds = Array.from(editUsernameMap.values()).map((u) => u.id);
          if (editMentionedUserIds.length > 0) {
            const editPosterId = authContext.registeredUser.id;
            mentionService.createPostMentions(postId, editMentionedUserIds).catch((err: unknown) => {
              fastify.log.error(`[PUT /posts/:postId] post mention persist failed: ${err}`);
            });
            notificationService.createPostMentionNotificationsBatch({
              postId,
              posterId: editPosterId,
              mentionedUserIds: editMentionedUserIds,
              postExcerpt: editedContent.slice(0, 100),
            }).catch((err: unknown) => {
              fastify.log.error(`[PUT /posts/:postId] post mention notify failed: ${err}`);
            });
          }
        }
      }

      // Broadcast post edits. Each type has its own event so clients can listen narrowly:
      // - STORY → story:updated (visibility-filtered, per audit X7)
      // - STATUS → status:updated (visibility-filtered)
      // - POST/MOOD → post:updated to friends feed
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const updatedPostType = (post as any).type as string;
        if (updatedPostType === 'STORY') {
          socialEvents.broadcastStoryUpdated(post as any, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast story updated failed'));
        } else if (updatedPostType === 'STATUS') {
          socialEvents.broadcastStatusUpdated(post as any, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast status updated failed'));
        } else {
          socialEvents.broadcastPostUpdated(post as any, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast post updated failed'));
        }
      }

      return sendSuccess(reply, post, { meta: { mentionedUsers: updateMentionedUsers } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to edit this post', { code: 'FORBIDDEN' });
      }
      // Business-rule rejections from updatePost (invalid type switch, reel
      // without media, type change on a repost) carry a 422 statusCode.
      if (error instanceof Error && (error as { statusCode?: number }).statusCode === 422) {
        return sendBadRequest(reply, error.message, { code: 'INVALID_POST_UPDATE' });
      }
      fastify.log.error(`[PUT /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId — Soft delete (author only)
  fastify.delete('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.deletePost(postId, authContext.registeredUser.id);
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast deletion via Socket.IO (use correct event based on post type)
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        if (result.type === 'STATUS') {
          socialEvents.broadcastStatusDeleted(postId, authContext.registeredUser.id, result.visibility, (result as any).visibilityUserIds ?? []).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId]: broadcast status deleted failed'));
        } else if (result.type === 'STORY') {
          socialEvents.broadcastStoryDeleted(postId, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId]: broadcast story deleted failed'));
        } else {
          socialEvents.broadcastPostDeleted(postId, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId]: broadcast post deleted failed'));
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Not authorized to delete this post', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[DELETE /posts/:postId] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/translate — Request on-demand translation for a specific language
  fastify.post('/posts/:postId/translate', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = TranslatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      const post = await postService.getPostById(postId);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      try {
        const translationService = PostTranslationService.shared;
        await translationService.translateOnDemand(postId, parsed.data.targetLanguage);
      } catch {
        return sendError(reply, 503, 'Translation service not available', { code: 'SERVICE_UNAVAILABLE' });
      }

      return sendSuccess(reply, { requested: true, targetLanguage: parsed.data.targetLanguage });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/translate] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
