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
import {
  createSocialWriteRateLimitConfig,
  createSharedWriteRateLimitPreHandler,
  hardenedRateLimitConfig,
} from './socialRateLimit';
import { resolveInteractionTarget } from '../../services/posts/postVisibility';
import { withMutationLog, withMutationOutcome } from '../../utils/withMutationLog';
import { MutationInFlight } from '../../services/MutationLogService';
import { validatePagination } from '../../utils/pagination';
import { withMentions } from '../../services/posts/postReferences';
import { WIRE_BROADCAST, wireReaderFromRequest } from '../../services/posts/storyEffectsV3';
import { registerBookmarkRoutes } from './bookmarks';
import { registerImpressionRoutes } from './impressions';
import { registerShareRoutes } from './share';

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

  // Trois familles ont quitté ce fichier (issue #4146), par RESPONSABILITÉ et
  // non par tranche : le favori, l'impression et le partage. Elles partagent
  // désormais la même porte d'audience (`postConsumptionGate`) et n'avaient
  // plus rien à faire au milieu des réactions, des vues et du repost. Le
  // fichier pesait 1165 lignes, au-dessus du budget 800-1100 : on n'ajoute pas
  // à un fichier hors budget, on extrait d'abord.
  //
  // Elles restent montées ICI, sur la même instance et le même `postService`,
  // pour qu'aucun chemin, aucun ordre d'enregistrement et aucun appelant ne
  // bouge : `registerInteractionRoutes` demeure le point d'entrée unique du
  // module, celui qu'`index.ts` et les suites de tests connaissent.
  registerBookmarkRoutes(fastify, prisma, requiredAuth, postService);
  registerImpressionRoutes(fastify, prisma, requiredAuth);
  registerShareRoutes(fastify, prisma, requiredAuth, postService);

  // #4147 critère 2 — seau PARTAGÉ avec POST /posts et
  // POST /posts/from-attachment (core.ts, sa PROPRE instance de ce même
  // preHandler ; le partage vient de la clé Redis, pas de l'identité de la
  // fermeture — cf. socialRateLimit.ts, en-tête). Posé sur repost ci-dessous.
  const sharedWriteRateLimit = createSharedWriteRateLimitPreHandler();

  // POST /posts/:postId/like
  //
  // `hardenedRateLimitConfig` recale ce seau (hook `preHandler` + `skipOnError:
  // false`, cf. socialRateLimit.ts) — sans quoi la clé se calculait à
  // `onRequest`, avant `authContext`, donc par IP plutôt que par compte
  // (#4147 critère 6). #4147 critère 4 demande « le même seau que POST » pour
  // DELETE ci-dessous ; `config.rateLimit` ne peut PAS faire converger deux
  // ROUTES vers un compteur unique (cf. socialRateLimit.ts, en-tête : chaque
  // route reçoit son propre "child store", namespacé par sa méthode+URL) —
  // DELETE reçoit donc le MÊME plafond (30/min, même fabrique, même clé par
  // COMPTE), posé INDÉPENDAMMENT, ce que le critère autorise explicitement
  // (« au minimum le 30/min actuel du POST tant que la route cible
  // n'existe pas »).
  fastify.post('/posts/:postId/like', {
    preValidation: [requiredAuth],
    config: { rateLimit: hardenedRateLimitConfig(createPostRouteRateLimitConfig('like')) },
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
  //
  // #4147 critère 4 — avant ce lot, aucun plafond : le retrait était libre
  // pendant que la pose (POST ci-dessus) était bornée à 30/min, une
  // asymétrie qu'un compte peut exploiter pour marteler la ligne
  // `PostReaction`/les compteurs sans jamais être freiné. Même plafond que
  // POST, posé de façon identique
  // (`hardenedRateLimitConfig(createPostRouteRateLimitConfig('like'))` —
  // même fabrique, même clé PAR COMPTE, même échec fail-closed) : les deux
  // sens du geste sont désormais bornés au même rythme, chacun sur son
  // propre budget de 30/min (`config.rateLimit` ne peut pas les fusionner en
  // un seul compteur inter-routes — cf. socialRateLimit.ts, en-tête ; le
  // critère l'autorise explicitement : « au minimum le 30/min actuel du
  // POST »).
  fastify.delete('/posts/:postId/like', {
    preValidation: [requiredAuth],
    config: { rateLimit: hardenedRateLimitConfig(createPostRouteRateLimitConfig('like')) },
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

  // POST /posts/:postId/view
  //
  // #4150 — le corps est DÉCLARÉ, et `duration` borné à la frontière.
  //
  // Il était lu en `(request.body as any) ?? {}` : aucun schéma, aucune borne,
  // et le seul `any` de ce module. La valeur était bien assainie en aval
  // (`recordView` la ramène dans [0, 300 000] ms), mais une borne posée chez
  // l'appelé n'est pas une borne — elle vaut pour CET appelé, et le jour où un
  // second consommateur lit le champ, il hérite d'un entier libre. Le schéma
  // refuse désormais ce qui n'est pas un nombre dans l'intervalle, AVANT que
  // le handler s'exécute ; l'assainissement d'aval reste, comme seconde
  // barrière pour les appelants qui ne passent pas par cette route.
  fastify.post('/posts/:postId/view', {
    schema: {
      params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
      // `['object', 'null']` et non `'object'` : les clients appellent cette
      // route SANS corps (une vue n'a rien à dire de plus que son existence),
      // et Fastify remet alors `null`. Un schéma `object` nu refuserait ces
      // appels — la rigueur fermerait une porte qu'elle n'a pas à fermer.
      body: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              duration: {
                type: 'integer',
                minimum: 0,
                maximum: 300_000,
                description: 'Durée de consultation en millisecondes (plafond : 5 minutes)',
              },
            },
          },
        ],
      },
    },
    preValidation: [requiredAuth],
    config: { rateLimit: createPostRouteRateLimitConfig('view') },
  }, async (request: FastifyRequest<{ Params: PostParams; Body?: { duration?: number } }>, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { postId } = request.params;
      const { duration } = request.body ?? {};
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
        //
        // #4044 — `getPostById` est la lecture LOURDE du détail (réactions,
        // bookmark, comptage de reposts, résolution de référence…), sans
        // AUCUN try/catch propre, appelée ici pour trois champs seulement
        // (type, authorId, viewCount). La vue vient déjà d'être enregistrée
        // DURABLEMENT par `recordView` ci-dessus — un échec de CET
        // enrichissement optionnel (diffusion temps réel) ne doit jamais
        // faire échouer la réponse au client, qui verrait un 500 permanent
        // (retenté 5×, jamais résolu, la vue pourtant déjà comptée) pour un
        // post dont l'auteur ne recevra qu'une notification temps réel en moins.
        try {
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
        } catch (broadcastError) {
          enhancedLogger.warn('[POST /posts/:postId/view]: story-viewed broadcast enrichment failed — view already recorded, not surfacing as an error', { err: broadcastError });
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
  // #4147 critère 1 — la seule route DESTRUCTIVE du module (supprime
  // postView/postReaction/postImpression, remet sept compteurs à zéro,
  // refanne story:created dans tous les trays) n'avait AUCUN plafond avant ce
  // lot : dix appels valaient dix remises à zéro de l'engagement acquis.
  // Seau dédié `social:write` — cf. socialRateLimit.ts pour le choix de ne
  // PAS le coupler à la création (`posts:create`, réutilisé par repost
  // juste en dessous) : republier une story existante n'est pas un geste de
  // création, et le coupler bloquerait un usage nominal (prolonger une
  // story qui expire) sur le budget d'un autre.
  fastify.post('/posts/:postId/republish', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSocialWriteRateLimitConfig() },
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

  // #4147 critère 2 — un repost crée pourtant un `Post`
  // (`postService.repostPost` → `prisma.post.create`) mais n'avait, avant ce
  // lot, aucun plafond : le plafond de création (`POST /posts`, 10/min) se
  // contournait entièrement en repostant. `sharedWriteRateLimit` (construit
  // plus haut) fait consommer à cette route le MÊME budget que POST /posts
  // et POST /posts/from-attachment — PAS via `config.rateLimit` (qui ne
  // PEUT PAS faire partager un compteur entre routes, cf.
  // socialRateLimit.ts, en-tête) mais via un `preHandler` qui incrémente
  // directement la même clé Redis. C'est ce partage — prouvé par témoin
  // (deux comptes, deux seaux distincts ; un seul compte, un budget commun
  // aux trois routes) — qui ferme le contournement.
  fastify.post('/posts/:postId/repost', {
    preValidation: [requiredAuth],
    preHandler: [sharedWriteRateLimit],
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
