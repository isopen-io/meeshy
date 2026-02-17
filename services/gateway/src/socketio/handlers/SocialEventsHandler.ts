/**
 * SocialEventsHandler
 * Gère le broadcasting des événements sociaux (posts, stories, statuts, commentaires)
 * vers les rooms feed:{userId} des amis
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type {
  Post,
  PostComment,
  PostLikedEventData,
  PostUnlikedEventData,
  PostRepostedEventData,
  StoryViewedEventData,
  StoryReactedEventData,
  StatusReactedEventData,
  CommentAddedEventData,
  CommentDeletedEventData,
  CommentLikedEventData,
} from '@meeshy/shared/types/post';

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

      this.friendsCache.set(userId, { ids, expiresAt: Date.now() + this.FRIENDS_CACHE_TTL_MS });
      return ids;
    } catch (error) {
      console.error('[SocialEventsHandler] Error fetching friend IDs:', error);
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
   * Broadcast uniquement vers l'auteur du post (notifs personnelles)
   */
  private emitToUser(userId: string, event: string, data: unknown): void {
    this.io.to(ROOMS.feed(userId)).emit(event, data);
  }

  // ==============================================
  // FEED ROOM MANAGEMENT
  // ==============================================

  /**
   * Appelé quand un socket reçoit feed:subscribe
   */
  handleFeedSubscribe(socket: any, userId: string): void {
    const room = ROOMS.feed(userId);
    socket.join(room);
  }

  /**
   * Appelé quand un socket reçoit feed:unsubscribe
   */
  handleFeedUnsubscribe(socket: any, userId: string): void {
    const room = ROOMS.feed(userId);
    socket.leave(room);
  }

  private async getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string,
    visibilityUserIds: string[] = []
  ): Promise<string[]> {
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

  async broadcastPostCreated(post: Post, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.POST_CREATED, { post });
  }

  async broadcastPostUpdated(post: Post, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.POST_UPDATED, { post });
  }

  async broadcastPostDeleted(postId: string, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.POST_DELETED, { postId, authorId });
  }

  async broadcastPostLiked(data: PostLikedEventData, postAuthorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(postAuthorId);
    this.emitToFriends(friendIds, postAuthorId, SERVER_EVENTS.POST_LIKED, data);
  }

  async broadcastPostUnliked(data: PostUnlikedEventData, postAuthorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(postAuthorId);
    this.emitToFriends(friendIds, postAuthorId, SERVER_EVENTS.POST_UNLIKED, data);
  }

  async broadcastPostReposted(data: PostRepostedEventData, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.POST_REPOSTED, data);
  }

  // ==============================================
  // STORY BROADCASTS
  // ==============================================

  async broadcastStoryCreated(story: Post, authorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(authorId);
    this.emitToFriends(friendIds, authorId, SERVER_EVENTS.STORY_CREATED, { story });
  }

  broadcastStoryViewed(data: StoryViewedEventData, storyAuthorId: string): void {
    // Seul l'auteur de la story doit voir les vues
    this.emitToUser(storyAuthorId, SERVER_EVENTS.STORY_VIEWED, data);
  }

  broadcastStoryReacted(data: StoryReactedEventData, storyAuthorId: string): void {
    this.emitToUser(storyAuthorId, SERVER_EVENTS.STORY_REACTED, data);
  }

  // ==============================================
  // STATUS/MOOD BROADCASTS
  // ==============================================

  async broadcastStatusCreated(status: Post, authorId: string): Promise<void> {
    const visibility = (status as any).visibility ?? 'PUBLIC';
    const visibilityUserIds = (status as any).visibilityUserIds ?? [];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_CREATED, { status });
  }

  async broadcastStatusUpdated(status: Post, authorId: string): Promise<void> {
    const visibility = (status as any).visibility ?? 'PUBLIC';
    const visibilityUserIds = (status as any).visibilityUserIds ?? [];
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_UPDATED, { status });
  }

  async broadcastStatusDeleted(statusId: string, authorId: string, visibility: string = 'PUBLIC', visibilityUserIds: string[] = []): Promise<void> {
    const recipients = await this.getVisibilityFilteredRecipients(authorId, visibility, visibilityUserIds);
    this.emitToFriends(recipients, authorId, SERVER_EVENTS.STATUS_DELETED, { statusId, authorId });
  }

  broadcastStatusReacted(data: StatusReactedEventData, statusAuthorId: string): void {
    this.emitToUser(statusAuthorId, SERVER_EVENTS.STATUS_REACTED, data);
  }

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  async broadcastCommentAdded(data: CommentAddedEventData, postAuthorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(postAuthorId);
    this.emitToFriends(friendIds, postAuthorId, SERVER_EVENTS.COMMENT_ADDED, data);
  }

  async broadcastCommentDeleted(data: CommentDeletedEventData, postAuthorId: string): Promise<void> {
    const friendIds = await this.getFriendIds(postAuthorId);
    this.emitToFriends(friendIds, postAuthorId, SERVER_EVENTS.COMMENT_DELETED, data);
  }

  broadcastCommentLiked(data: CommentLikedEventData, commentAuthorId: string): void {
    this.emitToUser(commentAuthorId, SERVER_EVENTS.COMMENT_LIKED, data);
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
