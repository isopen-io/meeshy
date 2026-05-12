import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { CreatePostSchema, UpdatePostSchema, TranslatePostSchema, PostParams } from './types';
import { sendSuccess } from '../../utils/response';
import { resolveMentionedUsers } from '../../services/MentionService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog } from '../../utils/withMutationLog';

export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);

  // POST /posts — Create a new post
  fastify.post('/posts', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('create') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const parsed = CreatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
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
          visibility: parsed.data.visibility ?? 'PUBLIC',
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
        const broadcastPost = post as unknown as Post;
        if (postType === 'STORY') {
          socialEvents.broadcastStoryCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
        } else if (postType === 'STATUS') {
          socialEvents.broadcastStatusCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
        } else {
          socialEvents.broadcastPostCreated(broadcastPost, authContext.registeredUser.id).catch(() => {});
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
          ).catch(() => {});
        } catch {
          // PostTranslationService not initialized — skip silently
        }
      }

      const postContent = (post as any).content as string | undefined;
      const mentionedUsers = postContent
        ? await resolveMentionedUsers(prisma, [postContent])
        : [];

      return sendSuccess(reply, post, { statusCode: 201, meta: { mentionedUsers } });
    } catch (error) {
      fastify.log.error(`[POST /posts] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

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
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // PUT /posts/:postId — Update a post (author only)
  fastify.put('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = UpdatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
      }

      const post = await postService.updatePost(postId, authContext.registeredUser.id, parsed.data);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
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

      // Broadcast story edits to viewers so they don't render stale content.
      // Regular posts already have `broadcastPostUpdated`; stories need their
      // own event so iOS / web can listen narrowly to story changes (per audit
      // X7 — without this, deletes and edits silently desync the cached tray).
      const socialEvents = fastify.socialEvents;
      if (socialEvents && (post as any).type === 'STORY') {
        socialEvents.broadcastStoryUpdated(post as any, authContext.registeredUser.id).catch(() => {});
      }

      return sendSuccess(reply, post, { meta: { mentionedUsers: updateMentionedUsers } });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to edit this post' });
      }
      fastify.log.error(`[PUT /posts/:postId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /posts/:postId — Soft delete (author only)
  fastify.delete('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const result = await postService.deletePost(postId, authContext.registeredUser.id);
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      // Broadcast deletion via Socket.IO (use correct event based on post type)
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        if (result.type === 'STATUS') {
          socialEvents.broadcastStatusDeleted(postId, authContext.registeredUser.id, result.visibility, (result as any).visibilityUserIds ?? []).catch(() => {});
        } else if (result.type === 'STORY') {
          socialEvents.broadcastStoryDeleted(postId, authContext.registeredUser.id).catch(() => {});
        } else {
          socialEvents.broadcastPostDeleted(postId, authContext.registeredUser.id).catch(() => {});
        }
      }

      return sendSuccess(reply, { deleted: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return reply.status(403).send({ success: false, error: 'Not authorized to delete this post' });
      }
      fastify.log.error(`[DELETE /posts/:postId] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /posts/:postId/translate — Request on-demand translation for a specific language
  fastify.post('/posts/:postId/translate', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({ success: false, error: 'Authentication required' });
      }

      const { postId } = request.params;
      const parsed = TranslatePostSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Invalid request', details: parsed.error.issues });
      }

      const post = await postService.getPostById(postId);
      if (!post) {
        return reply.status(404).send({ success: false, error: 'Post not found' });
      }

      try {
        const translationService = PostTranslationService.shared;
        await translationService.translateOnDemand(postId, parsed.data.targetLanguage);
      } catch {
        return reply.status(503).send({ success: false, error: 'Translation service not available' });
      }

      return sendSuccess(reply, { requested: true, targetLanguage: parsed.data.targetLanguage });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/translate] Error: ${error}`);
      return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
