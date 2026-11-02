import { describe, expect, test } from 'bun:test';

import { SEARCH_TABS, searchTabOf } from './global-search-screen';

/**
 * #14620 — la recherche générale : trois onglets, Messages · Posts ·
 * Personnes (plus d'onglet Conversations), l'onglet demandé par `?tab=` et
 * Messages sinon.
 */
describe('la recherche générale', () => {
  test('les onglets sont Messages, Posts, Personnes — Conversations n’en est plus', () => {
    expect(SEARCH_TABS).toEqual(['messages', 'posts', 'people']);
  });

  test('?tab= choisit l’onglet, un onglet inconnu ouvre Messages', () => {
    expect(searchTabOf('posts')).toBe('posts');
    expect(searchTabOf('conversations')).toBe('messages');
    expect(searchTabOf(null)).toBe('messages');
  });
});
