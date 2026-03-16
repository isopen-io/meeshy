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
  } as any);

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
    act(() => {
      useUserStore.getState().clearStore();
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useUserStore.getState();

      expect(state.usersMap.size).toBe(0);
      expect(state.participants).toEqual([]);
      expect(state._lastStatusUpdate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('mergeParticipants', () => {
    it('should add participants and populate usersMap', () => {
      act(() => {
        useUserStore.getState().mergeParticipants([mockUser1, mockUser2]);
      });

      const state = useUserStore.getState();

      expect(state.usersMap.size).toBe(2);
      expect(state.usersMap.get('user-1')?.displayName).toBe('John Doe');
      expect(state.usersMap.get('user-2')?.displayName).toBe('Jane Doe');
    });

    it('should merge new participants with existing (additive)', () => {
      act(() => {
        useUserStore.getState().mergeParticipants([mockUser1, mockUser2]);
      });

      act(() => {
        useUserStore.getState().mergeParticipants([mockUser3]);
      });

      const state = useUserStore.getState();

      // All 3 users should be present (additive merge)
      expect(state.usersMap.size).toBe(3);
      expect(state.usersMap.has('user-1')).toBe(true);
      expect(state.usersMap.has('user-2')).toBe(true);
      expect(state.usersMap.has('user-3')).toBe(true);
    });

    it('should update existing user with more recent data', () => {
      const recentDate = new Date('2025-01-01T12:00:00Z');
      act(() => {
        useUserStore.getState().mergeParticipants([
          createMockUser({ id: 'user-1', displayName: 'Old Name', lastActiveAt: new Date('2024-01-01') } as any)
        ]);
      });

      act(() => {
        useUserStore.getState().mergeParticipants([
          createMockUser({ id: 'user-1', displayName: 'New Name', lastActiveAt: recentDate } as any)
        ]);
      });

      expect(useUserStore.getState().usersMap.get('user-1')?.displayName).toBe('New Name');
    });

    it('should handle empty array', () => {
      act(() => {
        useUserStore.getState().mergeParticipants([mockUser1]);
        useUserStore.getState().mergeParticipants([]);
      });

      // Existing user should still be there
      expect(useUserStore.getState().usersMap.size).toBe(1);
    });

    it('should update _lastStatusUpdate timestamp', () => {
      const beforeTime = Date.now();

      act(() => {
        useUserStore.getState().mergeParticipants([mockUser1]);
      });

      const state = useUserStore.getState();
      expect(state._lastStatusUpdate).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('setParticipants (backward-compatible alias)', () => {
    it('should delegate to mergeParticipants', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2]);
      });

      const state = useUserStore.getState();
      expect(state.usersMap.size).toBe(2);
      expect(state.usersMap.get('user-1')).toBeDefined();
      expect(state.usersMap.get('user-2')).toBeDefined();
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

    it('should create a minimal entry for unknown user (not drop the event)', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      act(() => {
        useUserStore.getState().updateUserStatus('unknown-user', {
          isOnline: true,
          lastActiveAt: new Date(),
          username: 'newguy',
        });
      });

      const state = useUserStore.getState();
      // Unknown user should now be in the store
      expect(state.usersMap.size).toBe(2);
      const newUser = state.usersMap.get('unknown-user');
      expect(newUser).toBeDefined();
      expect(newUser?.isOnline).toBe(true);
      expect(newUser?.username).toBe('newguy');
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
      expect(state.usersMap.get('user-2')?.isOnline).toBe(false);
      expect(state.usersMap.get('user-3')?.isOnline).toBe(true);
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
      expect(user?.id).toBe('user-1');
      expect(user?.displayName).toBe('John Doe');
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
      const manyUsers = Array.from({ length: 1000 }, (_, i) =>
        createMockUser({ id: `user-${i}` })
      );

      act(() => {
        useUserStore.getState().setParticipants(manyUsers);
      });

      const startTime = performance.now();
      useUserStore.getState().getUserById('user-500');
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1);
    });
  });

  describe('clearStore', () => {
    it('should clear all state', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2, mockUser3]);
      });

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
  });

  describe('Real-time Status Scenarios', () => {
    it('should handle user coming online', () => {
      const offlineUser = createMockUser({ id: 'user-offline', isOnline: false });

      act(() => {
        useUserStore.getState().setParticipants([offlineUser]);
      });

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

      act(() => {
        for (let i = 0; i < 100; i++) {
          useUserStore.getState().updateUserStatus('user-1', { isOnline: i % 2 === 0 });
        }
      });

      expect(useUserStore.getState().getUserById('user-1')?.isOnline).toBe(false);
    });

    it('should handle multiple users updating simultaneously', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1, mockUser2, mockUser3]);
      });

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
    it('should handle updating status with undefined values', () => {
      act(() => {
        useUserStore.getState().setParticipants([mockUser1]);
      });

      const update: UserStatusUpdate = { lastActiveAt: new Date() };

      act(() => {
        useUserStore.getState().updateUserStatus('user-1', update);
      });

      expect(useUserStore.getState().getUserById('user-1')?.isOnline).toBe(true);
    });
  });
});
