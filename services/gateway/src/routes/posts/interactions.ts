import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { OrphanMediaCleanupService } from '../../services/storage/OrphanMediaCleanupService';
import { LikeSchema, RepostSchema, PostParams, EngagementBatchSchema } from './types';
import { sendSuccess, sendForbidden, sendUnauthorized, sendNotFound, sendInternalError, sendBadRequest, sendConflict } from '../../utils/response';
import { ConflictError } from '../../errors/custom-errors';
import { resolveMentionedUsers } from '../../services/MentionService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog } from '../../utils/withMutationLog';
import { resolveFrontendBaseUrl } from '../../services/TrackingLinkService';

export function registerInteractionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  orphanCleanup?: OrphanMediaCleanupService
) {
  // Inject orphanCleanup so repostPost registers snapshot files in the
  // outbox before commit (Pilier 4 producer side). The MediaService
  // argument is the default — passed explicitly so the constructor chain
  // is readable.
  const postService = new PostService(prisma, new MediaService(), orphanCleanup);

  // POST /posts/:postId/like
  fastify.post('/posts/:postId/like', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('like') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = LikeSchema.safeParse(request.body ?? {});
      const emoji = parsed.success ? parsed.data.emoji : '❤️';

      // Idempotent via clientMutationId. `likePost` is naturally
      // idempotent at the storage layer (the reaction set keeps a
      // single entry per (userId, postId)), but we still record the
      // mutation so replays don't double-fire notifications.
      const post = await withMutationLog({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'toggleLikePost',
        op: async () => {
          const res = await postService.likePost(postId, authContext.registeredUser.id, emoji);
          if (!res) throw new Error('POST_NOT_FOUND');
          return res as typeof res & { id: string };
        },
        onDuplicate: async (_resultId) => {
          const res = await postService.getPostById(postId, authContext.registeredUser.id);
          return res as (typeof res & { id: string }) | null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast like via Socket.IO. Each post type fans out differently:
      // - STORY → private story:reacted to author + post room (privacy: not fanned to friends)
      // - STATUS → status:reacted to author + post room (same privacy model as STORY)
      // - POST/MOOD → post:liked fan-out to all friends
      const socialEvents = fastify.socialEvents;
      if (socialEvents && post.authorId) {
        if (post.type === 'STORY') {
          socialEvents.broadcastStoryReacted({
            storyId: postId,
            userId: authContext.registeredUser.id,
            emoji,
          }, post.authorId);
        } else if (post.type === 'STATUS') {
          socialEvents.broadcastStatusReacted({
            statusId: postId,
            userId: authContext.registeredUser.id,
            emoji,
          }, post.authorId);
        } else {
          socialEvents.broadcastPostLiked({
            postId,
            userId: authContext.registeredUser.id,
            emoji,
            likeCount: post.likeCount,
            reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
          }, post.authorId,
            (post as { visibility?: string }).visibility ?? 'PUBLIC',
            (post as { visibilityUserIds?: string[] }).visibilityUserIds ?? [],
          ).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/like]: broadcast post liked failed'));
        }
      }

      // Create notification for post author
      const notifService = fastify.notificationService;
      if (notifService && post.authorId) {
        notifService.createPostLikeNotification({
          actorId: authContext.registeredUser.id,
          postId,
          postAuthorId: post.authorId,
          emoji,
          postType: post.type,
          postPreview: (post as { content?: string | null }).content?.slice(0, 80) ?? undefined,
          postCreatedAt: (post as { createdAt?: Date | string | null }).createdAt ?? undefined,
          postExpiresAt: (post as { expiresAt?: Date | string | null }).expiresAt ?? undefined,
        }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/like]: notify post like failed'));
      }

      return sendSuccess(reply, { liked: true, reactionSummary: post.reactionSummary });
    } catch (error) {
      // The max-1-reaction domain guard is reachable (a user changing their
      // emoji) — surface it as 409, not a 500. Preserves the "max 1" semantics
      // while keeping a reachable domain error out of INTERNAL_ERROR.
      if (error instanceof ConflictError) {
        return sendConflict(reply, error.message, { code: error.code });
      }
      fastify.log.error(`[POST /posts/:postId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/like
  fastify.delete('/posts/:postId/like', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      // Idempotent via clientMutationId. Unlike is also naturally
      // idempotent — re-running over an already-unliked post is a
      // no-op — but recording the mutation prevents the broadcast
      // path from firing twice on replay.
      const post = await withMutationLog({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'toggleLikePost',
        op: async () => {
          const res = await postService.unlikePost(postId, authContext.registeredUser.id);
          if (!res) throw new Error('POST_NOT_FOUND');
          return res as typeof res & { id: string };
        },
        onDuplicate: async (_resultId) => {
          const res = await postService.getPostById(postId, authContext.registeredUser.id);
          return res as (typeof res & { id: string }) | null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast unlike via Socket.IO. Mirror the like broadcast routing per post type.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && post.authorId) {
        if (post.type === 'STORY') {
          socialEvents.broadcastStoryUnreacted({
            storyId: postId,
            userId: authContext.registeredUser.id,
            emoji: '❤️',
          }, post.authorId);
        } else if (post.type === 'STATUS') {
          socialEvents.broadcastStatusUnreacted({
            statusId: postId,
            userId: authContext.registeredUser.id,
            emoji: '❤️',
          }, post.authorId);
        } else {
          socialEvents.broadcastPostUnliked({
            postId,
            userId: authContext.registeredUser.id,
            emoji: '❤️',
            likeCount: post.likeCount,
            reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
          }, post.authorId,
            (post as { visibility?: string }).visibility ?? 'PUBLIC',
            (post as { visibilityUserIds?: string[] }).visibilityUserIds ?? [],
          ).catch((err) => fastify.log.warn({ err }, '[DELETE /posts/:postId/like]: broadcast post unliked failed'));
        }
      }

      return sendSuccess(reply, { liked: false, reactionSummary: post.reactionSummary });
    } catch (error) {
      fastify.log.error(`[DELETE /posts/:postId/like] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/bookmark
  fastify.post('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.bookmarkPost(postId, authContext.registeredUser.id);
      // Sync temps réel (perso) : le feed et le reel viewer réhydratent
      // `isBookmarkedByMe` + le `bookmarkCount` absolu → le favori et son
      // compteur survivent à la fermeture/réouverture, sans reload.
      fastify.socialEvents?.broadcastPostBookmarked(
        { postId, bookmarked: true, bookmarkCount: result?.bookmarkCount ?? 0 },
        authContext.registeredUser.id,
      );
      return sendSuccess(reply, { bookmarked: true, bookmarkCount: result?.bookmarkCount ?? 0 });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/bookmark] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/bookmark
  fastify.delete('/posts/:postId/bookmark', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.unbookmarkPost(postId, authContext.registeredUser.id);
      fastify.socialEvents?.broadcastPostBookmarked(
        { postId, bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 },
        authContext.registeredUser.id,
      );
      return sendSuccess(reply, { bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 });
    } catch (error) {
      fastify.log.error(`[DELETE /posts/:postId/bookmark] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/view
  fastify.post('/posts/:postId/view', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('view') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const { duration } = (request.body as any) ?? {};
      const viewerId = authContext.registeredUser.id;
      const isNewView = await postService.recordView(postId, viewerId, duration);

      // Contenu consommé (première vue réelle) → les notifications liées à ce
      // post (X a publié une story / un statut / un post, réactions, commentaires)
      // ne doivent plus apparaître comme non lues. Borné à la première vue pour
      // éviter de rejouer la requête à chaque impression répétée du feed.
      // Fire-and-forget : ne bloque pas la réponse, émet `notification:counts`.
      if (isNewView) {
        fastify.notificationService.markPostNotificationsAsRead(viewerId, postId).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/view]: mark post notifications as read failed'));
      }

      // If this is a story, broadcast the view to the story author
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        // Fetch post to check type and get author + viewCount. Passe le viewer :
        // sans lui, `getPostById` applique le filtre PUBLIC-seul et retourne
        // `null` pour une story FRIENDS (le cas courant) → `broadcastStoryViewed`
        // ne partait jamais alors que `recordView` (même filtre viewer) avait
        // bien enregistré la vue. Le viewer vient de passer ce même filtre dans
        // `recordView`, donc la story est retrouvée ici aussi.
        const post = await postService.getPostById(postId, viewerId);
        if (post && post.type === 'STORY' && post.authorId !== authContext.registeredUser.id) {
          socialEvents.broadcastStoryViewed({
            storyId: postId,
            viewerId: authContext.registeredUser.id,
            viewerUsername: authContext.registeredUser.username ?? '',
            viewCount: post.viewCount,
          }, post.authorId);
        }
      }

      return sendSuccess(reply, { viewed: true });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/view] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/anonymous-view — compte une ouverture ANONYME (sans compte).
  // v1 "comptage bête" : public, dédup faible par X-Session-Token (chaîne opaque).
  // Les clients INSCRITS (JWT présent) sont comptés via le parcours engagement →
  // no-op ici pour éviter le double-comptage. Voir spec 2026-06-17 (§ Sécurité).
  // Pas de preValidation auth : on lit le header directement, sans tenter de
  // résoudre un Participant (un token navigateur n'en est pas un → éviterait un 401).
  fastify.post('/posts/:postId/anonymous-view', {
    config: { rateLimit: createPostRouteRateLimitConfig('view') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      if (request.headers.authorization) {
        return sendSuccess(reply, { counted: false }); // client inscrit → parcours engagement
      }
      const sessionKey = request.headers['x-session-token'] as string | undefined;
      if (!sessionKey || sessionKey.length === 0 || sessionKey.length > 128) {
        return sendBadRequest(reply, 'Missing or invalid session key', { code: 'VALIDATION_ERROR' });
      }
      const { postId } = request.params;
      const counted = await postService.recordAnonymousOpen(postId, sessionKey);
      return sendSuccess(reply, { counted });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/anonymous-view] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/impression — Track a feed impression
  fastify.post('/posts/:postId/impression', {
    schema: {
      params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['feed', 'profile', 'search', 'shared_link', 'notification', 'detail'] }
        }
      }
    },
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const source = (request.body as any)?.source ?? 'feed';

      await prisma.postImpression.create({
        data: { postId, userId: authContext.registeredUser.id, source }
      });

      // Ouvrir le Détail d'un post (`source: 'detail'`) est à la fois une
      // impression ET une vue (totale, jamais dédupliquée) comptée IMMÉDIATEMENT
      // — chaque ouverture compte, sans seuil ni gating engagement. Les autres
      // sources (apparition feed, etc.) ne comptent qu'une impression.
      // Note : `postOpenCount` n'est PLUS alimenté par l'engagement sur la surface
      // `detail` (cf. engagementAggregateIncrements) pour éviter le double comptage.
      const counters: Record<string, { increment: number }> = { impressionCount: { increment: 1 } };
      if (source === 'detail') {
        counters.postOpenCount = { increment: 1 };
      }

      await prisma.post.update({
        where: { id: postId },
        data: counters
      });

      return sendSuccess(reply, { recorded: true });
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/impression] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/impressions/batch — Track multiple feed impressions at once
  fastify.post('/posts/impressions/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['postIds'],
        properties: {
          postIds: { type: 'array', items: { type: 'string' } },
          source: { type: 'string', enum: ['feed', 'profile', 'search', 'shared_link', 'notification', 'detail'] }
        }
      }
    },
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('impression') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postIds, source = 'feed' } = request.body as any;

      if (!Array.isArray(postIds) || postIds.length === 0) {
        return sendSuccess(reply, { recorded: 0 });
      }

      const capped = postIds.slice(0, 50);

      await prisma.postImpression.createMany({
        data: capped.map((postId: string) => ({
          postId,
          userId: authContext.registeredUser!.id,
          source
        }))
      });

      await prisma.post.updateMany({
        where: { id: { in: capped } },
        data: { impressionCount: { increment: 1 } }
      });

      return sendSuccess(reply, { recorded: capped.length });
    } catch (error) {
      fastify.log.error(`[POST /posts/impressions/batch] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/engagement/batch — Ingest durable engagement sessions (dwell + actions)
  //
  // Append-only ingestion of finalized consumption sessions captured client-side
  // (EngagementOutbox). Idempotent on sessionId (upsert) so a lost-ACK retry is a
  // no-op. The userId is taken from the auth context — the client-supplied
  // session.userId is never trusted. Skips (without 400) any session whose post
  // was deleted between begin and flush.
  fastify.post('/posts/engagement/batch', {
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('engagement') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = EngagementBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid engagement batch', { code: 'VALIDATION_ERROR' });
      }

      // Zod has validated + applied defaults at runtime; `.data.sessions` is the
      // parsed output. The service re-normalizes defensively, so the structural
      // assertion to its input shape is safe.
      const sessions = parsed.data.sessions as Parameters<typeof postService.recordEngagementBatch>[0];
      const recorded = await postService.recordEngagementBatch(
        sessions,
        authContext.registeredUser.id,
      );
      return sendSuccess(reply, { recorded });
    } catch (error) {
      fastify.log.error(`[POST /posts/engagement/batch] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/share — Track a share, optionally mint a tracking link
  //
  // Body (all optional):
  //   - platform: marketing tag forwarded to PostService.sharePost
  //   - generateLink: when truthy, mint a TrackingLink owned by the caller so
  //     they can paste an attributable `meeshy.me/l/<token>` URL into any
  //     external share sheet. The link points at the post detail route on the
  //     web frontend (`FRONTEND_URL`/feeds/post/<postId>`); subsequent
  //     redirects are counted into the existing `trackingLinkClick` analytics.
  //     The same `/feeds/post/<postId>` path is also claimed by the iOS app via
  //     Universal Links, so the recipient lands directly inside the native
  //     PostDetailView when the app is installed.
  //
  // Response always carries `{ shared, shareCount }`; if `generateLink` was
  // requested the same payload also exposes `shortUrl` (absolute, ready for
  // sharing) and `token` (6-char id) so the client can deep-link / display
  // analytics later.
  fastify.post('/posts/:postId/share', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const body = (request.body as any) ?? {};
      const platform: string | undefined = body.platform;
      const generateLink: boolean = Boolean(body.generateLink);
      const baseUrl = resolveFrontendBaseUrl();

      const payload: {
        shared: boolean;
        shareCount: number;
        shortUrl?: string;
        token?: string;
      } = { shared: true, shareCount: 0 };

      if (generateLink) {
        // Tracked share: upsert one link per (post, sharer). Reusing an existing
        // link does NOT re-increment shareCount — the counter tracks unique
        // sharers, not repeated taps of the share button.
        const result = await postService.shareWithTrackingLink(
          postId,
          authContext.registeredUser.id,
          { baseUrl, platform },
        );
        if (!result) {
          return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
        }
        payload.shareCount = result.shareCount;
        payload.token = result.token;
        payload.shortUrl = result.shortUrl;
      } else {
        // Plain share (no tracked link) — increment the counter as before.
        const post = await postService.sharePost(postId, authContext.registeredUser.id, platform);
        if (!post) {
          return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
        }
        payload.shareCount = post.shareCount;
      }

      return sendSuccess(reply, payload);
    } catch (error) {
      fastify.log.error(`[POST /posts/:postId/share] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/share — Analytics of the caller's own tracked share link.
  //
  // Returns null data when the caller has not (yet) generated a tracked share
  // for this post. Otherwise exposes the live click analytics so the UI can
  // surface "your link got N clicks" without a second tracking-links call.
  fastify.get('/posts/:postId/share', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const baseUrl = resolveFrontendBaseUrl();
      const link = await postService.getPostShareLink(postId, authContext.registeredUser.id, baseUrl);

      return sendSuccess(reply, link);
    } catch (error) {
      fastify.log.error(`[GET /posts/:postId/share] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/pin — Pin a post (author only)
  fastify.post('/posts/:postId/pin', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const post = await postService.pinPost(postId, authContext.registeredUser.id);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, { pinned: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Only the author can pin this post', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[POST /posts/:postId/pin] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /posts/:postId/pin — Unpin a post (author only)
  fastify.delete('/posts/:postId/pin', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const post = await postService.unpinPost(postId, authContext.registeredUser.id);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, { pinned: false });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Only the author can unpin this post', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[DELETE /posts/:postId/pin] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/views — Story/post seen-by list (author only)
  fastify.get('/posts/:postId/views', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const query = request.query as any;
      const limit = parseInt(query.limit) || 50;
      const offset = parseInt(query.offset) || 0;

      const result = await postService.getPostViews(postId, authContext.registeredUser.id, limit, offset);
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, result.items, {
        pagination: { total: result.total, offset, limit, hasMore: result.hasMore },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Only the author can view this list', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[GET /posts/:postId/views] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // GET /posts/:postId/interactions — Story viewers enriched with reactions & replies (author only)
  fastify.get('/posts/:postId/interactions', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const query = request.query as any;
      const limit = parseInt(query.limit) || 50;
      const offset = parseInt(query.offset) || 0;

      const result = await postService.getPostInteractions(postId, authContext.registeredUser.id, limit, offset);
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, { viewers: result.viewers }, {
        pagination: { total: result.total, offset, limit, hasMore: result.hasMore },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Only the author can view interactions', { code: 'FORBIDDEN' });
      }
      fastify.log.error(`[GET /posts/:postId/interactions] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/repost
  fastify.post('/posts/:postId/repost', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const parsed = RepostSchema.safeParse(request.body ?? {});
      const data = parsed.success ? parsed.data : { isQuote: false };

      const repost = await postService.repostPost(
        postId,
        authContext.registeredUser.id,
        {
          targetType: data.targetType as PostType | undefined,
          content: data.content,
          isQuote: data.isQuote,
        },
      );

      if (!repost) {
        return sendNotFound(reply, 'Original post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast repost via Socket.IO
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        socialEvents.broadcastPostReposted({
          originalPostId: postId,
          repost: repost as unknown as Post,
        }, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/repost]: broadcast post reposted failed'));
      }

      // Notify original post author
      const notifService = fastify.notificationService;
      if (notifService && repost.repostOfId) {
        const original = await postService.getPostById(postId);
        if (original?.authorId) {
          notifService.createPostRepostNotification({
            actorId: authContext.registeredUser.id,
            originalPostId: postId,
            postAuthorId: original.authorId,
            repostId: repost.id,
            postType: (original as { type?: 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' }).type,
            postPreview: (original as { content?: string | null }).content?.slice(0, 80) ?? undefined,
            postCreatedAt: (original as { createdAt?: Date | string | null }).createdAt ?? undefined,
            postExpiresAt: (original as { expiresAt?: Date | string | null }).expiresAt ?? undefined,
          }).catch((err) => fastify.log.warn({ err }, '[POST /posts/:postId/repost]: notify post repost failed'));
        }
      }

      return sendSuccess(reply, repost, { statusCode: 201 });
    } catch (error) {
      if (error instanceof Error && (error as any).statusCode === 403) {
        return sendForbidden(reply, error.message);
      }
      fastify.log.error(`[POST /posts/:postId/repost] Error: ${error}`);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
