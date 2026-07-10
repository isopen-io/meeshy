import { describe, it, expect } from '@jest/globals';
import { TranslationCache } from '../../../services/message-translation/TranslationCache';
import type { TranslationResult } from '../../../services/zmq-translation';

/**
 * Le cache mémoire de traduction est documenté "LRU" mais évinçait en FIFO :
 * set() supprimait la plus ancienne clé INSÉRÉE et get() ne rafraîchissait pas
 * la récence. Une traduction chaude (relue souvent) insérée tôt finissait
 * évincée — l'inverse du but d'un cache. Ces tests verrouillent le vrai LRU.
 */
const res = (id: string): TranslationResult => ({ messageId: id } as unknown as TranslationResult);

describe('TranslationCache (in-memory) — true LRU eviction', () => {
  it('evicts the least-recently-USED entry, not the oldest inserted', () => {
    const cache = new TranslationCache(2);
    cache.set('a', res('a'));
    cache.set('b', res('b'));

    // Accède à 'a' → 'a' devient le plus récemment utilisé, 'b' le moins.
    expect(cache.get('a')).not.toBeNull();

    cache.set('c', res('c')); // plein → doit évincer 'b' (LRU), pas 'a'

    expect(cache.get('a')).not.toBeNull(); // survécu (récemment utilisé)
    expect(cache.get('b')).toBeNull();     // évincé
    expect(cache.get('c')).not.toBeNull();
  });

  it('stays bounded at maxSize', () => {
    const cache = new TranslationCache(3);
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, res(`k${i}`));
    expect(cache.size).toBe(3);
  });

  it('re-setting an existing key refreshes its recency', () => {
    const cache = new TranslationCache(2);
    cache.set('a', res('a'));
    cache.set('b', res('b'));

    cache.set('a', res('a2')); // re-set 'a' → devient MRU, 'b' devient LRU
    cache.set('c', res('c'));  // plein → évince 'b'

    expect(cache.get('a')?.messageId).toBe('a2');
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });
});
