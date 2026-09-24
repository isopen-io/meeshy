import { describe, expect, test } from 'bun:test';

import type { StoryTrayMedia, StoryTrayPost } from '@/lib/api/stories';
import { myActiveStories, myStoryDateLabel, myStoryThumbnail } from '@/lib/view/my-stories';

/**
 * **LA LOI DE « MES STORIES »** (#6149) — miroir `MyStoriesView.swift`. Voir
 * le doc-comment de `my-stories.ts`.
 */

const NOW = new Date('2026-09-24T12:00:00.000Z').getTime();

const story = (over: Partial<StoryTrayPost> & { readonly id: string }): StoryTrayPost => ({
  type: 'STORY',
  createdAt: '2026-09-24T10:00:00.000Z',
  author: { id: 'u-moi', username: 'moi' },
  ...over,
});

describe('myActiveStories — mes stories actives, les plus récentes d’abord', () => {
  test('les stories expirées et celles des autres sont écartées, le reste est trié desc', () => {
    const stories: readonly StoryTrayPost[] = [
      // Expirée par `expiresAt` explicite (passé).
      story({ id: 'expired-explicit', createdAt: '2026-09-24T09:00:00.000Z', expiresAt: '2026-09-24T09:30:00.000Z' }),
      // Sans `expiresAt` : expirée par le défaut de 20h (créée il y a 21h).
      story({ id: 'expired-default', createdAt: '2026-09-23T15:00:00.000Z' }),
      // Deux actives, à des instants différents.
      story({ id: 'active-older', createdAt: '2026-09-24T08:00:00.000Z' }),
      story({ id: 'active-newer', createdAt: '2026-09-24T11:00:00.000Z' }),
      // D'un autre auteur — jamais dans « mes » stories.
      story({ id: 'other', createdAt: '2026-09-24T11:30:00.000Z', author: { id: 'u-ines', username: 'ines' } }),
    ];

    const mine = myActiveStories({ stories, viewerId: 'u-moi', now: NOW });

    expect(mine.map((s) => s.id)).toEqual(['active-newer', 'active-older']);
  });

  test('sans lecteur identifié, aucune story', () => {
    expect(myActiveStories({ stories: [story({ id: 's1' })], viewerId: undefined, now: NOW })).toEqual([]);
  });

  test('aucune story de moi ⇒ liste vide, jamais une erreur', () => {
    const stories: readonly StoryTrayPost[] = [story({ id: 's1', author: { id: 'u-ines', username: 'ines' } })];
    expect(myActiveStories({ stories, viewerId: 'u-moi', now: NOW })).toEqual([]);
  });
});

const media = (over: Partial<StoryTrayMedia> = {}): StoryTrayMedia => ({ id: 'm1', ...over });

describe('myStoryThumbnail — composite, distante, aplat', () => {
  test('un thumbHash pose le PLACEHOLDER, une `thumbnailUrl` sert la photo', () => {
    // Un thumbHash valide (3+ octets, base64 standard).
    const thumb = myStoryThumbnail([media({ thumbHash: 'AQAAAA==', thumbnailUrl: 'https://cdn/thumb.jpg' })]);
    expect(thumb.kind).toBe('photo');
    if (thumb.kind !== 'photo') throw new Error('unreachable');
    expect(thumb.url).toBe('https://cdn/thumb.jpg');
    expect(thumb.placeholder?.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('sans `thumbnailUrl`, la loi retombe sur `storyMediaUrl` (fileUrl puis url)', () => {
    const thumb = myStoryThumbnail([media({ fileUrl: 'https://cdn/full.jpg' })]);
    expect(thumb).toEqual({ kind: 'photo', url: 'https://cdn/full.jpg', placeholder: undefined });

    const legacy = myStoryThumbnail([media({ url: 'https://cdn/legacy.jpg' })]);
    expect(legacy).toEqual({ kind: 'photo', url: 'https://cdn/legacy.jpg', placeholder: undefined });
  });

  test('sans média, ou sans aucune adresse exploitable ⇒ un simple placeholder', () => {
    expect(myStoryThumbnail(undefined)).toEqual({ kind: 'placeholder' });
    expect(myStoryThumbnail([])).toEqual({ kind: 'placeholder' });
    expect(myStoryThumbnail([media()])).toEqual({ kind: 'placeholder' });
  });

  test('un thumbHash illisible ne casse rien — la photo reste servie, sans aplat', () => {
    const thumb = myStoryThumbnail([media({ thumbHash: 'x', fileUrl: 'https://cdn/full.jpg' })]);
    expect(thumb).toEqual({ kind: 'photo', url: 'https://cdn/full.jpg', placeholder: undefined });
  });
});

describe('myStoryDateLabel — relative sous un mois calendaire, date au-delà', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');

  test('il y a deux jours ⇒ relatif, en français', () => {
    const label = myStoryDateLabel(new Date('2026-09-22T12:00:00.000Z'), now, 'fr');
    expect(label).toContain('2');
    expect(label).not.toMatch(/\d{4}/);
  });

  test('il y a 25 jours (sous le mois calendaire) ⇒ encore relatif', () => {
    const label = myStoryDateLabel(new Date('2026-08-30T12:00:00.000Z'), now, 'fr');
    expect(label).not.toBe(new Intl.DateTimeFormat('fr', { dateStyle: 'medium' }).format(new Date('2026-08-30T12:00:00.000Z')));
  });

  test('un mois et un jour avant ⇒ la date ABSOLUE, jamais un compte de jours', () => {
    const target = new Date('2026-08-23T12:00:00.000Z');
    expect(myStoryDateLabel(target, now, 'fr')).toBe(new Intl.DateTimeFormat('fr', { dateStyle: 'medium' }).format(target));
  });

  test('la langue change le mot — jamais une prose figée', () => {
    const target = new Date('2026-09-22T12:00:00.000Z');
    const fr = myStoryDateLabel(target, now, 'fr');
    const de = myStoryDateLabel(target, now, 'de');
    expect(fr).not.toBe(de);
  });
});
