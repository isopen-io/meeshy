/**
 * Tests for hooks/social/use-post-room.ts
 *
 * The post room (`post:${postId}`) is where the gateway broadcasts
 * content-scoped social events (new comments, detailed emoji reactions,
 * story/status reactions) to viewers who are NOT friends of the author.
 * Without joining it, a web viewer of a public post / reel / story never
 * receives those events in real time. iOS already joins via `post:join`;
 * this hook brings the web client to parity.
 */

import { renderHook } from '@testing-library/react';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

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

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockSocket,
  },
}));

function resetSocket() {
  mockSocketOn.mockReset();
  mockSocketOff.mockReset();
  mockSocketEmit.mockReset();
  mockSocket = {
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
    connected: true,
  };
}

beforeEach(resetSocket);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePostRoom', () => {
  it('emits post:join with the postId on mount', () => {
    renderHook(() => usePostRoom('post-1'));
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.JOIN_POST, { postId: 'post-1' });
  });

  it('emits post:leave with the postId on unmount', () => {
    const { unmount } = renderHook(() => usePostRoom('post-1'));
    mockSocketEmit.mockClear();
    unmount();
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.LEAVE_POST, { postId: 'post-1' });
  });

  it('does nothing when postId is null or undefined', () => {
    renderHook(() => usePostRoom(null));
    renderHook(() => usePostRoom(undefined));
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    renderHook(() => usePostRoom('post-1', { enabled: false }));
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('leaves the old room and joins the new one when postId changes', () => {
    const { rerender } = renderHook(({ id }: { id: string }) => usePostRoom(id), {
      initialProps: { id: 'post-1' },
    });
    mockSocketEmit.mockClear();

    rerender({ id: 'post-2' });

    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.LEAVE_POST, { postId: 'post-1' });
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.JOIN_POST, { postId: 'post-2' });
  });

  it('re-emits post:join when the socket reconnects', () => {
    renderHook(() => usePostRoom('post-1'));

    const connectHandler = mockSocketOn.mock.calls.find(([event]) => event === 'connect')?.[1];
    expect(connectHandler).toBeDefined();

    mockSocketEmit.mockClear();
    connectHandler();
    expect(mockSocketEmit).toHaveBeenCalledWith(CLIENT_EVENTS.JOIN_POST, { postId: 'post-1' });
  });

  it('detaches the reconnect listener on unmount', () => {
    const { unmount } = renderHook(() => usePostRoom('post-1'));
    unmount();
    expect(mockSocketOff).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('does not throw when there is no socket', () => {
    mockSocket = null;
    expect(() => renderHook(() => usePostRoom('post-1'))).not.toThrow();
  });
});
