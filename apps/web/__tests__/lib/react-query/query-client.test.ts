/**
 * Tests for lib/react-query/query-client.ts
 */

import { createQueryClient } from '@/lib/react-query/query-client';

describe('createQueryClient', () => {
  it('creates a QueryClient instance', () => {
    const client = createQueryClient();
    expect(client).toBeDefined();
    expect(typeof client.getQueryData).toBe('function');
  });

  it('creates fresh instances on each call', () => {
    const a = createQueryClient();
    const b = createQueryClient();
    expect(a).not.toBe(b);
  });

  // ─── Query defaults ──────────────────────────────────────────────────────────

  describe('query defaults', () => {
    it('sets staleTime to Infinity', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.queries?.staleTime).toBe(Infinity);
    });

    it('sets gcTime to 30 minutes', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.queries?.gcTime).toBe(30 * 60 * 1000);
    });

    it('sets refetchOnWindowFocus to always', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.queries?.refetchOnWindowFocus).toBe('always');
    });

    it('sets refetchOnReconnect to always', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.queries?.refetchOnReconnect).toBe('always');
    });

    it('sets refetchOnMount to false', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.queries?.refetchOnMount).toBe(false);
    });
  });

  // ─── Retry logic ─────────────────────────────────────────────────────────────

  describe('retry logic', () => {
    const getRetry = () => {
      const client = createQueryClient();
      return client.getDefaultOptions().queries?.retry as (failureCount: number, error: Error) => boolean;
    };

    it('does not retry on 401 errors', () => {
      const retry = getRetry();
      const err = Object.assign(new Error('Unauthorized'), { status: 401 });
      expect(retry(0, err)).toBe(false);
      expect(retry(1, err)).toBe(false);
    });

    it('does not retry on 403 errors', () => {
      const retry = getRetry();
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      expect(retry(0, err)).toBe(false);
    });

    it('does not retry on 404 errors', () => {
      const retry = getRetry();
      const err = Object.assign(new Error('Not Found'), { status: 404 });
      expect(retry(0, err)).toBe(false);
    });

    it('retries on generic errors up to 3 times', () => {
      const retry = getRetry();
      const err = new Error('Network error');
      expect(retry(0, err)).toBe(true);
      expect(retry(1, err)).toBe(true);
      expect(retry(2, err)).toBe(true);
    });

    it('stops retrying after 3 failures', () => {
      const retry = getRetry();
      const err = new Error('Network error');
      expect(retry(3, err)).toBe(false);
    });

    it('retries on 500 errors (server errors)', () => {
      const retry = getRetry();
      const err = Object.assign(new Error('Server Error'), { status: 500 });
      expect(retry(0, err)).toBe(true);
    });
  });

  // ─── Retry delay ─────────────────────────────────────────────────────────────

  describe('retryDelay', () => {
    const getDelay = () => {
      const client = createQueryClient();
      return client.getDefaultOptions().queries?.retryDelay as (attempt: number) => number;
    };

    it('starts at 1000ms for first attempt', () => {
      const delay = getDelay();
      expect(delay(0)).toBe(1000);
    });

    it('doubles on each attempt (exponential backoff)', () => {
      const delay = getDelay();
      expect(delay(1)).toBe(2000);
      expect(delay(2)).toBe(4000);
    });

    it('caps at 30 seconds', () => {
      const delay = getDelay();
      // 2^10 * 1000 = 1024000ms >> 30000ms cap
      expect(delay(10)).toBe(30000);
    });
  });

  // ─── Mutation defaults ────────────────────────────────────────────────────────

  describe('mutation defaults', () => {
    it('sets mutation retry to false', () => {
      const client = createQueryClient();
      const defaults = client.getDefaultOptions();
      expect(defaults.mutations?.retry).toBe(false);
    });
  });
});
