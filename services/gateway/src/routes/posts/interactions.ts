import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType } from '@meeshy/shared/prisma/client';
import type { PostVisibility } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { OrphanMediaCleanupService } from '../../services/storage/OrphanMediaCleanupService';
import { LikeSchema, UnlikeSchema, RepostSchema, PostParams, EngagementBatchSchema, RecordDownloadsSchema } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { safeBroadcast } from '../../socketio/serverEmit';
import { sendSuccess, sendForbidden, sendUnauthorized, sendNotFound, sendInternalError, sendBadRequest, sendConflict, sendGone } from '../../utils/response';
import { ConflictError } from '../../errors/custom-errors';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { resolveInteractionTarget } from '../../services/posts/postVisibility';
import { withMutationLog, withMutationOutcome } from '../../utils/withMutationLog';
import { MutationInFlight } from '../../services/MutationLogService';
import { resolveFrontendBaseUrl } from '../../services/TrackingLinkService';
import { validatePagination } from '../../utils/pagination';
import { NOT_DELETED } from '../../services/posts/postIncludes';
import { withMentions } from '../../services/posts/postReferences';
import { WIRE_BROADCAST, wireReaderFromRequest } from '../../services/posts/storyEffectsV3';

/**
 * Surfaces qui peuvent produire une impression. Déclaré UNE fois et partagé par
 * la route unitaire et la route batch : les deux enums avaient divergé du client
 * — iOS envoie `story` à chaque slide de story révélé
 * (`StoryViewModel.recordStoryImpression`), valeur absente des deux listes, donc
 * 400 systématique et `impressionCount` figé à 0 sur toutes les stories malgré
 * des vues réelles. Toute nouvelle surface cliente s'ajoute ICI, pas dans un
 * seul des deux schémas.
 */
const IMPRESSION_SOURCES = [
  'feed',
  'profile',
  'search',
  'shared_link',
  'notification',
  'detail',
  'story',
  'status',
] as const;

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

      // Aimer est une INTERACTION. Un repost SIMPLE (`isQuote:false`,
      // `repostOfId` renseigné) n'a pas de vie sociale propre : la cible
      // réelle est sa RACINE (`resolveInteractionTarget`, point unique
      // partagé avec le chemin socket) — une citation ou un post normal
      // garde sa propre cible. La redirection ne dépasse jamais la
      // visibilité de la racine (refus standard sinon, jamais un crédit
      // silencieux). Même refus indistinct que le jumeau socket
      // `post:reaction-add` — sinon l'ACL dépendrait du transport.
      const target = await resolveInteractionTarget(prisma, postId, authContext.registeredUser.id);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const targetPostId = target.id;

      // Idempotent via clientMutationId. `likePost` is naturally
      // idempotent at the storage layer (the reaction set keeps a
      // single entry per (userId, postId)), d'où `replayCost: 'converges'`.
      //
      // ATTENTION — ce commentaire promettait « so replays don't double-fire
      // notifications ». C'est FAUX et ça l'a toujours été : la diffusion et
      // `createPostLikeNotification` vivent APRÈS le journal, sans condition,
      // donc un rejeu les refait. Le verrou ne garde que ce qu'il ENVELOPPE.
      // Le remède existe depuis 2026-08-25 — `withMutationOutcome`, dont le
      // verdict `replayed` retient les effets de bord, appliqué juste en
      // dessous sur le repost — mais il n'a PAS été porté ici : la route like
      // est hors du fil rouge du repost et sa suite de tests mocke le helper.
      // Dette nommée, pas invariant tenu.
      const post = await withMutationLog({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'toggleLikePost',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const res = await postService.likePost(targetPostId, authContext.registeredUser.id, emoji);
          if (!res) throw new Error('POST_NOT_FOUND');
          // Les deux branches rendent la MÊME forme de post : `likePost` porte
          // la relation brute `postMentions`, `getPostById` sa forme aplatie et
          // projetée. Aplatir les deux ici, plutôt que d'assertion en assertion,
          // c'est la seule façon que le rejeu ne se distingue pas de l'écriture.
          return withMentions(res as typeof res & { id: string }, wireReaderFromRequest(request as UnifiedAuthRequest));
        },
        onDuplicate: async (_resultId) => {
          const res = await postService.getPostById(targetPostId, authContext.registeredUser.id);
          return res ? withMentions(res as typeof res & { id: string }, wireReaderFromRequest(request as UnifiedAuthRequest)) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });
      if (!post) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      // Broadcast like via Socket.IO — porte l'id de la CIBLE réelle
      // (`targetPostId`, l'original pour un repost simple) : les clients
      // patchent l'original partout où il apparaît. Each post type fans out
      // differently:
      // - STORY → private story:reacted to author + post room (privacy: not fanned to friends)
      // - STATUS → status:reacted to author + post room (same privacy model as STORY)
      // - POST/MOOD → post:liked fan-out to all friends
      const socialEvents = fastify.socialEvents;
      if (socialEvents && post.authorId) {
        // `likeCount` + `reactionSummary` : l'état ABSOLU après le geste, la
        // même paire que `post:liked` porte depuis toujours. Les jumeaux
        // story/status ne portaient qu'un emoji et un acteur, ce qui n'autorise
        // qu'un comptage en `±1` — non idempotent, non rattrapable. La paire
        // est déjà en main : c'est le post rendu par `likePost`.
        const counters = {
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        };
        if (post.type === 'STORY') {
          socialEvents.broadcastStoryReacted({
            storyId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji,
            ...counters,
          }, post.authorId);
        } else if (post.type === 'STATUS') {
          socialEvents.broadcastStatusReacted({
            statusId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji,
            ...counters,
          }, post.authorId);
        } else {
          // L'audience du broadcast vient de `target`, la tranche ACL de la
          // CIBLE réelle déjà chargée plus haut par `resolveInteractionTarget`
          // — pas d'un cast sur la forme rendue par `likePost`, qui laissait
          // un `?? 'PUBLIC'` décider de la diffusion si le champ manquait.
          socialEvents.broadcastPostLiked({
            postId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji,
            ...counters,
          }, post.authorId, target.visibility, target.visibilityUserIds,
          ).catch((err) => enhancedLogger.warn('[POST /posts/:postId/like]: broadcast post liked failed', { err }));
        }
      }

      // Create notification for post author
      const notifService = fastify.notificationService;
      if (notifService && post.authorId) {
        notifService.createPostLikeNotification({
          actorId: authContext.registeredUser.id,
          postId: targetPostId,
          postAuthorId: post.authorId,
          emoji,
          postType: post.type,
          postPreview: (post as { content?: string | null }).content?.slice(0, 80) ?? undefined,
          postCreatedAt: (post as { createdAt?: Date | string | null }).createdAt ?? undefined,
          postExpiresAt: (post as { expiresAt?: Date | string | null }).expiresAt ?? undefined,
        }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/like]: notify post like failed', { err }));
      }

      return sendSuccess(reply, { liked: true, reactionSummary: post.reactionSummary });
    } catch (error) {
      // The max-1-reaction domain guard is reachable (a user changing their
      // emoji) — surface it as 409, not a 500. Preserves the "max 1" semantics
      // while keeping a reachable domain error out of INTERNAL_ERROR.
      if (error instanceof ConflictError) {
        return sendConflict(reply, error.message, { code: error.code });
      }
      enhancedLogger.error('[POST /posts/:postId/like]', error);
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

      // QUELLE réaction part. Le corps est optionnel — aucun client déployé
      // n'en envoie — mais quand il en envoie un, c'est une DÉSIGNATION, pas
      // une suggestion : un emoji hors format se refuse (400) au lieu d'être
      // silencieusement remplacé par un autre retrait. Le jumeau `POST` peut
      // se permettre un défaut ('❤️') parce qu'il CRÉE ; ici un défaut
      // rendrait le repli « la plus récente » inatteignable (cf.
      // `UnlikeSchema`). Pas de `schema.response` ajouté au passage : cette
      // route n'en a jamais eu, et `fast-json-stringify` retirerait en SILENCE
      // tout champ non déclaré.
      const parsed = UnlikeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid emoji', { code: 'VALIDATION_ERROR' });
      }
      const requestedEmoji = parsed.data.emoji;

      // Retirer reste une interaction avec le post — même garde et même
      // redirection repost simple → racine que la pose (`resolveInteractionTarget`),
      // pour que ni l'ACL ni la cible ne dépendent du sens du geste.
      const target = await resolveInteractionTarget(prisma, postId, authContext.registeredUser.id);
      if (!target) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const targetPostId = target.id;

      // Idempotent via clientMutationId. Unlike is also naturally
      // idempotent — re-running over an already-unliked post is a
      // no-op — but recording the mutation prevents the broadcast
      // path from firing twice on replay.
      //
      // `removedEmoji` traverse le journal de mutation avec le post : c'est le
      // seul endroit d'où la route puisse apprendre QUELLE réaction est partie
      // (cf. `PostService.unlikePost`). Le rejeu, lui, ne peut plus le savoir —
      // la ligne `PostReaction` n'existe plus — et il rend donc `null`, ce qui
      // vaut « rien à annoncer ». C'est exactement ce que le commentaire
      // ci-dessus promettait déjà et que le code ne faisait pas.
      const outcome = await withMutationLog({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'toggleLikePost',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: async () => {
          const res = await postService.unlikePost(targetPostId, authContext.registeredUser.id, requestedEmoji);
          if (!res) throw new Error('POST_NOT_FOUND');
          return { ...res, post: withMentions(res.post, wireReaderFromRequest(request as UnifiedAuthRequest)) };
        },
        onDuplicate: async (_resultId) => {
          const res = await postService.getPostById(targetPostId, authContext.registeredUser.id);
          return res ? { id: res.id, post: withMentions(res, wireReaderFromRequest(request as UnifiedAuthRequest)), removedEmoji: null } : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });
      if (!outcome) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }
      const { post, removedEmoji } = outcome;

      // Broadcast unlike via Socket.IO — porte l'id de la CIBLE réelle, comme
      // le like. Mirror the like broadcast routing per post type.
      //
      // Rien retiré ⇒ rien annoncé. Un `unreacted` décrit une TRANSITION ; sans
      // réaction retirée il n'y en a pas eu, et l'émettre quand même faisait
      // décrémenter les clients à delta sur un geste sans effet. L'acteur, lui,
      // reçoit l'état absolu dans la réponse HTTP ci-dessous.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && post.authorId && removedEmoji) {
        const counters = {
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        };
        if (post.type === 'STORY') {
          socialEvents.broadcastStoryUnreacted({
            storyId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji: removedEmoji,
            ...counters,
          }, post.authorId);
        } else if (post.type === 'STATUS') {
          socialEvents.broadcastStatusUnreacted({
            statusId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji: removedEmoji,
            ...counters,
          }, post.authorId);
        } else {
          // Même source que le jumeau `POST` : la tranche ACL de la CIBLE
          // réelle chargée pour la garde, jamais un défaut reconstruit au
          // point d'appel.
          socialEvents.broadcastPostUnliked({
            postId: targetPostId,
            userId: authContext.registeredUser.id,
            emoji: removedEmoji,
            ...counters,
          }, post.authorId, target.visibility, target.visibilityUserIds,
          ).catch((err) => enhancedLogger.warn('[DELETE /posts/:postId/like]: broadcast post unliked failed', { err }));
        }
      }

      return sendSuccess(reply, { liked: false, reactionSummary: post.reactionSummary });
    } catch (error) {
      enhancedLogger.error('[DELETE /posts/:postId/like]', error);
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
      // Le favori est ÉCRIT : plus rien de ce qui suit n'a le droit de faire
      // échouer la requête. Sans cette porte, une panne d'émission rendait 500
      // sur une opération réussie, et le client effaçait de l'écran un favori
      // bien présent en base.
      safeBroadcast('post:bookmarked', () => {
        fastify.socialEvents?.broadcastPostBookmarked(
          { postId, bookmarked: true, bookmarkCount: result?.bookmarkCount ?? 0 },
          authContext.registeredUser.id,
        );
      });
      return sendSuccess(reply, { bookmarked: true, bookmarkCount: result?.bookmarkCount ?? 0 });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/bookmark]', error);
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
      safeBroadcast('post:unbookmarked', () => {
        fastify.socialEvents?.broadcastPostBookmarked(
          { postId, bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 },
          authContext.registeredUser.id,
        );
      });
      return sendSuccess(reply, { bookmarked: false, bookmarkCount: result?.bookmarkCount ?? 0 });
    } catch (error) {
      enhancedLogger.error('[DELETE /posts/:postId/bookmark]', error);
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
        fastify.notificationService.markPostNotificationsAsRead(viewerId, postId).catch((err) => enhancedLogger.warn('[POST /posts/:postId/view]: mark post notifications as read failed', { err }));
      }

      // If this is a story, broadcast the view to the story author
      const socialEvents = fastify.socialEvents;
      if (socialEvents) {
        // Fetch post to check type and get author + viewCount. Passe le viewer :
        // sans lui, `getPostById` applique le filtre PUBLIC-seul et retourne
        // `null` pour une story FRIENDS (le cas courant) → `broadcastStoryViewed`
        // ne partait jamais alors que `recordView` (même filtre viewer) avait
        // bien enregistré la vue. Le viewer d'audience vient de passer ce même
        // filtre dans `recordView`, donc la story est retrouvée ici aussi.
        //
        // Un lecteur admis par sa seule RÉFÉRENCE (2026-08-19) l'est aussi :
        // `getPostById` relit sans filtre quand l'audience ne rend rien, et la
        // référence tranche — l'auteur reçoit donc son événement temps réel pour
        // une vue que `recordView` vient d'enregistrer. Ces deux-là ne peuvent
        // plus diverger.
        const post = await postService.getPostById(postId, viewerId);
        if (post && post.type === 'STORY' && post.authorId !== authContext.registeredUser.id) {
          safeBroadcast('story:viewed', () => {
            socialEvents.broadcastStoryViewed({
              storyId: postId,
              viewerId: authContext.registeredUser.id,
              viewerUsername: authContext.registeredUser.username ?? '',
              viewCount: post.viewCount,
            }, post.authorId);
          });
        }
      }

      return sendSuccess(reply, { viewed: true });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/view]', error);
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
      enhancedLogger.error('[POST /posts/:postId/anonymous-view]', error);
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
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] }
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

      // Résout repostOfId/originalRepostOfId depuis le RETOUR de `update` —
      // pas une lecture séparée : un repost doit créditer son original du
      // même impressionCount en plus de son propre compteur (chantier
      // reposts cohérents & watermark, tâche 1), sans ajouter de requête sur
      // ce chemin chaud (chaque impression, majoritairement des non-reposts).
      const target = await prisma.post.update({
        where: { id: postId },
        data: counters,
        select: { repostOfId: true, originalRepostOfId: true },
      });

      const rootId = target?.originalRepostOfId ?? target?.repostOfId;
      if (rootId && rootId !== postId) {
        await prisma.post.updateMany({
          where: { id: rootId, deletedAt: NOT_DELETED },
          data: { impressionCount: { increment: 1 } },
        });
      }

      return sendSuccess(reply, { recorded: true });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/impression]', error);
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
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] }
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

      // Une impression par APPARITION : le même post peut légitimement revenir
      // plusieurs fois dans un lot (aller-retour de scroll). `createMany` insère
      // bien une ligne par occurrence, mais `updateMany({ id: { in: [...] } })`
      // n'incrémente chaque post qu'UNE fois — le `in` est dédupliqué côté base.
      // On regroupe donc par nombre d'occurrences : un `updateMany` par valeur
      // d'incrément distincte (en pratique 1 à 3), et non un par post.
      const occurrences = capped.reduce<Map<string, number>>((acc, postId: string) => {
        acc.set(postId, (acc.get(postId) ?? 0) + 1);
        return acc;
      }, new Map());

      const idsByIncrement = [...occurrences].reduce<Map<number, string[]>>((acc, [postId, count]) => {
        acc.set(count, [...(acc.get(count) ?? []), postId]);
        return acc;
      }, new Map());

      // Reposts du batch : résout repostOfId/originalRepostOfId de tous les
      // posts DISTINCTS en UNE requête — jamais une par post — pour créditer
      // la racine de chaque repost du même impressionCount (chantier reposts
      // cohérents & watermark, tâche 1).
      const repostSources = await prisma.post.findMany({
        where: { id: { in: [...occurrences.keys()] }, repostOfId: { not: null } },
        select: { id: true, repostOfId: true, originalRepostOfId: true },
      });
      const rootByPostId = new Map<string, string>(
        repostSources
          .map((p: { id: string; repostOfId: string | null; originalRepostOfId: string | null }) =>
            [p.id, p.originalRepostOfId ?? p.repostOfId] as [string, string | null])
          .filter((entry: [string, string | null]): entry is [string, string] =>
            Boolean(entry[1]) && entry[1] !== entry[0]),
      );

      // Chaque OCCURRENCE d'un repost dans le batch crédite sa racine — deux
      // reposts distincts (ou 2 occurrences du même repost) du même original
      // doivent créditer l'original de +2, jamais +1. Même piège `in`
      // dédupliqué que ci-dessus, appliqué ici au crédit de la racine.
      const rootOccurrences = capped.reduce<Map<string, number>>((acc, postId: string) => {
        const rootId = rootByPostId.get(postId);
        if (!rootId) return acc;
        acc.set(rootId, (acc.get(rootId) ?? 0) + 1);
        return acc;
      }, new Map());

      const rootIdsByIncrement = [...rootOccurrences].reduce<Map<number, string[]>>((acc, [rootId, count]) => {
        acc.set(count, [...(acc.get(count) ?? []), rootId]);
        return acc;
      }, new Map());

      await Promise.all([
        ...[...idsByIncrement].map(([increment, ids]) =>
          prisma.post.updateMany({
            where: { id: { in: ids } },
            data: { impressionCount: { increment } }
          })
        ),
        ...[...rootIdsByIncrement].map(([increment, ids]) =>
          prisma.post.updateMany({
            where: { id: { in: ids }, deletedAt: NOT_DELETED },
            data: { impressionCount: { increment } }
          })
        ),
      ]);

      return sendSuccess(reply, { recorded: capped.length });
    } catch (error) {
      enhancedLogger.error('[POST /posts/impressions/batch]', error);
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
      enhancedLogger.error('[POST /posts/engagement/batch]', error);
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
      enhancedLogger.error('[POST /posts/:postId/share]', error);
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
      enhancedLogger.error('[GET /posts/:postId/share]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/downloads — Trace le téléchargement des médias d'un poste.
  //
  // Batch et non unitaire : « Enregistrer » sur un poste à quatre images
  // télécharge les quatre d'un coup, un seul aller-retour. La validation, l'ACL
  // et la déduplication vivent dans PostService.recordMediaDownloads.
  fastify.post('/posts/:postId/downloads', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const parsed = RecordDownloadsSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }

      const { postId } = request.params;
      const result = await postService.recordMediaDownloads(
        postId,
        authContext.registeredUser.id,
        { mediaIds: parsed.data.mediaIds, surface: parsed.data.surface },
      );

      // null couvre indistinctement « absent », « supprimé » et « invisible » —
      // les distinguer révélerait l'existence du poste.
      if (!result) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, result);
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/downloads]', error);
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
      enhancedLogger.error('[POST /posts/:postId/pin]', error);
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
      enhancedLogger.error('[DELETE /posts/:postId/pin]', error);
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
      // Clamp via the shared helper: floors to 1, caps at 100 (never leaks an
      // unbounded client `limit` into Prisma `take`), and treats `limit=0` as 1.
      const { limit, offset } = validatePagination(query.offset, query.limit, { defaultLimit: 50, maxLimit: 100 });

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
      enhancedLogger.error('[GET /posts/:postId/views]', error);
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
      // Clamp via the shared helper: floors to 1, caps at 100 (never leaks an
      // unbounded client `limit` into Prisma `take`), and treats `limit=0` as 1.
      const { limit, offset } = validatePagination(query.offset, query.limit, { defaultLimit: 50, maxLimit: 100 });

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
      enhancedLogger.error('[GET /posts/:postId/interactions]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // POST /posts/:postId/repost
  // POST /posts/:postId/republish — la MÊME story repart avec une date de
  // publication fraîche (createdAt/expiresAt = now/now+TTL) et un engagement
  // remis à zéro. Auteur uniquement, type STORY uniquement. Le broadcast
  // `story:created` la re-fanne dans les trays des destinataires.
  fastify.post('/posts/:postId/republish', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;

      // Mécanisme 2 de la chaîne du repost, et le seul dont le rejeu DÉTRUIT.
      // `republishStory` ne crée rien — il fait repartir la MÊME ligne — mais
      // il supprime `postView`/`postReaction`/`postImpression` et remet sept
      // compteurs à zéro. Rejouer après un timeout de réponse détruit une
      // SECONDE fois l'engagement acquis entre les deux appels et refanne
      // `story:created`. La remise à zéro est un choix produit ; sa répétition
      // sur un aléa réseau n'en est pas un. `diverges` parce que « rejouer
      // l'op » ne converge PAS : il détruit à nouveau.
      type RepublishResult = NonNullable<Awaited<ReturnType<typeof postService.republishStory>>>;
      const outcome = await withMutationOutcome<RepublishResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'republishStory',
        replayCost: 'diverges',
        op: async () => {
          const r = await postService.republishStory(postId, authContext.registeredUser.id);
          if (!r) throw new Error('STORY_NOT_FOUND');
          return r as RepublishResult & { id: string };
        },
        onDuplicate: async (resultId) => {
          const r = await postService.getPostById(resultId, authContext.registeredUser.id);
          return r ? (r as unknown as RepublishResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'STORY_NOT_FOUND') return null;
        throw err;
      });

      if (!outcome) {
        return sendNotFound(reply, 'Story not found', { code: 'POST_NOT_FOUND' });
      }
      if (outcome.status === 'gone') {
        return sendGone(reply, 'Republish already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      const republished = outcome.result;
      const isFreshRepublish = outcome.status === 'applied';

      // Une republication garde ses lignes `PostMention` : servie sous le nom
      // de la RELATION, l'app qui la reçoit n'y lit aucune référence. Même
      // aplatissement des mentions sur les deux charges ; seul `storyEffects`
      // diverge — négocié pour la réponse (O17), tel quel sur le broadcast
      // (F3 : une seule charge pour une audience hétérogène).
      const payload = withMentions(republished, wireReaderFromRequest(request as UnifiedAuthRequest));
      const broadcastPayload = withMentions(republished, WIRE_BROADCAST);

      // Un rejeu resert la story ; il ne la republie pas. Refanner
      // `story:created` la ferait remonter une seconde fois en tête des trays
      // de tous les destinataires pour une seule republication.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && isFreshRepublish) {
        socialEvents.broadcastStoryCreated(broadcastPayload as unknown as Post, authContext.registeredUser.id)
          .catch((err) => enhancedLogger.warn('[POST /posts/:postId/republish]: broadcast story created failed', { err }));
      }

      return sendSuccess(reply, payload);
    } catch (error) {
      // Une requête JUMELLE applique déjà ce cmid. Ni résultat à resservir, ni
      // op à rejouer : 409, que la file durable iOS traite comme retentable
      // (409 est délibérément EXCLU de `permanentRejectionStatusCodes`). Sans
      // ce traitement, la route rendait 500 — « le serveur est cassé » pour
      // une situation parfaitement saine.
      if (error instanceof MutationInFlight) {
        return sendConflict(reply, 'Republish already in flight', { code: 'MUTATION_IN_FLIGHT' });
      }
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return sendForbidden(reply, 'Only the author can republish a story', { code: 'FORBIDDEN' });
      }
      if (error instanceof Error && error.message === 'NOT_A_STORY') {
        return sendBadRequest(reply, 'Only stories can be republished', { code: 'NOT_A_STORY' });
      }
      enhancedLogger.error('[POST /posts/:postId/republish]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  fastify.post('/posts/:postId/repost', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      // Loi 5 — « le repost miroite ». Ce `safeParse` retombait sur
      // `{ isQuote: false }` en cas d'échec, ce qui jette D'UN COUP
      // `targetType`, `content` ET `visibility` : le service appliquait alors
      // son repli `?? PostType.POST` et une source ÉPHÉMÈRE (story, status)
      // repartait en post PERMANENT, sans le moindre signal. Une citation de
      // 5001 caractères, ou un `targetType` hors énumération (`MOOD` est une
      // valeur réelle de `Post.type` que `RepostSchema` n'accepte pas),
      // suffisaient à le déclencher. Un corps invalide se REFUSE — c'est la
      // garde même que `RepostPostPayload.targetType` (obligatoire dans la
      // file durable iOS) existe pour ne jamais avoir à contourner.
      const parsed = RepostSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(reply, 'Invalid request', { code: 'VALIDATION_ERROR' });
      }
      const data = parsed.data;

      // Idempotent via clientMutationId (lot 7, tâche 7.1) : `repostPost`
      // n'est PAS naturellement idempotent — chaque appel `prisma.post.create`
      // fabrique un Post neuf (contrairement à `likePost`/`unlikePost`, dont
      // l'idempotence vit dans l'ensemble de réactions). Sans ce verrou, un
      // rejeu réseau (retry client, double-tap, flush d'outbox après un
      // timeout de réponse) republie le même contenu en double.
      //
      // `replayCost: 'diverges'` est la DEUXIÈME moitié du verrou, et elle
      // n'est pas décorative : sans elle, `withMutationLog` retombait sur son
      // filet « rejoue op() » dès que `onDuplicate` ne retrouvait rien —
      // c'est-à-dire dès que l'auteur avait supprimé son repost entre l'envoi
      // et le rejeu. Le repost SUPPRIMÉ renaissait alors sous un id neuf. La
      // route rend désormais 410 : la mutation a bien eu lieu, son résultat
      // n'est plus là, il n'y a rien à refaire.
      //
      // `withMutationOutcome` (et non `withMutationLog`) parce que la
      // republication ne voyage pas SEULE : un `post:reposted` et une
      // notification partent juste en dessous. Un verrou qui ne garde que la
      // CRÉATION laisse partir l'annonce en double à chaque rejeu — deux
      // bannières pour un repost unique (`createNotification` fait un
      // `prisma.notification.create` sec, sans clé d'idempotence). Le verdict
      // les garde.
      //
      // Même patron que `like`/`unlike` juste au-dessus dans ce fichier : op()
      // lève une erreur MESSAGE-matchée sur un 404 métier plutôt que de
      // renvoyer `null` (le type `T & { id: string }` ne laisse pas passer
      // `null`), et le `.catch()` qui l'entoure la reconvertit en verdict
      // « introuvable ». La ligne `MutationLog` n'est écrite qu'APRÈS le succès
      // de `op()` (`MutationLogService.recordOrReturn`) : un repost 404 ne
      // consomme donc PAS le cmid, et le client peut le rejouer une fois
      // l'original redevenu accessible.
      type RepostResult = NonNullable<Awaited<ReturnType<typeof postService.repostPost>>>;
      const outcome = await withMutationOutcome<RepostResult>({
        request,
        fastify,
        userId: authContext.registeredUser.id,
        kind: 'repostPost',
        replayCost: 'diverges',
        op: async () => {
          const r = await postService.repostPost(
            postId,
            authContext.registeredUser.id,
            {
              targetType: data.targetType as PostType | undefined,
              content: data.content,
              isQuote: data.isQuote,
              visibility: data.visibility as PostVisibility | undefined,
            },
          );
          if (!r) throw new Error('POST_NOT_FOUND');
          return r as RepostResult & { id: string };
        },
        onDuplicate: async (resultId) => {
          const r = await postService.getPostById(resultId, authContext.registeredUser.id);
          return r ? (r as unknown as RepostResult & { id: string }) : null;
        },
      }).catch((err) => {
        if (err instanceof Error && err.message === 'POST_NOT_FOUND') return null;
        throw err;
      });

      if (!outcome) {
        return sendNotFound(reply, 'Original post not found', { code: 'POST_NOT_FOUND' });
      }
      if (outcome.status === 'gone') {
        return sendGone(reply, 'Repost already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      const repost = outcome.result;
      // Un rejeu resert le repost ; il ne REFAIT rien. Ce booléen gouverne les
      // deux effets qui voyagent AVEC la republication, et eux seuls.
      const isFreshRepost = outcome.status === 'applied';

      // Même aplatissement que partout ailleurs : la clé exposée est `mentions`,
      // y compris sur un repost qui n'en porte aucune — une clé absente et une
      // liste vide ne se décodent pas pareil.
      const payload = withMentions(repost, wireReaderFromRequest(request as UnifiedAuthRequest));
      const broadcastPayload = withMentions(repost, WIRE_BROADCAST);

      // Broadcast repost via Socket.IO — F3 : blob tel quel pour l'audience
      // hétérogène, chaque client négocie sa forme au premier fetch REST.
      const socialEvents = fastify.socialEvents;
      if (socialEvents && isFreshRepost) {
        socialEvents.broadcastPostReposted({
          originalPostId: postId,
          repost: broadcastPayload as unknown as Post,
        }, authContext.registeredUser.id).catch((err) => enhancedLogger.warn('[POST /posts/:postId/repost]: broadcast post reposted failed', { err }));
      }

      // Notify original post author
      const notifService = fastify.notificationService;
      if (notifService && repost.repostOfId && isFreshRepost) {
        // Même garde que la route de traduction : sans le viewer, le lookup
        // applique le filtre anonyme et ne retrouve pas une story réservée aux
        // contacts — l'auteur d'une story repartagée n'était alors jamais
        // notifié.
        const original = await postService.getPostById(postId, authContext.registeredUser.id);
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
          }).catch((err) => enhancedLogger.warn('[POST /posts/:postId/repost]: notify post repost failed', { err }));
        }
      }

      return sendSuccess(reply, payload, { statusCode: 201 });
    } catch (error) {
      // Une requête JUMELLE applique déjà ce cmid. Ni résultat à resservir, ni
      // op à rejouer : 409, que la file durable iOS traite comme retentable
      // (409 est délibérément EXCLU de `permanentRejectionStatusCodes`). Sans
      // ce traitement, la route rendait 500 — « le serveur est cassé » pour
      // une situation parfaitement saine.
      if (error instanceof MutationInFlight) {
        return sendConflict(reply, 'Repost already in flight', { code: 'MUTATION_IN_FLIGHT' });
      }
      if (error instanceof Error && (error as any).statusCode === 403) {
        return sendForbidden(reply, error.message);
      }
      enhancedLogger.error('[POST /posts/:postId/repost]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
