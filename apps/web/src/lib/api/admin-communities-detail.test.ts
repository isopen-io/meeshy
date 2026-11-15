import { describe, expect, test } from 'bun:test';

import { COMMUNITY_MEMBERS_SPEC } from '@/lib/admin/community-list';
import { parseListState } from '@/lib/admin/list-state';
import { resultatServi } from '@/test-support/served-pagination';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import {
  adminCommunityMembersQueryKey,
  adminCommunityQueryKey,
  decodeAdminCommunityFiche,
  decodeAdminCommunityMember,
  loadAdminCommunity,
  loadAdminCommunityMembers,
  updateAdminCommunity,
} from './admin-communities-detail';

/**
 * LA FICHE D'UNE COMMUNAUTÉ (#8876) — `GET /admin/communities/:id`, ses membres
 * et le geste `PATCH` (désactiver / réactiver, rendre privée / publique).
 */
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const person = (n: number, name: string) => ({ id: ID(n), username: name.toLowerCase(), displayName: name, avatar: null });

const served = (overrides: Record<string, unknown> = {}) => ({
  id: ID(3),
  identifier: 'mshy_club-jazz',
  name: 'Club de jazz',
  description: 'Les amateurs de jazz de Douala',
  avatar: 'https://cdn.meeshy.me/c/jazz.jpg',
  banner: 'https://cdn.meeshy.me/c/jazz-banner.jpg',
  isPrivate: true,
  isActive: true,
  deletedAt: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  creator: person(1, 'Awa'),
  activeMemberCount: 42,
  leftMemberCount: 7,
  conversationCount: 2,
  postCount: 15,
  conversations: [
    { id: ID(5), title: 'Répétitions', identifier: 'mshy_repetitions-secret', type: 'group', isActive: true, lastMessageAt: '2026-09-29T20:00:00.000Z', memberCount: 12 },
    { id: ID(6), title: null, identifier: null, type: 'public', isActive: false, lastMessageAt: null, memberCount: 3 },
  ],
  staff: [
    { user: person(1, 'Awa'), role: 'admin', joinedAt: '2026-08-01T10:00:00.000Z' },
    { user: person(2, 'Jean'), role: 'moderator', joinedAt: '2026-08-05T10:00:00.000Z' },
  ],
  ...overrides,
});

describe('decodeAdminCommunityFiche — champ par champ', () => {
  const fiche = decodeAdminCommunityFiche(served());

  test('l’identité, l’état et les dates', () => {
    expect(fiche).toMatchObject({
      id: ID(3),
      identifier: 'mshy_club-jazz',
      name: 'Club de jazz',
      description: 'Les amateurs de jazz de Douala',
      avatar: 'https://cdn.meeshy.me/c/jazz.jpg',
      banner: 'https://cdn.meeshy.me/c/jazz-banner.jpg',
      isPrivate: true,
      isActive: true,
      deletedAt: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  test('les quatre chiffres : membres actifs, départs, conversations, publications', () => {
    expect(fiche).toMatchObject({ activeMemberCount: 42, leftMemberCount: 7, conversationCount: 2, postCount: 15 });
  });

  test('le créateur et l’équipe sont nommés, l’équipe avec son rôle', () => {
    expect(fiche?.creator).toEqual({ id: ID(1), username: 'awa', displayName: 'Awa', avatar: null });
    expect(fiche?.staff).toEqual([
      { user: { id: ID(1), username: 'awa', displayName: 'Awa', avatar: null }, role: 'admin', joinedAt: '2026-08-01T10:00:00.000Z' },
      { user: { id: ID(2), username: 'jean', displayName: 'Jean', avatar: null }, role: 'moderator', joinedAt: '2026-08-05T10:00:00.000Z' },
    ]);
  });

  test('les conversations gardent leur titre, leur type, leur état et leurs membres — pas leur identifiant d’entrée', () => {
    expect(fiche?.conversations).toEqual([
      { id: ID(5), title: 'Répétitions', type: 'group', isActive: true, lastMessageAt: '2026-09-29T20:00:00.000Z', memberCount: 12 },
      { id: ID(6), title: null, type: 'public', isActive: false, lastMessageAt: null, memberCount: 3 },
    ]);
    expect(JSON.stringify(fiche)).not.toContain('secret');
  });

  test('une communauté désactivée garde la date de sa désactivation', () => {
    const off = decodeAdminCommunityFiche(served({ isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' }));
    expect(off).toMatchObject({ isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' });
  });

  test('sans créateur lisible, null ; sans description ni bannière, null', () => {
    const bare = decodeAdminCommunityFiche(served({ creator: null, description: '', banner: null }));
    expect(bare).toMatchObject({ creator: null, description: null, banner: null });
  });

  test('un membre d’équipe sans personne lisible est écarté, jamais réparé', () => {
    const partial = decodeAdminCommunityFiche(served({ staff: [{ role: 'admin', user: null }] }));
    expect(partial?.staff).toEqual([]);
  });

  test('sans identifiant, pas de fiche', () => {
    expect(decodeAdminCommunityFiche({ name: 'x' })).toBeNull();
    expect(decodeAdminCommunityFiche(null)).toBeNull();
  });
});

describe('decodeAdminCommunityMember — un membre nommé', () => {
  const member = {
    id: ID(8),
    role: 'moderator',
    joinedAt: '2026-08-05T10:00:00.000Z',
    isActive: false,
    leftAt: '2026-09-10T10:00:00.000Z',
    user: { ...person(2, 'Jean'), email: 'jean@meeshy.me', isOnline: true },
  };

  test('forme figée : le rôle, l’arrivée, le départ et la personne (sans présence ni coordonnées)', () => {
    expect(decodeAdminCommunityMember(member)).toEqual({
      id: ID(8),
      role: 'moderator',
      joinedAt: '2026-08-05T10:00:00.000Z',
      isActive: false,
      leftAt: '2026-09-10T10:00:00.000Z',
      user: { id: ID(2), username: 'jean', displayName: 'Jean', avatar: null },
    });
  });

  test('un membre sans personne lisible est écarté', () => {
    expect(decodeAdminCommunityMember({ ...member, user: null })).toBeNull();
  });

  test('un membre est actif tant que la passerelle ne dit pas `false`', () => {
    expect(decodeAdminCommunityMember({ ...member, isActive: undefined, leftAt: null })?.isActive).toBe(true);
  });
});

describe('les lectures — chemins du catalogue, pagination servie', () => {
  test('la fiche se lit sur le catalogue généré', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ success: true, data: served() }));
    const result = await loadAdminCommunity({ source: 'gateway', transport, communityId: ID(3) });
    expect(result.ok && result.data?.name).toBe('Club de jazz');
    expect(calls()[0]).toMatchObject({ method: 'GET', path: `/api/v1/admin/communities/${ID(3)}` });
  });

  test('les membres : recherche, rôle et activité partent ; la pagination vient À CÔTÉ de data', async () => {
    const { transport, calls } = routedTransport((req) =>
      pathOf(req) === `/api/v1/admin/communities/${ID(3)}/members`
        ? resultatServi({
            success: true,
            data: [{ id: ID(8), role: 'member', joinedAt: '2026-08-05T10:00:00.000Z', isActive: true, leftAt: null, user: person(2, 'Jean') }],
            pagination: { total: 57, offset: 20, limit: 20, hasMore: true },
          })
        : undefined,
    );
    const state = parseListState(new URLSearchParams('role=member&isActive=true&q=jean&offset=20'), COMMUNITY_MEMBERS_SPEC);
    const result = await loadAdminCommunityMembers({ source: 'gateway', transport, communityId: ID(3), state });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ total: 57, hasMore: true });
    expect(result.data.rows.map((entry) => entry.user.displayName)).toEqual(['Jean']);
    expect(Object.fromEntries(new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams)).toEqual({
      offset: '20',
      limit: '20',
      search: 'jean',
      role: 'member',
      isActive: 'true',
    });
  });

  test('un 404 sur la fiche remonte', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 404, error: 'Communauté introuvable' }));
    expect(await loadAdminCommunity({ source: 'gateway', transport, communityId: ID(3) })).toEqual({ ok: false, status: 404, error: 'Communauté introuvable' });
  });

  test('les clés partagent le préfixe de la communauté : une invalidation les relit toutes', () => {
    expect(adminCommunityQueryKey(ID(3))).toEqual(['admin', 'community', 'fiche', ID(3)]);
    expect(adminCommunityMembersQueryKey(ID(3), 'role=admin')).toEqual(['admin', 'community', 'members', ID(3), 'role=admin']);
  });
});

describe('updateAdminCommunity — PATCH avec motif, corps minimal', () => {
  test('désactiver : isActive et le motif, rien d’autre ; la réponse est la fiche à jour', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ success: true, data: served({ isActive: false, deletedAt: '2026-09-30T10:00:00.000Z' }) }));
    const result = await updateAdminCommunity({
      source: 'gateway',
      transport,
      communityId: ID(3),
      change: { isActive: false },
      reason: 'Contenus contraires aux règles',
    });

    expect(result.ok && result.data.fiche?.isActive).toBe(false);
    expect(calls()[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/v1/admin/communities/${ID(3)}`,
      body: { isActive: false, reason: 'Contenus contraires aux règles' },
    });
    expect(Object.keys((calls()[0]?.body as Record<string, unknown>) ?? {}).sort()).toEqual(['isActive', 'reason']);
  });

  test('rendre publique : isPrivate et le motif', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ success: true, data: served({ isPrivate: false }) }));
    await updateAdminCommunity({ source: 'gateway', transport, communityId: ID(3), change: { isPrivate: false }, reason: 'Demande du créateur' });
    expect(calls()[0]?.body).toEqual({ isPrivate: false, reason: 'Demande du créateur' });
  });

  test('un refus de la passerelle remonte avec son statut', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 403, error: 'Permission insuffisante' }));
    const result = await updateAdminCommunity({ source: 'gateway', transport, communityId: ID(3), change: { isActive: false }, reason: 'Contenus contraires' });
    expect(result).toEqual({ ok: false, status: 403, error: 'Permission insuffisante' });
  });
});
