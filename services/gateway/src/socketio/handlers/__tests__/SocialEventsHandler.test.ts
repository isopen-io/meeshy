/**
 * Unit tests for SocialEventsHandler
 * Covers: feed room management (subscribe/unsubscribe), friend cache,
 * post broadcasts (created, liked, unliked, bookmarked, deleted),
 * story broadcasts (created, reacted, unreacted), status broadcasts,
 * and comment broadcasts.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SocialEventsHandler } from '../SocialEventsHandler';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    POST_CREATED: 'post:created',
    POST_UPDATED: 'post:updated',
    POST_DELETED: 'post:deleted',
    POST_LIKED: 'post:liked',
    POST_UNLIKED: 'post:unliked',
    POST_REPOSTED: 'post:reposted',
    POST_BOOKMARKED: 'post:bookmarked',
    POST_REACTION_ADDED: 'post:reaction-added',
    POST_REACTION_REMOVED: 'post:reaction-removed',
    STORY_CREATED: 'story:created',
    STORY_UPDATED: 'story:updated',
    STORY_DELETED: 'story:deleted',
    STORY_VIEWED: 'story:viewed',
    STORY_REACTED: 'story:reacted',
    STORY_UNREACTED: 'story:unreacted',
    STATUS_CREATED: 'status:created',
    STATUS_UPDATED: 'status:updated',
    STATUS_DELETED: 'status:deleted',
    STATUS_REACTED: 'status:reacted',
    STATUS_UNREACTED: 'status:unreacted',
    COMMENT_ADDED: 'comment:added',
    COMMENT_DELETED: 'comment:deleted',
    COMMENT_LIKED: 'comment:liked',
    POST_TRANSLATION_UPDATED: 'post:translation-updated',
    COMMENT_TRANSLATION_UPDATED: 'comment:translation-updated',
    COMMENT_MEDIA_UPDATED: 'comment:media-updated',
  },
  ROOMS: {
    feed: (id: string) => `feed:${id}`,
    post: (id: string) => `post:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../services/posts/communityVisibility', () => ({
  getCommunityCoMemberIds: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTHOR_ID = 'author-abc';
const FRIEND_ID_1 = 'friend-111';
const FRIEND_ID_2 = 'friend-222';
const POST_ID = '507f191e810c19729de860ea';
const STORY_ID = '507f191e810c19729de860eb';
const STATUS_ID = '507f191e810c19729de860ec';
const COMMENT_ID = '507f191e810c19729de860ed';
const SOCKET_ID = 'socket-social-abc';
const USER_ID = 'user-social-123';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeSocket(id = SOCKET_ID): Socket {
  return {
    id,
    join: jest.fn<any>().mockResolvedValue(undefined),
    leave: jest.fn<any>().mockResolvedValue(undefined),
    emit: jest.fn<any>(),
  } as unknown as Socket;
}

function makePrisma(friendIds: string[] = [FRIEND_ID_1, FRIEND_ID_2]): PrismaClient {
  const friendships = friendIds.map(id => ({
    senderId: AUTHOR_ID,
    receiverId: id,
  }));

  return {
    friendRequest: {
      findMany: jest.fn<any>().mockResolvedValue(friendships),
    },
  } as unknown as PrismaClient;
}

function makeIo() {
  const emit = jest.fn<any>();
  const ioTo = jest.fn<any>().mockReturnValue({ emit });
  return {
    to: ioTo,
    _emit: emit,
  };
}

function buildHandler(overrides: {
  prisma?: PrismaClient;
  io?: ReturnType<typeof makeIo>;
} = {}) {
  const prisma = overrides.prisma ?? makePrisma();
  const io = overrides.io ?? makeIo();

  const handler = new SocialEventsHandler({
    io: io as any,
    prisma,
  });

  return { handler, prisma, io };
}

function makePost(overrides: Record<string, unknown> = {}): any {
  return {
    id: POST_ID,
    visibility: 'PUBLIC',
    visibilityUserIds: [],
    type: 'POST',
    authorId: AUTHOR_ID,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SocialEventsHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Feed room management ─────────────────────────────────────────────────

  describe('handleFeedSubscribe', () => {
    it('joins the feed room for the given userId', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();

      await handler.handleFeedSubscribe(socket, USER_ID);

      expect(socket.join).toHaveBeenCalledWith(`feed:${USER_ID}`);
    });

    it('rejects when socket.join rejects', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      (socket.join as jest.Mock<any>).mockRejectedValueOnce(new Error('join failed'));

      await expect(handler.handleFeedSubscribe(socket, USER_ID)).rejects.toThrow('join failed');
    });
  });

  describe('handleFeedUnsubscribe', () => {
    it('leaves the feed room for the given userId', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();

      await handler.handleFeedUnsubscribe(socket, USER_ID);

      expect(socket.leave).toHaveBeenCalledWith(`feed:${USER_ID}`);
    });

    it('rejects when socket.leave rejects', async () => {
      const { handler } = buildHandler();
      const socket = makeSocket();
      (socket.leave as jest.Mock<any>).mockRejectedValueOnce(new Error('leave failed'));

      await expect(handler.handleFeedUnsubscribe(socket, USER_ID)).rejects.toThrow('leave failed');
    });
  });

  // ── Friend cache ─────────────────────────────────────────────────────────

  describe('friend cache (via broadcastPostDeleted)', () => {
    it('fetches friends from DB on first call', async () => {
      const prisma = makePrisma([FRIEND_ID_1]);
      const { handler } = buildHandler({ prisma });

      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);

      expect((prisma.friendRequest.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(1);
    });

    it('uses cache on second call within TTL', async () => {
      const prisma = makePrisma([FRIEND_ID_1]);
      const { handler } = buildHandler({ prisma });

      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);
      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);

      expect((prisma.friendRequest.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(1);
    });

    it('returns empty array and does not throw when DB rejects', async () => {
      const prisma = {
        friendRequest: { findMany: jest.fn<any>().mockRejectedValue(new Error('db error')) },
      } as unknown as PrismaClient;
      const { handler } = buildHandler({ prisma });

      await expect(handler.broadcastPostDeleted(POST_ID, AUTHOR_ID)).resolves.toBeUndefined();
    });

    it('resolves friend IDs in both sender and receiver direction', async () => {
      const prisma = {
        friendRequest: {
          findMany: jest.fn<any>().mockResolvedValue([
            { senderId: FRIEND_ID_1, receiverId: AUTHOR_ID },
            { senderId: AUTHOR_ID, receiverId: FRIEND_ID_2 },
          ]),
        },
      } as unknown as PrismaClient;
      const { handler, io } = buildHandler({ prisma });

      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);

      const roomsEmittedTo = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(roomsEmittedTo).toContain(`feed:${FRIEND_ID_1}`);
      expect(roomsEmittedTo).toContain(`feed:${FRIEND_ID_2}`);
    });
  });

  // ── Post broadcasts ──────────────────────────────────────────────────────

  describe('broadcastPostCreated', () => {
    it('emits post:created to friend feed rooms and author feed room', async () => {
      const { handler, io } = buildHandler();
      const post = makePost();

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${FRIEND_ID_2}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('includes post and clientMutationId in payload when provided', async () => {
      const { handler, io } = buildHandler();
      const post = makePost();
      const clientMutationId = 'cid_abc123';

      await handler.broadcastPostCreated(post, AUTHOR_ID, clientMutationId);

      const emitFn = io.to.mock.results[0].value.emit;
      const [event, payload] = (emitFn as jest.Mock<any>).mock.calls[0] as [string, unknown];
      expect(event).toBe('post:created');
      expect(payload).toMatchObject({ post, clientMutationId });
    });

    it('filters PRIVATE visibility — emits only to author', async () => {
      const { handler, io } = buildHandler();
      const post = makePost({ visibility: 'PRIVATE' });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('filters EXCEPT visibility — excludes blocked friend IDs', async () => {
      const { handler, io } = buildHandler();
      const post = makePost({ visibility: 'EXCEPT', visibilityUserIds: [FRIEND_ID_1] });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${FRIEND_ID_2}`);
    });

    it('filters ONLY visibility — emits only to allowed user IDs', async () => {
      const { handler, io } = buildHandler();
      const post = makePost({ visibility: 'ONLY', visibilityUserIds: [FRIEND_ID_2] });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${FRIEND_ID_2}`);
    });
  });

  describe('broadcastPostLiked', () => {
    it('emits post:liked to friend feed rooms, author feed room, AND post room', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, userId: USER_ID, emoji: '❤️', likeCount: 6, reactionSummary: { '❤️': 6 } };

      await handler.broadcastPostLiked(data, AUTHOR_ID);

      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`feed:${FRIEND_ID_1}`);
      expect(roomsArg).toContain(`feed:${FRIEND_ID_2}`);
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
      expect(roomsArg).toContain(`post:${POST_ID}`);
    });

    it('emits single event to all rooms (no duplicate delivery)', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, userId: USER_ID, emoji: '❤️', likeCount: 1, reactionSummary: {} };

      await handler.broadcastPostLiked(data, AUTHOR_ID);

      expect(io.to).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastPostUnliked', () => {
    it('emits post:unliked to friend feed rooms and post room', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, userId: USER_ID, emoji: '❤️', likeCount: 5, reactionSummary: {} };

      await handler.broadcastPostUnliked(data, AUTHOR_ID);

      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`post:${POST_ID}`);
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastPostDeleted', () => {
    it('emits post:deleted with postId and authorId', async () => {
      const { handler, io } = buildHandler();

      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);

      const emitFn = io.to.mock.results[0].value.emit;
      const [event, payload] = (emitFn as jest.Mock<any>).mock.calls[0] as [string, unknown];
      expect(event).toBe('post:deleted');
      expect(payload).toMatchObject({ postId: POST_ID, authorId: AUTHOR_ID });
    });
  });

  describe('broadcastPostBookmarked', () => {
    it('emits post:bookmarked only to the user who bookmarked (personal event)', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, userId: USER_ID, isBookmarked: true };

      handler.broadcastPostBookmarked(data, USER_ID);

      expect(io.to).toHaveBeenCalledWith(`feed:${USER_ID}`);
      expect(io.to).toHaveBeenCalledTimes(1);
    });
  });

  // ── Story broadcasts ─────────────────────────────────────────────────────

  describe('broadcastStoryCreated', () => {
    it('emits story:created to friend feed rooms honoring visibility', async () => {
      const { handler, io } = buildHandler();
      const story = makePost({ id: STORY_ID, type: 'STORY', visibility: 'PUBLIC' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('does not emit to friends when story visibility is PRIVATE', async () => {
      const { handler, io } = buildHandler();
      const story = makePost({ id: STORY_ID, type: 'STORY', visibility: 'PRIVATE' });

      await handler.broadcastStoryCreated(story, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastStoryViewed', () => {
    it('emits story:viewed only to story author feed room', () => {
      const { handler, io } = buildHandler();
      const data = { storyId: STORY_ID, viewerId: USER_ID } as any;

      handler.broadcastStoryViewed(data, AUTHOR_ID);

      expect(io.to).toHaveBeenCalledWith(`feed:${AUTHOR_ID}`);
      expect(io.to).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastStoryReacted', () => {
    it('emits story:reacted to author feed room AND story post room in a single deduped emit', () => {
      const { handler, io } = buildHandler();
      const data = { storyId: STORY_ID, userId: USER_ID, emoji: '❤️' } as any;

      handler.broadcastStoryReacted(data, AUTHOR_ID);

      // Single `io.to([...])` call → Socket.IO dedupes a socket present in both
      // rooms (author watching their own story) → no `+2` double-count.
      expect(io.to).toHaveBeenCalledTimes(1);
      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
      expect(roomsArg).toContain(`post:${STORY_ID}`);
    });
  });

  describe('broadcastStoryUnreacted', () => {
    it('emits story:unreacted to author feed room AND story post room in a single deduped emit', () => {
      const { handler, io } = buildHandler();
      const data = { storyId: STORY_ID, userId: USER_ID, emoji: '❤️' } as any;

      handler.broadcastStoryUnreacted(data, AUTHOR_ID);

      expect(io.to).toHaveBeenCalledTimes(1);
      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
      expect(roomsArg).toContain(`post:${STORY_ID}`);
    });
  });

  describe('broadcastStoryDeleted', () => {
    it('emits story:deleted to all friends regardless of visibility', async () => {
      const { handler, io } = buildHandler();

      await handler.broadcastStoryDeleted(STORY_ID, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${FRIEND_ID_2}`);
    });
  });

  // ── Status broadcasts ────────────────────────────────────────────────────

  describe('broadcastStatusCreated', () => {
    it('emits status:created to visibility-filtered recipients', async () => {
      const { handler, io } = buildHandler();
      const status = makePost({ id: STATUS_ID, type: 'STATUS', visibility: 'FRIENDS' });

      await handler.broadcastStatusCreated(status, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
    });
  });

  describe('broadcastStatusReacted', () => {
    it('emits status:reacted to author feed room AND status post room in a single deduped emit', () => {
      const { handler, io } = buildHandler();
      const data = { statusId: STATUS_ID, userId: USER_ID, emoji: '🎉' } as any;

      handler.broadcastStatusReacted(data, AUTHOR_ID);

      expect(io.to).toHaveBeenCalledTimes(1);
      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
      expect(roomsArg).toContain(`post:${STATUS_ID}`);
    });
  });

  describe('broadcastStatusUnreacted', () => {
    it('emits status:unreacted to author feed room AND status post room in a single deduped emit', () => {
      const { handler, io } = buildHandler();
      const data = { statusId: STATUS_ID, userId: USER_ID, emoji: '🎉' } as any;

      handler.broadcastStatusUnreacted(data, AUTHOR_ID);

      expect(io.to).toHaveBeenCalledTimes(1);
      const roomsArg = (io.to as jest.Mock<any>).mock.calls[0][0] as string[];
      expect(roomsArg).toContain(`feed:${AUTHOR_ID}`);
      expect(roomsArg).toContain(`post:${STATUS_ID}`);
    });
  });

  // ── Comment broadcasts ───────────────────────────────────────────────────

  describe('broadcastCommentAdded', () => {
    it('emits comment:added to friend feed rooms and post room', async () => {
      const { handler, io } = buildHandler();
      const comment = { id: COMMENT_ID, postId: POST_ID, content: 'Great!' } as any;

      await handler.broadcastCommentAdded(comment, AUTHOR_ID, 'PUBLIC', []);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms.some((r: string[]) => Array.isArray(r) ? r.some((v: string) => v.includes('feed:') || v.includes('post:')) : (r as unknown as string).includes('feed:') || (r as unknown as string).includes('post:'))).toBe(true);
    });
  });

  describe('broadcastCommentLiked', () => {
    it('emits comment:liked to comment author feed room', () => {
      const { handler, io } = buildHandler();
      const commentAuthorId = 'comment-author-1';
      const data = { commentId: COMMENT_ID, postId: POST_ID, userId: USER_ID, emoji: '👍' } as any;

      handler.broadcastCommentLiked(data, commentAuthorId);

      expect(io.to).toHaveBeenCalledWith(`feed:${commentAuthorId}`);
    });
  });

  describe('broadcastPostUpdated', () => {
    it('emits post:updated to visibility-filtered friend feed rooms and author', async () => {
      const { handler, io } = buildHandler();
      const post = makePost({ visibility: 'PUBLIC' });

      await handler.broadcastPostUpdated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastStoryUpdated', () => {
    it('emits story:updated to visibility-filtered feed rooms', async () => {
      const { handler, io } = buildHandler();
      const story = makePost({ id: STORY_ID, type: 'STORY', visibility: 'FRIENDS' });

      await handler.broadcastStoryUpdated(story, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('emits only to author when story visibility is PRIVATE', async () => {
      const { handler, io } = buildHandler();
      const story = makePost({ id: STORY_ID, type: 'STORY', visibility: 'PRIVATE' });

      await handler.broadcastStoryUpdated(story, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastStatusUpdated', () => {
    it('emits status:updated to visibility-filtered recipients', async () => {
      const { handler, io } = buildHandler();
      const status = makePost({ id: STATUS_ID, type: 'STATUS', visibility: 'FRIENDS' });

      await handler.broadcastStatusUpdated(status, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
    });
  });

  describe('broadcastStatusDeleted', () => {
    it('emits status:deleted with statusId and authorId to friends', async () => {
      const { handler, io } = buildHandler();

      await handler.broadcastStatusDeleted(STATUS_ID, AUTHOR_ID);

      const emitFn = io.to.mock.results[0].value.emit;
      const [event, payload] = (emitFn as jest.Mock<any>).mock.calls[0] as [string, unknown];
      expect(event).toBe('status:deleted');
      expect(payload).toMatchObject({ statusId: STATUS_ID, authorId: AUTHOR_ID });
    });

    it('respects visibility when PRIVATE — emits only to author', async () => {
      const { handler, io } = buildHandler();

      await handler.broadcastStatusDeleted(STATUS_ID, AUTHOR_ID, 'PRIVATE', []);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).not.toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastPostTranslationUpdated', () => {
    it('emits post:translation-updated to visibility-filtered friends and author', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, translations: { en: 'Hello' } } as any;

      await handler.broadcastPostTranslationUpdated(data, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('broadcastCommentDeleted', () => {
    it('emits comment:deleted to visibility-filtered rooms', async () => {
      const { handler, io } = buildHandler();
      const data = { commentId: COMMENT_ID, postId: POST_ID } as any;

      await handler.broadcastCommentDeleted(data, AUTHOR_ID, 'PUBLIC', []);

      const allRoomArgs = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r).flat();
      expect(allRoomArgs.some((r: string) => r.includes('feed:') || r.includes('post:'))).toBe(true);
    });
  });

  describe('broadcastCommentTranslationUpdated', () => {
    it('emits comment:translation-updated to feed rooms and post room', async () => {
      const { handler, io } = buildHandler();
      const data = { commentId: COMMENT_ID, postId: POST_ID, translations: {} } as any;

      await handler.broadcastCommentTranslationUpdated(data, AUTHOR_ID, 'PUBLIC', []);

      const allRoomArgs = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r).flat();
      expect(allRoomArgs.some((r: string) => r.includes('post:'))).toBe(true);
    });
  });

  describe('broadcastCommentMediaUpdated', () => {
    it('emits comment:media-updated to feed rooms and post room', async () => {
      const { handler, io } = buildHandler();
      const data = { commentId: COMMENT_ID, postId: POST_ID } as any;

      await handler.broadcastCommentMediaUpdated(data, AUTHOR_ID, 'PUBLIC', []);

      const allRoomArgs = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r).flat();
      expect(allRoomArgs.some((r: string) => r.includes('post:'))).toBe(true);
    });
  });

  describe('broadcastPostReposted', () => {
    it('emits post:reposted to visibility-filtered feed rooms', async () => {
      const { handler, io } = buildHandler();
      const repost = makePost({ visibility: 'PUBLIC' });
      const data = { postId: POST_ID, repost } as any;

      await handler.broadcastPostReposted(data, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
    });
  });

  describe('getVisibilityFilteredRecipients — default visibility branch', () => {
    it('falls back to friend list for unrecognized visibility string', async () => {
      const { handler, io } = buildHandler();
      const post = makePost({ visibility: 'UNKNOWN_VISIBILITY' });

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${FRIEND_ID_1}`);
      expect(rooms).toContain(`feed:${FRIEND_ID_2}`);
    });
  });

  describe('friends cache eviction', () => {
    it('evicts oldest entry when cache reaches 500 entries', async () => {
      const prisma = {
        friendRequest: {
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      } as unknown as ReturnType<typeof makePrisma>;
      const { handler } = buildHandler({ prisma });

      for (let i = 0; i < 501; i++) {
        await handler.broadcastPostDeleted(POST_ID, `evict-user-${i}`);
      }

      expect((prisma.friendRequest.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(501);
    });
  });

  describe('invalidateFriendsCache', () => {
    it('removes the cached entry so the next call re-fetches from DB', async () => {
      const prisma = makePrisma([FRIEND_ID_1]);
      const { handler } = buildHandler({ prisma });

      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);
      handler.invalidateFriendsCache(AUTHOR_ID);
      await handler.broadcastPostDeleted(POST_ID, AUTHOR_ID);

      expect((prisma.friendRequest.findMany as jest.Mock<any>)).toHaveBeenCalledTimes(2);
    });
  });

  describe('null-coalescing fallback branches', () => {
    it('broadcastPostCreated falls back to PUBLIC when post.visibility is undefined', async () => {
      const { handler, io } = buildHandler();
      const post = { id: POST_ID, authorId: AUTHOR_ID, visibilityUserIds: [] } as any;

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastPostCreated falls back to empty array when post.visibilityUserIds is undefined', async () => {
      const { handler, io } = buildHandler();
      const post = { id: POST_ID, authorId: AUTHOR_ID, visibility: 'PUBLIC' } as any;

      await handler.broadcastPostCreated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastPostUpdated falls back to PUBLIC when post.visibility is undefined', async () => {
      const { handler, io } = buildHandler();
      const post = { id: POST_ID, authorId: AUTHOR_ID, visibilityUserIds: [] } as any;

      await handler.broadcastPostUpdated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastPostUpdated falls back to empty array when post.visibilityUserIds is undefined', async () => {
      const { handler, io } = buildHandler();
      const post = { id: POST_ID, authorId: AUTHOR_ID, visibility: 'PUBLIC' } as any;

      await handler.broadcastPostUpdated(post, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastPostReposted falls back to PUBLIC when repost is undefined', async () => {
      const { handler, io } = buildHandler();
      const data = { postId: POST_ID, originalPostId: 'orig-1' } as any;

      await handler.broadcastPostReposted(data, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastStoryUpdated spreads undefined visibilityUserIds as empty array', async () => {
      const { handler, io } = buildHandler();
      const story = { id: STORY_ID, type: 'STORY', authorId: AUTHOR_ID, visibility: 'PUBLIC' } as any;

      await handler.broadcastStoryUpdated(story, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });

    it('broadcastStatusUpdated spreads undefined visibilityUserIds as empty array', async () => {
      const { handler, io } = buildHandler();
      const status = { id: STATUS_ID, type: 'STATUS', authorId: AUTHOR_ID, visibility: 'PUBLIC' } as any;

      await handler.broadcastStatusUpdated(status, AUTHOR_ID);

      const rooms = (io.to as jest.Mock<any>).mock.calls.map(([r]: [unknown]) => r);
      expect(rooms).toContain(`feed:${AUTHOR_ID}`);
    });
  });

  describe('friends cache eviction — expired entries', () => {
    it('deletes expired entries when cache reaches 500 entries', async () => {
      const { handler } = buildHandler();
      const cache = (handler as any).friendsCache as Map<string, { ids: string[]; expiresAt: number }>;

      for (let i = 0; i < 500; i++) {
        cache.set(`expired-${i}`, { ids: [], expiresAt: Date.now() - 1 });
      }

      await handler.broadcastPostDeleted(POST_ID, 'trigger-user');

      expect(cache.size).toBeLessThan(500);
    });
  });

  describe('getVisibilityFilteredRecipients — default visibilityUserIds', () => {
    it('uses empty array as default when visibilityUserIds argument is omitted', async () => {
      const { handler } = buildHandler();

      const result = await (handler as any).getVisibilityFilteredRecipients(AUTHOR_ID, 'PUBLIC');

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
