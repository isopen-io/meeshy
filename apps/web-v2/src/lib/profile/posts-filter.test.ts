import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import { filterPosts, toggledFilter } from './posts-filter';

const post = (id: string, type: string): FeedPost => ({ id, type, createdAt: '2026-09-01T10:00:00.000Z' });

const CORPUS: readonly FeedPost[] = [post('a', 'POST'), post('b', 'REEL'), post('c', 'POST'), post('d', 'REEL')];

describe('toggledFilter', () => {
  test('toucher une tuile filtre ; RE-toucher la même rétablit tout', () => {
    expect(toggledFilter('all', 'reels')).toBe('reels');
    expect(toggledFilter('reels', 'reels')).toBe('all');
    expect(toggledFilter('reels', 'posts')).toBe('posts');
    expect(toggledFilter('posts', 'posts')).toBe('all');
  });
});

describe('filterPosts', () => {
  test('« tout » ne retire rien, et rend la MÊME référence', () => {
    expect(filterPosts(CORPUS, 'all')).toBe(CORPUS);
  });

  test('« réels » ne garde que les réels ; « postes » ne garde que les autres', () => {
    expect(filterPosts(CORPUS, 'reels').map((p) => p.id)).toEqual(['b', 'd']);
    expect(filterPosts(CORPUS, 'posts').map((p) => p.id)).toEqual(['a', 'c']);
  });

  test('un type INCONNU du serveur compte comme un poste, jamais comme un réel', () => {
    expect(filterPosts([post('e', 'STATUS')], 'posts').map((p) => p.id)).toEqual(['e']);
    expect(filterPosts([post('e', 'STATUS')], 'reels')).toEqual([]);
  });
});
