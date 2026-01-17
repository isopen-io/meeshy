/**
 * Markdown Parser - LRU Cache
 *
 * Caching layer for parsed HTML with LRU eviction
 */

import type { CacheEntry } from './types';
import { MAX_CACHE_SIZE, CACHE_TTL } from './rules/constants';

const htmlCache = new Map<string, CacheEntry>();

/**
 * Get HTML from cache if valid
 *
 * @param cacheKey - Cache key
 * @returns Cached HTML or null if not found/expired
 */
export const getCachedHtml = (cacheKey: string): string | null => {
  const entry = htmlCache.get(cacheKey);
  // js-early-exit pattern
  if (!entry) return null;

  // Check if cache is still valid
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    htmlCache.delete(cacheKey);
    return null;
  }

  return entry.html;
};

/**
 * Store HTML in cache with LRU eviction
 *
 * @param cacheKey - Cache key
 * @param html - HTML to cache
 */
export const setCachedHtml = (cacheKey: string, html: string): void => {
  // LRU eviction: remove oldest entry if cache is full
  if (htmlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = htmlCache.keys().next().value;
    if (firstKey) {
      htmlCache.delete(firstKey);
    }
  }

  htmlCache.set(cacheKey, {
    html,
    timestamp: Date.now()
  });
};

/**
 * Clear the entire cache
 */
export const clearCache = (): void => {
  htmlCache.clear();
};
