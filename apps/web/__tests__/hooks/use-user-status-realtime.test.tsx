/**
 * Tests for useUserStatusRealtime hook
 *
 * Tests cover:
 * - Socket.IO event subscription
 * - User status update handling
 * - Store integration
 * - Cleanup on unmount
 */

import { renderHook } from '@testing-library/react';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

// Mock Socket.IO service
const mockOnUserStatus = jest.fn(() => jest.fn());

jest.mock('@/services/meeshy-socketio.service', () => ({
  getSocketIOService: () => ({
    onUserStatus: (callback: any) => mockOnUserStatus(callback),
  }),
}));

// Mock user store
const mockUpdateUserStatus = jest.fn();

jest.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (state: any) => any) => {
    const state = {
      updateUserStatus: mockUpdateUserStatus,
    };
    return selector(state);
  },
}));

describe('useUserStatusRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
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
    it('should call updateUserStatus when event received', () => {
      let eventCallback: (event: any) => void = () => {};

      mockOnUserStatus.mockImplementation((callback) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      // Simulate receiving a user status event
      eventCallback({
        userId: 'user-123',
        isOnline: true,
        username: 'testuser',
        lastActiveAt: '2024-01-15T10:00:00Z',
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledWith('user-123', {
        isOnline: true,
        lastActiveAt: expect.any(Date),
      });
    });

    it('should handle user going offline', () => {
      let eventCallback: (event: any) => void = () => {};

      mockOnUserStatus.mockImplementation((callback) => {
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
      });
    });

    it('should handle undefined lastActiveAt', () => {
      let eventCallback: (event: any) => void = () => {};

      mockOnUserStatus.mockImplementation((callback) => {
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
      });
    });

    it('should convert lastActiveAt string to Date', () => {
      let eventCallback: (event: any) => void = () => {};

      mockOnUserStatus.mockImplementation((callback) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      const timestamp = '2024-01-15T10:30:00Z';
      eventCallback({
        userId: 'user-456',
        isOnline: true,
        username: 'anotheruser',
        lastActiveAt: timestamp,
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledWith('user-456', {
        isOnline: true,
        lastActiveAt: new Date(timestamp),
      });
    });
  });

  describe('Multiple Events', () => {
    it('should handle multiple status updates', () => {
      let eventCallback: (event: any) => void = () => {};

      mockOnUserStatus.mockImplementation((callback) => {
        eventCallback = callback;
        return jest.fn();
      });

      renderHook(() => useUserStatusRealtime());

      // First event
      eventCallback({
        userId: 'user-1',
        isOnline: true,
        username: 'user1',
      });

      // Second event
      eventCallback({
        userId: 'user-2',
        isOnline: false,
        username: 'user2',
        lastActiveAt: '2024-01-15T09:00:00Z',
      });

      expect(mockUpdateUserStatus).toHaveBeenCalledTimes(2);
      expect(mockUpdateUserStatus).toHaveBeenNthCalledWith(1, 'user-1', {
        isOnline: true,
        lastActiveAt: undefined,
      });
      expect(mockUpdateUserStatus).toHaveBeenNthCalledWith(2, 'user-2', {
        isOnline: false,
        lastActiveAt: expect.any(Date),
      });
    });
  });

  describe('Rerender Stability', () => {
    it('should not resubscribe on rerender', () => {
      const { rerender } = renderHook(() => useUserStatusRealtime());

      expect(mockOnUserStatus).toHaveBeenCalledTimes(1);

      rerender();

      // Should still be called only once
      expect(mockOnUserStatus).toHaveBeenCalledTimes(1);
    });
  });
});
