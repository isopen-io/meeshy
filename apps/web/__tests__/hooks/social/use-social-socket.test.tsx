/**
 * Tests for hooks/social/use-social-socket.ts
 *
 * `useSocialSocket` joins the caller's `feed:{userId}` room so the gateway's
 * post/story/status/comment broadcasts reach the client. Room membership
 * lives on the transient server-side socket, so it must be re-established
 * whenever the underlying transport reconnects (dropped connection, JWT
 * refresh forcing a reconnect, etc.) even though the hook itself never
 * unmounts across that event.
 */

import { act, renderHook } from '@testing-library/react';
import { useSocialSocket } from '@/hooks/social/use-social-socket';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Socket mock
// ---------------------------------------------------------------------------

const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();
const mockSocketEmit = jest.fn();

type MockSocket = {
  on: typeof mockSocketOn;
  off: typeof mockSocketOff;
  emit: typeof mockSocketEmit;
  connected: boolean;
};

let mockSocket: MockSocket | null = {
  on: mockSocketOn,
  off: mockSocketOff,
  emit: mockSocketEmit,
  connected: true,
};

const mockStatusListeners = new Set<() => void>();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocket,
    onStatusChange: (cb: () => void) => {
      mockStatusListeners.add(cb);
      return () => mockStatusListeners.delete(cb);
    },
  },
}));

function emitStatusChange() {
  mockStatusListeners.forEach(cb => cb());
}

function resetSocket() {
  mockSocketOn.mockReset();
  mockSocketOff.mockReset();
  mockSocketEmit.mockReset();
  mockStatusListeners.clear();
  mockSocket = {
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
    connected: true,
  };
}

beforeEach(resetSocket);

function connectHandler(): (() => void) | undefined {
  return mockSocketOn.mock.calls.find(([event]) => event === 'connect')?.[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSocialSocket', () => {
  it('emits feed:subscribe on mount', () => {
    renderHook(() => useSocialSocket());
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.FEED_SUBSCRIBE);
  });

  it('emits feed:unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useSocialSocket());
    mockSocketEmit.mockClear();
    unmount();
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.FEED_UNSUBSCRIBE);
  });

  it('does nothing when disabled', () => {
    renderHook(() => useSocialSocket({ enabled: false }));
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('re-emits feed:subscribe when the socket reconnects', () => {
    renderHook(() => useSocialSocket());

    const handler = connectHandler();
    expect(handler).toBeDefined();

    mockSocketEmit.mockClear();
    handler!();
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.FEED_SUBSCRIBE);
  });

  it('detaches the reconnect listener on unmount', () => {
    const { unmount } = renderHook(() => useSocialSocket());
    unmount();
    expect(mockSocketOff).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('does not throw when there is no socket', () => {
    mockSocket = null;
    expect(() => renderHook(() => useSocialSocket())).not.toThrow();
  });

  it('subscribes once the socket becomes available after mounting with none (deep-link into a feed route)', () => {
    mockSocket = null;
    renderHook(() => useSocialSocket());
    expect(mockSocketEmit).not.toHaveBeenCalled();

    // Some other code path (e.g. a conversation route) bootstraps the
    // connection later in the same session.
    mockSocket = { on: mockSocketOn, off: mockSocketOff, emit: mockSocketEmit, connected: true };
    act(() => emitStatusChange());

    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.FEED_SUBSCRIBE);
  });

  it('does not resubscribe on every status change once a socket was already picked up', () => {
    renderHook(() => useSocialSocket());
    mockSocketEmit.mockClear();

    act(() => emitStatusChange());
    act(() => emitStatusChange());

    expect(mockSocketEmit).not.toHaveBeenCalledWith(CLIENT_EVENTS.FEED_SUBSCRIBE);
  });

  it('still delegates post events to the latest callback after a reconnect re-subscribe', () => {
    const onPostCreated = jest.fn();
    renderHook(() => useSocialSocket({ onPostCreated }));

    const handler = connectHandler();
    handler!();

    const postCreatedListener = mockSocketOn.mock.calls.find(
      ([event]) => event === SERVER_EVENTS.POST_CREATED
    )?.[1];
    expect(postCreatedListener).toBeDefined();

    const payload = { postId: 'post-1' } as any;
    postCreatedListener!(payload);
    expect(onPostCreated).toHaveBeenCalledWith(payload);
  });
});
