import { describe, expect, test } from 'bun:test';

import { parseListState } from '@/lib/admin/list-state';
import { POST_LIST_SPEC } from '@/lib/admin/post-list';
import { resultatServi } from '@/test-support/served-pagination';
import { routedTransport, pathOf } from '@/test-support/routed-transport';

import {
  adminPostsQueryKey,
  adminPostsStatsQueryKey,
  decodeAdminPersonRef,
  decodeAdminPostRow,
  decodeAdminPostsStats,
  loadAdminPosts,
  loadAdminPostsStats,
} from './admin-posts';

/**
 * LES PUBLICATIONS VUES PAR L'ADMINISTRATION (#8876) — `GET /admin/posts` (la
 * pagination À CÔTÉ de `data`, ce que le transport remet) et `GET
 * /admin/posts/stats`.
 *
 * Le décodeur ne garde que ce que l'écran montre : le TEXTE d'une publication à
 * audience restreinte n'y entre pas — la liste plate de toute la plateforme ne
 * le lit pas, et un texte que le décodeur ne garde pas ne peut ni s'afficher ni
 * rester dans la mémoire de la page.
 */
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;

const author = (n = 1) => ({ id: ID(n), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.meeshy.me/a/awa.jpg' });

const row = (overrides: Record<string, unknown> = {}) => ({
  id: ID(2),
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Bonne fête à toute la communauté !',
  originalLanguage: 'fr',
  communityId: null,
  moodEmoji: null,
  isPinned: true,
  isEdited: false,
  deletedAt: null,
  expiresAt: null,
  likeCount: 12,
  commentCount: 3,
  repostCount: 1,
  viewCount: 240,
  bookmarkCount: 2,
  shareCount: 0,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:05:00.000Z',
  author: author(),
  media: [],
  _count: { comments: 3, views: 40, bookmarks: 2 },
  ...overrides,
});

describe('decodeAdminPersonRef — l’identité nommée d’une personne', () => {
  test('garde l’identifiant, le pseudo, le nom affiché et la photo — rien d’autre', () => {
    expect(decodeAdminPersonRef({ ...author(), email: 'awa@meeshy.me', role: 'ADMIN', isOnline: true })).toEqual({
      id: ID(1),
      username: 'awa',
      displayName: 'Awa Diop',
      avatar: 'https://cdn.meeshy.me/a/awa.jpg',
    });
  });

  test('un nom ou une photo absents se disent null, jamais une chaîne vide', () => {
    expect(decodeAdminPersonRef({ id: ID(1), username: 'awa', displayName: '  ', avatar: '' })).toEqual({
      id: ID(1),
      username: 'awa',
      displayName: null,
      avatar: null,
    });
  });

  test('sans identifiant, pas de personne', () => {
    expect(decodeAdminPersonRef({ username: 'awa' })).toBeNull();
    expect(decodeAdminPersonRef(null)).toBeNull();
  });
});

describe('decodeAdminPostRow — champ par champ, sans étalement', () => {
  test('forme figée pour une publication publique', () => {
    expect(decodeAdminPostRow(row())).toEqual({
      id: ID(2),
      type: 'POST',
      visibility: 'PUBLIC',
      restricted: false,
      excerpt: 'Bonne fête à toute la communauté !',
      mediaCount: 0,
      moodEmoji: null,
      isPinned: true,
      deletedAt: null,
      expiresAt: null,
      likeCount: 12,
      commentCount: 3,
      viewCount: 240,
      createdAt: '2026-09-29T10:00:00.000Z',
      author: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.meeshy.me/a/awa.jpg' },
    });
  });

  test('l’extrait tient en 120 caractères et se ferme par « … »', () => {
    const long = 'a'.repeat(300);
    const excerpt = decodeAdminPostRow(row({ content: long }))?.excerpt ?? '';
    expect(Array.from(excerpt)).toHaveLength(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  for (const visibility of ['PRIVATE', 'ONLY', 'EXCEPT']) {
    test(`audience ${visibility} : le texte n’entre pas dans le décodeur, la ligne se dit restreinte`, () => {
      const decoded = decodeAdminPostRow(row({ visibility, content: 'Mon secret de famille' }));
      expect(decoded).toMatchObject({ restricted: true, excerpt: null, visibility });
      expect(JSON.stringify(decoded)).not.toContain('secret');
    });
  }

  test('l’humeur d’un statut se garde, sauf pour une audience restreinte', () => {
    expect(decodeAdminPostRow(row({ type: 'STATUS', content: null, moodEmoji: '🎉' }))?.moodEmoji).toBe('🎉');
    expect(decodeAdminPostRow(row({ type: 'STATUS', visibility: 'ONLY', moodEmoji: '🎉' }))?.moodEmoji).toBeNull();
  });

  test('le nombre de médias se compte, leur adresse ne se garde pas', () => {
    const decoded = decodeAdminPostRow(row({ type: 'STORY', content: null, media: [{ id: 'm1', fileUrl: 'https://x/1.jpg' }, { id: 'm2', fileUrl: 'https://x/2.jpg' }] }));
    expect(decoded).toMatchObject({ mediaCount: 2, excerpt: null });
    expect(JSON.stringify(decoded)).not.toContain('https://x/');
  });

  test('les compteurs absents valent zéro, un auteur absent vaut null', () => {
    const decoded = decodeAdminPostRow({ id: ID(2), type: 'STATUS', createdAt: '2026-09-29T10:00:00.000Z' });
    expect(decoded).toMatchObject({ likeCount: 0, commentCount: 0, viewCount: 0, author: null, isPinned: false, visibility: null });
  });

  test('une ligne sans identifiant est écartée', () => {
    expect(decodeAdminPostRow({ type: 'POST' })).toBeNull();
  });
});

describe('decodeAdminPostsStats — ce que la passerelle compte', () => {
  const served = {
    total: 120,
    deleted: 8,
    byType: { POST: 70, STORY: 35, REEL: 10, STATUS: 5 },
    topAuthors: [
      { author: author(1), postCount: 14 },
      { author: { id: ID(3) }, postCount: 9 },
    ],
    trending: [
      { id: ID(4), type: 'REEL', content: 'Un texte de tendance', likeCount: 50, commentCount: 9, repostCount: 2, viewCount: 900, shareCount: 1, bookmarkCount: 3, createdAt: '2026-09-28T09:00:00.000Z', author: author(1) },
    ],
  };

  test('le total, les retirées et la répartition par type, du plus fréquent au moins fréquent', () => {
    const stats = decodeAdminPostsStats(served);
    expect(stats.total).toBe(120);
    expect(stats.deleted).toBe(8);
    expect(stats.byType).toEqual([
      { type: 'POST', count: 70 },
      { type: 'STORY', count: 35 },
      { type: 'REEL', count: 10 },
      { type: 'STATUS', count: 5 },
    ]);
  });

  test('un auteur que la passerelle n’a pas pu nommer garde son identifiant et se dira « Compte sans nom »', () => {
    const stats = decodeAdminPostsStats(served);
    expect(stats.topAuthors).toEqual([
      { author: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.meeshy.me/a/awa.jpg' }, postCount: 14 },
      { author: { id: ID(3), username: '', displayName: null, avatar: null }, postCount: 9 },
    ]);
  });

  test('une tendance garde son engagement, jamais son texte (l’audience de la publication n’est pas servie ici)', () => {
    const stats = decodeAdminPostsStats(served);
    expect(stats.trending).toEqual([
      {
        id: ID(4),
        type: 'REEL',
        likeCount: 50,
        commentCount: 9,
        author: { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.meeshy.me/a/awa.jpg' },
      },
    ]);
    expect(JSON.stringify(stats)).not.toContain('tendance');
  });

  test('une charge illisible rend des statistiques vides, jamais une exception', () => {
    expect(decodeAdminPostsStats(null)).toEqual({ total: 0, deleted: 0, byType: [], topAuthors: [], trending: [] });
  });
});

describe('loadAdminPosts — le chemin, la requête et la pagination servie', () => {
  const state = (query: string) => parseListState(new URLSearchParams(query), POST_LIST_SPEC);

  test('part sur le catalogue généré avec la page et les filtres, et lit la pagination À CÔTÉ de data', async () => {
    const { transport, calls } = routedTransport((req) =>
      pathOf(req) === '/api/v1/admin/posts'
        ? resultatServi({ success: true, data: [row()], pagination: { total: 41, offset: 20, limit: 20, hasMore: true } })
        : undefined,
    );
    const result = await loadAdminPosts({
      source: 'gateway',
      transport,
      state: state('type=STORY&visibility=PUBLIC&isDeleted=true&isPinned=false&period=week&authorId=64f1c2a9e8b7d6c5b4a39281&q=fête&offset=20'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(41);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.rows.map((entry) => entry.id)).toEqual([ID(2)]);
    const query = new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      offset: '20',
      limit: '20',
      search: 'fête',
      type: 'STORY',
      visibility: 'PUBLIC',
      isDeleted: 'true',
      isPinned: 'false',
      period: 'week',
      authorId: '64f1c2a9e8b7d6c5b4a39281',
    });
    expect(calls()[0]?.method).toBe('GET');
  });

  test('sans filtre, seuls la page et sa taille partent', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ data: [], pagination: { total: 0, offset: 0, limit: 20, hasMore: false } }));
    await loadAdminPosts({ source: 'gateway', transport, state: state('') });
    expect(Object.fromEntries(new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams)).toEqual({ offset: '0', limit: '20' });
  });

  test('un refus remonte tel quel', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 403, error: 'Permission insuffisante' }));
    const result = await loadAdminPosts({ source: 'gateway', transport, state: state('') });
    expect(result).toEqual({ ok: false, status: 403, error: 'Permission insuffisante' });
  });
});

describe('loadAdminPostsStats — la période se passe telle quelle', () => {
  test('sans période, aucune requête de période ; avec, `period`', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ data: { total: 1, deleted: 0, byType: { POST: 1 }, topAuthors: [], trending: [] } }));
    await loadAdminPostsStats({ source: 'gateway', transport });
    await loadAdminPostsStats({ source: 'gateway', transport, period: 'month' });
    expect(calls().map((call) => call.path)).toEqual(['/api/v1/admin/posts/stats', '/api/v1/admin/posts/stats?period=month']);
  });
});

describe('les clés de requête — sous `admin`, jamais persistées', () => {
  test('la liste, les statistiques et la fiche partagent le préfixe `admin` · `posts`', () => {
    expect(adminPostsQueryKey('type=STORY')).toEqual(['admin', 'posts', 'list', 'type=STORY']);
    expect(adminPostsStatsQueryKey('week')).toEqual(['admin', 'posts', 'stats', 'week']);
    expect(adminPostsStatsQueryKey(undefined)).toEqual(['admin', 'posts', 'stats', 'all']);
  });
});
