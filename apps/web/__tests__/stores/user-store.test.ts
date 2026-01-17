/**
 * User Store Tests
 * Tests for user status state management with Zustand
 */

import { act } from '@testing-library/react';
import { useUserStore, UserStatusUpdate } from '../../stores/user-store';
import type { User } from '@/types';

describe('UserStore', () => {
  const createMockUser = (overrides: Partial<User> = {}): User => ({
    id: `user-${Date.now()}-${Math.random()}`,
    username: 'testuser',
    email: 'test@example.com',
    phoneNumber: '+1234567890',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    avatar: null,
    role: 'USER',
    systemLanguage: 'en',
    regionalLanguage: 'en',
    isOnline: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockUser1: User = createMockUser({
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
    isOnline: true,
  });

  const mockUser2: User = createMockUser({
    id: 'user-2',
    username: 'jane',
    displayName: 'Jane Doe',
    isOnline: false,
  });

  const mockUser3: User = createMockUser({
    id: 'user-3',
    username: 'bob',
    displayName: 'Bob Smith',
    isOnline: true,
  });

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useUserStore.setState({
        usersMap: new Map(),
        participants: [],
        _lastStatusUpdate: 0,
      });
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useUserStore.getState();

      expect(state.usersMap.size).toBe(0);
      expect(state.participants).toEqual([]);
      expect(state._lastStatusUpdate).toBe(0);
    });
  });

  describe('setParticipants', () => {
    it('should set participants and populate usersMap', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
      });

      const state = useUserStore.getState();

      expect(state.participants).toHaveLength(2);
      expect(state.usersMap.size).toBe(2);
      expect(state.usersMap.get('user-1')).toEqual(mockUser1);
      expect(state.usersMap.get('user-2')).toEqual(mockUser2);
    });

    it('should replace existing participants', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
      });

      act(() => {
        useUserStore.getState().setParticipants([mockUser3]);
      });

      const state = useUserStore.getState();

      expect(state.participants).toHaveLength(1);
      expect(state.usersMap.size).toBe(1);
      expect(state.usersMap.get('user-3')).toEqual(mockUser3);
      expect(state.usersMap.has('user-1')).toBe(false);
    });

    it('should update _lastStatusUpdate timestamp', () => {
      const beforeTime = Date.now();

      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const state = useUserStore.getState();
      expect(state._lastStatusUpdate).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should handle empty array', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
        useUserStore.getState().setParticipants([]);
      });

      const state = useUserStore.getState();
      expect(state.participants).toHaveLength(0);
      expect(state.usersMap.size).toBe(0);
    });

    it('should handle duplicate user IDs by using last occurrence', () => {
      const duplicateUser = { ...mockUser1, displayName: 'Duplicate John' };

      act(() => {
        useUserStore.getState().setParticipants([mockUser1, duplicateUser]);
      });

      const state = useUserStore.getState();
      expect(state.usersMap.get('user-1')?.displayName).toBe('Duplicate John');
    });
  });

  describe('updateUserStatus', () => {
    it('should update user online status', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
      });

      expect(useUserStore.getState().usersMap.get('user-2')?.isOnline).toBe(false);

      act(() => {
        useUserStore.getState().updateUserStatus('user-2', { isOnline: true });
      });

      expect(useUserStore.getState().usersMap.get('user-2')?.isOnline).toBe(true);
    });

    it('should update user lastActiveAt', () => {
      const newLastActiveAt = new Date('2024-06-15T12:00:00Z');

      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
        useUserStore.getState().updateUserStatus('user-1', { lastActiveAt: newLastActiveAt });
      });

      expect(useUserStore.getState().usersMap.get('user-1')?.lastActiveAt).toEqual(newLastActiveAt);
    });

    it('should update both online status and lastActiveAt', () => {
      const newLastActiveAt = new Date();

      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
        useUserStore.getState().updateUserStatus('user-1', {
          isOnline: false,
          lastActiveAt: newLastActiveAt,
        });
      });

      const user = useUserStore.getState().usersMap.get('user-1');
      expect(user?.isOnline).toBe(false);
      expect(user?.lastActiveAt).toEqual(newLastActiveAt);
    });

    it('should update participants array as well', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
        useUserStore.getState().updateUserStatus('user-1', { isOnline: false });
      });

      const state = useUserStore.getState();
      const userInParticipants = state.participants.find(p => p.id === 'user-1');
      expect(userInParticipants?.isOnline).toBe(false);
    });

    it('should not modify state for non-existent user', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const beforeState = useUserStore.getState();
      const beforeTimestamp = beforeState._lastStatusUpdate;

      act(() => {
        useUserStore.getState().updateUserStatus('non-existent-user', { isOnline: true });
      });

      const afterState = useUserStore.getState();
      // Timestamp should not change for non-existent user
      expect(afterState._lastStatusUpdate).toBe(beforeTimestamp);
      expect(afterState.usersMap.size).toBe(1);
    });

    it('should preserve other user properties when updating status', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
        useUserStore.getState().updateUserStatus('user-1', { isOnline: false });
      });

      const user = useUserStore.getState().usersMap.get('user-1');
      expect(user?.username).toBe('john');
      expect(user?.displayName).toBe('John Doe');
      expect(user?.email).toBe('test@example.com');
    });

    it('should not affect other users', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2, mockUser3]);
        useUserStore.getState().updateUserStatus('user-1', { isOnline: false });
      });

      const state = useUserStore.getState();
      expect(state.usersMap.get('user-2')?.isOnline).toBe(false); // unchanged
      expect(state.usersMap.get('user-3')?.isOnline).toBe(true); // unchanged
    });

    it('should update _lastStatusUpdate on successful update', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const beforeTime = Date.now();

      act(() => {
        useUserStore.getState().updateUserStatus('user-1', { isOnline: false });
      });

      expect(useUserStore.getState()._lastStatusUpdate).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
      });

      const user = useUserStore.getState().getUserById('user-1');
      expect(user).toEqual(mockUser1);
    });

    it('should return undefined for non-existent ID', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const user = useUserStore.getState().getUserById('non-existent');
      expect(user).toBeUndefined();
    });

    it('should return undefined when store is empty', () => {
      const user = useUserStore.getState().getUserById('user-1');
      expect(user).toBeUndefined();
    });

    it('should provide O(1) access', () => {
      // Add many users
      const manyUsers = Array.from({ length: 1000 }, (_, i) =>
        createMockUser({ id: `user-${i}` })
      );

      act(() => {
        useUserStore.getState().setParticipants(manyUsers);
      });

      // Access should be fast (Map lookup)
      const startTime = performance.now();
      useUserStore.getState().getUserById('user-500');
      const endTime = performance.now();

      // Should complete in less than 1ms
      expect(endTime - startTime).toBeLessThan(1);
    });
  });

  describe('clearStore', () => {
    it('should clear all state', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2, mockUser3]);
      });

      expect(useUserStore.getState().participants).toHaveLength(3);
      expect(useUserStore.getState().usersMap.size).toBe(3);

      act(() => {
        useUserStore.getState().clearStore();
      });

      const state = useUserStore.getState();
      expect(state.participants).toHaveLength(0);
      expect(state.usersMap.size).toBe(0);
    });

    it('should update _lastStatusUpdate on clear', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const beforeTime = Date.now();

      act(() => {
        useUserStore.getState().clearStore();
      });

      expect(useUserStore.getState()._lastStatusUpdate).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should be safe to call on empty store', () => {
      act(() => {
        useUserStore.getState().clearStore();
      });

      const state = useUserStore.getState();
      expect(state.participants).toHaveLength(0);
      expect(state.usersMap.size).toBe(0);
    });
  });

  describe('Real-time Status Scenarios', () => {
    it('should handle user coming online', () => {
      const offlineUser = createMockUser({ id: 'user-offline', isOnline: false });

      act(() => {
        useUserStore.getState().setParticipants([offlineUser]);
      });

      // Simulate Socket.IO event: user came online
      act(() => {
        useUserStore.getState().updateUserStatus('user-offline', {
          isOnline: true,
          lastActiveAt: new Date(),
        });
      });

      const user = useUserStore.getState().getUserById('user-offline');
      expect(user?.isOnline).toBe(true);
      expect(user?.lastActiveAt).toBeDefined();
    });

    it('should handle user going offline', () => {
      const onlineUser = createMockUser({ id: 'user-online', isOnline: true });

      act(() => {
        useUserStore.getState().setParticipants([onlineUser]);
      });

      // Simulate Socket.IO event: user went offline
      act(() => {
        useUserStore.getState().updateUserStatus('user-online', {
          isOnline: false,
          lastActiveAt: new Date(),
        });
      });

      const user = useUserStore.getState().getUserById('user-online');
      expect(user?.isOnline).toBe(false);
    });

    it('should handle rapid status updates', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      // Simulate rapid online/offline toggling
      act(() => {
        for (let i = 0; i < 100; i++) {
          useUserStore.getState().updateUserStatus('user-1', { isOnline: i % 2 === 0 });
        }
      });

      // Final state should be based on last update (99 is odd, so isOnline: false)
      expect(useUserStore.getState().getUserById('user-1')?.isOnline).toBe(false);
    });

    it('should handle multiple users updating simultaneously', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2, mockUser3]);
      });

      // Simulate multiple users changing status
      act(() => {
        useUserStore.getState().updateUserStatus('user-1', { isOnline: false });
        useUserStore.getState().updateUserStatus('user-2', { isOnline: true });
        useUserStore.getState().updateUserStatus('user-3', { isOnline: false });
      });

      const state = useUserStore.getState();
      expect(state.getUserById('user-1')?.isOnline).toBe(false);
      expect(state.getUserById('user-2')?.isOnline).toBe(true);
      expect(state.getUserById('user-3')?.isOnline).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with minimal data', () => {
      const minimalUser: User = {
        id: 'minimal-user',
        username: 'minimal',
        email: 'minimal@example.com',
        phoneNumber: '',
        firstName: '',
        lastName: '',
        displayName: 'Minimal',
        avatar: null,
        role: 'USER',
        systemLanguage: 'en',
        regionalLanguage: 'en',
        isOnline: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      act(() => {
        useUserStore.getState().setParticipants([minimalUser]);
      });

      expect(useUserStore.getState().getUserById('minimal-user')).toEqual(minimalUser);
    });

    it('should handle updating status with undefined values', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      // Update with only lastActiveAt (isOnline is undefined)
      const update: UserStatusUpdate = { lastActiveAt: new Date() };

      act(() => {
        useUserStore.getState().updateUserStatus('user-1', update);
      });

      // isOnline should remain unchanged
      expect(useUserStore.getState().getUserById('user-1')?.isOnline).toBe(true);
    });
  });
});
