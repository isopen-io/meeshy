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
import type { Post, PostLikedEventData, PostUnlikedEventData, PostRepostedEventData, StoryViewedEventData, StoryReactedEventData, StoryUnreactedEventData, StatusReactedEventData, StatusUnreactedEventData, CommentAddedEventData, CommentDeletedEventData, CommentLikedEventData, CommentTranslationUpdatedEventData, CommentMediaUpdatedEventData } from '@meeshy/shared/types/post';

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
    communityMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

function createMockSocket() {
  return {
    join: jest.fn(),
    leave: jest.fn(),
  } as unknown as Parameters<SocialEventsHandler['handleFeedSubscribe']>[0];
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

    it('should echo the clientMutationId in the payload when provided (U1)', async () => {
      const post = createMockPost();

      await handler.broadcastPostCreated(post, AUTHOR_ID, 'cmid_offline_post');

      expect(mockIO.emit).toHaveBeenCalledWith(
        SERVER_EVENTS.POST_CREATED,
        { post, clientMutationId: 'cmid_offline_post' }
      );
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

      // M2 — UN SEUL emit sur l'union (2 amis + auteur + post room). Socket.IO
      // dédoublonne → plus de double-livraison pour un ami-viewer.
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(
        expect.arrayContaining([
          ROOMS.feed(FRIEND_1),
          ROOMS.feed(FRIEND_2),
          ROOMS.feed(AUTHOR_ID),
          ROOMS.post(data.postId),
        ]),
      );
      expect(mockIO.emit).toHaveBeenCalledTimes(1);
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

      // M2 — UN SEUL emit sur l'union (cf. broadcastPostLiked).
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(
        expect.arrayContaining([
          ROOMS.feed(FRIEND_1),
          ROOMS.feed(FRIEND_2),
          ROOMS.feed(AUTHOR_ID),
          ROOMS.post(data.postId),
        ]),
      );
      expect(mockIO.emit).toHaveBeenCalledTimes(1);
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

  describe('broadcastPostBookmarked', () => {
    it('should emit POST_BOOKMARKED ONLY to the viewer feed room (favori personnel)', () => {
      handler.broadcastPostBookmarked({ postId: 'post-1', bookmarked: true }, VIEWER_ID);

      // Personnel : seul l'utilisateur qui a bookmarké le reçoit (toutes ses sessions/vues).
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(VIEWER_ID));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_BOOKMARKED, {
        postId: 'post-1',
        bookmarked: true,
      });
    });

    it('should carry bookmarked:false on un-bookmark', () => {
      handler.broadcastPostBookmarked({ postId: 'post-1', bookmarked: false }, VIEWER_ID);

      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.POST_BOOKMARKED, {
        postId: 'post-1',
        bookmarked: false,
      });
    });

    it('should NOT emit to friends', () => {
      handler.broadcastPostBookmarked({ postId: 'post-1', bookmarked: true }, VIEWER_ID);

      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
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

    it('should fan a COMMUNITY story to community co-members + author (not friends)', async () => {
      mockPrisma.communityMember.findMany
        .mockResolvedValueOnce([{ communityId: 'c1' }])
        .mockResolvedValueOnce([{ userId: 'co-1' }]);
      const story = createMockPost({ id: 'story-2', type: 'STORY', visibility: 'COMMUNITY' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed('co-1'));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
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
    it('should emit STORY_REACTED to the story author AND to the post room', () => {
      const data: StoryReactedEventData = {
        storyId: 'story-1',
        userId: VIEWER_ID,
        emoji: 'fire',
      };

      handler.broadcastStoryReacted(data, AUTHOR_ID);

      // Single deduped emit (io.to([...])) → an author watching their own story
      // (in both rooms) receives STORY_REACTED exactly once, no `+2`.
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(rooms).toContain(ROOMS.post('story-1'));
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

  describe('post broadcasts — visibility filtering (rights of diffusion, C1-bis)', () => {
    it('broadcastPostCreated for a PRIVATE post reaches only the author feed', async () => {
      const post = createMockPost({ id: 'p-priv', visibility: 'PRIVATE' });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(AUTHOR_ID));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    });

    it('broadcastPostCreated for an ONLY post reaches only the allow-listed friend', async () => {
      const post = createMockPost({ id: 'p-only', visibility: 'ONLY', visibilityUserIds: [FRIEND_1] });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(FRIEND_1));
      expect(mockIO.to).not.toHaveBeenCalledWith(ROOMS.feed(FRIEND_2));
    });

    it('broadcastPostLiked for an EXCEPT post skips the excluded friend feed (post room still reached)', async () => {
      await handler.broadcastPostLiked(
        { postId: 'p-exc', userId: VIEWER_ID, emoji: '❤️', likeCount: 1, reactionSummary: { '❤️': 1 } },
        AUTHOR_ID,
        'EXCEPT',
        [FRIEND_1],
      );

      // Single unified emit (M2) → rooms is an array; assert its contents.
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_1));
      expect(rooms).toContain(ROOMS.feed(FRIEND_2));
      expect(rooms).toContain(ROOMS.post('p-exc'));
    });
  });

  describe('broadcastStatusReacted', () => {
    it('should emit STATUS_REACTED to the status author AND to the post room', () => {
      const data: StatusReactedEventData = {
        statusId: 'status-1',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      // Single deduped emit (io.to([...])) → author-viewer counts the emoji once.
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(rooms).toContain(ROOMS.post('status-1'));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.STATUS_REACTED, data);
    });

    it('should NOT emit to friend feed rooms', () => {
      const data: StatusReactedEventData = {
        statusId: 'status-1',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_1));
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_2));
    });
  });

  // ==============================================
  // COMMENT BROADCASTS
  // ==============================================

  describe('broadcastCommentAdded', () => {
    const makeData = (postId = 'post-1'): CommentAddedEventData => ({
      postId,
      comment: {
        id: 'comment-1',
        content: 'Nice post!',
        likeCount: 0,
        replyCount: 0,
        createdAt: new Date().toISOString(),
      },
      commentCount: 1,
    });

    it('should emit COMMENT_ADDED to the friend feeds, the author feed AND the post room', async () => {
      const data = makeData();

      await handler.broadcastCommentAdded(data, AUTHOR_ID);

      // Single chained emit on the UNION of rooms (Socket.IO dedupes a socket
      // present in several rooms → exactly-once delivery).
      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(
        expect.arrayContaining([
          ROOMS.feed(FRIEND_1),
          ROOMS.feed(FRIEND_2),
          ROOMS.feed(AUTHOR_ID),
          ROOMS.post('post-1'),
        ])
      );
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_ADDED, data);
    });

    it('should reach the post room so a detail/reel viewer who is NOT the author\'s friend sees the comment live', async () => {
      const data = makeData('post-77');

      await handler.broadcastCommentAdded(data, AUTHOR_ID);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toContain(ROOMS.post('post-77'));
    });

    it('should deliver EXACTLY ONCE (single emit) so non-idempotent comment inserts never double-apply', async () => {
      const data = makeData();

      await handler.broadcastCommentAdded(data, AUTHOR_ID);

      expect(mockIO.emit).toHaveBeenCalledTimes(1);
    });

    it('should still reach the author feed AND the post room when the friends lookup fails', async () => {
      mockPrisma.friendRequest.findMany.mockRejectedValue(new Error('Database connection lost'));
      const data = makeData('post-err');

      await handler.broadcastCommentAdded(data, AUTHOR_ID);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(AUTHOR_ID), ROOMS.post('post-err')]));
    });
  });

  // C1 — comment events must respect the POST's visibility, NOT fan out to all
  // the author's friends regardless of who may see the post.
  describe('broadcastCommentAdded — visibility filtering (rights of diffusion)', () => {
    const makeData = (postId = 'post-1'): CommentAddedEventData => ({
      postId,
      comment: { id: 'comment-1', content: 'secret', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() },
      commentCount: 1,
    });

    it('PRIVATE: reaches ONLY the author feed and the (join-gated) post room — never friend feeds', async () => {
      await handler.broadcastCommentAdded(makeData(), AUTHOR_ID, 'PRIVATE', []);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual([ROOMS.feed(AUTHOR_ID), ROOMS.post('post-1')]);
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_1));
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_2));
    });

    it('ONLY: reaches only the allow-listed friend (+ author + post room)', async () => {
      await handler.broadcastCommentAdded(makeData(), AUTHOR_ID, 'ONLY', [FRIEND_1]);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(FRIEND_1), ROOMS.feed(AUTHOR_ID), ROOMS.post('post-1')]));
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_2));
    });

    it('EXCEPT: excludes the listed friend but keeps the others', async () => {
      await handler.broadcastCommentAdded(makeData(), AUTHOR_ID, 'EXCEPT', [FRIEND_1]);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toContain(ROOMS.feed(FRIEND_2));
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_1));
    });

    it('defaults to PUBLIC friend fan-out when visibility is omitted (back-compat)', async () => {
      await handler.broadcastCommentAdded(makeData(), AUTHOR_ID);

      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(FRIEND_1), ROOMS.feed(FRIEND_2)]));
    });
  });

  describe('broadcastCommentDeleted — visibility filtering', () => {
    it('PRIVATE: does not reach friend feeds', async () => {
      await handler.broadcastCommentDeleted({ postId: 'post-1', commentId: 'c1', commentCount: 0 }, AUTHOR_ID, 'PRIVATE', []);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).not.toContain(ROOMS.feed(FRIEND_1));
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(AUTHOR_ID), ROOMS.post('post-1')]));
    });
  });

  describe('broadcastCommentDeleted', () => {
    it('should emit COMMENT_DELETED to the friend feeds, the author feed AND the post room', async () => {
      const data: CommentDeletedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        commentCount: 0,
      };

      await handler.broadcastCommentDeleted(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(
        expect.arrayContaining([
          ROOMS.feed(FRIEND_1),
          ROOMS.feed(FRIEND_2),
          ROOMS.feed(AUTHOR_ID),
          ROOMS.post('post-1'),
        ])
      );
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_DELETED, data);
    });

    it('should deliver EXACTLY ONCE so the optimistic removal never double-corrects', async () => {
      const data: CommentDeletedEventData = { postId: 'post-1', commentId: 'comment-1', commentCount: 0 };

      await handler.broadcastCommentDeleted(data, AUTHOR_ID);

      expect(mockIO.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastCommentLiked', () => {
    it('should emit COMMENT_LIKED to the comment author AND the post room (live count for all viewers)', () => {
      const data: CommentLikedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        userId: VIEWER_ID,
        emoji: 'thumbsup',
        likeCount: 1,
      };

      const commentAuthorId = 'user-comment-author';
      handler.broadcastCommentLiked(data, commentAuthorId);

      expect(mockIO.to).toHaveBeenCalledTimes(2);
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.feed(commentAuthorId));
      expect(mockIO.to).toHaveBeenCalledWith(ROOMS.post('post-1'));
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
  // COMMENT TRANSLATION / MEDIA BROADCASTS — must reach the post room too
  // ==============================================

  describe('broadcastCommentTranslationUpdated', () => {
    it('should emit COMMENT_TRANSLATION_UPDATED to the friend/author feeds AND the post room', async () => {
      const data: CommentTranslationUpdatedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        language: 'fr',
        translation: { text: 'Bonjour', translationModel: 'nllb', createdAt: new Date().toISOString() },
      };

      await handler.broadcastCommentTranslationUpdated(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(AUTHOR_ID), ROOMS.post('post-1')]));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, data);
    });
  });

  describe('broadcastCommentMediaUpdated', () => {
    it('should emit COMMENT_MEDIA_UPDATED to the friend/author feeds AND the post room', async () => {
      const data: CommentMediaUpdatedEventData = {
        postId: 'post-1',
        commentId: 'comment-1',
        comment: { id: 'comment-1', content: 'hi', likeCount: 0, replyCount: 0, createdAt: new Date().toISOString() },
      };

      await handler.broadcastCommentMediaUpdated(data, AUTHOR_ID);

      expect(mockIO.to).toHaveBeenCalledTimes(1);
      const rooms = mockIO.to.mock.calls[0][0] as string[];
      expect(rooms).toEqual(expect.arrayContaining([ROOMS.feed(AUTHOR_ID), ROOMS.post('post-1')]));
      expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.COMMENT_MEDIA_UPDATED, data);
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
  // PHASE 4B — B2: broadcastStoryReacted emits to ROOMS.post
  // ==============================================

  describe('broadcastStoryReacted — B2 room emit', () => {
    it('should emit STORY_REACTED to the author feed room AND to ROOMS.post(storyId)', () => {
      const data: StoryReactedEventData = {
        storyId: 'story-42',
        userId: VIEWER_ID,
        emoji: 'fire',
      };

      handler.broadcastStoryReacted(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(calledRooms).toContain(ROOMS.post('story-42'));
      // Both emits use the same event constant
      const emittedEvents = mockIO.emit.mock.calls.map((call: any[]) => call[0]);
      expect(emittedEvents.every((e: string) => e === SERVER_EVENTS.STORY_REACTED)).toBe(true);
    });

    it('should NOT emit STORY_REACTED to friend feed rooms', () => {
      const data: StoryReactedEventData = {
        storyId: 'story-42',
        userId: VIEWER_ID,
        emoji: 'fire',
      };

      handler.broadcastStoryReacted(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).not.toContain(ROOMS.feed(FRIEND_1));
      expect(calledRooms).not.toContain(ROOMS.feed(FRIEND_2));
    });
  });

  // ==============================================
  // PHASE 4B — B3: broadcastStoryUnreacted
  // ==============================================

  describe('broadcastStoryUnreacted — B3', () => {
    it('should emit STORY_UNREACTED to the author feed room AND to ROOMS.post(storyId)', () => {
      const data: StoryUnreactedEventData = {
        storyId: 'story-42',
        userId: VIEWER_ID,
        emoji: 'fire',
      };

      handler.broadcastStoryUnreacted(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(calledRooms).toContain(ROOMS.post('story-42'));
      const emittedEvents = mockIO.emit.mock.calls.map((call: any[]) => call[0]);
      expect(emittedEvents.every((e: string) => e === SERVER_EVENTS.STORY_UNREACTED)).toBe(true);
    });

    it('should use the STORY_UNREACTED event constant ("story:unreacted")', () => {
      expect(SERVER_EVENTS.STORY_UNREACTED).toBe('story:unreacted');

      const data: StoryUnreactedEventData = { storyId: 's1', userId: 'u1', emoji: 'fire' };
      handler.broadcastStoryUnreacted(data, AUTHOR_ID);

      const emittedEvents = mockIO.emit.mock.calls.map((call: any[]) => call[0]);
      expect(emittedEvents).toContain('story:unreacted');
    });
  });

  // ==============================================
  // PHASE 4B — B3: broadcastStatusReacted emits to ROOMS.post
  // ==============================================

  describe('broadcastStatusReacted — B2 room emit', () => {
    it('should emit STATUS_REACTED to the author feed room AND to ROOMS.post(statusId)', () => {
      const data: StatusReactedEventData = {
        statusId: 'status-99',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(calledRooms).toContain(ROOMS.post('status-99'));
    });
  });

  // ==============================================
  // PHASE 4B — B3: broadcastStatusUnreacted
  // ==============================================

  describe('broadcastStatusUnreacted — B3', () => {
    it('should emit STATUS_UNREACTED to the author feed room AND to ROOMS.post(statusId)', () => {
      const data: StatusUnreactedEventData = {
        statusId: 'status-99',
        userId: VIEWER_ID,
        emoji: 'heart',
      };

      handler.broadcastStatusUnreacted(data, AUTHOR_ID);

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).toContain(ROOMS.feed(AUTHOR_ID));
      expect(calledRooms).toContain(ROOMS.post('status-99'));
      const emittedEvents = mockIO.emit.mock.calls.map((call: any[]) => call[0]);
      expect(emittedEvents.every((e: string) => e === SERVER_EVENTS.STATUS_UNREACTED)).toBe(true);
    });

    it('should use the STATUS_UNREACTED event constant ("status:unreacted")', () => {
      expect(SERVER_EVENTS.STATUS_UNREACTED).toBe('status:unreacted');
    });
  });

  // ==============================================
  // PHASE 4B — B7: STORY_TRANSLATION_UPDATED renamed value
  // ==============================================

  describe('STORY_TRANSLATION_UPDATED event constant — B7', () => {
    it('should use "story:translation-updated" (not "post:story-translation-updated")', () => {
      expect(SERVER_EVENTS.STORY_TRANSLATION_UPDATED).toBe('story:translation-updated');
    });

    it('should NOT use the old "post:story-translation-updated" value', () => {
      expect(SERVER_EVENTS.STORY_TRANSLATION_UPDATED).not.toBe('post:story-translation-updated');
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

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
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

      const calledRooms = mockIO.to.mock.calls.flatMap((call: any[]) => Array.isArray(call[0]) ? call[0] : [call[0]]);
      expect(calledRooms).toEqual([ROOMS.feed(AUTHOR_ID)]);
    });
  });
});
