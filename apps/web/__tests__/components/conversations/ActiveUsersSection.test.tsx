/**
 * Iter 36 (A3) — la section "utilisateurs actifs" de la sidebar affiche une
 * présence VIVANTE : statut du store prioritaire sur le payload, mise à jour
 * sur event Socket.IO et décroissance via le tick (avant : statut figé au fetch).
 */

import { render, screen, act } from '@testing-library/react';
import { ActiveUsersSection } from '@/components/conversations/details-sidebar/ActiveUsersSection';
import { useUserStore } from '@/stores/user-store';
import type { User } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

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

describe('ActiveUsersSection presence', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('prefers the live store status over the stale payload status', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([
        buildUser({ id: 'user-1', isOnline: false, lastActiveAt: thirtyFiveMinutesAgo }),
      ]);
    });

    render(
      <ActiveUsersSection
        activeUsers={[buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]}
      />
    );

    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Absent')).not.toBeInTheDocument();
  });

  it('updates the dot when a Socket.IO presence event lands in the store', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);

    render(
      <ActiveUsersSection
        activeUsers={[buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]}
      />
    );
    expect(screen.getByTitle('En ligne')).toBeInTheDocument();

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Absent')).not.toBeInTheDocument();
  });

  it('recomputes status decay on the store tick', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([
        buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() }),
      ]);
    });

    render(
      <ActiveUsersSection
        activeUsers={[buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]}
      />
    );
    expect(screen.getByTitle('En ligne')).toBeInTheDocument();

    act(() => {
      const state = useUserStore.getState();
      const user = state.usersMap.get('user-1');
      if (user) {
        (user as { lastActiveAt?: Date }).lastActiveAt = twoMinutesAgo;
      }
      state.triggerStatusTick();
    });

    expect(screen.getByTitle('Absent')).toBeInTheDocument();
  });

  it('falls back to the payload presence when the store does not know the user', () => {
    render(
      <ActiveUsersSection
        activeUsers={[buildUser({ id: 'unknown-user', isOnline: true, lastActiveAt: new Date() })]}
      />
    );

    expect(screen.getByTitle('En ligne')).toBeInTheDocument();
  });

  it('renders the empty state when there are no active users', () => {
    render(<ActiveUsersSection activeUsers={[]} />);

    expect(screen.getByText('conversationDetails.noActiveUsers')).toBeInTheDocument();
  });
});

/**
 * Le nom et les initiales convergent sur le SSOT `getUserDisplayName` /
 * `getUserInitials` (priorité displayName > firstName+lastName > username),
 * au lieu d'une résolution inline qui ignorait `displayName` et exigeait
 * firstName ET lastName.
 */
describe('ActiveUsersSection name & initials resolution', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('prefers displayName over username when firstName/lastName are absent', () => {
    render(
      <ActiveUsersSection
        activeUsers={[buildUser({
          id: 'user-1',
          displayName: 'Alice Wonderland',
          firstName: undefined,
          lastName: undefined,
          username: 'awonder',
        })]}
      />
    );

    expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();
    expect(screen.queryByText('awonder')).not.toBeInTheDocument();
  });

  it('renders a first-name-only user partial name instead of the username', () => {
    render(
      <ActiveUsersSection
        activeUsers={[buildUser({
          id: 'user-1',
          displayName: undefined,
          firstName: 'Bob',
          lastName: undefined,
          username: 'bob99',
        })]}
      />
    );

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('bob99')).not.toBeInTheDocument();
  });

  it('derives the avatar initials from the resolved display name', () => {
    render(
      <ActiveUsersSection
        activeUsers={[buildUser({
          id: 'user-1',
          displayName: 'Alice Wonderland',
          firstName: undefined,
          lastName: undefined,
          username: 'awonder',
        })]}
      />
    );

    expect(screen.getByText('AW')).toBeInTheDocument();
  });
});
