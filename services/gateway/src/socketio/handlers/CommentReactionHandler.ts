/**
 * Comment Reaction Handler
 * Gère les réactions emoji sur les commentaires de posts (ajout, suppression, synchronisation)
 *
 * Mirrors ReactionHandler exactly, substituting:
 *   messageId       → commentId
 *   conversationId  → postId
 *   participantId   → userId
 *   ROOMS.conversation → ROOMS.post
 *   ReactionService → CommentReactionService
 *   Anonymous users are rejected (comments require registered users to react)
 */

import type { MeeshySocket as Socket } from '../typed-socket';
import type { MeeshyIOServer as SocketIOServer } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { retractReactionNotifications } from '../../services/notifications/retractReactionNotifications';
import { CommentReactionService } from '../../services/CommentReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import type { AckOf, AckResponseOf } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketCommentReactionAddSchema,
  SocketCommentReactionRemoveSchema,
  SocketCommentReactionRequestSyncSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import { loadCommentPostAcl, canUserInteractWithPost, canUserConsumePost } from '../../services/posts/postVisibility.js';

const logger = enhancedLogger.child({ module: 'CommentReactionHandler' });

/** Per-user token bucket: 30 reactions/min across add + remove. */
const COMMENT_REACTION_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'socket:comment:reaction',
} as const;

const reactionRateLimiter = new SocketRateLimiter();

export interface CommentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  commentReactionService: CommentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class CommentReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private commentReactionService: CommentReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private readonly logger = logger;

  constructor(deps: CommentReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.commentReactionService = deps.commentReactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  /**
   * Ajoute une réaction à un commentaire
   */
  async handleAddReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: AckOf<'comment:reaction-add'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionAddSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
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
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-add rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Le fil hérite de l'audience de son post, et réagir est une INTERACTION.
      // Le post est résolu DEPUIS le commentaire : le `postId` du payload est
      // fourni par le client et n'est JAMAIS cru — ni pour l'audience, ni pour
      // adresser la diffusion (voir `postId` ci-dessous).
      // Refus indistinct d'un commentaire inexistant — pas d'oracle.
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (!thread || !(await canUserInteractWithPost(this.prisma, thread.post, userId))) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-add denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }
      const postId = thread.postId;

      const reaction = await this.commentReactionService.addReaction({
        commentId: validated.commentId,
        userId,
        emoji: validated.emoji,
      });

      if (!reaction) {
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
          success: false,
          error: 'Failed to add reaction',
        };
        if (callback) callback(errorResponse);
        return;
      }

      // `postId` = celui du COMMENTAIRE, jamais celui du payload. Trois raisons,
      // et la vérité est déjà en main (`thread.postId`), donc gratuite :
      //
      // 1. ADRESSE. `handleJoinPost` fait entrer les viewers dans la room de la
      //    cible RÉSOLUE (`resolveConsumptionTarget` : un repost simple n'a pas
      //    de vie sociale propre, sa room est celle de sa racine). Un
      //    commentaire est lui aussi toujours écrit sur la cible résolue
      //    (`routes/posts/comments.ts` § `targetPostId`). Diffuser vers l'id
      //    brut du client — celui de la carte affichée, donc le REPOST —
      //    envoyait l'événement dans une room où personne n'est jamais entré :
      //    tous les autres lecteurs gardaient un compteur périmé, en silence,
      //    puisque l'ACK de l'acteur, lui, disait `success`.
      // 2. INTÉGRITÉ. `postId` est la CLÉ de cache côté client
      //    (`patchCommentInPostCaches` web, `FeedPersistenceActor` iOS). Un
      //    `postId` arbitraire y injectait l'agrégation d'un commentaire
      //    étranger, et divulguait au passage son existence et son décompte à
      //    l'audience d'un post sans rapport.
      // 3. INVARIANT PARTAGÉ. `PostReactionHandler` porte déjà la cible
      //    résolue dans SA room et SON payload (`targetPostId`, tâche 9). Les
      //    deux handlers implémentent la même règle ; seul celui-ci croyait le
      //    client — le seul écart qu'aucun test ne regardait, parce qu'en
      //    nominal les deux ids coïncident.
      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'add',
        userId,
        postId
      );

      // Contrat ACK == broadcast : on renvoie l'`updateEvent` (commentId, postId,
      // userId, emoji, action, aggregation, timestamp) — le MÊME objet que le
      // broadcast `comment:reaction-added`. Le web ignore `data`, l'iOS le décode en
      // `SocketCommentReactionUpdateEvent`. La `reaction` brute cassait le décodage iOS.
      const successResponse: AckResponseOf<'comment:reaction-add'> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      if (reaction.unchanged) {
        // Idempotent no-op: the user already had exactly this emoji on this comment
        // (re-fire — optimistic double-fire, a socket retry after a lost ACK, or a
        // second device echoing the same tap). Nothing changed in the DB, so the
        // success ACK above already gives the client its desired end-state. Skip the
        // broadcast and the author notification — re-emitting them spams every
        // post-room socket and re-notifies the author for a reaction that never
        // changed state. Mirrors ReactionHandler.handleReactionAdd's `unchanged`
        // guard and this handler's own already-absent guard on remove.
        return;
      }

      this.io.to(ROOMS.post(postId)).emit(SERVER_EVENTS.COMMENT_REACTION_ADDED, updateEvent);

      // Fire-and-forget: notification errors must not reach the outer catch after
      // success was already confirmed to the client.
      this._createCommentReactionNotification(
        validated.commentId,
        postId,
        validated.emoji,
        userId
      ).catch(err => this.logger.error('comment reaction notification failed', err, { commentId: validated.commentId }));
    } catch (error: unknown) {
      this.logger.error('Failed to add comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-add'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un commentaire
   */
  async handleRemoveReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: AckOf<'comment:reaction-remove'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionRemoveSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
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
        const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-remove rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Retirer reste une interaction avec le fil — même garde que la pose.
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (!thread || !(await canUserInteractWithPost(this.prisma, thread.post, userId))) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-remove denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }
      // Symétrique de la pose : room ET payload portent le post du COMMENTAIRE,
      // jamais l'id du payload (rationale complet dans `handleAddReaction`). Un
      // retrait mal adressé est pire qu'un ajout mal adressé : les lecteurs
      // gardent une réaction qui n'existe plus, et rien ne la rattrape tant
      // qu'ils ne refetchent pas le fil entier.
      const postId = thread.postId;

      const removed = await this.commentReactionService.removeReaction({
        commentId: validated.commentId,
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

      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'remove',
        userId,
        postId
      );

      // Contrat ACK == broadcast (voir handleAddReaction) : on renvoie l'`updateEvent`,
      // identique au broadcast `comment:reaction-removed`, au lieu d'un simple {message}.
      const successResponse: AckResponseOf<'comment:reaction-remove'> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      this.io.to(ROOMS.post(postId)).emit(SERVER_EVENTS.COMMENT_REACTION_REMOVED, updateEvent);

      // Le symétrique du `_createCommentReactionNotification` du chemin
      // d'ajout. Le retrait couvre les DEUX familles que le commentaire
      // produit — `comment_reaction` (ce handler) et `comment_like` (la route
      // REST) — parce qu'il filtre sur les deux chemins d'id : quel que soit
      // le transport qui a posé la réaction, celui qui la défait la retire.
      void retractReactionNotifications(
        this.prisma,
        { subject: { kind: 'comment', id: validated.commentId }, actorId: userId, emoji: validated.emoji },
        this.notificationService
      ).catch(err => this.logger.error('comment reaction notification retraction failed', err, { commentId: validated.commentId }));
    } catch (error: unknown) {
      this.logger.error('Failed to remove comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un commentaire
   */
  async handleRequestSync(
    socket: Socket,
    data: { commentId: string },
    callback?: AckOf<'comment:reaction-request-sync'>
  ): Promise<void> {
    try {
      // Validate at the socket boundary like every sibling method — otherwise a
      // malformed payload reaches `CommentReactionService.validateCommentId`, whose
      // error-message template dereferences `commentId.substring(...)` and throws
      // an opaque `TypeError` instead of the intended clean validation error.
      const schemaValidation = validateSocketEvent(SocketCommentReactionRequestSyncSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-request-sync'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const syncAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!syncAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Synchroniser, c'est LIRE le fil : même audience que le lire
      // (`canUserConsumePost` — amis ∪ contacts DM), celle que `handleJoinPost`
      // applique déjà pour laisser entrer dans la room. Ses deux frères
      // (`handleAddReaction`, `handleRemoveReaction`) gardaient leur accès ;
      // celui-ci ne gardait rien, alors qu'il rend PLUS que le broadcast :
      // `CommentReactionSync` porte les `userIds` de chaque réacteur. Un
      // `commentId` suffisait donc à obtenir le roster nominatif d'un
      // commentaire sur un post PRIVATE dont on n'est pas l'audience.
      //
      // Audience de CONSOMMATION, pas d'INTERACTION : un contact DM non-ami lit
      // légitimement le fil (cf. `postVisibility.ts` § `canUserConsumePost`) —
      // le gater sur les amis stricts en ferait un 404, ce que la lecture REST
      // du même fil n'impose pas.
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (!thread || !(await canUserConsumePost(this.prisma, thread.post, userId))) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-sync denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }

      const reactionSync = await this.commentReactionService.getCommentReactions({
        commentId: validated.commentId,
        currentUserId: userId,
      });

      const successResponse: AckResponseOf<'comment:reaction-request-sync'> = {
        success: true,
        data: reactionSync,
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      this.logger.error('Failed to sync comment reactions', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-request-sync'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync reactions',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Crée une notification de réaction sur commentaire
   */
  private async _createCommentReactionNotification(
    commentId: string,
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    // Fetch comment + post in parallel pour récupérer le contexte nécessaire
    // à un body riche : "[reactor] a réagi [emoji] à votre commentaire sur la
    // story de [story_author]" (spec user 2026-05-28 — la notif sommaire
    // actuelle « XXX » + emoji nu n'expose pas le contexte du commentaire).
    const [comment, post] = await Promise.all([
      this.prisma.postComment.findUnique({
        where: { id: commentId },
        select: { authorId: true, content: true },
      }),
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          type: true,
          author: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    if (!comment?.authorId) return;

    const postAuthorName = post?.author?.displayName?.trim()
      || post?.author?.username?.trim()
      || '';

    this.notificationService
      .createCommentReactionNotification({
        commentAuthorId: comment.authorId,
        reactorUserId,
        commentId,
        postId,
        reactionEmoji: emoji,
        commentPreview: comment.content?.slice(0, 80) ?? '',
        postAuthorName,
        // Forward the real post type (mirror PostReactionHandler) so a reaction on a
        // comment under a REEL/STATUS keeps its entity typing instead of collapsing to POST.
        postType: post?.type,
      })
      .catch((error) => {
        this.logger.error('[CommentReactionHandler] Failed to create comment reaction notification', error, { reactorUserId, commentId, postId, emoji });
      });
  }
}
