import { describe, expect, test } from 'bun:test';

import { createThumbnailCache, filterThumbnailSize } from './studio-filter-thumbnails';

/** Les miniatures des EFFETS VISUELS (#8794, jumelle de `StoryFilterThumbnails`
 * iOS, #8792) — un seul rendu réduit du fond par fichier, borné. */
describe('createThumbnailCache — un cache BORNÉ, qui rend ce qu’il évince', () => {
  test('au-delà de la borne, la plus ancienne part et son URL est révoquée', () => {
    const revoked: string[] = [];
    const cache = createThumbnailCache({ limit: 2, revoke: (url) => revoked.push(url) });
    cache.set('a', 'blob:a');
    cache.set('b', 'blob:b');
    cache.set('c', 'blob:c');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe('blob:b');
    expect(cache.get('c')).toBe('blob:c');
    expect(revoked).toEqual(['blob:a']);
  });

  test('lire une entrée la rend RÉCENTE : c’est l’autre qui part', () => {
    const revoked: string[] = [];
    const cache = createThumbnailCache({ limit: 2, revoke: (url) => revoked.push(url) });
    cache.set('a', 'blob:a');
    cache.set('b', 'blob:b');
    cache.get('a');
    cache.set('c', 'blob:c');
    expect(cache.get('a')).toBe('blob:a');
    expect(revoked).toEqual(['blob:b']);
  });

  test('réécrire une clé révoque l’URL remplacée', () => {
    const revoked: string[] = [];
    const cache = createThumbnailCache({ limit: 2, revoke: (url) => revoked.push(url) });
    cache.set('a', 'blob:a1');
    cache.set('a', 'blob:a2');
    expect(cache.get('a')).toBe('blob:a2');
    expect(revoked).toEqual(['blob:a1']);
  });
});

describe('filterThumbnailSize — la miniature garde le format du fond, bord long borné', () => {
  test('portrait, paysage, carré ; un format inconnu retombe sur le 9:16 de la scène', () => {
    expect(filterThumbnailSize({ aspectRatio: 0.5, edge: 160 })).toEqual({ width: 80, height: 160 });
    expect(filterThumbnailSize({ aspectRatio: 2, edge: 160 })).toEqual({ width: 160, height: 80 });
    expect(filterThumbnailSize({ aspectRatio: 1, edge: 160 })).toEqual({ width: 160, height: 160 });
    expect(filterThumbnailSize({ aspectRatio: undefined, edge: 160 })).toEqual({ width: 90, height: 160 });
  });
});
