/**
 * Tests for useUserStatusRealtime hook
 */

import { renderHook, act } from '@testing-library/react';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { getUserStatus } from '@/lib/user-status';

const mockOnUserStatus = jest.fn(() => jest.fn());
const mockOnPresenceSnapshot = jest.fn(() => jest.fn());
const mockGetSocket = jest.fn(() => ({ connected: true, emit: jest.fn() }));

jest.mock('@/services/meeshy-socketio.service', () => ({
  getSocketIOService: () => ({
    onUserStatus: (...args: unknown[]) => (mockOnUserStatus as (...a: unknown[]) => unknown)(...args),
    onPresenceSnapshot: (...args: unknown[]) => (mockOnPresenceSnapshot as (...a: unknown[]) => unknown)(...args),
    getSocket: () => mockGetSocket(),
  }),
}));

const mockUpdateUserStatus = jest.fn();
const mockTriggerStatusTick = jest.fn();
const mockMergeParticipants = jest.fn();
const mockUsersMap = new Map<string, { id: string }>();

const userStoreState = {
  updateUserStatus: mockUpdateUserStatus,
  triggerStatusTick: mockTriggerStatusTick,
  mergeParticipants: mockMergeParticipants,
  usersMap: mockUsersMap,
};

type Selector<T> = (state: typeof userStoreState) => T;

const useUserStoreMock = Object.assign(
  (selector: Selector<unknown>) => selector(userStoreState),
  { getState: () => userStoreState }
);

jest.mock('@/stores/user-store', () => ({
  get useUserStore() { return useUserStoreMock; },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost:3000/api/v1${endpoint}`,
}));

jest.mock('@/utils/token-utils', () => ({
  getAuthToken: () => ({
    value: 'test-token',
    type: 'auth' as const,
    header: { name: 'Authorization', value: 'Bearer test-token' },
  }),
}));

describe('useUserStatusRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockUsersMap.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Event Subscription', () => {
    it('should subscribe to user status events on mount', () => {
      renderHook(() => useUserStatusRealtime());
      expect(mockOnUserStatus).toHaveBeenCalled();
    });

    it('should subscribe to presence snapshot events on mount', () => {
      renderHook(() => useUserStatusRealtime());
      expect(mockOnPresenceSnapshot).toHaveBeenCalled();
    });

    it('should unsubscribe on unmount', () => {
      const mockUnsubscribe = jest.fn();
      const mockUnsubscribeSnapshot = jest.fn();
      mockOnUserStatus.mockReturnValue(mockUnsubscribe);
      mockOnPresenceSnapshot.mockReturnValue(mockUnsubscribeSnapshot);

      const { unmount } = renderHook(() => useUserStatusRealtime());
      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
      expect(mockUnsubscribeSnapshot).toHaveBeenCalled();
    });
  });

  describe('Status Update Handling', () => {
    it('should call updateUserStatus with username when event received', () => {
      let eventCallback: (event: any) => void = () => {};

      (mockOnUserStatus as any).mockImplementation((callback: any) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      eventCallback({
        userId: 'user-123',
        isOnline: true,
        username: 'testuser',
        lastActiveAt: '2024-01-15T10:00:00Z',
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledWith('user-123', {
        isOnline: true,
        lastActiveAt: expect.any(Date),
        username: 'testuser',
      });
    });

    it('should handle user going offline', () => {
      let eventCallback: (event: any) => void = () => {};

      (mockOnUserStatus as any).mockImplementation((callback: any) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      eventCallback({
        userId: 'user-123',
        isOnline: false,
        username: 'testuser',
        lastActiveAt: '2024-01-15T10:00:00Z',
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledWith('user-123', {
        isOnline: false,
        lastActiveAt: expect.any(Date),
        username: 'testuser',
      });
    });

    it('should handle undefined lastActiveAt', () => {
      let eventCallback: (event: any) => void = () => {};

      (mockOnUserStatus as any).mockImplementation((callback: any) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      eventCallback({
        userId: 'user-123',
        isOnline: true,
        username: 'testuser',
        lastActiveAt: undefined,
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledWith('user-123', {
        isOnline: true,
        lastActiveAt: undefined,
        username: 'testuser',
      });
    });
  });

  describe('Multiple Events', () => {
    it('should handle multiple status updates', () => {
      let eventCallback: (event: any) => void = () => {};

      (mockOnUserStatus as any).mockImplementation((callback: any) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      eventCallback({ userId: 'user-1', isOnline: true, username: 'user1' });
      eventCallback({ userId: 'user-2', isOnline: false, username: 'user2', lastActiveAt: '2024-01-15T09:00:00Z' });

      expect(mockUpdateUserStatus).toHaveBeenCalledTimes(2);
      expect(mockUpdateUserStatus).toHaveBeenNthCalledWith(1, 'user-1', {
        isOnline: true,
        lastActiveAt: undefined,
        username: 'user1',
      });
      expect(mockUpdateUserStatus).toHaveBeenNthCalledWith(2, 'user-2', {
        isOnline: false,
        lastActiveAt: expect.any(Date),
        username: 'user2',
      });
    });
  });

  describe('Presence Snapshot', () => {
    it('should bulk-merge participants when snapshot received', () => {
      let snapshotCallback: (event: any) => void = () => {};

      (mockOnPresenceSnapshot as any).mockImplementation((callback: any) => {
        snapshotCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      snapshotCallback({
        users: [
          { userId: 'u1', username: 'alice', isOnline: true, lastActiveAt: '2024-01-15T10:00:00Z' },
          { userId: 'u2', username: 'bob', isOnline: false, lastActiveAt: null },
        ],
      });

      expect(mockMergeParticipants).toHaveBeenCalledTimes(1);
      const merged = (mockMergeParticipants.mock.calls[0] as unknown as [Array<{ id: string; username: string; isOnline: boolean }>])[0];
      expect(merged).toHaveLength(2);
      expect(merged[0]).toMatchObject({ id: 'u1', username: 'alice', isOnline: true });
      expect(merged[1]).toMatchObject({ id: 'u2', username: 'bob', isOnline: false });
    });

    it('should not fabricate a "now" lastActiveAt for a snapshot user with null lastActiveAt', () => {
      let snapshotCallback: (event: any) => void = () => {};

      (mockOnPresenceSnapshot as any).mockImplementation((callback: any) => {
        snapshotCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      // Gateway nulls lastActiveAt for offline contacts who hide "last seen"
      // (MeeshySocketIOManager _applyPresencePrefs). A missing timestamp must
      // NOT be substituted with Date.now(), otherwise getUserStatus decays to
      // 'online' and paints an orange pulsing dot for an offline user.
      snapshotCallback({
        users: [{ userId: 'u3', username: 'carol', isOnline: false, lastActiveAt: null }],
      });

      const merged = (mockMergeParticipants.mock.calls[0] as unknown as [Array<any>])[0];
      expect(merged[0].lastActiveAt).toBeUndefined();
      expect(getUserStatus(merged[0])).toBe('offline');
    });

    it('should ignore empty snapshots', () => {
      let snapshotCallback: (event: any) => void = () => {};

      (mockOnPresenceSnapshot as any).mockImplementation((callback: any) => {
        snapshotCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      snapshotCallback({ users: [] });
      expect(mockMergeParticipants).not.toHaveBeenCalled();
    });
  });

  describe('Resync on focus', () => {
    it('should fetch /users/presence when window gains focus', async () => {
      mockUsersMap.set('u1', { id: 'u1' });
      mockUsersMap.set('u2', { id: 'u2' });

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            users: [
              { userId: 'u1', isOnline: true, lastActiveAt: '2024-01-15T10:00:00Z' },
              { userId: 'u2', isOnline: false, lastActiveAt: null },
            ],
          },
        }),
      });
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      renderHook(() => useUserStatusRealtime());

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toContain('/users/presence?ids=');
      expect(calledUrl).toContain('u1');
      expect(calledUrl).toContain('u2');
      expect((calledInit.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    });

    it('should skip fetch when store is empty', async () => {
      const fetchMock = jest.fn();
      (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

      renderHook(() => useUserStatusRealtime());

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
        await Promise.resolve();
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat every 90s', () => {
      const mockEmit = jest.fn();
      mockGetSocket.mockReturnValue({ connected: true, emit: mockEmit });

      renderHook(() => useUserStatusRealtime());

      jest.advanceTimersByTime(90_000);
      expect(mockEmit).toHaveBeenCalledWith('heartbeat');
    });
  });

  describe('Status Tick', () => {
    it('should trigger status tick every 60s', () => {
      renderHook(() => useUserStatusRealtime());

      jest.advanceTimersByTime(60_000);
      expect(mockTriggerStatusTick).toHaveBeenCalled();
    });
  });
});
