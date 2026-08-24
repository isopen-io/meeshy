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

// ─── Le RANG du lecteur ──────────────────────────────────────────────────────
//
// `getCurrentUserRole` alimente `canAccessAdminSettings` (onglet de
// configuration de la conversation) et `canModifyConversationImage`. Il lisait
// `participant.role` — qui porte le rôle PLATEFORME ('USER', 'ADMIN'…), le rang
// dans la conversation vivant sous `conversationRole` (cf.
// `serializeConversationParticipant`, `packages/shared/utils/participant-helpers.ts`).
//
// Un créateur de groupe ordinaire obtenait donc 'USER', et
// `hasMinimumMemberRole('user', MODERATOR)` est faux : l'onglet ne s'ouvrait
// jamais, et il ne pouvait modifier ni le titre, ni la description, ni l'image
// de son propre groupe. Seuls les membres du staff plateforme passaient, par
// coïncidence de taxonomie.

describe('useParticipantInfo — rang du lecteur dans la conversation', () => {
  const conversationOf = (over: Partial<Conversation> = {}) =>
    ({ id: 'conv-1', type: 'group', title: 'Team Meeshy', ...over }) as Conversation;

  const participantOf = (over: Record<string, unknown> = {}) =>
    ({ userId: CURRENT_USER.id, role: 'USER', ...over }) as unknown as Participant;

  it("préfère currentUserRole servi par le serveur", () => {
    // Autorité serveur : la liste de participants est tronquée à cinq, donc le
    // lecteur d'un groupe de six n'y figure pas — lui seul ne peut pas trancher.
    const { result } = renderHook(() =>
      useParticipantInfo(conversationOf({ currentUserRole: 'creator' } as Partial<Conversation>), CURRENT_USER, [])
    );

    expect(result.current.getCurrentUserRole()).toBe('creator');
  });

  it('retombe sur conversationRole, jamais sur le rôle plateforme', () => {
    const { result } = renderHook(() =>
      useParticipantInfo(
        conversationOf(),
        CURRENT_USER,
        [participantOf({ role: 'USER', conversationRole: 'admin' })]
      )
    );

    expect(result.current.getCurrentUserRole()).toBe('admin');
  });

  it("ne promeut pas un simple membre au motif qu'il est ADMIN de la plateforme", () => {
    const { result } = renderHook(() =>
      useParticipantInfo(
        conversationOf(),
        CURRENT_USER,
        [participantOf({ role: 'ADMIN', conversationRole: 'member' })]
      )
    );

    expect(result.current.getCurrentUserRole()).toBe('member');
  });

  it('retombe sur le rôle plateforme quand la conversation ne dit rien', () => {
    // Un gateway antérieur, ou une route qui ne calcule pas le rang : on ne
    // dégrade pas le lecteur, on garde le comportement d'avant.
    const staff = { id: 'me-1', role: 'BIGBOSS' } as unknown as User;

    const { result } = renderHook(() => useParticipantInfo(conversationOf(), staff, []));

    expect(result.current.getCurrentUserRole()).toBe('BIGBOSS');
  });
});
