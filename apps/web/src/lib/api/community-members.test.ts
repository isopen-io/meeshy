import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpTransport } from './http';
import {
  changeCommunityMemberRole,
  decodeCommunityMember,
  loadCommunityMembers,
  memberGesturesOf,
  memberSectionsOf,
  removeCommunityMember,
  type CommunityMember,
} from './community-members';

type Sent = { readonly method: string; readonly path: string; readonly body?: unknown };

const transport = (answer: ApiResult<unknown>, sent: Sent[] = []): HttpTransport =>
  ({
    request: async (request: Sent) => {
      sent.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      return answer;
    },
  }) as unknown as HttpTransport;

const wire = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  communityId: 'c1',
  userId: 'u-bob',
  role: 'member',
  joinedAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  user: { id: 'u-bob', username: 'bob', displayName: 'Bob', avatar: null, isOnline: false },
  ...over,
});

const member = (over: Partial<CommunityMember> = {}): CommunityMember => ({
  id: 'row-1',
  userId: 'u-bob',
  role: 'member',
  name: 'Bob',
  username: 'bob',
  avatar: null,
  online: false,
  ...over,
});

describe('la projection d’un membre', () => {
  test('garde le nom, l’identifiant de ligne, l’utilisateur et le rôle servis', () => {
    expect(decodeCommunityMember(wire())).toEqual(member());
  });

  test('sans nom d’affichage, il se nomme par son identifiant', () => {
    expect(decodeCommunityMember(wire({ user: { id: 'u-bob', username: 'bob', displayName: '', avatar: null } }))?.name).toBe('bob');
  });

  test('la présence n’est que celle SERVIE : absente, jamais inventée', () => {
    expect(decodeCommunityMember(wire({ user: { id: 'u-bob', username: 'bob', displayName: 'Bob' } }))?.online).toBe(false);
    expect(decodeCommunityMember(wire({ user: { id: 'u-bob', username: 'bob', displayName: 'Bob', isOnline: true } }))?.online).toBe(true);
  });

  test('rien d’autre ne passe dans le cache : ni horodatage d’activité, ni coordonnées', () => {
    const decoded = decodeCommunityMember(
      wire({ user: { id: 'u-bob', username: 'bob', displayName: 'Bob', lastActiveAt: '2026-11-07T10:00:00.000Z', email: 'bob@x.io', phoneNumber: '+221' } }),
    );
    expect(JSON.stringify(decoded)).not.toMatch(/lastActiveAt|bob@x\.io|\+221/);
  });

  test('le contour équipé servi voyage avec la personne (#10945), et rien sans contour', () => {
    const ringed = decodeCommunityMember(
      wire({ user: { id: 'u-bob', username: 'bob', displayName: 'Bob', profileDecor: { avatarRing: { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } } } }),
    );
    expect(ringed?.ring).toEqual({ pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null });
    expect('ring' in (decodeCommunityMember(wire()) ?? {})).toBe(false);
  });

  test('un rôle inconnu se lit « membre », une ligne sans utilisateur est écartée', () => {
    expect(decodeCommunityMember(wire({ role: 'owner' }))?.role).toBe('member');
    expect(decodeCommunityMember(wire({ user: null }))).toBeNull();
  });
});

describe('la page de membres', () => {
  test('part sur l’id de la communauté, paginée à l’offset, et dit où reprendre', async () => {
    const sent: Sent[] = [];
    const result = await loadCommunityMembers({
      source: 'gateway',
      transport: transport({ ok: true, data: [wire(), wire({ id: 'row-2', userId: 'u-ann', user: { id: 'u-ann', username: 'ann', displayName: 'Ann' } })], pagination: { hasMore: true, total: 5 } } as ApiResult<unknown>, sent),
      communityId: 'c1',
      offset: 30,
    });
    expect(sent[0]?.path).toBe('/api/v1/communities/c1/members?offset=30&limit=30');
    expect(result.ok && result.data.nextOffset).toBe(32);
    expect(result.ok && result.data.members.map((row) => row.userId)).toEqual(['u-bob', 'u-ann']);
  });

  test('la dernière page ne propose pas de suite', async () => {
    const result = await loadCommunityMembers({ source: 'gateway', transport: transport({ ok: true, data: [wire()], pagination: { hasMore: false } } as ApiResult<unknown>), communityId: 'c1', offset: 0 });
    expect(result.ok && result.data.nextOffset).toBeNull();
  });
});

describe('les gestes envoyés', () => {
  test('le rôle part sur l’identifiant de LIGNE, le retrait sur l’utilisateur — les deux adresses de la passerelle', async () => {
    const sent: Sent[] = [];
    const deps = { source: 'gateway' as const, transport: transport({ ok: true, data: {} }, sent) };
    await changeCommunityMemberRole(deps, { communityId: 'c1', member: member(), role: 'moderator' });
    await removeCommunityMember(deps, { communityId: 'c1', member: member() });
    expect(sent).toEqual([
      { method: 'PATCH', path: '/api/v1/communities/c1/members/row-1/role', body: { role: 'moderator' } },
      { method: 'DELETE', path: '/api/v1/communities/c1/members/u-bob' },
    ]);
  });
});

describe('les sections et les gestes offerts', () => {
  test('les membres se rangent par rôle, administrateurs d’abord, sections vides tues', () => {
    const sections = memberSectionsOf([member({ id: 'a', role: 'member' }), member({ id: 'b', role: 'admin' }), member({ id: 'c', role: 'member' })]);
    expect(sections.map((section) => [section.role, section.members.map((row) => row.id)])).toEqual([
      ['admin', ['b']],
      ['member', ['a', 'c']],
    ]);
  });

  const viewer = { viewerId: 'u-me', createdBy: 'u-creator' };

  test('un administrateur peut donner les AUTRES rôles et retirer', () => {
    expect(memberGesturesOf({ ...viewer, viewerRole: 'admin', member: member({ role: 'member' }) })).toEqual({ roles: ['admin', 'moderator'], canRemove: true });
  });

  test('aucun geste pour un modérateur, un membre ou un lecteur dont le rôle n’est pas servi', () => {
    const none = { roles: [], canRemove: false };
    expect(memberGesturesOf({ ...viewer, viewerRole: 'moderator', member: member() })).toEqual(none);
    expect(memberGesturesOf({ ...viewer, viewerRole: 'member', member: member() })).toEqual(none);
    expect(memberGesturesOf({ ...viewer, viewerRole: null, member: member() })).toEqual(none);
    expect(memberGesturesOf({ ...viewer, viewerRole: undefined, member: member() })).toEqual(none);
  });

  test('ni sur sa propre ligne (on QUITTE), ni sur celle du créateur (la passerelle refuse)', () => {
    const none = { roles: [], canRemove: false };
    expect(memberGesturesOf({ ...viewer, viewerRole: 'admin', member: member({ userId: 'u-me' }) })).toEqual(none);
    expect(memberGesturesOf({ ...viewer, viewerRole: 'admin', member: member({ userId: 'u-creator', role: 'admin' }) })).toEqual(none);
  });
});
