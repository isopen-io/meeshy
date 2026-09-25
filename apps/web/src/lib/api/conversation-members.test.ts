import { describe, expect, test } from 'bun:test';

import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

import type { Participant } from './types';
import { scriptedGateway } from '@/test-support/scripted-transport';

import { decodeConversationMember, loadConversationMembers, memberFromParticipant } from './conversation-members';

/**
 * LA PAGINATION CURSEUR telle que la route la pose à la racine — le transport
 * la TYPE `PaginationMeta` (offset) mais la transmet telle quelle : les deux
 * formes voyagent dans le même objet, comme sur le fil.
 */
const cursorPagination = (cursor: { readonly nextCursor: string | null; readonly hasMore: boolean; readonly totalCount: number }): PaginationMeta =>
  Object.assign({ total: cursor.totalCount, offset: 0, limit: 50, hasMore: cursor.hasMore }, cursor);

/** Une ligne telle que `serializeConversationParticipant` la rend. */
const wireMember = (overrides: Record<string, unknown> = {}) => ({
  id: 'p-nour',
  participantId: 'p-nour',
  userId: 'u-nour',
  type: 'user',
  username: 'nour',
  firstName: 'Nour',
  lastName: 'Haddad',
  displayName: 'Nour Haddad',
  avatar: '2026/09/u-nour/photo.png',
  role: 'USER',
  conversationRole: 'admin',
  isOnline: false,
  lastActiveAt: null,
  ...overrides,
});

describe('decodeConversationMember — la forme aplatie de la passerelle (#7829)', () => {
  test('un membre inscrit : pseudo, nom, photo déjà résolue, rôle de la conversation', () => {
    expect(decodeConversationMember(wireMember())).toEqual({
      id: 'p-nour',
      userId: 'u-nour',
      username: 'nour',
      displayName: 'Nour Haddad',
      avatar: '2026/09/u-nour/photo.png',
      role: 'admin',
    });
  });

  test('un participant ANONYME n’a pas de pseudo : celui que sert la passerelle est son nom local', () => {
    const member = decodeConversationMember(wireMember({ type: 'anonymous', userId: null, username: 'Invité', displayName: 'Invité' }));
    expect(member?.username).toBeNull();
    expect(member?.displayName).toBe('Invité');
  });

  test('une photo vide compte pour absente, un rôle absent vaut « member »', () => {
    const member = decodeConversationMember(wireMember({ avatar: '', conversationRole: null }));
    expect(member?.avatar).toBeUndefined();
    expect(member?.role).toBe('member');
  });

  test('une ligne sans identifiant est écartée', () => {
    expect(decodeConversationMember({ displayName: 'x' })).toBeNull();
  });
});

describe('loadConversationMembers — la route paginée par curseur', () => {
  test('demande la page, décode les membres, suit le curseur tant que `hasMore`', async () => {
    const { deps, calls } = scriptedGateway({
      'GET /api/v1/conversations/c1/participants?limit=50': {
        ok: true,
        data: [wireMember(), { broken: true }],
        pagination: cursorPagination({ nextCursor: 'p-nour', hasMore: true, totalCount: 120 }),
      },
    });
    const result = await loadConversationMembers({ ...deps, conversationId: 'c1', cursor: null });
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/conversations/c1/participants?limit=50']);
    expect(result.ok && result.data.members.map((m) => m.username)).toEqual(['nour']);
    expect(result.ok && result.data.nextCursor).toBe('p-nour');
    expect(result.ok && result.data.totalCount).toBe(120);
  });

  test('la page suivante porte le curseur ; la dernière n’en rend aucun', async () => {
    const { deps } = scriptedGateway({
      'GET /api/v1/conversations/c1/participants?limit=50&cursor=p-nour': {
        ok: true,
        data: [wireMember({ id: 'p-ali', username: 'ali' })],
        pagination: cursorPagination({ nextCursor: null, hasMore: false, totalCount: 2 }),
      },
    });
    const result = await loadConversationMembers({ ...deps, conversationId: 'c1', cursor: 'p-nour' });
    expect(result.ok && result.data.nextCursor).toBeNull();
  });

  test('un refus remonte tel quel', async () => {
    const { deps } = scriptedGateway({
      'GET /api/v1/conversations/c1/participants?limit=50': { ok: false, status: 403, error: 'Accès refusé' },
    });
    const result = await loadConversationMembers({ ...deps, conversationId: 'c1', cursor: null });
    expect(result).toEqual({ ok: false, status: 403, error: 'Accès refusé' });
  });
});

describe('memberFromParticipant — les participants DÉJÀ en cache, peints avant la réponse', () => {
  test('pseudo du compte, photo par la loi partagée, rôle', () => {
    const participant = {
      id: 'p-nour',
      conversationId: 'c1',
      userId: 'u-nour',
      type: 'user',
      displayName: 'Nour Haddad',
      role: 'moderator',
      language: 'fr',
      isActive: true,
      isOnline: false,
      joinedAt: new Date('2026-01-01'),
      user: { id: 'u-nour', username: 'nour', avatar: 'a.png' },
    } as Participant;
    expect(memberFromParticipant(participant)).toEqual({
      id: 'p-nour',
      userId: 'u-nour',
      username: 'nour',
      displayName: 'Nour Haddad',
      avatar: 'a.png',
      role: 'moderator',
    });
  });
});
