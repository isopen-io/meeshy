import { describe, expect, test } from 'bun:test';

import type { Post } from '@meeshy/shared/types/post';

import { unwrap } from './client';
import type { ApiResult, HttpTransport } from './http';
import {
  decodeStatusMoods,
  decodeStoryGroups,
  hasUnviewedStories,
  isGroupFullyExpired,
  latestStoryOf,
  loadStatuses,
  loadStoryTray,
  type StoryGroup,
} from './stories';

/**
 * `stories.ts` — LE PORT (#5652, bloc A). Motif EXISTANT `conversations.
 * test.ts` : un transport FACTICE, jamais un vrai réseau ; erreur ≠ vide
 * (leçon « erreur avalée en VIDE »).
 */

function fakeTransport(result: ApiResult<unknown>): HttpTransport {
  const request = (async () => result) as HttpTransport['request'];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = request;
  return transport;
}

const author = (id: string, displayName: string) => ({ id, username: id, displayName });

function post(partial: Partial<Post> & { readonly id: string; readonly authorId: string }): Post {
  return {
    type: 'STORY',
    visibility: 'FRIENDS',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: new Date('2026-09-12T10:00:00Z'),
    updatedAt: new Date('2026-09-12T10:00:00Z'),
    ...partial,
  };
}

describe('stories — loadStoryTray / loadStatuses (fixtures)', () => {
  test('rend le corpus de fixtures quand source=fixtures', async () => {
    const result = await loadStoryTray({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) });
    expect(result.ok).toBe(true);
  });

  test('rend le corpus de statuts de fixtures quand source=fixtures', async () => {
    const result = await loadStatuses({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) });
    expect(result.ok).toBe(true);
  });
});

describe('stories — loadStoryTray (gateway)', () => {
  test('appelle GET /api/v1/social/posts?scope=stories&projection=tray', async () => {
    let calledPath: string | undefined;
    const transport = fakeTransport({ ok: true, data: [] });
    transport.request = (async (req) => {
      calledPath = req.path;
      return { ok: true, data: [] };
    }) as HttpTransport['request'];
    await loadStoryTray({ source: 'gateway', transport });
    expect(calledPath).toBe('/api/v1/social/posts?scope=stories&projection=tray');
  });

  test('une erreur réseau N’EST PAS avalée en corpus vide — elle reste un échec', async () => {
    const transport = fakeTransport({ ok: false, status: 500, error: 'Internal server error' });
    const result = await loadStoryTray({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    expect(() => unwrap(result)).toThrow();
  });
});

describe('stories — loadStatuses (gateway)', () => {
  test('appelle GET /api/v1/social/posts?scope=statuses', async () => {
    let calledPath: string | undefined;
    const transport = fakeTransport({ ok: true, data: [] });
    transport.request = (async (req) => {
      calledPath = req.path;
      return { ok: true, data: [] };
    }) as HttpTransport['request'];
    await loadStatuses({ source: 'gateway', transport });
    expect(calledPath).toBe('/api/v1/social/posts?scope=statuses');
  });
});

describe('decodeStoryGroups — regroupement par auteur, ordre croissant DANS le groupe', () => {
  test('groupe les stories par auteur, la première rencontre porte les métadonnées', () => {
    const raw: readonly Post[] = [
      post({ id: 's-2', authorId: 'u-a', author: author('u-a', 'Amina'), createdAt: new Date('2026-09-12T12:00:00Z') }),
      post({ id: 's-1', authorId: 'u-a', author: author('u-a', 'Amina'), createdAt: new Date('2026-09-12T11:00:00Z') }),
      post({ id: 's-b', authorId: 'u-b', author: author('u-b', 'Bruno'), createdAt: new Date('2026-09-12T09:00:00Z') }),
    ];
    const groups = decodeStoryGroups(raw);
    expect(groups.map((g) => g.id)).toEqual(['u-a', 'u-b']);
    expect(groups[0]?.displayName).toBe('Amina');
    // Servi createdAt DESC (s-2 avant s-1) — le décodeur RENVERSE en croissant.
    expect(groups[0]?.stories.map((s) => s.id)).toEqual(['s-1', 's-2']);
  });

  test('latestStoryOf lit le dernier élément (ordre croissant)', () => {
    const raw: readonly Post[] = [
      post({ id: 's-new', authorId: 'u-a', createdAt: new Date('2026-09-12T12:00:00Z') }),
      post({ id: 's-old', authorId: 'u-a', createdAt: new Date('2026-09-12T09:00:00Z') }),
    ];
    const [group] = decodeStoryGroups(raw);
    expect(group && latestStoryOf(group)?.id).toBe('s-new');
  });

  test('isViewedByMe non booléen se normalise en false (jamais une exception)', () => {
    const raw: readonly Post[] = [post({ id: 's-1', authorId: 'u-a' })];
    const [group] = decodeStoryGroups(raw);
    expect(group && hasUnviewedStories(group)).toBe(true);
  });

  test('une story vue rend hasUnviewedStories faux quand toutes le sont', () => {
    const raw: readonly Post[] = [{ ...post({ id: 's-1', authorId: 'u-a' }), isViewedByMe: true } as Post];
    const [group] = decodeStoryGroups(raw);
    expect(group && hasUnviewedStories(group)).toBe(false);
  });
});

describe('isGroupFullyExpired', () => {
  const now = new Date('2026-09-12T12:00:00Z');

  test('vrai quand toutes les stories du groupe sont expirées', () => {
    const g: StoryGroup = {
      id: 'u-a',
      displayName: 'Amina',
      stories: [{ id: 's-1', createdAt: new Date(0), expiresAt: new Date('2026-09-11T00:00:00Z'), isViewed: true }],
    };
    expect(isGroupFullyExpired(g, now)).toBe(true);
  });

  test('faux dès qu’une story reste active', () => {
    const g: StoryGroup = {
      id: 'u-a',
      displayName: 'Amina',
      stories: [{ id: 's-1', createdAt: new Date(0), expiresAt: new Date('2026-09-13T00:00:00Z'), isViewed: true }],
    };
    expect(isGroupFullyExpired(g, now)).toBe(false);
  });
});

describe('decodeStatusMoods — le PLUS RÉCENT par auteur', () => {
  test('le premier rencontré (créé le plus récemment, servi en tête) gagne', () => {
    const raw: readonly Post[] = [
      { ...post({ id: 'st-2', authorId: 'u-a', type: 'STATUS' }), moodEmoji: '🎉' },
      { ...post({ id: 'st-1', authorId: 'u-a', type: 'STATUS' }), moodEmoji: '😴' },
    ];
    expect(decodeStatusMoods(raw)).toEqual({ 'u-a': '🎉' });
  });

  test('ignore un moodEmoji vide ou absent', () => {
    const raw: readonly Post[] = [post({ id: 'st-1', authorId: 'u-a', type: 'STATUS' })];
    expect(decodeStatusMoods(raw)).toEqual({});
  });
});

/**
 * UNE CHAÎNE VIDE N'EST PAS UNE URL (revue #5652) — `thumbnailUrl` est
 * nullable et `fileUrl` peut arriver vide d'un média en traitement (les
 * fixtures du rail le font déjà : `fileUrl: ''`). `?? undefined` ne l'attrape
 * pas, et `<img src="">` RECHARGE le document courant — une requête de plus et
 * un carré cassé par-dessus les initiales.
 */
describe('decodeStoryGroups — une URL VIDE est une ABSENCE, jamais une couverture', () => {
  test('`fileUrl: ""` ne produit AUCUNE previewUrl', () => {
    const raw: readonly Post[] = [
      post({ id: 's-1', authorId: 'u-a', media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: '', order: 0 }] as NonNullable<Post['media']> }),
    ];
    const [group] = decodeStoryGroups(raw);
    expect(group && latestStoryOf(group)?.previewUrl).toBeUndefined();
  });

  test('`thumbnailUrl` VIDE retombe sur `fileUrl` non vide', () => {
    const raw: readonly Post[] = [
      post({
        id: 's-1',
        authorId: 'u-a',
        media: [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://cdn.test/f.jpg', thumbnailUrl: '', order: 0 }] as NonNullable<Post['media']>,
      }),
    ];
    const [group] = decodeStoryGroups(raw);
    expect(group && latestStoryOf(group)?.previewUrl).toBe('https://cdn.test/f.jpg');
  });

  test('un `avatar` VIDE sur l’auteur ne devient pas une image', () => {
    const raw: readonly Post[] = [post({ id: 's-1', authorId: 'u-a', author: { id: 'u-a', username: 'a', avatar: '' } as NonNullable<Post['author']> })];
    const [group] = decodeStoryGroups(raw);
    expect(group?.avatarUrl).toBeUndefined();
  });
});
