/**
 * Iter 37 (F12+F13) — résolution de présence vivante extraite en hook.
 * Single source of truth consommée par toutes les feuilles de présence
 * (dot, badge, label) : store prioritaire → fallback payload → décroissance au tick.
 */

import { renderHook, act } from '@testing-library/react';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import { useUserStore } from '@/stores/user-store';
import type { User } from '@/types';

const buildUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  username: 'john',
  displayName: 'John Doe',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  role: 'USER',
  systemLanguage: 'en',
  regionalLanguage: 'en',
  isOnline: true,
  lastActiveAt: new Date(),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as unknown as User);

describe('useLiveUserStatus', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('resolves the status of the user from the store', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    const { result } = renderHook(() => useLiveUserStatus('user-1'));

    expect(result.current).toBe('online');
  });

  it('updates when the store status of THIS user changes', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    const { result } = renderHook(() => useLiveUserStatus('user-1'));
    expect(result.current).toBe('online');

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    expect(result.current).toBe('offline');
  });

  it('recomputes relative status decay on the store tick (online → away without any user mutation)', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]);
    });

    const { result } = renderHook(() => useLiveUserStatus('user-1'));
    expect(result.current).toBe('online');

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { lastActiveAt: twoMinutesAgo });
    });

    expect(result.current).toBe('away');
  });

  it('falls back to the provided presence source when the store does not know the user yet', () => {
    const { result } = renderHook(() =>
      useLiveUserStatus('unknown-user', { isOnline: true, lastActiveAt: new Date() })
    );

    expect(result.current).toBe('online');
  });

  it('resolves offline when neither the store nor the fallback resolve a user', () => {
    const { result } = renderHook(() => useLiveUserStatus('unknown-user'));

    expect(result.current).toBe('offline');
  });
});
