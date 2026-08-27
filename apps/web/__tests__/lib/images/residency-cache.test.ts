/**
 * Registre de résidence — l'équivalent web de la lecture synchrone NSCache
 * d'iOS (`DiskCacheStore.cachedImage`, cf. `FullscreenImageSource.isResident`,
 * #3871 → #3878). Une image/poster "résident" doit s'afficher SANS spinner
 * ni fond flou (Cache-First, § Instant App Principles du CLAUDE.md racine).
 */
import { createResidencyCache } from '@/lib/images/residency-cache';

describe('createResidencyCache', () => {
  it('reports an unmarked URL as not resident', () => {
    const cache = createResidencyCache(10);
    expect(cache.has('https://cdn.example/full.jpg')).toBe(false);
  });

  it('reports a marked URL as resident — cache non vide, jamais de spinner', () => {
    const cache = createResidencyCache(10);
    cache.mark('https://cdn.example/full.jpg');
    expect(cache.has('https://cdn.example/full.jpg')).toBe(true);
  });

  it('treats null/undefined/empty URLs as never resident', () => {
    const cache = createResidencyCache(10);
    expect(cache.has(null)).toBe(false);
    expect(cache.has(undefined)).toBe(false);
    expect(cache.has('')).toBe(false);
  });

  it('marking null/undefined/empty is a no-op — does not throw, does not pollute residency', () => {
    const cache = createResidencyCache(10);
    cache.mark(null);
    cache.mark(undefined);
    cache.mark('');
    expect(cache.has(null)).toBe(false);
    expect(cache.has('')).toBe(false);
  });

  it('evicts the least-recently-marked entry once maxEntries is exceeded', () => {
    const cache = createResidencyCache(2);
    cache.mark('a');
    cache.mark('b');
    cache.mark('c'); // evicts 'a'
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('re-marking an already-resident URL refreshes it as most-recently-used', () => {
    const cache = createResidencyCache(2);
    cache.mark('a');
    cache.mark('b');
    cache.mark('a'); // 'a' is now most-recent; 'b' is now oldest
    cache.mark('c'); // evicts 'b', not 'a'
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('reset clears all residency', () => {
    const cache = createResidencyCache(10);
    cache.mark('a');
    cache.reset();
    expect(cache.has('a')).toBe(false);
  });

  it('two independent instances never share residency', () => {
    const images = createResidencyCache(10);
    const posters = createResidencyCache(10);
    images.mark('shared-url');
    expect(images.has('shared-url')).toBe(true);
    expect(posters.has('shared-url')).toBe(false);
  });

  it('rejects a non-positive maxEntries', () => {
    expect(() => createResidencyCache(0)).toThrow();
    expect(() => createResidencyCache(-1)).toThrow();
  });
});
