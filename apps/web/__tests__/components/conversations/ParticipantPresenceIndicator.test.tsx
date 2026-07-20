/**
 * Iter 35 (F9) — feuille de présence abonnée par userId.
 * L'indicateur reflète le statut du user store (et sa décroissance via le tick)
 * sans que la row ConversationItem ait à s'abonner au store.
 */

import { render, screen, act } from '@testing-library/react';
import { ParticipantPresenceIndicator } from '@/components/conversations/conversation-item/ParticipantPresenceIndicator';
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

describe('ParticipantPresenceIndicator', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('renders the online status of the user from the store', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<ParticipantPresenceIndicator userId="user-1" />);

    expect(screen.getByTitle('En ligne')).toBeInTheDocument();
  });

  it('updates when the store status of THIS user changes', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    render(<ParticipantPresenceIndicator userId="user-1" />);
    expect(screen.getByTitle('En ligne')).toBeInTheDocument();

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    // Au-dela de 30min (offline) : plus aucun indicateur de presence.
    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Hors ligne/)).not.toBeInTheDocument();
  });

  it('falls back to the provided user when the store does not know the user yet', () => {
    render(
      <ParticipantPresenceIndicator
        userId="unknown-user"
        fallbackUser={{ isOnline: true, lastActiveAt: new Date() }}
      />
    );

    expect(screen.getByTitle('En ligne')).toBeInTheDocument();
  });

  it('renders nothing (offline) when neither the store nor the fallback resolve a user', () => {
    const { container } = render(<ParticipantPresenceIndicator userId="unknown-user" />);

    // offline => aucun indicateur affiché.
    expect(container).toBeEmptyDOMElement();
  });

  it('recomputes relative status decay on the store tick (online → away without any user mutation)', () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    act(() => {
      // isOnline indéterminé → statut purement temporel : 6 min = away
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]);
    });

    render(<ParticipantPresenceIndicator userId="user-1" />);
    expect(screen.getByTitle('En ligne')).toBeInTheDocument();

    act(() => {
      // updateUserStatus creates a new user object + new Map reference, which
      // guarantees Zustand notifies all selectors watching this user's data.
      // Direct mutation of the map object is unreliable (same reference → selector
      // equality check in useSyncExternalStore skips re-render).
      useUserStore.getState().updateUserStatus('user-1', { lastActiveAt: sixMinutesAgo });
    });

    expect(screen.getByTitle('Absent')).toBeInTheDocument();
  });
});
