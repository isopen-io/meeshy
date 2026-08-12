/**
 * Iter 36 (A1) — l'avatar du header rend la feuille de présence par userId.
 * Le dot reflète le store (events + décroissance via tick) sans que le
 * ConversationHeader ait à s'abonner au user store.
 */

import { render, screen, act } from '@testing-library/react';
import { HeaderAvatar } from '@/components/conversations/header/HeaderAvatar';
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

const t = (key: string) => key;

const renderHeaderAvatar = (props: Partial<Parameters<typeof HeaderAvatar>[0]> = {}) =>
  render(
    <HeaderAvatar
      isDirect
      isAnonymous={false}
      canModifyImage={false}
      avatar="JD"
      name="John Doe"
      userId="user-1"
      presenceFallback={null}
      encryptionInfo={null}
      t={t}
      {...props}
    />
  );

describe('HeaderAvatar presence', () => {
  beforeEach(() => {
    act(() => {
      useUserStore.getState().clearStore();
    });
  });

  it('renders the live status of the other participant from the store', () => {
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    renderHeaderAvatar();

    expect(screen.getByTitle('En ligne')).toBeInTheDocument();
  });

  it('updates the dot when the store status of the participant changes', () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: true, lastActiveAt: new Date() })]);
    });

    renderHeaderAvatar();
    expect(screen.getByTitle('En ligne')).toBeInTheDocument();

    act(() => {
      useUserStore.getState().updateUserStatus('user-1', { isOnline: false, lastActiveAt: thirtyFiveMinutesAgo });
    });

    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Absent')).not.toBeInTheDocument();
  });

  it('recomputes status decay on the store tick without any user mutation', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    act(() => {
      useUserStore.getState().mergeParticipants([buildUser({ id: 'user-1', isOnline: undefined, lastActiveAt: new Date() })]);
    });

    renderHeaderAvatar();
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

  it('falls back to the conversation payload presence when the store is empty', () => {
    renderHeaderAvatar({
      userId: 'unknown-user',
      presenceFallback: { isOnline: true, lastActiveAt: new Date() },
    });

    expect(screen.getByTitle('En ligne')).toBeInTheDocument();
  });

  it('renders no presence dot for an anonymous direct participant', () => {
    renderHeaderAvatar({ isAnonymous: true });

    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Hors ligne')).not.toBeInTheDocument();
  });

  it('renders no presence dot for a group conversation', () => {
    renderHeaderAvatar({ isDirect: false });

    expect(screen.queryByTitle('En ligne')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Hors ligne')).not.toBeInTheDocument();
  });
});
