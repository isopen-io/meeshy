/**
 * Post Reaction Handler
 * Gère les réactions emoji sur les posts (ajout, suppression, synchronisation)
 *
 * Mirrors CommentReactionHandler exactly, substituting:
 *   commentId       → postId
 *   ROOMS.post      → ROOMS.post (same room — post reactions live in the same room as comment reactions)
 *   CommentReactionService → PostReactionService
 *   Anonymous users are rejected (posts require registered users to react)
 *
 * join/leave post room handlers are owned by this handler (PostReactionHandler)
 * since posts are the natural semantic owner of the post room.
 * CommentReactionHandler delegates join/leave to the same shared room.
 */

import type { MeeshySocket as Socket, MeeshyIOServer as SocketIOServer } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { retractReactionNotifications } from '../../services/notifications/retractReactionNotifications';
import { PostReactionService } from '../../services/PostReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import type { AckOf, AckResponseOf } from '@meeshy/shared/types/socketio-events';
import type { PostReactionUpdateEventData } from '@meeshy/shared/types/post';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketPostReactionAddSchema,
  SocketPostReactionRemoveSchema,
  SocketPostReactionRequestSyncSchema,
  SocketPostRoomActionSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import { resolveInteractionTarget, resolveConsumptionTarget } from '../../services/posts/postVisibility.js';
import { SocialEventsHandler } from './SocialEventsHandler';
import { emitServerEvent } from '../serverEmit';

/** Emoji canonique du "like" — aligné REST (`interactions.ts`) + web (`HEART_EMOJI`). */
const HEART_EMOJI = '❤️';

const logger = enhancedLogger.child({ module: 'PostReactionHandler' });

/** Per-user token bucket: 30 reactions/min across add + remove. */
const POST_REACTION_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'socket:post:reaction',
} as const;

const reactionRateLimiter = new SocketRateLimiter();

export interface PostReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  postReactionService: PostReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  socialEvents: SocialEventsHandler;
}

export class PostReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private postReactionService: PostReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private socialEvents: SocialEventsHandler;
  private readonly logger = logger;

  constructor(deps: PostReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.postReactionService = deps.postReactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.socialEvents = deps.socialEvents;
  }

  /**
   * Émet l'événement de réaction UNIFIÉ.
   *
   * Pour le "like" (❤️) sur un POST/REEL, émet l'événement CANONIQUE ABSOLU
   * `post:liked`/`post:unliked` (via `SocialEventsHandler`) vers les feed rooms
   * des amis ET la post room — UN SEUL événement par like, reçu par les 3 surfaces
   * (feed, détail, reel viewer) avec un payload absolu `{likeCount, reactionSummary}`.
   * On NE ré-émet PAS `post:reaction-added/removed` pour le ❤️ (évite le double-
   * comptage sur un client présent dans les deux rooms).
   *
   * Pour les autres emojis (ou stories/statuses), conserve l'événement par-emoji
   * `post:reaction-added/removed` vers la post room (comportement historique).
   */
  private async broadcastReactionChange(
    postId: string,
    emoji: string,
    action: 'add' | 'remove',
    userId: string,
    // Cycle 101 — `unknown` ici ANNULAIT le contrat pour les deux sites
    // d'émission ci-dessous : la garde d'un `MeeshySocket` ne vaut que jusqu'au
    // premier paramètre non typé (leçon du cycle 100, `SocialEventsHandler`).
    // `createUpdateEvent` rend déjà exactement cette forme.
    updateEvent: PostReactionUpdateEventData
  ): Promise<void> {
    if (emoji === HEART_EMOJI) {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, type: true, likeCount: true, reactionSummary: true, visibility: true, visibilityUserIds: true },
      });
      if (post && post.authorId && (post.type === 'POST' || post.type === 'REEL')) {
        const payload = {
          postId,
          userId,
          emoji,
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        };
        if (action === 'add') {
          await this.socialEvents.broadcastPostLiked(payload, post.authorId, post.visibility, post.visibilityUserIds ?? []);
        } else {
          await this.socialEvents.broadcastPostUnliked(payload, post.authorId, post.visibility, post.visibilityUserIds ?? []);
        }
        return;
      }
    }
    const event = action === 'add' ? SERVER_EVENTS.POST_REACTION_ADDED : SERVER_EVENTS.POST_REACTION_REMOVED;
    emitServerEvent(this.io.to(ROOMS.post(postId)), event, updateEvent);
  }

  /**
   * Ajoute une réaction à un post
   */
  async handleAddReaction(
    socket: Socket,
    data: { postId: string; emoji: string },
    callback?: AckOf<'post:reaction-add'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostReactionAddSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'post:reaction-add'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: AckResponseOf<'post:reaction-add'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[PostReactionHandler] post:reaction-add rate limit exceeded', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Réagir est une INTERACTION : même verdict que `post:join`, mais celui-ci
      // ne gardait que l'abonnement à la room. Une réaction n'a pas besoin de la
      // room — connaître le `postId` suffisait à en poser une sur un post
      // restreint, à peser dans ses agrégats et à notifier son auteur.
      // Refus indistinct d'un post inexistant : ne pas faire de l'ACK un oracle.
      //
      // Repost simple → racine (tâche 9) : `resolveInteractionTarget` est le
      // POINT UNIQUE de cette redirection, partagé avec le chemin REST
      // (`routes/posts/interactions.ts`) — un repost `isQuote:false` n'a pas
      // de vie sociale propre, la réaction se pose sur sa RACINE
      // (`originalRepostOfId ?? repostOfId`). Une citation garde sa cible.
      const target = await resolveInteractionTarget(this.prisma, validated.postId, userId);
      if (!target) {
        this.logger.warn('[PostReactionHandler] post:reaction-add denied (visibility)', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Post not found' });
        return;
      }
      const targetPostId = target.id;

      const reaction = await this.postReactionService.addReaction({
        postId: targetPostId,
        userId,
        emoji: validated.emoji,
      });

      if (!reaction) {
        const errorResponse: AckResponseOf<'post:reaction-add'> = {
          success: false,
          error: 'Failed to add reaction',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const updateEvent = await this.postReactionService.createUpdateEvent(
        targetPostId,
        validated.emoji,
        'add',
        userId
      );

      // Contrat ACK == broadcast : on renvoie l'`updateEvent` (postId, userId,
      // emoji, action, aggregation, timestamp) — le MÊME objet que le broadcast
      // `post:reaction-added`. Le web ignore `data` (lit seulement success/error),
      // l'iOS le décode en `SocketPostReactionUpdateEvent`. Renvoyer la `reaction`
      // brute (sans action/aggregation) cassait le décodage iOS (malformedResponse).
      const successResponse: AckResponseOf<'post:reaction-add'> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      if (reaction.unchanged) {
        // Idempotent no-op: the user already had exactly this emoji on this post
        // (a like re-fire — optimistic double-fire, a socket retry after a lost
        // ACK, or a second device echoing the same tap). Nothing changed in the DB,
        // so the success ACK above already gives the client its desired end-state.
        // Skip the broadcast and the author notification — re-emitting them spams
        // every feed/post-room socket and re-notifies the author for a reaction
        // that never changed state. Mirrors ReactionHandler.handleReactionAdd's
        // `unchanged` guard and this handler's own already-absent guard on remove.
        return;
      }

      this.broadcastReactionChange(targetPostId, validated.emoji, 'add', userId, updateEvent)
        .catch(err => this.logger.error('post reaction:add broadcast failed', err, { postId: targetPostId }));
      // Le `.catch` est OBLIGATOIRE, exactement comme sur le broadcast juste
      // au-dessus et sur le jumeau `CommentReactionHandler`. Le lot est détaché :
      // le `try/catch` de cette méthode ne le couvre pas, et un rejet que
      // personne n'écoute termine le process sous le
      // `--unhandled-rejections=throw` par défaut de Node 22 — toutes les
      // WebSockets de la gateway tombées pour un aléa DB sur un canal latéral.
      // Le commentaire précédent affirmait que le callee « gère ses erreurs en
      // interne » : il n'en gère que la MOITIÉ (l'appel de notification porte un
      // `.catch`, le `prisma.post.findUnique` qui le précède est nu). Garantir
      // la promesse ICI ne dépend d'aucune promesse du callee.
      this._createPostReactionNotification(targetPostId, validated.emoji, userId)
        .catch(err => this.logger.error('post reaction notification failed', err, { postId: targetPostId }));
    } catch (error: unknown) {
      this.logger.error('Failed to add post reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'post:reaction-add'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un post
   */
  async handleRemoveReaction(
    socket: Socket,
    data: { postId: string; emoji: string },
    callback?: AckOf<'post:reaction-remove'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostReactionRemoveSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'post:reaction-remove'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: AckResponseOf<'post:reaction-remove'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[PostReactionHandler] post:reaction-remove rate limit exceeded', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Retirer reste une interaction avec le post — même garde et même
      // redirection repost simple → racine que la pose
      // (`resolveInteractionTarget`), pour que ni l'ACL ni la cible ne
      // dépendent du sens du geste : retirer via un repost DIFFÉRENT de
      // celui qui a servi à poser retire bien la même réaction sur la racine.
      const target = await resolveInteractionTarget(this.prisma, validated.postId, userId);
      if (!target) {
        this.logger.warn('[PostReactionHandler] post:reaction-remove denied (visibility)', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Post not found' });
        return;
      }
      const targetPostId = target.id;

      const removed = await this.postReactionService.removeReaction({
        postId: targetPostId,
        userId,
        emoji: validated.emoji,
      });

      if (!removed) {
        // Idempotent: the reaction is already absent — the caller's desired
        // end-state is achieved. Reply success (no broadcast, nothing changed)
        // instead of an error, which the client would treat as a failed un-react
        // and roll the optimistic removal back, re-showing a reaction that is
        // gone. Mirrors ReactionHandler.handleReactionRemove (message reactions).
        //
        // SANS `data`, et c'est la règle « ACK == broadcast » appliquée à la
        // lettre : rien n'a changé, donc AUCUN `updateEvent` n'est diffusé, donc
        // il n'y a rien à refléter dans l'accusé. Ce site portait
        // `{ message: 'Reaction already absent' }` — une phrase anglaise que le
        // décodeur iOS de `Socket*ReactionUpdateEvent` rejette, sur le chemin
        // que déclenche exactement le double-tap qu'un accusé idempotent existe
        // pour absorber. Les deux autres familles portaient la même, recopiée du
        // même endroit ; c'est la porte typée (`AckOf<…>`) qui les a nommées.
        if (callback) callback({ success: true });
        return;
      }

      const updateEvent = await this.postReactionService.createUpdateEvent(
        targetPostId,
        validated.emoji,
        'remove',
        userId
      );

      // Contrat ACK == broadcast (voir handleAddReaction) : on renvoie l'`updateEvent`,
      // identique au broadcast `post:reaction-removed`, au lieu d'un simple {message}.
      const successResponse: AckResponseOf<'post:reaction-remove'> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      this.broadcastReactionChange(targetPostId, validated.emoji, 'remove', userId, updateEvent)
        .catch(err => this.logger.error('post reaction:remove broadcast failed', err, { postId: targetPostId }));

      // Le symétrique du `createPostLikeNotification` du chemin d'ajout : la
      // réaction défaite emporte la notification qu'elle avait produite. Le
      // retrait vise la CIBLE réelle (`targetPostId`, racine résolue depuis un
      // éventuel repost) et non `validated.postId` — c'est sur elle que la
      // notification a été écrite. Fire-and-forget : le dé-réagir est déjà
      // persisté et déjà ACKé.
      void retractReactionNotifications(
        this.prisma,
        { subject: { kind: 'post', id: targetPostId }, actorId: userId, emoji: validated.emoji },
        this.notificationService
      ).catch(err => this.logger.error('post reaction notification retraction failed', err, { postId: targetPostId }));
    } catch (error: unknown) {
      this.logger.error('Failed to remove post reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'post:reaction-remove'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un post
   */
  async handleRequestSync(
    socket: Socket,
    data: { postId: string },
    callback?: AckOf<'post:reaction-request-sync'>
  ): Promise<void> {
    try {
      // Validate at the socket boundary like every sibling method — otherwise a
      // malformed payload reaches `PostReactionService.validatePostId`, whose
      // error-message template dereferences `postId.substring(...)` and throws an
      // opaque `TypeError` instead of the intended clean validation error.
      const schemaValidation = validateSocketEvent(SocketPostReactionRequestSyncSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'post:reaction-request-sync'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const syncAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!syncAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Synchroniser = LIRE l'état social du post, donc la MÊME porte que
      // `handleJoinPost` : `resolveConsumptionTarget` (amis ∪ contacts DM), qui
      // rend `null` — refus indistinct, jamais de 403 — pour un post absent,
      // supprimé ou hors audience. Sans elle la garde de la room ne bornait
      // rien : plutôt que de s'abonner, il suffisait de demander l'état, et
      // n'importe quel compte authentifié obtenait le décompte de réactions
      // d'un post PRIVATE à partir de son seul id.
      //
      // La redirection des reposts simples vient avec, et il le faut : le
      // room-join redirige déjà vers la racine, donc synchroniser sur l'id brut
      // rendait un état qui n'est pas celui que la room diffusera ensuite —
      // l'ouverture d'un repost affichait 0 réaction puis se corrigeait au
      // premier événement.
      const target = await resolveConsumptionTarget(this.prisma, validated.postId, userId);
      if (!target) {
        this.logger.warn('[PostReactionHandler] post:reaction-sync denied (visibility)', { userId, postId: validated.postId });
        return callback?.({ success: false, error: 'Post not found' });
      }

      const reactionSync = await this.postReactionService.getPostReactions({
        postId: target.id,
        currentUserId: userId,
      });

      const successResponse: AckResponseOf<'post:reaction-request-sync'> = {
        success: true,
        data: reactionSync,
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      this.logger.error('Failed to sync post reactions', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'post:reaction-request-sync'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync reactions',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Rejoint la room d'un post pour recevoir les événements de réactions.
   * Requires authentication — anonymous sockets cannot subscribe to post rooms.
   */
  async handleJoinPost(
    socket: Socket,
    data: { postId: string },
    callback?: AckOf<'post:join'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostRoomActionSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        if (callback) callback({ success: false, error: 'User not authenticated' });
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const joinAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!joinAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Rejoindre suit la MÊME redirection que la lecture du fil
      // (`comments.ts` GET, `resolveConsumptionTarget`) : un repost simple
      // n'a pas de room propre — sa room est celle de sa racine, là où
      // vivent réellement les broadcasts `post:liked`/`comment:added` depuis
      // la redirection tâche 9. Sans ceci, un viewer qui ouvre le fil d'un
      // repost simple rejoignait la room DU REPOST mais ne recevait plus
      // AUCUN événement — ils partent tous vers la room de la racine
      // désormais (review task-9, important #1). `resolveConsumptionTarget`
      // exclut aussi les racines ÉPHÉMÈRES (STORY/STATUS, critique #1) : un
      // repost qui les source garde sa PROPRE room, comme sa propre vie
      // sociale. Refus indistinct (`null`) pour post absent/supprimé/
      // invisible — jamais de distinction 404/403 qui divulguerait
      // l'existence d'un post restreint.
      const target = await resolveConsumptionTarget(this.prisma, validated.postId, userId);
      if (!target) {
        this.logger.warn('[PostReactionHandler] post:join denied (visibility)', { userId, postId: validated.postId });
        return callback?.({ success: false, error: 'Post not found' });
      }

      await socket.join(ROOMS.post(target.id));
      callback?.({ success: true });
    } catch (error: unknown) {
      this.logger.error('Failed to join post room', error, { postId: (data as { postId?: string }).postId });
      const errorResponse: AckResponseOf<'post:join'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to join post room',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Quitte la room d'un post.
   * Requires authentication — mirrors handleJoinPost guards.
   */
  async handleLeavePost(
    socket: Socket,
    data: { postId: string },
    callback?: AckOf<'post:leave'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostRoomActionSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        if (callback) callback({ success: false, error: 'User not authenticated' });
        return;
      }

      const leaveAllowed = await reactionRateLimiter.checkLimit(userIdOrToken, POST_REACTION_RATE_LIMIT);
      if (!leaveAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      // Symétrique de `handleJoinPost` : la room réellement rejointe est
      // celle de la CIBLE résolue (racine d'un repost simple, sauf source
      // éphémère) — jamais `validated.postId` brut, sinon `leave` cible une
      // room où le socket n'a jamais mis les pieds et la vraie room (celle de
      // la racine) ne se libère jamais — fuite d'abonnement (review task-9,
      // important #1). Si la résolution échoue (racine devenue invisible
      // depuis le join), on retombe sur l'id brut en best-effort : `leave`
      // sur une room absente est un no-op, jamais une erreur visible pour
      // l'appelant.
      const target = await resolveConsumptionTarget(this.prisma, validated.postId, userId);
      await socket.leave(ROOMS.post(target?.id ?? validated.postId));
      if (callback) callback({ success: true });
    } catch (error: unknown) {
      this.logger.error('Failed to leave post room', error, { postId: (data as { postId?: string }).postId });
      const errorResponse: AckResponseOf<'post:leave'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to leave post room',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Crée une notification de réaction sur post (reuses post_like type)
   */
  private async _createPostReactionNotification(
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, type: true, content: true, createdAt: true, expiresAt: true },
    });

    if (!post?.authorId) return;

    // Mirror the REST like route (`routes/posts/interactions.ts`) exactly: forward the
    // real post type + ephemeral context so a reaction on a STORY/STATUS/REEL yields the
    // correctly-typed notification (`story_reaction`/`status_reaction`, expiry context)
    // instead of a generic `post_like`. Hardcoding `'POST'` here dropped that typing on
    // every socket-path reaction.
    this.notificationService
      .createPostLikeNotification({
        actorId: reactorUserId,
        postId,
        postAuthorId: post.authorId,
        emoji,
        postType: post.type,
        postPreview: post.content?.slice(0, 80) ?? undefined,
        postCreatedAt: post.createdAt ?? undefined,
        postExpiresAt: post.expiresAt ?? undefined,
      })
      .catch((error) => {
        this.logger.error('[PostReactionHandler] Failed to create post reaction notification', error, { reactorUserId, postId, emoji });
      });
  }
}
