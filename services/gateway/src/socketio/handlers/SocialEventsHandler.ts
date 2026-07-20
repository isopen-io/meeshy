/**
 * SocialEventsHandler
 * Gère le broadcasting des événements sociaux (posts, stories, statuts, commentaires)
 * vers les rooms feed:{userId} des amis
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getCommunityCoMemberIds } from '../../services/posts/communityVisibility';
import type {
  Post,
  PostComment,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  PostBookmarkedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
  StoryUnreactedEventData,
  StatusReactedEventData,
  StatusUnreactedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
  PostTranslationUpdatedEventData,
  CommentTranslationUpdatedEventData,
  CommentMediaUpdatedEventData,
} from '@meeshy/shared/types/post';

// enhancedLogger (Pino) sort en prod ; le `logger` Winston de server.ts est
// configuré à `level: 'warn'` en prod et filtre tous les `logger.info(...)`.
// Sans ce logger dédié, le fanout social était totalement invisible côté
// production et empêchait tout diagnostic en cas de "ma story n'arrive pas".
const logger = enhancedLogger.child({ module: 'SocialEventsHandler' });

export interface SocialEventsHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
}

export class SocialEventsHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;

  // Cache des amis (TTL court pour éviter des queries trop fréquentes)
  private friendsCache: Map<string, { ids: string[]; expiresAt: number }> = new Map();
  private readonly FRIENDS_CACHE_TTL_MS = 30_000; // 30s

  constructor(deps: SocialEventsHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
  }

  // ==============================================
  // FRIEND IDS (pour le broadcast vers les feed rooms)
  // ==============================================

  private async getFriendIds(userId: string): Promise<string[]> {
    const cached = this.friendsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    try {
      const friendships = await this.prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: userId, status: 'accepted' },
            { receiverId: userId, status: 'accepted' },
          ],
        },
        select: { senderId: true, receiverId: true },
      });

      const ids = friendships.map(f =>
        f.senderId === userId ? f.receiverId : f.senderId
      );

      if (this.friendsCache.size >= 500) {
        const now = Date.now();
        for (const [k, v] of this.friendsCache) {
          if (v.expiresAt <= now) this.friendsCache.delete(k);
        }
        if (this.friendsCache.size >= 500) {
          const oldest = this.friendsCache.keys().next().value;
          if (oldest !== undefined) this.friendsCache.delete(oldest);
        }
      }
      this.friendsCache.set(userId, { ids, expiresAt: Date.now() + this.FRIENDS_CACHE_TTL_MS });
      return ids;
    } catch (error) {
      logger.error('social events — error fetching friend IDs', { userId, error });
      return [];
    }
  }

  /**
   * Broadcast vers les feed rooms des amis + l'auteur lui-même
   */
  private emitToFriends(friendIds: string[], authorId: string, event: string, data: unknown): void {
    // Inclure l'auteur pour feedback immédiat
    const targetIds = [...friendIds, authorId];
    for (const id of targetIds) {
      this.io.to(ROOMS.feed(id)).emit(event, data);
    }
  }

  /**
   * Émission UNIQUE sur l'union des feed rooms (amis filtrés par visibilité +
   * auteur) ET de la post room (`ROOMS.post`). Socket.IO dédoublonne un socket
   * présent dans plusieurs rooms → livraison EXACTEMENT une fois, ce qui supprime
   * la double-livraison du modèle « boucle feed + emit post room séparé » (un
   * ami-viewer était dans sa feed room ET la post room). Cf. `commentBroadcastRooms`.
   */
  private emitToFeedsAndPostRoom(
    recipientIds: string[],
    authorId: string,
    postId: string,
    event: string,
    data: unknown,
  ): void {
    const rooms = [...recipientIds, authorId].map((id) => ROOMS.feed(id));
    rooms.push(ROOMS.post(postId));
    this.io.to(rooms).emit(event, data);
  }

  /**
   * Broadcast uniquement vers l'auteur du post (notifs personnelles)
   */
  private emitToUser(userId: string, event: string, data: unknown): void {
    this.io.to(ROOMS.feed(userId)).emit(event, data);
  }

  /**
   * Émission UNIQUE sur l'union de la feed room d'un utilisateur ET de la post
   * room — déduplication Socket.IO incluse (`io.to([...])`). Un même socket
   * présent dans LES DEUX rooms (typiquement l'auteur qui regarde sa propre
   * story/statut : il est dans sa feed room ET dans la post room du viewer)
   * reçoit l'événement EXACTEMENT une fois.
   *
   * Avant ce seam, `broadcastStoryReacted`/`broadcastStatusReacted` faisaient
   * deux `.emit()` séparés (feed room PUIS post room) → l'auteur-viewer recevait
   * `story:reacted` DEUX fois → le delta `+1` côté iOS s'appliquait deux fois →
   * compteur de réactions affiché en `+2`. Miroir de `emitToFeedsAndPostRoom`.
   */
  private emitToUserFeedAndPostRoom(userId: string, postId: string, event: string, data: unknown): void {
    this.io.to([ROOMS.feed(userId), ROOMS.post(postId)]).emit(event, data);
  }

  // ==============================================
  // FEED ROOM MANAGEMENT
  // ==============================================

  /**
   * Appelé quand un socket reçoit feed:subscribe
   */
  async handleFeedSubscribe(socket: Socket, userId: string): Promise<void> {
    const room = ROOMS.feed(userId);
    await socket.join(room);
  }

  /**
   * Appelé quand un socket reçoit feed:unsubscribe
   */
  async handleFeedUnsubscribe(socket: Socket, userId: string): Promise<void> {
    const room = ROOMS.feed(userId);
    await socket.leave(room);
  }

  private async getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string,
    visibilityUserIds: string[] = []
  ): Promise<string[]> {
    if (visibility === 'COMMUNITY') {
      return getCommunityCoMemberIds(this.prisma, authorId);
    }

    const friendIds = await this.getFriendIds(authorId);

    switch (visibility) {
      case 'PUBLIC':
      case 'FRIENDS':
        return friendIds;
      case 'EXCEPT':
        return friendIds.filter(id => !visibilityUserIds.includes(id));
      case 'ONLY':
        return visibilityUserIds;
      case 'PRIVATE':
        return [];
      default:
        return friendIds;
    }
  }

  // ==============================================
  // POST BROADCASTS
  // ==============================================

  async broadcastPostCreated(post: Post, authorId: string, clientMutationId?: string): Promise<void> {
    // Respect the post's visibility — an ONLY/EXCEPT/PRIVATE/COMMUNITY post must
    // NOT be fanned out (full body) to friends outside the allowed set.
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      (post.visibility as string) ?? 'PUBLIC',
      (post.visibilityUserIds as string[] | undefined) ?? [],
    );
    logger.info(`📣 post:created fanout author=${authorId} postId=${post.id} recipients=${recipients.length}`);
    // U1 — echo the cmid so the author's offline-created optimistic post (keyed
    // by cmid) reconciles to the server id instead of duplicating.
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_CREATED, { post, clientMutationId });
  }

  async broadcastPostUpdated(post: Post, authorId: string): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      (post.visibility as string) ?? 'PUBLIC',
      (post.visibilityUserIds as string[] | undefined) ?? [],
    );
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_UPDATED, { post });
  }

  async broadcastPostDeleted(postId: string, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.POST_DELETED, { postId, authorId });
  }

  async broadcastPostLiked(
    data: PostLikedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    // Feed rooms (amis filtrés par visibilité + auteur) ET post room (détail /
    // reel viewer) en UN SEUL emit dédoublonné — plus de double-livraison.
    this.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_LIKED, data);
  }

  async broadcastPostUnliked(
    data: PostUnlikedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    this.emitToFeedsAndPostRoom(recipients, postAuthorId, data.postId, SERVER_EVENTS.POST_UNLIKED, data);
  }

  async broadcastPostReposted(data: PostRepostedEventData, authorId: string): Promise<void> {
    // The repost is itself a post authored by the reposter; honour ITS visibility.
    const repost = data.repost as Post | undefined;
    const recipients = await this.getVisibilityFilteredRecipients(
      authorId,
      (repost?.visibility as string) ?? 'PUBLIC',
      (repost?.visibilityUserIds as string[] | undefined) ?? [],
    );
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.POST_REPOSTED, data);
  }

  /**
   * Broadcast d'un toggle de favori — PERSONNEL : le favori n'intéresse que
   * l'utilisateur qui l'a posé. On émet donc uniquement vers SA feed room (toutes
   * ses sessions/vues : feed + reel viewer). Permet de garder `isBookmarkedByMe`
   * synchronisé en direct et de le réhydrater à la réouverture du viewer.
   */
  broadcastPostBookmarked(data: PostBookmarkedEventData, userId: string): void {
    this.emitToUser(userId, SERVER_EVENTS.POST_BOOKMARKED, data);
  }

  // ==============================================
  // STORY BROADCASTS
  // ==============================================

  async broadcastStoryCreated(story: Post, authorId: string): Promise<void> {
    // Honor `visibility` / `visibilityUserIds` like `broadcastStatusCreated` —
    // previously this always fanned out to ALL friends, leaking ONLY/EXCEPT
    // stories via the realtime event payload even though the REST list was
    // correctly filtered.
    const visibility = story.visibility;
    const visibilityUserIds = [...(story.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    logger.info(
      `📣 story:created fanout author=${authorId} storyId=${story.id} visibility=${visibility} recipients=${recipients.length}`
    );
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STORY_CREATED, { story });
  }

  /// Emitted when an author edits a published story (PUT /posts/:id). Mirrors
  /// `broadcastStoryCreated`'s visibility filtering — only viewers who can
  /// currently see the story receive the update.
  async broadcastStoryUpdated(story: Post, authorId: string): Promise<void> {
    const visibility = story.visibility;
    const visibilityUserIds = [...(story.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STORY_UPDATED, { story });
  }

  /// Emitted when an author deletes a story. Sent to all friends (we don't have
  /// the visibility metadata anymore — and over-broadcasting a deletion is safe:
  /// recipients who never had the story silently ignore it).
  async broadcastStoryDeleted(storyId: string, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.STORY_DELETED, { storyId, authorId });
  }

  broadcastStoryViewed(data: StoryViewedEventData, storyAuthorId: string): void {
    // Seul l'auteur de la story doit voir les vues
    this.emitToUser(storyAuthorId, SERVER_EVENTS.STORY_VIEWED, data);
  }

  broadcastStoryReacted(data: StoryReactedEventData, storyAuthorId: string): void {
    // UN SEUL emit dédoublonné vers la feed room de l'auteur ET la story room
    // des viewers. L'auteur qui regarde sa propre story est dans les deux rooms :
    // sans dédup il recevait l'event deux fois → compteur `+2` (cf. helper).
    this.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_REACTED, data);
  }

  broadcastStoryUnreacted(data: StoryUnreactedEventData, storyAuthorId: string): void {
    this.emitToUserFeedAndPostRoom(storyAuthorId, data.storyId, SERVER_EVENTS.STORY_UNREACTED, data);
  }

  // ==============================================
  // STATUS/MOOD BROADCASTS
  // ==============================================

  async broadcastStatusCreated(status: Post, authorId: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    logger.info(
      `📣 status:created fanout author=${authorId} statusId=${status.id} visibility=${visibility} recipients=${recipients.length}`
    );
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_CREATED, { status });
  }

  async broadcastStatusUpdated(status: Post, authorId: string): Promise<void> {
    const visibility = status.visibility;
    const visibilityUserIds = [...(status.visibilityUserIds ?? [])];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_UPDATED, { status });
  }

  async broadcastStatusDeleted(statusId: string, authorId: string, visibility: string = 'PUBLIC', visibilityUserIds: string[] = []): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_DELETED, { statusId, authorId });
  }

  broadcastStatusReacted(data: StatusReactedEventData, statusAuthorId: string): void {
    // Même dédup que `broadcastStoryReacted` : l'auteur-viewer ne compte plus son
    // émoji deux fois.
    this.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_REACTED, data);
  }

  broadcastStatusUnreacted(data: StatusUnreactedEventData, statusAuthorId: string): void {
    this.emitToUserFeedAndPostRoom(statusAuthorId, data.statusId, SERVER_EVENTS.STATUS_UNREACTED, data);
  }

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  /**
   * Rooms devant recevoir un événement de commentaire : les feed rooms de
   * l'auteur du post et de ses amis (fil d'actualité) ET la post room
   * (`ROOMS.post`) où se trouvent les viewers du détail / reel viewer qui ne
   * sont PAS amis de l'auteur (post PUBLIC, co-membre de communauté, ou le
   * commentateur lui-même). Sans la post room, un viewer ouvrant le détail d'un
   * post qui ne suit pas l'auteur ne voyait JAMAIS les nouveaux commentaires en
   * temps réel — il fallait recharger. Miroir de `broadcastPostLiked` /
   * `broadcastStoryReacted` qui atteignent déjà la post room.
   *
   * Émission UNIQUE sur l'union des rooms : Socket.IO dédoublonne les sockets
   * présents dans plusieurs rooms (un viewer ami est dans SA feed room ET dans la
   * post room), donc l'événement est livré EXACTEMENT une fois. C'est requis
   * pour les commentaires : l'insertion d'un commentaire et l'incrément du
   * compteur de réponses côté client ne sont PAS idempotents en cas de double
   * livraison (contrairement au payload absolu de `post:liked`).
   */
  private commentBroadcastRooms(recipientIds: string[], postAuthorId: string, postId: string): string[] {
    const feedRooms = [...recipientIds, postAuthorId].map((id) => ROOMS.feed(id));
    return [...feedRooms, ROOMS.post(postId)];
  }

  /**
   * Recipients of a comment-scoped event = the feed rooms allowed by the POST's
   * visibility (NOT the author's full friend list) + the post author + the
   * join-gated post room. Without the visibility filter, a comment on an
   * `ONLY` / `EXCEPT` / `PRIVATE` / `COMMUNITY` post leaked its content to every
   * friend of the author, including friends not permitted to see the post.
   * Mirrors `getVisibilityFilteredRecipients` already used by story/status
   * creation. `visibility` defaults to `PUBLIC` (legacy friend fan-out) so a
   * caller that cannot resolve the post's visibility degrades to the previous
   * behaviour rather than dropping delivery.
   */
  async broadcastCommentAdded(
    data: CommentAddedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_ADDED, data);
  }

  async broadcastCommentDeleted(
    data: CommentDeletedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_DELETED, data);
  }

  broadcastCommentLiked(data: CommentLikedEventData, commentAuthorId: string): void {
    this.emitToUser(commentAuthorId, SERVER_EVENTS.COMMENT_LIKED, data);
    // Reach every viewer of the post detail (join-gated post room) so the
    // comment's like count updates live for them too — not just the comment
    // author. Payload is ABSOLUTE (likeCount) → idempotent even if the comment
    // author is in both their feed room and the post room. Mirrors
    // `broadcastPostLiked`.
    this.io.to(ROOMS.post(data.postId)).emit(SERVER_EVENTS.COMMENT_LIKED, data);
  }

  // ==============================================
  // POST/COMMENT TRANSLATION BROADCASTS
  // ==============================================

  async broadcastPostTranslationUpdated(
    data: PostTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, postAuthorId, SERVER_EVENTS.POST_TRANSLATION_UPDATED, data);
  }

  async broadcastCommentTranslationUpdated(
    data: CommentTranslationUpdatedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, data);
  }

  /**
   * Diffuse `comment:media-updated` (transcription/traductions audio d'un média de
   * commentaire prêtes) à la même audience filtrée par visibilité que
   * `comment:translation-updated` : les destinataires autorisés par la visibilité
   * du post + l'auteur + la post room (join-gated).
   */
  async broadcastCommentMediaUpdated(
    data: CommentMediaUpdatedEventData,
    postAuthorId: string,
    visibility: string = 'PUBLIC',
    visibilityUserIds: string[] = [],
  ): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(postAuthorId, visibility, visibilityUserIds);
    const rooms = this.commentBroadcastRooms(recipients, postAuthorId, data.postId);
    this.io.to(rooms).emit(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, data);
  }

  // ==============================================
  // CACHE INVALIDATION
  // ==============================================

  /**
   * Invalide le cache des amis (par ex. après un nouvel ami accepté)
   */
  invalidateFriendsCache(userId: string): void {
    this.friendsCache.delete(userId);
  }
}
