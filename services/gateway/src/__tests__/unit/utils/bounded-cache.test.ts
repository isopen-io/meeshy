/**
 * Unit tests for src/utils/bounded-cache.ts
 *
 * Covers the two configurations the gateway relies on:
 *  - pure size-bounded (no TTL) — immutable identifier → ObjectId caches
 *  - size-bounded + TTL sweep — short-lived identity / participant memoization
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { BoundedTtlCache } from '../../../utils/bounded-cache';

describe('BoundedTtlCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic get/set/has/delete/clear', () => {
    it('test_get_missingKey_returnsUndefined', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10 });
      expect(cache.get('nope')).toBeUndefined();
    });

    it('test_set_thenGet_returnsStoredValue', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
      expect(cache.has('a')).toBe(true);
      expect(cache.size).toBe(1);
    });

    it('test_set_existingKey_overwritesValue', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('test_delete_removesEntry', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.delete('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('test_clear_removesAllEntries', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('size bound (no TTL, FIFO eviction)', () => {
    it('test_set_overCapacity_evictsOldestKey', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // over cap → evicts 'a'

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('d')).toBe(4);
    });

    it('test_set_existingKeyAtCapacity_doesNotEvict', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('a', 99); // refresh existing key — must NOT evict anything

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBe(99);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('test_evictExpired_withoutTtl_isNoOp', () => {
      const cache = new BoundedTtlCache<string, number>({ maxSize: 3 });
      cache.set('a', 1);
      cache.evictExpired();
      expect(cache.get('a')).toBe(1);
    });
  });

  describe('TTL expiry', () => {
    it('test_get_afterTtlElapsed_returnsUndefinedAndDrops', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
      cache.set('a', 1);

      jest.setSystemTime(1001);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('test_get_beforeTtlElapsed_returnsValue', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
      cache.set('a', 1);

      jest.setSystemTime(999);
      expect(cache.get('a')).toBe(1);
    });

    it('test_evictExpired_dropsOnlyExpiredEntries', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      const cache = new BoundedTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
      cache.set('old', 1);

      jest.setSystemTime(600);
      cache.set('fresh', 2);

      jest.setSystemTime(1001); // 'old' expired (>1000), 'fresh' still valid (<1600)
      cache.evictExpired();

      expect(cache.get('fresh')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('TTL + size bound interaction', () => {
    it('test_set_atCapacity_sweepsExpiredBeforeFifo', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      const cache = new BoundedTtlCache<string, number>({ maxSize: 2, ttlMs: 1000 });
      cache.set('a', 1);
      cache.set('b', 2);

      jest.setSystemTime(1001); // both expired
      cache.set('c', 3); // at cap → sweep expired ('a','b') then insert 'c'

      expect(cache.size).toBe(1);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('a')).toBeUndefined();
    });

    it('test_set_atCapacityAllFresh_fifoEvictsOldest', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      const cache = new BoundedTtlCache<string, number>({ maxSize: 2, ttlMs: 10000 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // all fresh, at cap → FIFO evicts 'a'

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });
  });
});
