/**
 * SocialEventsHandler Unit Tests
 *
 * Tests the broadcasting of social events (posts, stories, statuses, comments)
 * to feed rooms via Socket.IO. Covers:
 * - Feed room subscription/unsubscription
 * - Post broadcasts (created, deleted, liked, unliked, reposted)
 * - Story broadcasts (created, viewed, reacted)
 * - Status broadcasts (created, reacted)
 * - Comment broadcasts (added, deleted, liked)
 * - Friends cache (hit, miss, TTL expiry, invalidation)
 * - Error handling (Prisma failures)
 * - Event constant correctness (all emits use real SERVER_EVENTS values)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import type { Post, PostLikedEventData, PostUnlikedEventData, PostRepostedEventData, StoryViewedEventData, StoryReactedEventData, StatusReactedEventData, CommentAddedEventData, CommentDeletedEventData, CommentLikedEventData } from '@meeshy/shared/types/post';

// ===== MOCKS =====

function createMockIO() {
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  return { to: mockTo, emit: mockEmit };
}

function createMockPrisma() {
  return {
    friendRequest: {
      findMany: jest.fn(),
    },
  } as any;
}

function createMockSocket() {
  return {
    join: jest.fn(),
    leave: jest.fn(),
  };
}

function createMockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello world',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Post;
}

// ===== TEST CONSTANTS =====

const AUTHOR_ID = 'user-author-1';
const FRIEND_1 = 'user-friend-1';
const FRIEND_2 = 'user-friend-2';
const VIEWER_ID = 'user-viewer-1';

const MOCK_FRIENDSHIPS = [
  { senderId: AUTHOR_ID, receiverId: FRIEND_1 },
  { senderId: FRIEND_2, receiverId: AUTHOR_ID },
];

// ===== TESTS =====

describe('SocialEventsHandler', () => {
  let handler: SocialEventsHandler;
  let mockIO: ReturnType<typeof createMockIO>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIO = createMockIO();
    mockPrisma = createMockPrisma();

    handler = new SocialEventsHandler({
      io: mockIO as any,
      prisma: mockPrisma,
    });

    // Default: Prisma returns two friendships for the author
    mockPrisma.friendRequest.findMany.mockResolvedValue(MOCK_FRIENDSHIPS);
  });

  // ==============================================
  // FEED ROOM MANAGEMENT
  // ==============================================

  describe('Feed room management', () => {
    it('should join the correct feed room on subscribe', () => {
      const socket = createMockSocket();
      handler.handleFeedSubscribe(socket, 'user-42');

      expect(socket.join).toHaveBeenCalledWith(ROOMS.feed('user-42'));
    });

    it('should leave the correct feed room on unsubscribe', () => {
      const socket = createMockSocket();
      handler.handleFeedUnsubscribe(socket, 'user-42');

      expect(socket.leave).toHaveBeenCalledWith(ROOMS.feed('user-42'));
    });

    it('should use ROOMS.feed which produces the "feed:{id}" format', () => {
      expect(ROOMS.feed('abc')).toBe('feed:abc');
    });
  });

  // ==============================================
  // POST BROADCASTS
  // ==============================================

  describe('broadcastPostCreated', () => {
    it('should emit POST_CREATED to all friend feeds and the author feed', async () => {
      const post = createMockPost();

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      // Should emit to FRIEND_1, FRIEND_2, and AUTHOR_ID (3 total)
      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_CREATED, { post });
    });

    it('should use the SERVER_EVENTS.POST_CREATED constant ("post:created")', async () => {
      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const emittedEvent = mockIO.emit.mock.calls[0][0];
      expect(emittedEvent).toBe(SERVER_EVENTS.POST_CREATED);
      expect(emittedEvent).toBe('post:created');
    });
  });

  describe('broadcastPostDeleted', () => {
    it('should emit POST_DELETED to friends and author with postId and authorId', async () => {
      await handler.broadcastPostDeleted('post-99', AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_DELETED, {
        postId: 'post-99',
        authorId: AUTHOR_ID,
      });
    });
  });

  describe('broadcastPostLiked', () => {
    it('should emit POST_LIKED to friends and author', async () => {
      const data: PostLikedEventData = {
        postId: 'post-1',
        userId: VIEWER_ID,
        emoji: 'heart',
        likeCount: 5,
        reactionSummary: { heart: 5 },
      };

      await handler.broadcastPostLiked(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_LIKED, data);
    });
  });

  describe('broadcastPostUnliked', () => {
    it('should emit POST_UNLIKED to friends and author', async () => {
      const data: PostUnlikedEventData = {
        postId: 'post-1',
        userId: VIEWER_ID,
        emoji: 'heart',
        likeCount: 4,
        reactionSummary: { heart: 4 },
      };

      await handler.broadcastPostUnliked(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_UNLIKED, data);
    });
  });

  describe('broadcastPostReposted', () => {
    it('should emit POST_REPOSTED to friends and author', async () => {
      const repost = createMockPost({ id: 'repost-1', repostOfId: 'post-1' });
      const data: PostRepostedEventData = {
        originalPostId: 'post-1',
        repost,
      };

      await handler.broadcastPostReposted(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_REPOSTED, data);
    });
  });

  // ==============================================
  // STORY BROADCASTS
  // ==============================================

  describe('broadcastStoryCreated', () => {
    it('should emit STORY_CREATED to friends and author', async () => {
      const story = createMockPost({ id: 'story-1', type: 'STORY' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_CREATED, { story });
    });
  });

  describe('broadcastStoryViewed', () => {
    it('should emit STORY_VIEWED ONLY to the story author', () => {
      const data: StoryViewedEventData = {
        storyId: 'story-1',
        viewerId: VIEWER_ID,
        viewerUsername: 'viewer',
        viewCount: 10,
      };

      handler.broadcastStoryViewed(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_VIEWED, data);
    });

    it('should NOT emit to friends', () => {
      const data: StoryViewedEventData = {
        storyId: 'story-1',
        viewerId: VIEWER_ID,
        viewerUsername: 'viewer',
        viewCount: 10,
      };

      handler.broadcastStoryViewed(data, AUTHOR_ID);

      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    });
  });

  describe('broadcastStoryReacted', () => {
    it('should emit STORY_REACTED ONLY to the story author', () => {
      const data: StoryReactedEventData = {
        storyId: 'story-1',
        userId: VIEWER_ID,
        emoji: 'fire',
      };

      handler.broadcastStoryReacted(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STORY_REACTED, data);
    });
  });

  // ==============================================
  // STATUS BROADCASTS
  // ==============================================

  describe('broadcastStatusCreated', () => {
    it('should emit STATUS_CREATED to friends and author', async () => {
      const status = createMockPost({ id: 'status-1', type: 'STATUS' });

      await handler.broadcastStatusCreated(status, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STATUS_CREATED, { status });
    });
  });

  describe('broadcastStatusReacted', () => {
    it('should emit STATUS_REACTED ONLY to the status author', () => {
      const data: StatusReactedEventData = {
        statusId: 'status-1',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STATUS_REACTED, data);
    });

    it('should NOT emit to friends', () => {
      const data: StatusReactedEventData = {
        statusId: 'status-1',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    });
  });

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  describe('broadcastCommentAdded', () => {
    it('should emit COMMENT_ADDED to friends and author', async () => {
      const data: CommentAddedEventData = {
        postId: 'post-1',
        comment: {
          id: 'comment-1',
          content: 'Nice post!',
          likeCount: 0,
          replyCount: 0,
          createdAt: new Date().toISOString(),
        },
        commentCount: 1,
      };

      await handler.broadcastCommentAdded(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_ADDED, data);
    });
  });

  describe('broadcastCommentDeleted', () => {
    it('should emit COMMENT_DELETED to friends and author', async () => {
      const data: CommentDeletedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        commentCount: 0,
      };

      await handler.broadcastCommentDeleted(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(3);
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_DELETED, data);
    });
  });

  describe('broadcastCommentLiked', () => {
    it('should emit COMMENT_LIKED ONLY to the comment author', () => {
      const data: CommentLikedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        userId: VIEWER_ID,
        emoji: 'thumbsup',
        likeCount: 1,
      };

      const commentAuthorId = 'user-comment-author';
      handler.broadcastCommentLiked(data, commentAuthorId);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(commentAuthorId));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_LIKED, data);
    });

    it('should NOT emit to friends', () => {
      const data: CommentLikedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        userId: VIEWER_ID,
        emoji: 'thumbsup',
        likeCount: 1,
      };

      handler.broadcastCommentLiked(data, AUTHOR_ID);

      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    });
  });

  // ==============================================
  // FRIENDS CACHE
  // ==============================================

  describe('Friends cache', () => {
    it('should query Prisma on first call', async () => {
      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { senderId: AUTHOR_ID, status: 'accepted' },
            { receiverId: AUTHOR_ID, status: 'accepted' },
          ],
        },
        select: { senderId: true, receiverId: true },
      });
    });

    it('should use cached results on second call within TTL', async () => {
      const post = createMockPost();

      await handler.broadcastPostCreated(post, AUTHOR_ID);
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      // Prisma should only be called once due to caching
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
    });

    it('should refetch after cache TTL expires', async () => {
      const post = createMockPost();

      // First call populates cache
      await handler.broadcastPostCreated(post, AUTHOR_ID);
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);

      // Advance time past the 30s TTL
      const originalDateNow = Date.now;
      const startTime = Date.now();
      Date.now = () => startTime + 31_000;

      try {
        await handler.broadcastPostCreated(post, AUTHOR_ID);
        // Should have called Prisma again after TTL expired
        expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(2);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('should NOT refetch when still within TTL', async () => {
      const post = createMockPost();

      await handler.broadcastPostCreated(post, AUTHOR_ID);
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);

      // Advance time but stay within the 30s TTL
      const originalDateNow = Date.now;
      const startTime = Date.now();
      Date.now = () => startTime + 15_000;

      try {
        await handler.broadcastPostCreated(post, AUTHOR_ID);
        expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('invalidateFriendsCache should clear cache and force refetch', async () => {
      const post = createMockPost();

      // Populate cache
      await handler.broadcastPostCreated(post, AUTHOR_ID);
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(1);

      // Invalidate cache
      handler.invalidateFriendsCache(AUTHOR_ID);

      // Next call should refetch
      await handler.broadcastPostCreated(post, AUTHOR_ID);
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(2);
    });

    it('should maintain separate caches per user', async () => {
      const post = createMockPost();

      await handler.broadcastPostCreated(post, AUTHOR_ID);
      await handler.broadcastPostCreated(post, 'different-user');

      // Two separate Prisma calls for two different users
      expect(mockPrisma.friendRequest.findMany).toHaveBeenCalledTimes(2);
    });

    it('should correctly extract friend IDs from friendships', async () => {
      // Friendship where author is sender
      // Friendship where author is receiver
      mockPrisma.friendRequest.findMany.mockResolvedValue([
        { senderId: AUTHOR_ID, receiverId: 'friend-A' },
        { senderId: 'friend-B', receiverId: AUTHOR_ID },
      ]);

      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      // Should emit to friend-A, friend-B, and AUTHOR_ID
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed('friend-A'));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed('friend-B'));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.to).toHaveBeenCalledTimes(3);
    });
  });

  // ==============================================
  // ERROR HANDLING
  // ==============================================

  describe('Error handling', () => {
    it('should return empty friend list on Prisma error and emit only to author', async () => {
      mockPrisma.friendRequest.findMany.mockRejectedValue(new Error('Database connection lost'));

      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      // Should still emit to the author even when friends lookup fails
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_CREATED, { post });
    });

    it('should not throw when Prisma rejects', async () => {
      mockPrisma.friendRequest.findMany.mockRejectedValue(new Error('Network error'));

      const post = createMockPost();

      // Should not throw
      await expect(handler.broadcastPostCreated(post, AUTHOR_ID)).resolves.toBeUndefined();
    });

    it('should emit to author with no friends when user has zero friendships', async () => {
      mockPrisma.friendRequest.findMany.mockResolvedValue([]);

      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      // Only the author feed
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
    });
  });

  // ==============================================
  // EVENT CONSTANTS VERIFICATION
  // ==============================================

  describe('Event constants', () => {
    it('should use correct SERVER_EVENTS constant values', () => {
      expect(SERVER_EVENTS.POST_CREATED).toBe('post:created');
      expect(SERVER_EVENTS.POST_DELETED).toBe('post:deleted');
      expect(SERVER_EVENTS.POST_LIKED).toBe('post:liked');
      expect(SERVER_EVENTS.POST_UNLIKED).toBe('post:unliked');
      expect(SERVER_EVENTS.POST_REPOSTED).toBe('post:reposted');
      expect(SERVER_EVENTS.STORY_CREATED).toBe('story:created');
      expect(SERVER_EVENTS.STORY_VIEWED).toBe('story:viewed');
      expect(SERVER_EVENTS.STORY_REACTED).toBe('story:reacted');
      expect(SERVER_EVENTS.STATUS_CREATED).toBe('status:created');
      expect(SERVER_EVENTS.STATUS_REACTED).toBe('status:reacted');
      expect(SERVER_EVENTS.COMMENT_ADDED).toBe('comment:added');
      expect(SERVER_EVENTS.COMMENT_DELETED).toBe('comment:deleted');
      expect(SERVER_EVENTS.COMMENT_LIKED).toBe('comment:liked');
    });

    it('should emit each broadcast method with the correct event constant', async () => {
      const post = createMockPost();
      const likeData: PostLikedEventData = { postId: 'p1', userId: 'u1', emoji: 'heart', likeCount: 1, reactionSummary: { heart: 1 } };
      const unlikeData: PostUnlikedEventData = { postId: 'p1', userId: 'u1', emoji: 'heart', likeCount: 0, reactionSummary: {} };
      const repostData: PostRepostedEventData = { originalPostId: 'p1', repost: post };
      const storyViewData: StoryViewedEventData = { storyId: 's1', viewerId: 'v1', viewerUsername: 'viewer', viewCount: 1 };
      const storyReactData: StoryReactedEventData = { storyId: 's1', userId: 'u1', emoji: 'fire' };
      const statusReactData: StatusReactedEventData = { statusId: 'st1', userId: 'u1', emoji: 'heart' };
      const commentAddData: CommentAddedEventData = { postId: 'p1', comment: { id: 'c1', content: 'hi', likeCount: 0, replyCount: 0, createdAt: '' }, commentCount: 1 };
      const commentDelData: CommentDeletedEventData = { postId: 'p1', commentId: 'c1', commentCount: 0 };
      const commentLikeData: CommentLikedEventData = { postId: 'p1', commentId: 'c1', userId: 'u1', emoji: 'heart', likeCount: 1 };

      // Call each method and verify the event name used
      const calls: Array<{ method: () => Promise<void> | void; expectedEvent: string }> = [
        { method: () => handler.broadcastPostCreated(post, AUTHOR_ID), expectedEvent: SERVER_EVENTS.POST_CREATED },
        { method: () => handler.broadcastPostDeleted('p1', AUTHOR_ID), expectedEvent: SERVER_EVENTS.POST_DELETED },
        { method: () => handler.broadcastPostLiked(likeData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.POST_LIKED },
        { method: () => handler.broadcastPostUnliked(unlikeData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.POST_UNLIKED },
        { method: () => handler.broadcastPostReposted(repostData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.POST_REPOSTED },
        { method: () => handler.broadcastStoryCreated(post, AUTHOR_ID), expectedEvent: SERVER_EVENTS.STORY_CREATED },
        { method: () => handler.broadcastStoryViewed(storyViewData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.STORY_VIEWED },
        { method: () => handler.broadcastStoryReacted(storyReactData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.STORY_REACTED },
        { method: () => handler.broadcastStatusCreated(post, AUTHOR_ID), expectedEvent: SERVER_EVENTS.STATUS_CREATED },
        { method: () => handler.broadcastStatusReacted(statusReactData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.STATUS_REACTED },
        { method: () => handler.broadcastCommentAdded(commentAddData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.COMMENT_ADDED },
        { method: () => handler.broadcastCommentDeleted(commentDelData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.COMMENT_DELETED },
        { method: () => handler.broadcastCommentLiked(commentLikeData, AUTHOR_ID), expectedEvent: SERVER_EVENTS.COMMENT_LIKED },
      ];

      for (const { method, expectedEvent } of calls) {
        jest.clearAllMocks();
        mockPrisma.friendRequest.findMany.mockResolvedValue(MOCK_FRIENDSHIPS);

        await method();

        const emittedEvents = mockIO.emit.mock.calls.map((call: any[]) => call[0]);
        expect(emittedEvents).toContain(expectedEvent);
      }
    });
  });

  // ==============================================
  // emitToFriends vs emitToUser DISTINCTION
  // ==============================================

  describe('emitToFriends vs emitToUser routing', () => {
    it('broadcast methods that use emitToFriends should emit to (friends + author)', async () => {
      // Methods that broadcast to friends: PostCreated, PostDeleted, PostLiked,
      // PostUnliked, PostReposted, StoryCreated, StatusCreated,
      // CommentAdded, CommentDeleted
      const post = createMockPost();
      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.map((call: any[]) => call[0]);
      expect(calledRooms).toContain(ROOMS.feed(FRIEND_1));
      expect(calledRooms).toContain(ROOMS.feed(FRIEND_2));
      expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(calledRooms).toHaveLength(3);
    });

    it('broadcast methods that use emitToUser should emit ONLY to the target user', () => {
      // Methods that broadcast only to author: StoryViewed, StoryReacted,
      // StatusReacted, CommentLiked
      const data: StoryViewedEventData = {
        storyId: 'story-1',
        viewerId: VIEWER_ID,
        viewerUsername: 'viewer',
        viewCount: 1,
      };
      handler.broadcastStoryViewed(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.map((call: any[]) => call[0]);
      expect(calledRooms).toEqual([ROOMS.feed(AUTHOR_ID)]);
    });
  });
});
