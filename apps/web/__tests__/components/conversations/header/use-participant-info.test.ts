/**
 * Tests for useParticipantInfo hook — conversation header name resolution.
 *
 * Focus: the direct-conversation display name (`participantInfo.name`) must
 * converge on the SSOT `getUserDisplayName` priority order
 * (displayName > firstName+lastName > username), exactly like
 * `transform-conversation.ts`, `ActiveUsersSection`, and the conversation list.
 *
 * The prior inline chain (`displayName || username || firstName+lastName`)
 * preferred the cryptic `username` handle over the user's real name — so a
 * direct-conversation header showed `aw_1234` instead of `Alice Wang`.
 */

import { renderHook } from '@testing-library/react';
import { useParticipantInfo } from '@/components/conversations/header/use-participant-info';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';

// ─── Factory helpers ─────────────────────────────────────────────────────────

type TestUser = {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

const CURRENT_USER = { id: 'me-1' } as User;

function makeDirectConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    type: 'direct',
    title: 'Conversation privée',
    ...overrides,
  } as Conversation;
}

function makeParticipant(user: TestUser): Participant {
  return {
    userId: 'other-1',
    user,
  } as unknown as Participant;
}

function resolveName(user: TestUser, conversation?: Partial<Conversation>): string {
  const conv = makeDirectConversation(conversation);
  const participants = [
    { userId: CURRENT_USER.id, user: CURRENT_USER } as unknown as Participant,
    makeParticipant(user),
  ];
  const { result } = renderHook(() =>
    useParticipantInfo(conv, CURRENT_USER, participants)
  );
  return result.current.participantInfo.name;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useParticipantInfo — direct conversation name (SSOT convergence)', () => {
  it('prefers firstName+lastName over the username handle (RED before fix)', () => {
    const name = resolveName({
      firstName: 'Alice',
      lastName: 'Wang',
      username: 'aw_1234',
    });
    expect(name).toBe('Alice Wang');
  });

  it('prefers a lone firstName over the username handle (RED before fix)', () => {
    const name = resolveName({
      firstName: 'Alice',
      lastName: null,
      username: 'aw_1234',
    });
    expect(name).toBe('Alice');
  });

  it('uses displayName when set (highest priority)', () => {
    const name = resolveName({
      displayName: 'Ali',
      firstName: 'Alice',
      lastName: 'Wang',
      username: 'aw_1234',
    });
    expect(name).toBe('Ali');
  });

  it('falls back to username when no real name is available', () => {
    const name = resolveName({
      displayName: null,
      firstName: null,
      lastName: null,
      username: 'aw_1234',
    });
    expect(name).toBe('aw_1234');
  });

  it('ignores a whitespace-only displayName and resolves the real name', () => {
    const name = resolveName({
      displayName: '   ',
      firstName: 'Alice',
      lastName: 'Wang',
      username: 'aw_1234',
    });
    expect(name).toBe('Alice Wang');
  });

  it('returns the group title for non-direct conversations', () => {
    const conv = makeDirectConversation({ type: 'group', title: 'Team Meeshy' });
    const { result } = renderHook(() =>
      useParticipantInfo(conv, CURRENT_USER, [])
    );
    expect(result.current.participantInfo.name).toBe('Team Meeshy');
  });
});
