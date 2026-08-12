/**
 * Extra unit tests for CaptchaService.
 * Covers: isTokenVerified TTL expiry path (token in cache but expired),
 * cleanup interval firing (removes expired tokens), cache-TTL boundary.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockPost = jest.fn() as jest.MockedFunction<typeof import('axios').default.post>;
jest.mock('axios', () => ({ post: mockPost }));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { CaptchaService } from '../../../services/CaptchaService';

function makeSuccessResponse() {
  return {
    status: 200,
    data: { success: true, challenge_ts: '2026-06-25T12:00:00Z', hostname: 'example.com' },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  process.env.HCAPTCHA_SECRET = 'test-secret';
  process.env.HCAPTCHA_SITE_KEY = 'test-site-key';
  process.env.NODE_ENV = 'test';
  mockPost.mockResolvedValue(makeSuccessResponse());
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── isTokenVerified TTL expiry ───────────────────────────────────────────────

describe('verify — expired cached token allows re-verification', () => {
  it('allows re-verification of a token after its cache TTL has elapsed', async () => {
    const service = new CaptchaService();

    // First verify → caches the token
    await service.verify('token-x');
    expect(service.getCacheStats().cachedTokens).toBe(1);

    // Fast-forward past the cache TTL (default 5 min = 300_000 ms)
    jest.advanceTimersByTime(310_000);

    // Token should be treated as unknown — allow verification again
    const result = await service.verify('token-x');
    expect(result.success).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(2); // called again
  });
});

// ─── cleanup interval ─────────────────────────────────────────────────────────

describe('cleanup interval', () => {
  it('evicts expired tokens from the cache when the interval fires', async () => {
    const service = new CaptchaService();
    mockPost.mockResolvedValue(makeSuccessResponse());

    await service.verify('evictable-token');
    expect(service.getCacheStats().cachedTokens).toBe(1);

    // Advance past TTL so the cleanup interval treats the token as expired
    jest.advanceTimersByTime(400_000); // > 5 min TTL and > 1 min cleanup interval

    // The cleanup has now run — cache should be empty
    expect(service.getCacheStats().cachedTokens).toBe(0);
  });

  it('does not evict tokens that are still within their TTL', async () => {
    const service = new CaptchaService();
    mockPost.mockResolvedValue(makeSuccessResponse());

    await service.verify('fresh-token');
    expect(service.getCacheStats().cachedTokens).toBe(1);

    // Advance only 1 minute (cleanup fires but token TTL not yet elapsed)
    jest.advanceTimersByTime(61_000);

    expect(service.getCacheStats().cachedTokens).toBe(1);
  });
});
