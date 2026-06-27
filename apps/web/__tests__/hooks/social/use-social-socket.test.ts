/**
 * Tests for hooks/social/use-social-socket.ts
 */

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  CLIENT_EVENTS: {
    FEED_SUBSCRIBE: 'feed:subscribe',
    FEED_UNSUBSCRIBE: 'feed:unsubscribe',
  },
  SERVER_EVENTS: {
    POST_CREATED: 'post:created',
    POST_UPDATED: 'post:updated',
    POST_DELETED: 'post:deleted',
    POST_LIKED: 'post:liked',
    POST_UNLIKED: 'post:unliked',
    POST_REPOSTED: 'post:reposted',
    POST_BOOKMARKED: 'post:bookmarked',
    STORY_CREATED: 'story:created',
    STORY_VIEWED: 'story:viewed',
    STORY_REACTED: 'story:reacted',
    STATUS_CREATED: 'status:created',
    STATUS_UPDATED: 'status:updated',
    STATUS_DELETED: 'status:deleted',
    STATUS_REACTED: 'status:reacted',
    COMMENT_ADDED: 'comment:added',
    COMMENT_DELETED: 'comment:deleted',
    COMMENT_LIKED: 'comment:liked',
    POST_TRANSLATION_UPDATED: 'post:translation-updated',
    COMMENT_TRANSLATION_UPDATED: 'comment:translation-updated',
    STORY_TRANSLATION_UPDATED: 'story:translation-updated',
  },
}));

import { renderHook } from '@testing-library/react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useSocialSocket } from '@/hooks/social/use-social-socket';

const makeMockSocket = () => ({
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
});

let mockSocket: ReturnType<typeof makeMockSocket>;

beforeEach(() => {
  mockSocket = makeMockSocket();
  (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(mockSocket);
});

// ─── enabled guard ────────────────────────────────────────────────────────────

describe('enabled guard', () => {
  it('does not subscribe when enabled=false', () => {
    renderHook(() => useSocialSocket({ enabled: false }));
    expect(mockSocket.emit).not.toHaveBeenCalled();
    expect(mockSocket.on).not.toHaveBeenCalled();
  });

  it('does not subscribe when socket is null', () => {
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(null);
    renderHook(() => useSocialSocket());
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('enables by default', () => {
    renderHook(() => useSocialSocket());
    expect(mockSocket.emit).toHaveBeenCalledWith('feed:subscribe');
  });
});

// ─── mount / unmount ─────────────────────────────────────────────────────────

describe('lifecycle', () => {
  it('emits feed:subscribe on mount', () => {
    renderHook(() => useSocialSocket());
    expect(mockSocket.emit).toHaveBeenCalledWith('feed:subscribe');
  });

  it('emits feed:unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useSocialSocket());
    unmount();
    expect(mockSocket.emit).toHaveBeenCalledWith('feed:unsubscribe');
  });

  it('registers listeners for all known events on mount', () => {
    renderHook(() => useSocialSocket());
    const registeredEvents = mockSocket.on.mock.calls.map((c) => c[0]);
    expect(registeredEvents).toContain('post:created');
    expect(registeredEvents).toContain('post:liked');
    expect(registeredEvents).toContain('story:created');
    expect(registeredEvents).toContain('comment:added');
    expect(registeredEvents).toContain('status:created');
    expect(registeredEvents).toContain('post:translation-updated');
  });

  it('removes all listeners on unmount', () => {
    const { unmount } = renderHook(() => useSocialSocket());
    const onCount = mockSocket.on.mock.calls.length;
    unmount();
    expect(mockSocket.off.mock.calls.length).toBe(onCount);
  });
});

// ─── event delegation ────────────────────────────────────────────────────────

describe('event delegation', () => {
  it('calls onPostCreated when post:created fires', () => {
    const onPostCreated = jest.fn();
    renderHook(() => useSocialSocket({ onPostCreated }));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'post:created')?.[1];
    handler?.({ postId: 'p1' });
    expect(onPostCreated).toHaveBeenCalledWith({ postId: 'p1' });
  });

  it('calls onPostDeleted when post:deleted fires', () => {
    const onPostDeleted = jest.fn();
    renderHook(() => useSocialSocket({ onPostDeleted }));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'post:deleted')?.[1];
    handler?.({ postId: 'p2' });
    expect(onPostDeleted).toHaveBeenCalledWith({ postId: 'p2' });
  });

  it('calls onCommentAdded when comment:added fires', () => {
    const onCommentAdded = jest.fn();
    renderHook(() => useSocialSocket({ onCommentAdded }));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'comment:added')?.[1];
    handler?.({ commentId: 'c1' });
    expect(onCommentAdded).toHaveBeenCalledWith({ commentId: 'c1' });
  });

  it('calls onStatusCreated when status:created fires', () => {
    const onStatusCreated = jest.fn();
    renderHook(() => useSocialSocket({ onStatusCreated }));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'status:created')?.[1];
    handler?.({ statusId: 's1' });
    expect(onStatusCreated).toHaveBeenCalledWith({ statusId: 's1' });
  });

  it('calls onPostTranslationUpdated when translation event fires', () => {
    const onPostTranslationUpdated = jest.fn();
    renderHook(() => useSocialSocket({ onPostTranslationUpdated }));
    const handler = mockSocket.on.mock.calls.find(
      (c) => c[0] === 'post:translation-updated'
    )?.[1];
    handler?.({ postId: 'p3', lang: 'fr' });
    expect(onPostTranslationUpdated).toHaveBeenCalledWith({ postId: 'p3', lang: 'fr' });
  });

  it('does not throw when callback is undefined', () => {
    renderHook(() => useSocialSocket({}));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'post:created')?.[1];
    expect(() => handler?.({ postId: 'p1' })).not.toThrow();
  });
});
