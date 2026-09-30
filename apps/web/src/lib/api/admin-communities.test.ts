import { describe, expect, test } from 'bun:test';

import { COMMUNITY_LIST_SPEC } from '@/lib/admin/community-list';
import { parseListState } from '@/lib/admin/list-state';
import { resultatServi } from '@/test-support/served-pagination';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { adminCommunitiesQueryKey, decodeAdminCommunityRow, loadAdminCommunities } from './admin-communities';

/**
 * LES COMMUNAUTÉS VUES PAR L'ADMINISTRATION (#8876) — `GET /admin/communities`,
 * la pagination À CÔTÉ de `data`. `activeMemberCount` et `conversationCount`
 * sont les chiffres que le lot passerelle sert : `_count.members` comptait aussi
 * les départs.
 */
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;

const row = (overrides: Record<string, unknown> = {}) => ({
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
  creator: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: null },
  _count: { members: 99, Conversation: 99 },
  activeMemberCount: 42,
  conversationCount: 5,
  ...overrides,
});

describe('decodeAdminCommunityRow — champ par champ', () => {
  test('forme figée : l’identité, l’état, le créateur nommé et les deux chiffres servis', () => {
    expect(decodeAdminCommunityRow(row())).toEqual({
      id: ID(3),
      identifier: 'mshy_club-jazz',
      name: 'Club de jazz',
      avatar: 'https://cdn.meeshy.me/c/jazz.jpg',
      isPrivate: true,
      isActive: true,
      deletedAt: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      creator: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: null },
      activeMemberCount: 42,
      conversationCount: 5,
    });
  });

  test('les compteurs bruts (`_count`) ne sont JAMAIS lus : ils comptaient aussi les départs', () => {
    const decoded = decodeAdminCommunityRow(row({ activeMemberCount: undefined, conversationCount: undefined }));
    expect(decoded).toMatchObject({ activeMemberCount: 0, conversationCount: 0 });
  });

  test('une communauté désactivée garde la date de sa désactivation', () => {
    expect(decodeAdminCommunityRow(row({ isActive: false, deletedAt: '2026-09-20T08:00:00.000Z' }))).toMatchObject({
      isActive: false,
      deletedAt: '2026-09-20T08:00:00.000Z',
    });
  });

  test('l’état se lit fail-closed : seul `false` explicite désactive, seul `true` explicite rend privée — sinon, privée (le défaut du schéma)', () => {
    expect(decodeAdminCommunityRow(row({ isPrivate: undefined }))?.isPrivate).toBe(true);
    expect(decodeAdminCommunityRow(row({ isPrivate: false }))?.isPrivate).toBe(false);
    expect(decodeAdminCommunityRow(row({ isActive: undefined }))?.isActive).toBe(true);
  });

  test('un créateur ou une photo absents se disent null', () => {
    expect(decodeAdminCommunityRow(row({ creator: null, avatar: '' }))).toMatchObject({ creator: null, avatar: null });
  });

  test('une ligne sans identifiant est écartée', () => {
    expect(decodeAdminCommunityRow({ name: 'x' })).toBeNull();
  });
});

describe('loadAdminCommunities — le chemin, le tri sous ses noms de route et la pagination servie', () => {
  const state = (query: string) => parseListState(new URLSearchParams(query), COMMUNITY_LIST_SPEC);

  test('part sur le catalogue généré ; `sort` et `order` (et non sortBy) ; filtres et recherche', async () => {
    const { transport, calls } = routedTransport((req) =>
      pathOf(req) === '/api/v1/admin/communities'
        ? resultatServi({ success: true, data: [row()], pagination: { total: 31, offset: 20, limit: 20, hasMore: true } })
        : undefined,
    );
    const result = await loadAdminCommunities({
      source: 'gateway',
      transport,
      state: state('sort=name&order=asc&isPrivate=true&isActive=false&q=jazz&offset=20'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ total: 31, hasMore: true });
    expect(result.data.rows.map((entry) => entry.name)).toEqual(['Club de jazz']);
    expect(Object.fromEntries(new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams)).toEqual({
      offset: '20',
      limit: '20',
      search: 'jazz',
      sort: 'name',
      order: 'asc',
      isPrivate: 'true',
      isActive: 'false',
    });
  });

  test('sans filtre : la page, sa taille, et le tri par défaut (les plus récentes d’abord)', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }));
    await loadAdminCommunities({ source: 'gateway', transport, state: state('') });
    expect(Object.fromEntries(new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams)).toEqual({ offset: '0', limit: '20', sort: 'createdAt', order: 'desc' });
  });

  test('un refus remonte tel quel', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 403, error: 'Permission insuffisante' }));
    expect(await loadAdminCommunities({ source: 'gateway', transport, state: state('') })).toEqual({ ok: false, status: 403, error: 'Permission insuffisante' });
  });

  test('la clé de la liste vit sous `admin` · `community`', () => {
    expect(adminCommunitiesQueryKey('sort=name')).toEqual(['admin', 'community', 'list', 'sort=name']);
  });
});
