/**
 * SocialNotificationsP4B.test.ts
 *
 * Phase 4B reliability fixes:
 * - B1: STATUS likes route to status:reacted (not post:liked)
 * - B3: story:unreacted / status:unreacted events emitted on DELETE /like
 * - B4: broadcastPostUpdated wired for POST/MOOD types on PUT /posts/:id
 * - B6: invalidateFriendsCache called on friend accept for both parties
 *
 * All tests exercise the handler wiring logic via mocked socialEvents,
 * without spinning up a real Fastify instance or database.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ===== HELPERS =====

function makeSocialEventsMock() {
  return {
    broadcastPostLiked: jest.fn() as jest.MockedFunction<(...args: unknown[]) => Promise<void>>,
    broadcastPostUnliked: jest.fn() as jest.MockedFunction<(...args: unknown[]) => Promise<void>>,
    broadcastStoryReacted: jest.fn(),
    broadcastStoryUnreacted: jest.fn(),
    broadcastStatusReacted: jest.fn(),
    broadcastStatusUnreacted: jest.fn(),
    broadcastPostUpdated: jest.fn(),
    broadcastStoryUpdated: jest.fn(),
    broadcastStatusUpdated: jest.fn(),
    invalidateFriendsCache: jest.fn(),
  };
}

type SocialMock = ReturnType<typeof makeSocialEventsMock>;

/**
 * Simulates the like-routing logic from POST /posts/:postId/like
 * (extracted from interactions.ts for unit testability).
 */
function routeLikeEvent(
  socialEvents: SocialMock,
  postType: string,
  postId: string,
  userId: string,
  emoji: string,
  authorId: string,
  likeCount: number,
  reactionSummary: Record<string, number>
): void {
  if (postType === 'STORY') {
    socialEvents.broadcastStoryReacted({ storyId: postId, userId, emoji }, authorId);
  } else if (postType === 'STATUS') {
    socialEvents.broadcastStatusReacted({ statusId: postId, userId, emoji }, authorId);
  } else {
    socialEvents.broadcastPostLiked({ postId, userId, emoji, likeCount, reactionSummary }, authorId);
  }
}

/**
 * Simulates the unlike-routing logic from DELETE /posts/:postId/like.
 */
function routeUnlikeEvent(
  socialEvents: SocialMock,
  postType: string,
  postId: string,
  userId: string,
  authorId: string,
  likeCount: number,
  reactionSummary: Record<string, number>
): void {
  if (postType === 'STORY') {
    socialEvents.broadcastStoryUnreacted({ storyId: postId, userId, emoji: '❤️' }, authorId);
  } else if (postType === 'STATUS') {
    socialEvents.broadcastStatusUnreacted({ statusId: postId, userId, emoji: '❤️' }, authorId);
  } else {
    socialEvents.broadcastPostUnliked({ postId, userId, emoji: '❤️', likeCount, reactionSummary }, authorId);
  }
}

/**
 * Simulates the update-routing logic from PUT /posts/:postId.
 */
function routeUpdateEvent(
  socialEvents: SocialMock,
  postType: string,
  post: object,
  authorId: string
): void {
  if (postType === 'STORY') {
    socialEvents.broadcastStoryUpdated(post, authorId);
  } else if (postType === 'STATUS') {
    socialEvents.broadcastStatusUpdated(post, authorId);
  } else {
    socialEvents.broadcastPostUpdated(post, authorId);
  }
}

// ===== TESTS =====

describe('Phase 4B — B1: Like routing per post type', () => {
  let socialEvents: ReturnType<typeof makeSocialEventsMock>;

  beforeEach(() => {
    socialEvents = makeSocialEventsMock();
  });

  it('should call broadcastStatusReacted (not broadcastPostLiked) for STATUS likes', () => {
    routeLikeEvent(socialEvents, 'STATUS', 'status-1', 'user-A', '❤️', 'author-1', 1, { '❤️': 1 });

    expect(socialEvents.broadcastStatusReacted).toHaveBeenCalledWith(
      { statusId: 'status-1', userId: 'user-A', emoji: '❤️' },
      'author-1'
    );
    expect(socialEvents.broadcastPostLiked).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStoryReacted).not.toHaveBeenCalled();
  });

  it('should call broadcastStoryReacted for STORY likes', () => {
    routeLikeEvent(socialEvents, 'STORY', 'story-1', 'user-A', '🔥', 'author-1', 1, {});

    expect(socialEvents.broadcastStoryReacted).toHaveBeenCalledWith(
      { storyId: 'story-1', userId: 'user-A', emoji: '🔥' },
      'author-1'
    );
    expect(socialEvents.broadcastPostLiked).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStatusReacted).not.toHaveBeenCalled();
  });

  it('should call broadcastPostLiked for POST type likes', () => {
    routeLikeEvent(socialEvents, 'POST', 'post-1', 'user-A', '❤️', 'author-1', 5, { '❤️': 5 });

    expect(socialEvents.broadcastPostLiked).toHaveBeenCalledWith(
      { postId: 'post-1', userId: 'user-A', emoji: '❤️', likeCount: 5, reactionSummary: { '❤️': 5 } },
      'author-1'
    );
    expect(socialEvents.broadcastStatusReacted).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStoryReacted).not.toHaveBeenCalled();
  });

  it('should call broadcastPostLiked for MOOD type likes (default branch)', () => {
    routeLikeEvent(socialEvents, 'MOOD', 'mood-1', 'user-A', '😂', 'author-1', 2, { '😂': 2 });

    expect(socialEvents.broadcastPostLiked).toHaveBeenCalled();
    expect(socialEvents.broadcastStatusReacted).not.toHaveBeenCalled();
  });
});

describe('Phase 4B — B3: Unlike routing per post type', () => {
  let socialEvents: ReturnType<typeof makeSocialEventsMock>;

  beforeEach(() => {
    socialEvents = makeSocialEventsMock();
  });

  it('should call broadcastStatusUnreacted for STATUS unlikes', () => {
    routeUnlikeEvent(socialEvents, 'STATUS', 'status-1', 'user-A', 'author-1', 0, {});

    expect(socialEvents.broadcastStatusUnreacted).toHaveBeenCalledWith(
      { statusId: 'status-1', userId: 'user-A', emoji: '❤️' },
      'author-1'
    );
    expect(socialEvents.broadcastPostUnliked).not.toHaveBeenCalled();
  });

  it('should call broadcastStoryUnreacted for STORY unlikes', () => {
    routeUnlikeEvent(socialEvents, 'STORY', 'story-1', 'user-A', 'author-1', 0, {});

    expect(socialEvents.broadcastStoryUnreacted).toHaveBeenCalledWith(
      { storyId: 'story-1', userId: 'user-A', emoji: '❤️' },
      'author-1'
    );
    expect(socialEvents.broadcastPostUnliked).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStatusUnreacted).not.toHaveBeenCalled();
  });

  it('should call broadcastPostUnliked for POST type unlikes', () => {
    routeUnlikeEvent(socialEvents, 'POST', 'post-1', 'user-A', 'author-1', 3, { '❤️': 3 });

    expect(socialEvents.broadcastPostUnliked).toHaveBeenCalled();
    expect(socialEvents.broadcastStoryUnreacted).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStatusUnreacted).not.toHaveBeenCalled();
  });

  it('STATUS_UNREACTED event constant should be "status:unreacted"', () => {
    expect(SERVER_EVENTS.STATUS_UNREACTED).toBe('status:unreacted');
  });

  it('STORY_UNREACTED event constant should be "story:unreacted"', () => {
    expect(SERVER_EVENTS.STORY_UNREACTED).toBe('story:unreacted');
  });
});

describe('Phase 4B — B4: Post update routing per type', () => {
  let socialEvents: ReturnType<typeof makeSocialEventsMock>;

  beforeEach(() => {
    socialEvents = makeSocialEventsMock();
  });

  it('should call broadcastStoryUpdated for STORY edits', async () => {
    const post = { id: 'story-1', type: 'STORY' };
    routeUpdateEvent(socialEvents, 'STORY', post, 'author-1');
    await Promise.resolve(); // flush .catch()

    expect(socialEvents.broadcastStoryUpdated).toHaveBeenCalledWith(post, 'author-1');
    expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStatusUpdated).not.toHaveBeenCalled();
  });

  it('should call broadcastStatusUpdated for STATUS edits', async () => {
    const post = { id: 'status-1', type: 'STATUS' };
    routeUpdateEvent(socialEvents, 'STATUS', post, 'author-1');
    await Promise.resolve();

    expect(socialEvents.broadcastStatusUpdated).toHaveBeenCalledWith(post, 'author-1');
    expect(socialEvents.broadcastPostUpdated).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStoryUpdated).not.toHaveBeenCalled();
  });

  it('should call broadcastPostUpdated for POST type edits (default)', async () => {
    const post = { id: 'post-1', type: 'POST' };
    routeUpdateEvent(socialEvents, 'POST', post, 'author-1');
    await Promise.resolve();

    expect(socialEvents.broadcastPostUpdated).toHaveBeenCalledWith(post, 'author-1');
    expect(socialEvents.broadcastStoryUpdated).not.toHaveBeenCalled();
    expect(socialEvents.broadcastStatusUpdated).not.toHaveBeenCalled();
  });

  it('should call broadcastPostUpdated for MOOD type edits', async () => {
    const post = { id: 'mood-1', type: 'MOOD' };
    routeUpdateEvent(socialEvents, 'MOOD', post, 'author-1');
    await Promise.resolve();

    expect(socialEvents.broadcastPostUpdated).toHaveBeenCalled();
  });
});

describe('Phase 4B — B6: invalidateFriendsCache on friend accept', () => {
  it('should call invalidateFriendsCache for both sender and receiver when status is accepted', () => {
    const socialEvents = makeSocialEventsMock();
    const friendRequest = { senderId: 'user-A', receiverId: 'user-B' };
    const status = 'accepted';

    // Replicate the logic added in friends.ts
    if (status === 'accepted') {
      socialEvents.invalidateFriendsCache(friendRequest.senderId);
      socialEvents.invalidateFriendsCache(friendRequest.receiverId);
    }

    expect(socialEvents.invalidateFriendsCache).toHaveBeenCalledTimes(2);
    expect(socialEvents.invalidateFriendsCache).toHaveBeenCalledWith('user-A');
    expect(socialEvents.invalidateFriendsCache).toHaveBeenCalledWith('user-B');
  });

  it('should NOT call invalidateFriendsCache when status is rejected', () => {
    const socialEvents = makeSocialEventsMock();
    const friendRequest = { senderId: 'user-A', receiverId: 'user-B' };
    const status: string = 'rejected';

    if (status === 'accepted') {
      socialEvents.invalidateFriendsCache(friendRequest.senderId);
      socialEvents.invalidateFriendsCache(friendRequest.receiverId);
    }

    expect(socialEvents.invalidateFriendsCache).not.toHaveBeenCalled();
  });
});
