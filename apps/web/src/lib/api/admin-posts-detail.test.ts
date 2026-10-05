import { describe, expect, test } from 'bun:test';

import { resultatServi } from '@/test-support/served-pagination';
import { routedTransport } from '@/test-support/routed-transport';

import { adminPostQueryKey, decodeAdminPostFiche, loadAdminPost, removeAdminPost } from './admin-posts-detail';

/**
 * LA FICHE D'UNE PUBLICATION (#8876) — `GET /admin/posts/:postId`, dont le
 * schéma est ouvert (`additionalProperties: true`) : TOUT ce que la requête
 * charge part. Le décodeur est donc la seule barrière — position, liste des
 * personnes visées par l'audience, traductions, réactions, effets de story n'en
 * sortent jamais.
 */
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const person = (n: number, name: string) => ({ id: ID(n), username: name.toLowerCase(), displayName: name, avatar: null });

const served = (overrides: Record<string, unknown> = {}) => ({
  id: ID(9),
  authorId: ID(1),
  type: 'STORY',
  visibility: 'ONLY',
  visibilityUserIds: [ID(5), ID(6), ID(7)],
  content: 'Ce soir, on fête ça !',
  originalLanguage: 'fr',
  translations: { en: { text: 'Tonight we celebrate!' }, es: { text: '¡Esta noche lo celebramos!' } },
  metadata: { trackingLinks: [{ url: 'https://x', token: 'secret-token' }] },
  geoPoint: { type: 'Point', coordinates: [2.35, 48.85] },
  geoPrecision: 'EXACT',
  communityId: ID(3),
  repostOfId: ID(8),
  isQuote: true,
  storyEffects: { background: '#ff0000' },
  moodEmoji: '🎉',
  audioUrl: 'https://cdn/a.mp3',
  expiresAt: '2026-09-30T20:00:00.000Z',
  reactions: [{ userId: ID(5), emoji: '🔥' }],
  storyViews: [{ userId: ID(5) }],
  likeCount: 12,
  commentCount: 4,
  repostCount: 2,
  viewCount: 300,
  shareCount: 1,
  bookmarkCount: 3,
  isPinned: true,
  isEdited: true,
  contentEditedAt: '2026-09-30T09:30:00.000Z',
  deletedAt: null,
  createdAt: '2026-09-30T09:00:00.000Z',
  updatedAt: '2026-09-30T09:31:00.000Z',
  author: person(1, 'Awa'),
  media: [
    { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://cdn/1.jpg', thumbnailUrl: 'https://cdn/1-t.jpg', caption: 'La scène', alt: 'Une scène éclairée', fileSize: 204800, duration: null, width: 1080, height: 1920, order: 0, filePath: '/srv/secret', transcription: { text: 'dit' } },
    { id: 'm2', mimeType: 'audio/mpeg', fileUrl: 'https://cdn/2.mp3', thumbnailUrl: null, caption: null, alt: null, fileSize: 1024, duration: 12500, order: 1 },
  ],
  comments: Array.from({ length: 12 }, (_, index) => ({
    id: `c${index}`,
    content: `Commentaire ${index}`,
    likeCount: index,
    replyCount: 0,
    createdAt: '2026-09-30T10:00:00.000Z',
    author: person(2, 'Jean'),
  })),
  views: Array.from({ length: 15 }, (_, index) => ({ id: `v${index}`, userId: ID(2), viewedAt: '2026-09-30T10:00:00.000Z', duration: 4000, user: person(2, 'Jean') })),
  repostOf: { id: ID(8), content: 'Le texte originel', type: 'POST', createdAt: '2026-09-29T10:00:00.000Z', author: person(4, 'Mariam') },
  community: { id: ID(3), identifier: 'mshy_club-jazz', name: 'Club de jazz', avatar: 'https://cdn/c.jpg' },
  _count: { comments: 4, views: 61, bookmarks: 3, reposts: 2 },
  ...overrides,
});

describe('decodeAdminPostFiche — champ par champ', () => {
  const fiche = decodeAdminPostFiche(served());

  test('l’identité de la publication : type, audience, états, langue', () => {
    expect(fiche).toMatchObject({
      id: ID(9),
      type: 'STORY',
      visibility: 'ONLY',
      restricted: true,
      content: 'Ce soir, on fête ça !',
      originalLanguage: 'fr',
      isPinned: true,
      isEdited: true,
      isQuote: true,
      moodEmoji: '🎉',
      contentEditedAt: '2026-09-30T09:30:00.000Z',
      expiresAt: '2026-09-30T20:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-09-30T09:00:00.000Z',
      updatedAt: '2026-09-30T09:31:00.000Z',
    });
  });

  test('les langues traduites se COMPTENT, leur texte ne se garde pas', () => {
    expect(fiche?.translationCount).toBe(2);
    expect(JSON.stringify(fiche)).not.toContain('Tonight');
  });

  test('l’audience restreinte se dit par sa TAILLE : la liste des personnes visées ne sort jamais', () => {
    expect(fiche?.audienceCount).toBe(3);
    expect(JSON.stringify(fiche)).not.toContain(ID(5));
    expect(JSON.stringify(fiche)).not.toContain(ID(6));
    expect(JSON.stringify(fiche)).not.toContain('visibilityUserIds');
  });

  test('une audience publique n’a pas de taille à dire', () => {
    expect(decodeAdminPostFiche(served({ visibility: 'PUBLIC', visibilityUserIds: [] }))?.audienceCount).toBeNull();
  });

  test('la position, les métadonnées, les effets, les réactions et les vues embarquées ne sortent pas', () => {
    const text = JSON.stringify(fiche);
    for (const sensitive of ['geoPoint', 'coordinates', 'geoPrecision', 'secret-token', 'trackingLinks', 'storyEffects', '#ff0000', 'reactions', 'storyViews', 'audioUrl']) {
      expect(text).not.toContain(sensitive);
    }
  });

  test('les six compteurs, et les totaux de commentaires et de spectateurs', () => {
    expect(fiche?.counts).toEqual({ likes: 12, comments: 4, shares: 1, views: 300, bookmarks: 3, reposts: 2 });
    expect(fiche?.commentTotal).toBe(4);
    expect(fiche?.viewerTotal).toBe(61);
  });

  test('l’auteur et la communauté sont nommés', () => {
    expect(fiche?.author).toEqual({ id: ID(1), username: 'awa', displayName: 'Awa', avatar: null });
    expect(fiche?.community).toEqual({ id: ID(3), identifier: 'mshy_club-jazz', name: 'Club de jazz', avatar: 'https://cdn/c.jpg' });
  });

  test('le repartage garde son type et son auteur, jamais son texte', () => {
    expect(fiche?.repostOf).toEqual({ id: ID(8), type: 'POST', author: { id: ID(4), username: 'mariam', displayName: 'Mariam', avatar: null } });
    expect(JSON.stringify(fiche)).not.toContain('originel');
  });

  test('les médias gardent ce que la vignette et la légende montrent, pas les chemins ni les transcriptions', () => {
    expect(fiche?.media).toEqual([
      { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'https://cdn/1.jpg', thumbnailUrl: 'https://cdn/1-t.jpg', caption: 'La scène', alt: 'Une scène éclairée', fileSize: 204800, durationMs: null },
      { id: 'm2', mimeType: 'audio/mpeg', fileUrl: 'https://cdn/2.mp3', thumbnailUrl: null, caption: null, alt: null, fileSize: 1024, durationMs: 12500 },
    ]);
    expect(JSON.stringify(fiche)).not.toContain('/srv/secret');
  });

  test('les derniers commentaires sont au plus dix, avec leur auteur nommé', () => {
    expect(fiche?.comments).toHaveLength(10);
    expect(fiche?.comments[0]).toEqual({
      id: 'c0',
      content: 'Commentaire 0',
      author: { id: ID(2), username: 'jean', displayName: 'Jean', avatar: null },
      createdAt: '2026-09-30T10:00:00.000Z',
    });
  });

  test('les derniers spectateurs sont au plus douze, nommés, sans leur durée de vue', () => {
    expect(fiche?.viewers).toHaveLength(12);
    expect(fiche?.viewers[0]).toEqual({ user: { id: ID(2), username: 'jean', displayName: 'Jean', avatar: null }, viewedAt: '2026-09-30T10:00:00.000Z' });
  });

  test('sans `_count`, les totaux retombent sur ce qui est servi', () => {
    const bare = decodeAdminPostFiche(served({ _count: undefined, commentCount: 0 }));
    expect(bare?.commentTotal).toBe(12);
    expect(bare?.viewerTotal).toBe(15);
  });

  test('un commentaire ou un spectateur sans personne lisible est écarté, jamais réparé', () => {
    const partial = decodeAdminPostFiche(served({ views: [{ viewedAt: '2026-09-30T10:00:00.000Z', user: null }], comments: [{ id: 'c1', content: 'x', author: null }] }));
    expect(partial?.viewers).toEqual([]);
    expect(partial?.comments).toEqual([{ id: 'c1', content: 'x', author: null, createdAt: null }]);
  });

  test('sans identifiant, pas de fiche', () => {
    expect(decodeAdminPostFiche({ type: 'POST' })).toBeNull();
    expect(decodeAdminPostFiche(null)).toBeNull();
  });

  test('un texte de commentaire long est coupé en un extrait', () => {
    const long = decodeAdminPostFiche(served({ comments: [{ id: 'c1', content: 'b'.repeat(900), author: person(2, 'Jean') }] }));
    expect(Array.from(long?.comments[0]?.content ?? '').length).toBeLessThanOrEqual(300);
  });
});

describe('loadAdminPost et removeAdminPost — chemin, méthode, corps', () => {
  test('la fiche se lit sur le catalogue généré, l’identifiant encodé', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ success: true, data: served() }));
    const result = await loadAdminPost({ source: 'gateway', transport, postId: ID(9) });
    expect(result.ok && result.data?.id).toBe(ID(9));
    expect(calls()[0]).toMatchObject({ method: 'GET', path: `/api/v1/admin/posts/${ID(9)}` });
  });

  test('un 404 remonte', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 404, error: 'Post non trouve' }));
    expect(await loadAdminPost({ source: 'gateway', transport, postId: ID(9) })).toEqual({ ok: false, status: 404, error: 'Post non trouve' });
  });

  test('retirer une publication : DELETE avec le motif, le corps ne porte que `reason`', async () => {
    const { transport, calls } = routedTransport(() => resultatServi({ success: true, message: 'Post supprime avec succes' }));
    const result = await removeAdminPost({ source: 'gateway', transport, postId: ID(9), reason: 'Propos haineux signalés' });
    expect(result).toMatchObject({ ok: true, data: { removed: true } });
    expect(calls()[0]).toMatchObject({ method: 'DELETE', path: `/api/v1/admin/posts/${ID(9)}`, body: { reason: 'Propos haineux signalés' } });
  });

  test('« déjà retirée » (400) remonte avec son statut', async () => {
    const { transport } = routedTransport(() => ({ ok: false, status: 400, error: 'Le post est deja supprime' }));
    const result = await removeAdminPost({ source: 'gateway', transport, postId: ID(9), reason: 'Doublon' });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  test('la clé de la fiche partage le préfixe des publications', () => {
    expect(adminPostQueryKey(ID(9))).toEqual(['admin', 'posts', 'fiche', ID(9)]);
  });
});
