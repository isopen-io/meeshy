import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import {
  REEL_WINDOW_RADIUS,
  activeIndexOf,
  composeReelThread,
  entryReelIds,
  neighborIndex,
  pageModeOf,
  playbackIntentOf,
  reelDisplayOf,
  shouldLoadMoreReels,
} from './thread';

/**
 * LA LOI DU FIL DES RÉELS (#6457) — pure, sans DOM : quel réel se montre, dans
 * quel ordre, lequel joue, lesquels restent montés. Miroir de `ReelsViewModel`
 * (`seed(posts:startId:)`, `loadMoreIfNeeded`) et de `AdaptiveVerticalPager`.
 */
const reel = (id: string, partial: Partial<FeedPost> = {}): FeedPost => ({
  id,
  type: 'REEL',
  createdAt: '2026-09-14T08:00:00.000Z',
  ...partial,
});

const post = (id: string): FeedPost => ({ id, type: 'POST', createdAt: '2026-09-14T08:00:00.000Z' });

const known = (...posts: readonly FeedPost[]): ReadonlyMap<string, FeedPost> => new Map(posts.map((p) => [p.id, p]));

describe('entryReelIds — l’ouverture instantanée depuis le Flux', () => {
  test('la graine vient EN TÊTE, suivie des autres réels du Flux dans leur ordre, jamais les posts', () => {
    const feed = [reel('r1'), post('p1'), reel('r2'), reel('r3')];
    expect(entryReelIds({ seedId: 'r2', feedPosts: feed })).toEqual(['r2', 'r1', 'r3']);
  });

  test('sans graine, les réels du Flux dans leur ordre', () => {
    expect(entryReelIds({ feedPosts: [post('p1'), reel('r1'), reel('r2')] })).toEqual(['r1', 'r2']);
  });

  test('une graine absente du Flux (lien profond) garde sa place en tête', () => {
    expect(entryReelIds({ seedId: 'rX', feedPosts: [reel('r1')] })).toEqual(['rX', 'r1']);
  });
});

describe('composeReelThread — l’ordre ne bouge jamais sous le doigt', () => {
  test('entrée d’abord, puis la suite servie, dédoublonnée, première occurrence gagnante', () => {
    const thread = composeReelThread({
      entryIds: ['r2', 'r1'],
      known: known(reel('r1'), reel('r2'), reel('r5')),
      served: [reel('r5'), reel('r1'), reel('r6')],
    });
    expect(thread.map((r) => r.id)).toEqual(['r2', 'r1', 'r5', 'r6']);
  });

  test('la donnée la plus RÉCENTE sert : un réel servi remplace sa copie du Flux, à la même place', () => {
    const thread = composeReelThread({
      entryIds: ['r1'],
      known: known(reel('r1', { likeCount: 3 })),
      served: [reel('r1', { likeCount: 9 })],
    });
    expect(thread).toHaveLength(1);
    expect(thread[0]?.likeCount).toBe(9);
  });

  test('un identifiant sans donnée (graine encore en vol, réel supprimé) ne peint rien', () => {
    const thread = composeReelThread({ entryIds: ['rX', 'r1'], known: known(reel('r1')), served: [] });
    expect(thread.map((r) => r.id)).toEqual(['r1']);
  });

  test('un POST servi par erreur ne se glisse jamais dans le fil des réels', () => {
    const thread = composeReelThread({ entryIds: [], known: known(), served: [post('p1'), reel('r1')] });
    expect(thread.map((r) => r.id)).toEqual(['r1']);
  });
});

describe('activeIndexOf — le réel visible', () => {
  test('arrondi à la page la plus proche du défilement', () => {
    expect(activeIndexOf({ scrollTop: 0, pageHeight: 800, count: 5 })).toBe(0);
    expect(activeIndexOf({ scrollTop: 390, pageHeight: 800, count: 5 })).toBe(0);
    expect(activeIndexOf({ scrollTop: 410, pageHeight: 800, count: 5 })).toBe(1);
    expect(activeIndexOf({ scrollTop: 3200, pageHeight: 800, count: 5 })).toBe(4);
  });

  test('borné au fil, et 0 tant que la hauteur est inconnue', () => {
    expect(activeIndexOf({ scrollTop: 99_999, pageHeight: 800, count: 3 })).toBe(2);
    expect(activeIndexOf({ scrollTop: -40, pageHeight: 800, count: 3 })).toBe(0);
    expect(activeIndexOf({ scrollTop: 400, pageHeight: 0, count: 3 })).toBe(0);
    expect(activeIndexOf({ scrollTop: 400, pageHeight: 800, count: 0 })).toBe(0);
  });
});

describe('pageModeOf — un seul réel joue, ses voisins restent montés, les autres sont libérés', () => {
  test('la fenêtre est d’un réel de part et d’autre', () => {
    expect(REEL_WINDOW_RADIUS).toBe(1);
    expect(pageModeOf(3, 3)).toBe('active');
    expect(pageModeOf(2, 3)).toBe('near');
    expect(pageModeOf(4, 3)).toBe('near');
    expect(pageModeOf(1, 3)).toBe('far');
    expect(pageModeOf(5, 3)).toBe('far');
  });
});

describe('playbackIntentOf — la lecture suit la visibilité', () => {
  test('le réel qui devient visible joue, sauf s’il joue déjà', () => {
    expect(playbackIntentOf({ active: true, status: 'idle' })).toBe('play');
    expect(playbackIntentOf({ active: true, status: 'paused' })).toBe('play');
    expect(playbackIntentOf({ active: true, status: 'playing' })).toBeNull();
  });

  test('le réel qui sort du champ se met en pause s’il jouait, et rien d’autre', () => {
    expect(playbackIntentOf({ active: false, status: 'playing' })).toBe('pause');
    expect(playbackIntentOf({ active: false, status: 'idle' })).toBeNull();
    expect(playbackIntentOf({ active: false, status: 'paused' })).toBeNull();
  });

  test('un échec de lecture ne se rejoue pas en boucle : seul le geste « Réessayer » relance', () => {
    expect(playbackIntentOf({ active: true, status: 'error' })).toBeNull();
    expect(playbackIntentOf({ active: false, status: 'error' })).toBeNull();
  });
});

describe('neighborIndex — les flèches du clavier valent le balayage', () => {
  test('suivant et précédent, bornés aux extrémités', () => {
    expect(neighborIndex({ index: 0, direction: 'next', count: 3 })).toBe(1);
    expect(neighborIndex({ index: 2, direction: 'next', count: 3 })).toBe(2);
    expect(neighborIndex({ index: 1, direction: 'previous', count: 3 })).toBe(0);
    expect(neighborIndex({ index: 0, direction: 'previous', count: 3 })).toBe(0);
  });
});

describe('reelDisplayOf — la scène montre ce qui se lit, la vidéo d’abord', () => {
  const m = (id: string, kind: string) => ({ id, kind });

  test('la vidéo gagne sur les images, même rangée après elles', () => {
    expect(reelDisplayOf([m('i1', 'image'), m('v1', 'video')])).toEqual({ kind: 'video', media: m('v1', 'video') });
  });

  test('l’audio passe avant les images', () => {
    expect(reelDisplayOf([m('i1', 'image'), m('a1', 'audio')])).toEqual({ kind: 'audio', media: m('a1', 'audio') });
  });

  test('les images se parcourent toutes, dans leur ordre ; un fichier illisible ne se montre pas', () => {
    expect(reelDisplayOf([m('i1', 'image'), m('f1', 'other'), m('i2', 'image')])).toEqual({ kind: 'images', images: [m('i1', 'image'), m('i2', 'image')] });
    expect(reelDisplayOf([m('f1', 'other')])).toEqual({ kind: 'none' });
    expect(reelDisplayOf([])).toEqual({ kind: 'none' });
  });
});

describe('shouldLoadMoreReels — la suite se demande avant la fin, comme `loadMoreIfNeeded`', () => {
  test('à trois réels du bout', () => {
    expect(shouldLoadMoreReels({ activeIndex: 6, count: 10 })).toBe(false);
    expect(shouldLoadMoreReels({ activeIndex: 7, count: 10 })).toBe(true);
    expect(shouldLoadMoreReels({ activeIndex: 0, count: 2 })).toBe(true);
    expect(shouldLoadMoreReels({ activeIndex: 0, count: 0 })).toBe(false);
  });
});
