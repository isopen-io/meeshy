import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LanguageCache } from '../../../services/message-translation/LanguageCache';

describe('LanguageCache', () => {
  let cache: LanguageCache;
  const conversationId = 'conv-123';
  const languages = ['en', 'fr', 'es'];

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create cache with default TTL and max size', () => {
      cache = new LanguageCache();
      expect(cache).toBeDefined();
      expect(cache.size).toBe(0);
    });

    it('should create cache with custom TTL and max size', () => {
      const customTTL = 10000; // 10 seconds
      const customMaxSize = 50;
      cache = new LanguageCache(customTTL, customMaxSize);
      expect(cache).toBeDefined();
      expect(cache.size).toBe(0);
    });
  });

  describe('set and get', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should store and retrieve languages for a conversation', () => {
      cache.set(conversationId, languages);
      const retrieved = cache.get(conversationId);
      expect(retrieved).toEqual(languages);
      expect(cache.size).toBe(1);
    });

    it('should return null for non-existent conversation', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update existing conversation languages', () => {
      cache.set(conversationId, languages);
      const newLanguages = ['de', 'it'];
      cache.set(conversationId, newLanguages);

      const retrieved = cache.get(conversationId);
      expect(retrieved).toEqual(newLanguages);
      expect(cache.size).toBe(1);
    });

    it('should store multiple conversations', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);

      expect(cache.get('conv-1')).toEqual(['en']);
      expect(cache.get('conv-2')).toEqual(['fr']);
      expect(cache.get('conv-3')).toEqual(['es']);
      expect(cache.size).toBe(3);
    });
  });

  describe('TTL and expiration', () => {
    beforeEach(() => {
      const ttl = 5 * 60 * 1000; // 5 minutes
      cache = new LanguageCache(ttl);
    });

    it('should return cached value before TTL expires', () => {
      cache.set(conversationId, languages);

      // Advance time by 4 minutes (less than TTL)
      jest.advanceTimersByTime(4 * 60 * 1000);

      const retrieved = cache.get(conversationId);
      expect(retrieved).toEqual(languages);
    });

    it('should return null after TTL expires', () => {
      cache.set(conversationId, languages);

      // Advance time by 6 minutes (more than TTL)
      jest.advanceTimersByTime(6 * 60 * 1000);

      const retrieved = cache.get(conversationId);
      expect(retrieved).toBeNull();
    });

    it('should remove entry from cache after TTL expires', () => {
      cache.set(conversationId, languages);
      expect(cache.size).toBe(1);

      // Advance time past TTL
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Accessing expired entry should remove it
      cache.get(conversationId);
      expect(cache.size).toBe(0);
    });

    it('should handle custom TTL correctly', () => {
      const customTTL = 10000; // 10 seconds
      cache = new LanguageCache(customTTL);

      cache.set(conversationId, languages);

      // Before expiration
      jest.advanceTimersByTime(9000);
      expect(cache.get(conversationId)).toEqual(languages);

      // After expiration
      jest.advanceTimersByTime(2000);
      expect(cache.get(conversationId)).toBeNull();
    });
  });

  describe('max size and eviction', () => {
    it('should evict oldest entry when max size is reached', () => {
      const maxSize = 3;
      cache = new LanguageCache(5 * 60 * 1000, maxSize);

      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);
      expect(cache.size).toBe(3);

      // Adding 4th entry should evict the first
      cache.set('conv-4', ['de']);
      expect(cache.size).toBe(3);
      expect(cache.get('conv-1')).toBeNull(); // First entry evicted
      expect(cache.get('conv-2')).toEqual(['fr']);
      expect(cache.get('conv-3')).toEqual(['es']);
      expect(cache.get('conv-4')).toEqual(['de']);
    });

    it('should handle max size of 1', () => {
      cache = new LanguageCache(5 * 60 * 1000, 1);

      cache.set('conv-1', ['en']);
      expect(cache.size).toBe(1);

      cache.set('conv-2', ['fr']);
      expect(cache.size).toBe(1);
      expect(cache.get('conv-1')).toBeNull();
      expect(cache.get('conv-2')).toEqual(['fr']);
    });

    it('should not evict if size is below max', () => {
      cache = new LanguageCache(5 * 60 * 1000, 10);

      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);

      expect(cache.size).toBe(3);
      expect(cache.get('conv-1')).toEqual(['en']);
      expect(cache.get('conv-2')).toEqual(['fr']);
      expect(cache.get('conv-3')).toEqual(['es']);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should delete an existing entry', () => {
      cache.set(conversationId, languages);
      expect(cache.size).toBe(1);

      const deleted = cache.delete(conversationId);
      expect(deleted).toBe(true);
      expect(cache.size).toBe(0);
      expect(cache.get(conversationId)).toBeNull();
    });

    it('should return false when deleting non-existent entry', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should not affect other entries when deleting', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);

      cache.delete('conv-2');

      expect(cache.get('conv-1')).toEqual(['en']);
      expect(cache.get('conv-2')).toBeNull();
      expect(cache.get('conv-3')).toEqual(['es']);
      expect(cache.size).toBe(2);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should clear all entries', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);
      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('conv-1')).toBeNull();
      expect(cache.get('conv-2')).toBeNull();
      expect(cache.get('conv-3')).toBeNull();
    });

    it('should work on empty cache', () => {
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should allow adding entries after clear', () => {
      cache.set(conversationId, languages);
      cache.clear();

      cache.set('new-conv', ['de']);
      expect(cache.size).toBe(1);
      expect(cache.get('new-conv')).toEqual(['de']);
    });
  });

  describe('has', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should return true for existing valid entry', () => {
      cache.set(conversationId, languages);
      expect(cache.has(conversationId)).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired entry', () => {
      const ttl = 10000;
      cache = new LanguageCache(ttl);

      cache.set(conversationId, languages);
      expect(cache.has(conversationId)).toBe(true);

      jest.advanceTimersByTime(ttl + 1000);
      expect(cache.has(conversationId)).toBe(false);
    });

    it('should remove expired entry when checking has', () => {
      const ttl = 10000;
      cache = new LanguageCache(ttl);

      cache.set(conversationId, languages);
      expect(cache.size).toBe(1);

      jest.advanceTimersByTime(ttl + 1000);
      cache.has(conversationId);

      expect(cache.size).toBe(0);
    });

    it('should return true before expiration', () => {
      const ttl = 10000;
      cache = new LanguageCache(ttl);

      cache.set(conversationId, languages);

      jest.advanceTimersByTime(9000);
      expect(cache.has(conversationId)).toBe(true);
    });
  });

  describe('cleanExpired', () => {
    beforeEach(() => {
      const ttl = 5 * 60 * 1000; // 5 minutes
      cache = new LanguageCache(ttl);
    });

    it('should remove all expired entries', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);

      // Advance time past TTL
      jest.advanceTimersByTime(6 * 60 * 1000);

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(3);
      expect(cache.size).toBe(0);
    });

    it('should not remove non-expired entries', () => {
      cache.set('conv-1', ['en']);
      jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes
      cache.set('conv-2', ['fr']);

      // Advance time by 4 more minutes (total 6 for conv-1, 4 for conv-2)
      jest.advanceTimersByTime(4 * 60 * 1000);

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(1); // Only conv-1 expired
      expect(cache.size).toBe(1);
      expect(cache.get('conv-1')).toBeNull();
      expect(cache.get('conv-2')).toEqual(['fr']);
    });

    it('should return 0 when no entries are expired', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);

      // Advance time by 3 minutes (less than TTL)
      jest.advanceTimersByTime(3 * 60 * 1000);

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(0);
      expect(cache.size).toBe(2);
    });

    it('should return 0 when cache is empty', () => {
      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(0);
      expect(cache.size).toBe(0);
    });

    it('should handle partial expiration correctly', () => {
      cache.set('conv-1', ['en']);
      jest.advanceTimersByTime(3 * 60 * 1000);
      cache.set('conv-2', ['fr']);
      jest.advanceTimersByTime(3 * 60 * 1000); // conv-1 at 6min, conv-2 at 3min

      const cleaned = cache.cleanExpired();
      expect(cleaned).toBe(1);
      expect(cache.size).toBe(1);
      expect(cache.get('conv-2')).toEqual(['fr']);
    });
  });

  describe('size property', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should return correct size for empty cache', () => {
      expect(cache.size).toBe(0);
    });

    it('should return correct size after adding entries', () => {
      cache.set('conv-1', ['en']);
      expect(cache.size).toBe(1);

      cache.set('conv-2', ['fr']);
      expect(cache.size).toBe(2);

      cache.set('conv-3', ['es']);
      expect(cache.size).toBe(3);
    });

    it('should return correct size after deletions', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      cache.set('conv-3', ['es']);

      cache.delete('conv-2');
      expect(cache.size).toBe(2);
    });

    it('should return correct size after clear', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should handle empty language arrays', () => {
      cache.set(conversationId, []);
      expect(cache.get(conversationId)).toEqual([]);
    });

    it('should handle single language', () => {
      cache.set(conversationId, ['en']);
      expect(cache.get(conversationId)).toEqual(['en']);
    });

    it('should handle many languages', () => {
      const manyLanguages = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];
      cache.set(conversationId, manyLanguages);
      expect(cache.get(conversationId)).toEqual(manyLanguages);
    });

    it('should handle special characters in conversation IDs', () => {
      const specialIds = [
        'conv-with-dashes',
        'conv_with_underscores',
        'conv.with.dots',
        'conv:with:colons'
      ];

      specialIds.forEach((id, index) => {
        cache.set(id, [`lang${index}`]);
        expect(cache.get(id)).toEqual([`lang${index}`]);
      });
    });

    it('should maintain separate entries for different conversation IDs', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);

      expect(cache.get('conv-1')).not.toEqual(cache.get('conv-2'));
    });

    it('should handle rapid successive operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`conv-${i}`, [`lang-${i}`]);
      }

      // Due to max size (100 by default), all should be present
      expect(cache.size).toBe(100);
    });
  });

  describe('concurrent-like operations', () => {
    beforeEach(() => {
      cache = new LanguageCache();
    });

    it('should handle interleaved set and get operations', () => {
      cache.set('conv-1', ['en']);
      expect(cache.get('conv-1')).toEqual(['en']);

      cache.set('conv-2', ['fr']);
      expect(cache.get('conv-1')).toEqual(['en']);
      expect(cache.get('conv-2')).toEqual(['fr']);

      cache.set('conv-1', ['es']); // Update conv-1
      expect(cache.get('conv-1')).toEqual(['es']);
      expect(cache.get('conv-2')).toEqual(['fr']);
    });

    it('should handle mixed operations correctly', () => {
      cache.set('conv-1', ['en']);
      cache.set('conv-2', ['fr']);
      expect(cache.has('conv-1')).toBe(true);

      cache.delete('conv-1');
      expect(cache.has('conv-1')).toBe(false);
      expect(cache.has('conv-2')).toBe(true);

      cache.clear();
      expect(cache.has('conv-2')).toBe(false);
    });
  });
});
