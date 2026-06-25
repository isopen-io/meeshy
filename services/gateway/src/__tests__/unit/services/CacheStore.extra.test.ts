/**
 * Extra unit tests for CacheStore — memory-only mode methods not covered
 * by the primary test suite: expire, publish, info, getNativeClient,
 * getCacheStore (singleton), resetCacheStore.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { RedisCacheStore, getCacheStore, resetCacheStore } from '../../../services/CacheStore';

// ─── expire ───────────────────────────────────────────────────────────────────

describe('expire (memory-only)', () => {
  it('returns false when the key does not exist', async () => {
    const store = new RedisCacheStore();
    const result = await store.expire('no-such-key', 60);
    expect(result).toBe(false);
    await store.close();
  });

  it('returns true and updates the TTL when the key exists', async () => {
    const store = new RedisCacheStore();
    await store.set('expiry-key', 'value');

    const result = await store.expire('expiry-key', 1);
    expect(result).toBe(true);

    // Entry is still accessible immediately
    const val = await store.get('expiry-key');
    expect(val).toBe('value');

    // Wait for expiry (1s + buffer)
    await new Promise(r => setTimeout(r, 1100));
    const after = await store.get('expiry-key');
    expect(after).toBeNull();

    await store.close();
  });
});

// ─── publish ──────────────────────────────────────────────────────────────────

describe('publish (memory-only)', () => {
  it('returns 0 when no Redis is available', async () => {
    const store = new RedisCacheStore();
    const result = await store.publish('chan', 'msg');
    expect(result).toBe(0);
    await store.close();
  });
});

// ─── info ─────────────────────────────────────────────────────────────────────

describe('info (memory-only)', () => {
  it('returns a simulated info string without Redis', async () => {
    const store = new RedisCacheStore();
    const result = await store.info();
    expect(typeof result).toBe('string');
    expect(result).toContain('Memory');
    await store.close();
  });

  it('includes current key count in the info output', async () => {
    const store = new RedisCacheStore();
    await store.set('k1', 'v1');
    await store.set('k2', 'v2');
    const result = await store.info();
    expect(result).toContain('keys=2');
    await store.close();
  });
});

// ─── getNativeClient ──────────────────────────────────────────────────────────

describe('getNativeClient', () => {
  it('returns null when no Redis URL was provided', () => {
    const store = new RedisCacheStore();
    expect(store.getNativeClient()).toBeNull();
  });
});

// ─── getCacheStore / resetCacheStore ─────────────────────────────────────────

describe('getCacheStore / resetCacheStore', () => {
  afterEach(async () => {
    resetCacheStore();
  });

  it('getCacheStore returns the same instance on repeated calls (singleton)', () => {
    const a = getCacheStore();
    const b = getCacheStore();
    expect(a).toBe(b);
  });

  it('resetCacheStore clears the singleton so the next call returns a fresh instance', async () => {
    const a = getCacheStore();
    resetCacheStore();
    const b = getCacheStore();
    expect(b).not.toBe(a);
    await b.close();
  });
});
