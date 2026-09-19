import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import { filterPosts, showsEmptyState, toggledFilter } from './posts-filter';

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

/**
 * **LE VIDE FILTRÉ SE TAIT TANT QU'UNE PAGE RESTE À LIRE** (revue #7083,
 * défaut majeur 2) — miroir de `filteredEmptyState`
 * (`ProfileUserPostsList.swift:497-510`).
 *
 * Le défaut mesuré : la tuile « 2 Réels », la phrase « Aucun réel · Touchez à
 * nouveau la tuile pour tout revoir » et le bouton « Charger plus » peints
 * dans la MÊME image. Les deux branches du rendu étaient disjointes
 * (`models.length === 0` / `hasNextPage`), donc chaque moitié se mesurait
 * verte séparément : c'est leur COEXISTENCE que cette loi interdit.
 */
describe('showsEmptyState — une absence ne s’affirme que quand plus rien n’est à lire', () => {
  test('sous un filtre, tant qu’une page reste à lire, l’écran se TAIT', () => {
    expect(showsEmptyState({ visible: 0, filter: 'reels', hasNextPage: true })).toBe(false);
    expect(showsEmptyState({ visible: 0, filter: 'posts', hasNextPage: true })).toBe(false);
  });

  test('la dernière page lue, le vide filtré se DIT — sinon la tuile surmonterait du vide', () => {
    expect(showsEmptyState({ visible: 0, filter: 'reels', hasNextPage: false })).toBe(true);
  });

  test('le vide du COMPTE se dit tout de suite : c’est la réponse de la passerelle, pas un artefact de filtre', () => {
    expect(showsEmptyState({ visible: 0, filter: 'all', hasNextPage: true })).toBe(true);
    expect(showsEmptyState({ visible: 0, filter: 'all', hasNextPage: false })).toBe(true);
  });

  test('une seule ligne visible suffit à ne RIEN affirmer d’absent', () => {
    expect(showsEmptyState({ visible: 1, filter: 'reels', hasNextPage: false })).toBe(false);
    expect(showsEmptyState({ visible: 1, filter: 'all', hasNextPage: false })).toBe(false);
  });
});
