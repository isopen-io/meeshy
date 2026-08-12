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

describe('TranslationCache.deleteByMessageId', () => {
  it('removes all entries whose key starts with the given messageId prefix', () => {
    const cache = new TranslationCache(10);
    const msgId = 'abc123';
    cache.set(`${msgId}_en_fr`, res(msgId));
    cache.set(`${msgId}_fr`, res(msgId));
    cache.set(`${msgId}_en_de`, res(msgId));
    cache.set('other_en_fr', res('other'));

    const deleted = cache.deleteByMessageId(msgId);

    expect(deleted).toBe(3);
    expect(cache.get(`${msgId}_en_fr`)).toBeNull();
    expect(cache.get(`${msgId}_fr`)).toBeNull();
    expect(cache.get(`${msgId}_en_de`)).toBeNull();
    expect(cache.get('other_en_fr')).not.toBeNull();
  });

  it('returns 0 when no entries match', () => {
    const cache = new TranslationCache(10);
    cache.set('msg1_en_fr', res('msg1'));

    expect(cache.deleteByMessageId('nonexistent')).toBe(0);
    expect(cache.size).toBe(1);
  });

  it('handles empty cache gracefully', () => {
    const cache = new TranslationCache(10);
    expect(cache.deleteByMessageId('anyid')).toBe(0);
  });
});
