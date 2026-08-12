/**
 * Unit tests for CaptchaService
 * Covers: verify (replay, success, error codes, remoteIp, http-error, network-error),
 * shouldBypassInDev, verifyWithDevBypass, getSiteKey, getCacheStats, clearCache.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// The module under test calls axios.post directly (not axios.default.post),
// so the top-level mock object must have `post` at the root.
const mockPost = jest.fn() as jest.MockedFunction<typeof import('axios').default.post>;

jest.mock('axios', () => ({
  post: mockPost
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
  }
}));

import { CaptchaService } from '../../../services/CaptchaService';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    data: {
      success: true,
      challenge_ts: '2026-06-25T12:00:00Z',
      hostname: 'example.com',
      ...overrides
    }
  };
}

function makeService(): CaptchaService {
  return new CaptchaService();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CaptchaService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HCAPTCHA_SECRET: 'test-secret',
      HCAPTCHA_SITE_KEY: 'test-site-key',
      NODE_ENV: 'test',
      BYPASS_CAPTCHA: 'false'
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  // ── verify ───────────────────────────────────────────────────────────────

  describe('verify', () => {
    it('returns token-already-used when token was already verified', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      await service.verify('replay-token');
      const result = await service.verify('replay-token');

      expect(result).toEqual({ success: false, errorCodes: ['token-already-used'] });
    });

    it('returns success:true when hCaptcha responds with success', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      const result = await service.verify('valid-token');

      expect(result.success).toBe(true);
    });

    it('includes challengeTs and hostname from hCaptcha response', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse({
        challenge_ts: '2026-06-25T12:00:00Z',
        hostname: 'example.com'
      }));

      const result = await service.verify('ts-token');

      expect(result.challengeTs).toBe('2026-06-25T12:00:00Z');
      expect(result.hostname).toBe('example.com');
    });

    it('appends remoteip param when remoteIp is provided', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      await service.verify('ip-token', '192.168.1.1');

      const callArgs = mockPost.mock.calls[0];
      const params = callArgs[1] as URLSearchParams;
      expect(params.get('remoteip')).toBe('192.168.1.1');
    });

    it('returns http-error when response status is >= 400', async () => {
      const service = makeService();
      mockPost.mockResolvedValue({ status: 400, data: {} });

      const result = await service.verify('bad-status-token');

      expect(result).toEqual({ success: false, errorCodes: ['http-error'] });
    });

    it('returns network-error when axios throws', async () => {
      const service = makeService();
      mockPost.mockRejectedValue(new Error('Network failure'));

      const result = await service.verify('throw-token');

      expect(result).toEqual({ success: false, errorCodes: ['network-error'] });
    });
  });

  // ── shouldBypassInDev ─────────────────────────────────────────────────────

  describe('shouldBypassInDev', () => {
    it('returns false when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = makeService();

      expect(service.shouldBypassInDev()).toBe(false);
    });

    it('returns false when NODE_ENV is development but BYPASS_CAPTCHA is not true', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_CAPTCHA = 'false';
      const service = makeService();

      expect(service.shouldBypassInDev()).toBe(false);
    });

    it('returns true when NODE_ENV is development AND BYPASS_CAPTCHA is true', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = makeService();

      expect(service.shouldBypassInDev()).toBe(true);
    });
  });

  // ── verifyWithDevBypass ───────────────────────────────────────────────────

  describe('verifyWithDevBypass', () => {
    it('returns success:true without calling axios in dev+bypass mode', async () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = makeService();

      const result = await service.verifyWithDevBypass('any-token');

      expect(result.success).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('delegates to verify in production mode', async () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_CAPTCHA = 'false';
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      const result = await service.verifyWithDevBypass('prod-token');

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  // ── getSiteKey ────────────────────────────────────────────────────────────

  describe('getSiteKey', () => {
    it('returns the HCAPTCHA_SITE_KEY env var value', () => {
      process.env.HCAPTCHA_SITE_KEY = 'my-public-site-key';
      const service = makeService();

      expect(service.getSiteKey()).toBe('my-public-site-key');
    });
  });

  // ── getCacheStats ─────────────────────────────────────────────────────────

  describe('getCacheStats', () => {
    it('returns zero counts on a fresh instance', () => {
      const service = makeService();

      const stats = service.getCacheStats();

      expect(stats.cachedTokens).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });

    it('reflects the number of cached tokens after successful verifications', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      await service.verify('token-a');
      await service.verify('token-b');

      const stats = service.getCacheStats();
      expect(stats.cachedTokens).toBe(2);
      expect(stats.cacheSize).toBe(2);
    });
  });

  // ── clearCache ────────────────────────────────────────────────────────────

  describe('clearCache', () => {
    it('empties the token cache', async () => {
      const service = makeService();
      mockPost.mockResolvedValue(makeSuccessResponse());

      await service.verify('cached-token');
      expect(service.getCacheStats().cachedTokens).toBe(1);

      service.clearCache();

      expect(service.getCacheStats().cachedTokens).toBe(0);
    });
  });
});
