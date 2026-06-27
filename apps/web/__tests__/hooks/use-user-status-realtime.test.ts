/**
 * Tests for hooks/use-user-status-realtime.ts
 */

const mockOnUserStatus = jest.fn();
const mockOnPresenceSnapshot = jest.fn();
const mockGetSocket = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  getSocketIOService: () => ({
    onUserStatus: (...args: unknown[]) => mockOnUserStatus(...args),
    onPresenceSnapshot: (...args: unknown[]) => mockOnPresenceSnapshot(...args),
    getSocket: () => mockGetSocket(),
  }),
}));

const mockUpdateUserStatus = jest.fn();
const mockMergeParticipants = jest.fn();
const mockTriggerStatusTick = jest.fn();
const mockGetState = jest.fn();

jest.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    updateUserStatus: mockUpdateUserStatus,
    mergeParticipants: mockMergeParticipants,
    triggerStatusTick: mockTriggerStatusTick,
  }),
}));

// Attach getState to the useUserStore mock (used outside hook render)
const mockUserStoreModule = require('@/stores/user-store');
mockUserStoreModule.useUserStore.getState = mockGetState;

const mockBuildApiUrl = jest.fn((path: string) => `https://api.test${path}`);
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => mockBuildApiUrl(path),
}));

const mockGetAuthToken = jest.fn();
jest.mock('@/utils/token-utils', () => ({
  getAuthToken: () => mockGetAuthToken(),
}));

import { renderHook, act } from '@testing-library/react';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

// ─── Test setup ───────────────────────────────────────────────────────────────

const mockUnsubscribeStatus = jest.fn();
const mockUnsubscribeSnapshot = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  mockOnUserStatus.mockReturnValue(mockUnsubscribeStatus);
  mockOnPresenceSnapshot.mockReturnValue(mockUnsubscribeSnapshot);
  mockGetSocket.mockReturnValue(null);
  mockGetState.mockReturnValue({ usersMap: new Map() });

  // Default auth token
  mockGetAuthToken.mockReturnValue({
    header: { name: 'Authorization', value: 'Bearer test-token' },
  });

  // Default fetch mock
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ success: true, data: { users: [] } }),
  } as unknown as Response);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Socket event subscriptions ──────────────────────────────────────────────

describe('socket subscriptions', () => {
  it('subscribes to user status events on mount', () => {
    renderHook(() => useUserStatusRealtime());
    expect(mockOnUserStatus).toHaveBeenCalledWith(expect.any(Function));
  });

  it('subscribes to presence snapshot events on mount', () => {
    renderHook(() => useUserStatusRealtime());
    expect(mockOnPresenceSnapshot).toHaveBeenCalledWith(expect.any(Function));
  });

  it('calls updateUserStatus when USER_STATUS event fires', () => {
    renderHook(() => useUserStatusRealtime());

    const statusHandler = mockOnUserStatus.mock.calls[0][0];
    act(() => {
      statusHandler({
        userId: 'u1',
        isOnline: true,
        lastActiveAt: '2024-01-01T00:00:00Z',
        username: 'alice',
      });
    });

    expect(mockUpdateUserStatus).toHaveBeenCalledWith('u1', {
      isOnline: true,
      lastActiveAt: expect.any(Date),
      username: 'alice',
    });
  });

  it('passes undefined for lastActiveAt when not provided', () => {
    renderHook(() => useUserStatusRealtime());

    const statusHandler = mockOnUserStatus.mock.calls[0][0];
    act(() => {
      statusHandler({ userId: 'u2', isOnline: false, username: 'bob' });
    });

    expect(mockUpdateUserStatus).toHaveBeenCalledWith('u2', {
      isOnline: false,
      lastActiveAt: undefined,
      username: 'bob',
    });
  });

  it('calls mergeParticipants when PRESENCE_SNAPSHOT fires', () => {
    renderHook(() => useUserStatusRealtime());

    const snapshotHandler = mockOnPresenceSnapshot.mock.calls[0][0];
    act(() => {
      snapshotHandler({
        users: [
          { userId: 'u1', username: 'alice', isOnline: true, lastActiveAt: null },
        ],
      });
    });

    expect(mockMergeParticipants).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'u1', username: 'alice', isOnline: true }),
      ])
    );
  });

  it('does not call mergeParticipants for empty presence snapshot', () => {
    renderHook(() => useUserStatusRealtime());

    const snapshotHandler = mockOnPresenceSnapshot.mock.calls[0][0];
    act(() => { snapshotHandler({ users: [] }); });
    expect(mockMergeParticipants).not.toHaveBeenCalled();
  });

  it('does not call mergeParticipants for null event', () => {
    renderHook(() => useUserStatusRealtime());

    const snapshotHandler = mockOnPresenceSnapshot.mock.calls[0][0];
    act(() => { snapshotHandler(null); });
    expect(mockMergeParticipants).not.toHaveBeenCalled();
  });
});

// ─── Intervals ────────────────────────────────────────────────────────────────

describe('status tick interval', () => {
  it('calls triggerStatusTick every 60 seconds', () => {
    renderHook(() => useUserStatusRealtime());
    expect(mockTriggerStatusTick).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(60_000); });
    expect(mockTriggerStatusTick).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(60_000); });
    expect(mockTriggerStatusTick).toHaveBeenCalledTimes(2);
  });
});

describe('heartbeat interval', () => {
  it('emits heartbeat every 90 seconds when socket is connected', () => {
    const mockEmit = jest.fn();
    mockGetSocket.mockReturnValue({ connected: true, emit: mockEmit });
    renderHook(() => useUserStatusRealtime());

    act(() => { jest.advanceTimersByTime(90_000); });
    expect(mockEmit).toHaveBeenCalledWith('heartbeat');
  });

  it('does not emit heartbeat when socket is not connected', () => {
    const mockEmit = jest.fn();
    mockGetSocket.mockReturnValue({ connected: false, emit: mockEmit });
    renderHook(() => useUserStatusRealtime());

    act(() => { jest.advanceTimersByTime(90_000); });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('does not emit heartbeat when socket is null', () => {
    mockGetSocket.mockReturnValue(null);
    renderHook(() => useUserStatusRealtime());

    act(() => { jest.advanceTimersByTime(90_000); });
    // No throw expected
  });
});

// ─── Cleanup on unmount ───────────────────────────────────────────────────────

describe('cleanup on unmount', () => {
  it('calls unsubscribe for status and snapshot on unmount', () => {
    const { unmount } = renderHook(() => useUserStatusRealtime());
    unmount();
    expect(mockUnsubscribeStatus).toHaveBeenCalled();
    expect(mockUnsubscribeSnapshot).toHaveBeenCalled();
  });

  it('clears status tick interval on unmount', () => {
    const { unmount } = renderHook(() => useUserStatusRealtime());
    unmount();
    // After unmount, advancing timers should not call triggerStatusTick
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(mockTriggerStatusTick).not.toHaveBeenCalled();
  });

  it('clears heartbeat interval on unmount', () => {
    const mockEmit = jest.fn();
    mockGetSocket.mockReturnValue({ connected: true, emit: mockEmit });
    const { unmount } = renderHook(() => useUserStatusRealtime());
    unmount();
    act(() => { jest.advanceTimersByTime(90_000); });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

// ─── Focus / online resync ────────────────────────────────────────────────────

describe('focus/online resync', () => {
  it('adds focus event listener on mount', () => {
    const spy = jest.spyOn(window, 'addEventListener');
    renderHook(() => useUserStatusRealtime());
    expect(spy).toHaveBeenCalledWith('focus', expect.any(Function));
    spy.mockRestore();
  });

  it('adds online event listener on mount', () => {
    const spy = jest.spyOn(window, 'addEventListener');
    renderHook(() => useUserStatusRealtime());
    expect(spy).toHaveBeenCalledWith('online', expect.any(Function));
    spy.mockRestore();
  });

  it('removes event listeners on unmount', () => {
    const spy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useUserStatusRealtime());
    unmount();
    expect(spy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('online', expect.any(Function));
    spy.mockRestore();
  });

  it('triggers resync on focus when users are present', async () => {
    mockGetState.mockReturnValue({
      usersMap: new Map([['u1', {}], ['u2', {}]]),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: { users: [{ userId: 'u1', isOnline: true }] },
      }),
    } as unknown as Response);

    const eventHandlers: Record<string, EventListenerOrEventListenerObject> = {};
    jest.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        eventHandlers[type] = handler;
      }
    );

    renderHook(() => useUserStatusRealtime());
    // Advance time to bypass debounce
    act(() => { jest.advanceTimersByTime(2000); });

    await act(async () => {
      (eventHandlers['focus'] as EventListener)(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve(); // flush microtasks
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/presence'),
      expect.objectContaining({ method: 'GET' })
    );
    jest.restoreAllMocks();
  });

  it('does not resync when no auth token', async () => {
    mockGetAuthToken.mockReturnValue(null);
    mockGetState.mockReturnValue({
      usersMap: new Map([['u1', {}]]),
    });

    const eventHandlers: Record<string, EventListenerOrEventListenerObject> = {};
    jest.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        eventHandlers[type] = handler;
      }
    );

    renderHook(() => useUserStatusRealtime());

    await act(async () => {
      (eventHandlers['focus'] as EventListener)(new Event('focus'));
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('does not resync when usersMap is empty', async () => {
    mockGetState.mockReturnValue({ usersMap: new Map() });

    const eventHandlers: Record<string, EventListenerOrEventListenerObject> = {};
    jest.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        eventHandlers[type] = handler;
      }
    );

    renderHook(() => useUserStatusRealtime());

    await act(async () => {
      (eventHandlers['focus'] as EventListener)(new Event('focus'));
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('updates status from resync response', async () => {
    mockGetState.mockReturnValue({
      usersMap: new Map([['u1', {}]]),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          users: [
            { userId: 'u1', isOnline: true, lastActiveAt: '2024-01-01T00:00:00Z' },
          ],
        },
      }),
    } as unknown as Response);

    const eventHandlers: Record<string, EventListenerOrEventListenerObject> = {};
    jest.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        eventHandlers[type] = handler;
      }
    );

    renderHook(() => useUserStatusRealtime());

    await act(async () => {
      (eventHandlers['focus'] as EventListener)(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUpdateUserStatus).toHaveBeenCalledWith('u1', {
      isOnline: true,
      lastActiveAt: expect.any(Date),
    });
    jest.restoreAllMocks();
  });
});
