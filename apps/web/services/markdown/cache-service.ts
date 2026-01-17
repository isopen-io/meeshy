/**
 * LRU Cache Service for parsed HTML
 * - Caches parsed markdown to HTML
 * - LRU eviction policy
 * - TTL-based invalidation
 */

import { MAX_CACHE_SIZE, CACHE_TTL } from './constants';
import type { CacheEntry } from './types';

const htmlCache = new Map<string, CacheEntry>();

/**
 * Get HTML from cache if valid
 */
export const getCachedHtml = (cacheKey: string): string | null => {
  const entry = htmlCache.get(cacheKey);
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

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  return {
    size: htmlCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: CACHE_TTL
  };
};
