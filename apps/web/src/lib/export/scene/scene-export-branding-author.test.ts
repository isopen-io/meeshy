import { describe, expect, test } from 'bun:test';

import type { StoryPlaybackAuthor } from '@/lib/stories/playback';

import { brandingAuthorOf } from './scene-export-branding-author';

const author = (overrides: Partial<StoryPlaybackAuthor> = {}): StoryPlaybackAuthor => ({
  id: 'u-author',
  username: 'windie',
  displayName: 'Windie Nh',
  avatar: 'https://cdn.example/a.jpg',
  ...overrides,
});

describe("l'auteur d'une story exportée, lu sur ce que le serveur a servi", () => {
  test('nom, @username, avatar et bannière viennent de la charge servie', () => {
    const branded = brandingAuthorOf({ author: author({ banner: 'https://cdn.example/b.jpg' }), context: {} });
    expect(branded).toMatchObject({ authorId: 'u-author', displayName: 'Windie Nh', username: 'windie', avatarSrc: 'https://cdn.example/a.jpg', bannerSrc: 'https://cdn.example/b.jpg', self: false });
  });

  test("la présence est celle qui a été SERVIE ; rien de servi (pas ami) ⇒ aucune présence", () => {
    const served = brandingAuthorOf({ author: author({ isOnline: true, lastActiveAt: '2026-10-31T11:59:00Z' }), context: {} });
    expect(served?.presence).toEqual({ isOnline: true, lastActiveAt: '2026-10-31T11:59:00Z' });
    expect(brandingAuthorOf({ author: author(), context: {} })?.presence).toBeNull();
  });

  test("un auteur qui n'a servi que lastActiveAt garde cette seule information", () => {
    expect(brandingAuthorOf({ author: author({ lastActiveAt: '2026-10-31T11:59:00Z' }), context: {} })?.presence).toEqual({ isOnline: null, lastActiveAt: '2026-10-31T11:59:00Z' });
  });

  test('le lecteur connecté est l\'auteur : c\'est SA story', () => {
    expect(brandingAuthorOf({ author: author(), context: { viewerId: 'u-author' } })?.self).toBe(true);
    expect(brandingAuthorOf({ author: author(), context: { viewerId: 'someone' } })?.self).toBe(false);
  });

  test("l'humeur détenue par le web est transmise telle quelle", () => {
    expect(brandingAuthorOf({ author: author(), context: { mood: { emoji: '🎉', message: 'Fête' } } })).toMatchObject({ moodEmoji: '🎉', moodMessage: 'Fête' });
    expect(brandingAuthorOf({ author: author(), context: {} })).toMatchObject({ moodEmoji: null, moodMessage: null });
  });

  test('la teinte de repli est la loi partagée de la couleur d\'auteur', () => {
    const first = brandingAuthorOf({ author: author(), context: {} });
    const second = brandingAuthorOf({ author: author(), context: {} });
    expect(first?.accentHex).toMatch(/^[0-9A-Fa-f]{6}$/);
    expect(first?.accentHex).toBe(second?.accentHex ?? '');
  });

  test('sans nom affiché, le prénom et le nom ; sans rien, le @username ; sans aucun, pas d\'identité', () => {
    expect(brandingAuthorOf({ author: author({ displayName: undefined, firstName: 'Windie', lastName: 'Nh' }), context: {} })?.displayName).toBe('Windie Nh');
    expect(brandingAuthorOf({ author: author({ displayName: undefined }), context: {} })?.displayName).toBe('windie');
    expect(brandingAuthorOf({ author: author({ displayName: undefined, username: undefined }), context: {} })).toBeNull();
    expect(brandingAuthorOf({ author: undefined, context: {} })).toBeNull();
  });
});
