/**
 * Iter 37 (F12) — ligne dot + libellé de statut vivante pour les pages contacts.
 * Le dot ET le texte reflètent le user store ; le texte est surchargeable via
 * children (ligne « vu pour la dernière fois » de ContactsList).
 */

import { render, screen, act } from '@testing-library/react';
import { UserPresenceLabel } from '@/components/presence/UserPresenceLabel';
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

describe('UserPresenceLabel', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('renders the status label of the user from the store', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceLabel userId="user-1" t={t} />);

    expect(screen.getByText('En ligne')).toBeInTheDocument();
  });

  it('updates when the store status of THIS user changes', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceLabel userId="user-1" t={t} />);
    expect(screen.getByText('En ligne')).toBeInTheDocument();

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    // Au-dela de 5min (offline) : plus aucune info de presence (ni dot ni label).
    expect(screen.queryByText('Hors ligne')).not.toBeInTheDocument();
    expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
  });

  it('recomputes relative status decay on the store tick (away à 2min)', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]);
    });

    render(<UserPresenceLabel userId="user-1" t={t} />);
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

  it('shows the grey idle label (« Inactif ») between 3 and 5 minutes', () => {
    const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: false, lastActiveAt: fourMinutesAgo })]);
    });

    render(<UserPresenceLabel userId="user-1" t={t} />);

    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('falls back to the provided user when the store does not know the user yet', () => {
    render(
      <UserPresenceLabel
        userId="unknown-user"
        fallbackUser={{ isOnline: true, lastActiveAt: new Date() }}
        t={t}
      />
    );

    expect(screen.getByText('En ligne')).toBeInTheDocument();
  });

  it('renders children instead of the status label while keeping the dot live', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(
      <UserPresenceLabel userId="user-1" t={t}>
        Vu il y a 2 min
      </UserPresenceLabel>
    );

    expect(screen.getByText('Vu il y a 2 min')).toBeInTheDocument();
    expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
  });
});
