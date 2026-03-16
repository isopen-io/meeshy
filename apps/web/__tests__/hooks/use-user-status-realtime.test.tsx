/**
 * Tests for useUserStatusRealtime hook
 */

import { renderHook } from '@testing-library/react';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

const mockOnUserStatus = jest.fn(() => jest.fn());
const mockGetSocket = jest.fn(() => ({ connected: true, emit: jest.fn() }));

jest.mock('@/services/meeshy-socketio.service', () => ({
  getSocketIOService: () => ({
    onUserStatus: (...args: any[]) => (mockOnUserStatus as any)(...args),
    getSocket: () => mockGetSocket(),
  }),
}));

const mockUpdateUserStatus = jest.fn();
const mockTriggerStatusTick = jest.fn();

jest.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (state: any) => any) => {
    const state = {
      updateUserStatus: mockUpdateUserStatus,
      triggerStatusTick: mockTriggerStatusTick,
    };
    return selector(state);
  },
}));

describe('useUserStatusRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
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

    it('should unsubscribe on unmount', () => {
      const mockUnsubscribe = jest.fn();
      mockOnUserStatus.mockReturnValue(mockUnsubscribe);

      const { unmount } = renderHook(() => useUserStatusRealtime());
      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
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
