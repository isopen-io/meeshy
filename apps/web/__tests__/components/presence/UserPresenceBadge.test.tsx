/**
 * Iter 37 (F12) — badge de statut vivant pour les pages contacts.
 * Le libellé reflète le user store (events + décroissance via le tick) au lieu
 * du payload REST figé au fetch.
 */

import { render, screen, act } from '@testing-library/react';
import { UserPresenceBadge } from '@/components/presence/UserPresenceBadge';
import { useUserStore } from '@/stores/user-store';
import type { User } from '@/types';

const t = (key: string) =>
  ({
    'status.online': 'En ligne',
    'status.away': 'Absent',
    'status.idle': 'Inactif',
    'status.offline': 'Hors ligne',
  }[key] ?? key);

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

describe('UserPresenceBadge', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('renders the status label of the user from the store', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceBadge userId="user-1" t={t} />);

    expect(screen.getByText('En ligne')).toBeInTheDocument();
  });

  it('updates the label when the store status of THIS user changes', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceBadge userId="user-1" t={t} />);
    expect(screen.getByText('En ligne')).toBeInTheDocument();

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    // Au-dela de 5min (offline) : le badge disparait entierement.
    expect(screen.queryByText('Hors ligne')).not.toBeInTheDocument();
    expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
  });

  it('recomputes relative status decay on the store tick (away à 2min)', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceBadge userId="user-1" t={t} />);
    expect(screen.getByText('En ligne')).toBeInTheDocument();

    act(() => {
      const state = useUserStore.getState();
      const user = state.usersMap.get('user-1');
      if (user) {
        (user as { lastActiveAt?: Date }).lastActiveAt = twoMinutesAgo;
      }
      state.triggerStatusTick();
    });

    expect(screen.getByText('Absent')).toBeInTheDocument();
  });

  it('shows the grey idle badge (« Inactif ») between 3 and 5 minutes', () => {
    const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: false, lastActiveAt: fourMinutesAgo })]);
    });

    render(<UserPresenceBadge userId="user-1" t={t} />);

    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('falls back to the provided user when the store does not know the user yet', () => {
    render(
      <UserPresenceBadge
        userId="unknown-user"
        fallbackUser={{ isOnline: true, lastActiveAt: new Date() }}
        t={t}
      />
    );

    expect(screen.getByText('En ligne')).toBeInTheDocument();
  });
});
