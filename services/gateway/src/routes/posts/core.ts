import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { storyContentEditRequested } from '../../services/posts/storyEditPolicy';
import { PostTranslationService } from '../../services/posts/PostTranslationService';
import { CreatePostSchema, UpdatePostSchema, TranslatePostSchema, PostParams } from './types';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError, sendError } from '../../utils/response';
import { resolveMentionedUsers, MentionService } from '../../services/MentionService';
import { resolvePostMentions, reconcilePostMentions } from '../../services/posts/postMentions';
import { HashtagService } from '../../services/HashtagService';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { withMutationLog } from '../../utils/withMutationLog';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { hoistLocationDeep, parseSharedPlace, type SharedPlace } from '../../services/location/sharedPlace';

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

/**
 * Hisse `metadata.location` en top-level `location`, sur le post ET sur
 * chaque commentaire de son aperçu embarqué (`post.comments`) — voir
 * `hoistLocationDeep` (services/location/sharedPlace.ts). Appliqué à la fois
 * à la réponse REST et au payload socket (contrairement à `trackingLinks`,
 * qui ne hissait jusqu'ici que le payload socket, et qui ne descend pas dans
 * `comments`). No-op si rien ne porte de lieu.
 */
const hoistLocation = hoistLocationDeep;

export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  const postService = new PostService(prisma);
  const mentionService = new MentionService(prisma);
  const hashtagService = new HashtagService(prisma);

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
          content: parsed.data.content !== undefined ? SecuritySanitizer.sanitizeText(parsed.data.content) : undefined,
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
        const broadcastPost = hoistLocation(hoistTrackingLinks(post)) as unknown as Post;
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

      // Trigger async translation for text content (fire-and-forget).
      //
      // G2 — seules les STORY sont EXCLUES : leur `content` est déjà traduit
      // par le pipeline audience-driven du service
      // (`PostService.triggerStoryTextTranslation`) ; déclencher AUSSI
      // `translatePost` (5 langues fixes) doublait les jobs ZMQ et créait
      // des écritures concurrentes dans `Post.translations`.
      //
      // La condition testait `=== 'POST'`, ce qui laissait REEL et STATUS
      // sans aucun pipeline — ni ici, ni dans le service. Or le feed de
      // production est fait presque uniquement de REEL portant du texte :
      // vérifié le 2026-07-27, 40 REEL consécutifs sans une seule traduction.
      // Le Prisme ne s'appliquait donc pas au gros du contenu. On exclut
      // désormais STORY explicitement, pour qu'un futur type soit couvert
      // par défaut plutôt qu'oublié en silence.
      const postType = parsed.data.type ?? 'POST';
      const shouldTranslateContent = Boolean(parsed.data.content) && postType !== 'STORY';
      if (shouldTranslateContent) {
        try {
          const translationService = PostTranslationService.shared;
          translationService.translatePost(
            (post as any).id,
            parsed.data.content,
            // Use the canonical language persisted by createPost (SSOT) rather
            // than the raw client claim — it already incorporates the normalized
            // claim (or the detected fallback) and matches the NLLB source keys.
            (post as any).originalLanguage,
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

      // GW1 — use the DECORATED instance (wired push+socket+email by
      // server.ts), never a bare local NotificationService: a bare instance
      // persists notifications but silently drops every push and socket emit
      // (friend_new_post/friend_new_story/friend_new_mood never delivered).
      // The guard keeps degraded boot working (decoration happens after
      // SocketIOManager init; standalone harnesses may not have it).
      const notifService = fastify.notificationService;

      // Persist and notify post-body mentions. Single entry point shared with
      // the edit path (services/posts/postMentions.ts) — never throws.
      const createdMentions = await resolvePostMentions({
        prisma,
        mentionService,
        notificationService: notifService,
        post: {
          id: (post as any).id as string,
          authorId: authContext.registeredUser.id,
          // Discriminant d'entité → surface ouverte au tap côté client.
          type: postType as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL',
          // Audience du post — décide qui, parmi les nommés, a le droit d'être
          // prévenu. Un mentionné hors audience recevait l'extrait du contenu.
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        },
        content: postContent,
        onError: (err: unknown) => {
          fastify.log.error(`[POST /posts] post mention reconcile failed: ${err}`);
        },
      });
      // L'éventail vers les amis exclut les mentionnés : `user_mentioned` prime
      // sur `friend_new_post`, sinon un ami nommé reçoit les deux.
      const mentionedUserIdsForDedup = [...createdMentions.mentionedUserIds];

      if (postContent) {
        const hashtags = hashtagService.extractHashtags(postContent);
        if (hashtags.length > 0) {
          hashtagService.createPostHashtags((post as any).id as string, hashtags).catch((err: unknown) => {
            fastify.log.error(`[POST /posts] hashtag persist failed: ${err}`);
          });
        }
      }

      // Fan-out to friends: user_mentioned takes priority (dedup via excludeUserIds)
      if (notifService) {
        const postTypeForNotif = ((post as any).type ?? parsed.data.type ?? 'POST') as 'STORY' | 'POST' | 'MOOD' | 'STATUS' | 'REEL';
        notifService.createFriendContentNotificationsBatch({
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
      }

      return sendSuccess(reply, hoistLocation(post as unknown as Record<string, unknown>), { statusCode: 201, meta: { mentionedUsers } });
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

      return sendSuccess(reply, hoistLocation(post as unknown as Record<string, unknown>), { meta: { mentionedUsers } });
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

      // Lieu à l'édition — tri-état : absent = inchangé, null = retrait,
      // objet = remplacement validé par le MÊME parseSharedPlace que la
      // création (jamais de passthrough du bloc client vers metadata).
      let locationUpdate: SharedPlace | null | undefined;
      if (parsed.data.location !== undefined) {
        if (parsed.data.location === null) {
          locationUpdate = null;
        } else {
          const place = parseSharedPlace(parsed.data.location);
          if (!place) {
            return sendBadRequest(reply, 'Invalid location', { code: 'INVALID_LOCATION' });
          }
          locationUpdate = place;
        }
      }

      const baseUpdateData = parsed.data.content !== undefined
        ? { ...parsed.data, content: SecuritySanitizer.sanitizeText(parsed.data.content) }
        : parsed.data;
      const sanitizedUpdateData = { ...baseUpdateData, location: locationUpdate };
      const post = await postService.updatePost(postId, authContext.registeredUser.id, sanitizedUpdateData);
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

      // Une édition RÉCONCILIE : elle retire les lignes des partants et ne
      // prévient que les entrants. Le bloc qui vivait ici recréait sans jamais
      // supprimer, et renotifiait tout le monde à chaque édition.
      const editedContent = (post as any).content as string | undefined;
      await reconcilePostMentions({
        prisma,
        mentionService,
        notificationService: fastify.notificationService,
        post: {
          id: postId,
          authorId: authContext.registeredUser.id,
          // Discriminant d'entité → surface ouverte au tap côté client.
          type: (post as any).type as 'POST' | 'STORY' | 'MOOD' | 'STATUS' | 'REEL' | undefined,
          // Audience APRÈS édition : `post` est le document rendu par
          // `updatePost`, donc restreindre la visibilité d'un post et y ajouter
          // une mention dans la même requête applique bien la NOUVELLE règle.
          visibility: (post as any).visibility as string | undefined,
          visibilityUserIds: (post as any).visibilityUserIds as string[] | undefined,
        },
        content: editedContent,
        onError: (err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] post mention reconcile failed: ${err}`);
        },
      });

      {
        const editHashtags = editedContent ? hashtagService.extractHashtags(editedContent) : [];
        if (editHashtags.length > 0) {
          hashtagService.createPostHashtags(postId, editHashtags).catch((err: unknown) => {
            fastify.log.error(`[PUT /posts/:postId] hashtag persist failed: ${err}`);
          });
        }
        hashtagService.reconcileRemovedHashtags(postId, editHashtags.map((h) => h.tag)).catch((err: unknown) => {
          fastify.log.error(`[PUT /posts/:postId] hashtag reconcile failed: ${err}`);
        });
      }

      // Broadcast post edits. Each type has its own event so clients can listen narrowly:
      // - STORY → story:updated (visibility-filtered, per audit X7)
      // - STATUS → status:updated (visibility-filtered)
      // - POST/MOOD → post:updated to friends feed
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        const updatedPostType = (post as any).type as string;
        // Second chemin d'enrichissement (le premier est la création
        // ci-dessus) : le lieu — posé à la création OU modifié/retiré par
        // l'édition (tri-état `location`, merge metadata dans `updatePost`)
        // — doit rester visible sur CE broadcast aussi, sinon un post modifié
        // après coup (visibilité, contenu…) republierait sans sa position.
        const broadcastPost = hoistLocation(post as unknown as Record<string, unknown>) as unknown as Post;
        if (updatedPostType === 'STORY') {
          // Même prédicat que le reset d'engagement du service — les deux ne
          // peuvent pas diverger sur un même payload.
          socialEvents.broadcastStoryUpdated(broadcastPost, authContext.registeredUser.id, {
            engagementReset: storyContentEditRequested(parsed.data),
          }).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast story updated failed'));
        } else if (updatedPostType === 'STATUS') {
          socialEvents.broadcastStatusUpdated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast status updated failed'));
        } else {
          socialEvents.broadcastPostUpdated(broadcastPost, authContext.registeredUser.id).catch((err) => fastify.log.warn({ err }, '[PUT /posts/:postId]: broadcast post updated failed'));
        }
      }

      return sendSuccess(reply, hoistLocation(post as unknown as Record<string, unknown>), { meta: { mentionedUsers: updateMentionedUsers } });
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

  // DELETE /posts/:postId — Soft delete (auteur, ou modérateur et plus avec audit)
  fastify.delete('/posts/:postId', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const result = await postService.deletePost(postId, authContext.registeredUser.id, {
        actorRole: authContext.registeredUser.role,
      });
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

      // Le viewer DOIT être transmis : sans lui, `getPostById` retombe sur le
      // filtre anonyme (`visibility: PUBLIC`) et ne trouve rien d'autre qu'une
      // publication publique. Une story Meeshy étant réservée aux contacts par
      // défaut, la route répondait « Post not found » à un lecteur pourtant
      // légitime — et la feuille « Traductions » du lecteur restait sur un
      // anneau tournant sans fin (constaté au simulateur le 2026-07-27).
      const post = await postService.getPostById(postId, authContext.registeredUser.id);
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      try {
        const translationService = PostTranslationService.shared;
        await translationService.translateOnDemand(postId, parsed.data.targetLanguage, {
          force: parsed.data.force,
        });
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
