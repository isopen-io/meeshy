import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn<any>() },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

import _axios from 'axios';
const mockPost = (_axios as any).post as jest.Mock;

import { CaptchaService } from '../../../services/CaptchaService';

// ── Helpers ───────────────────────────────────────────────────────────────

const makeSuccessResponse = (overrides: Record<string, unknown> = {}) =>
  Promise.resolve({
    status: 200,
    data: {
      success: true,
      challenge_ts: '2026-06-26T00:00:00Z',
      hostname: 'example.com',
      'error-codes': [],
      ...overrides,
    },
  });

const makeHttpErrorResponse = (status: number) =>
  Promise.resolve({ status, data: {} });

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CaptchaService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockPost.mockReset();
    process.env = {
      ...originalEnv,
      HCAPTCHA_SECRET: 'test-secret',
      HCAPTCHA_SITE_KEY: 'test-site-key',
      NODE_ENV: 'test',
      BYPASS_CAPTCHA: 'false',
    };
  });

  // ── verify() ─────────────────────────────────────────────────────────────

  describe('verify()', () => {
    it('returns success:true and includes remoteip param when remoteIp is provided', async () => {
      mockPost.mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      const result = await service.verify('tok-1', '1.2.3.4');

      expect(result.success).toBe(true);
      expect(result.challengeTs).toBe('2026-06-26T00:00:00Z');
      expect(result.hostname).toBe('example.com');
      expect(result.errorCodes).toEqual([]);

      // Verify the URLSearchParams passed to axios included remoteip
      const calledParams: URLSearchParams = mockPost.mock.calls[0][1] as URLSearchParams;
      expect(calledParams.get('remoteip')).toBe('1.2.3.4');
      expect(calledParams.get('secret')).toBe('test-secret');
      expect(calledParams.get('response')).toBe('tok-1');
    });

    it('returns success:true and omits remoteip when remoteIp is not provided', async () => {
      mockPost.mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      const result = await service.verify('tok-2');

      expect(result.success).toBe(true);

      const calledParams: URLSearchParams = mockPost.mock.calls[0][1] as URLSearchParams;
      expect(calledParams.has('remoteip')).toBe(false);
    });

    it('returns success:false with token-already-used when the same token is used twice', async () => {
      mockPost.mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      // First call succeeds and caches the token
      await service.verify('reused-token');

      // Reset call count so we can verify the second call never reaches axios
      mockPost.mockReset();

      const result = await service.verify('reused-token');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toEqual(['token-already-used']);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns success:false with http-error when hCaptcha responds with non-200 status', async () => {
      mockPost.mockReturnValueOnce(makeHttpErrorResponse(400));
      const service = new CaptchaService();

      const result = await service.verify('tok-3');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toEqual(['http-error']);
    });

    it('returns success:false with network-error when axios throws', async () => {
      mockPost.mockReturnValueOnce(Promise.reject(new Error('ECONNREFUSED')));
      const service = new CaptchaService();

      const result = await service.verify('tok-4');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toEqual(['network-error']);
    });

    it('forwards success:false from the hCaptcha response data', async () => {
      mockPost.mockReturnValueOnce(
        Promise.resolve({
          status: 200,
          data: {
            success: false,
            challenge_ts: undefined,
            hostname: undefined,
            'error-codes': ['invalid-input-response'],
          },
        })
      );
      const service = new CaptchaService();

      const result = await service.verify('tok-5');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toEqual(['invalid-input-response']);
    });
  });

  // ── shouldBypassInDev() ───────────────────────────────────────────────────

  describe('shouldBypassInDev()', () => {
    it('returns true when NODE_ENV=development and BYPASS_CAPTCHA=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = new CaptchaService();

      expect(service.shouldBypassInDev()).toBe(true);
    });

    it('returns false when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = new CaptchaService();

      expect(service.shouldBypassInDev()).toBe(false);
    });
  });

  // ── verifyWithDevBypass() ─────────────────────────────────────────────────

  describe('verifyWithDevBypass()', () => {
    it('returns success:true immediately without calling axios in dev bypass mode', async () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_CAPTCHA = 'true';
      const service = new CaptchaService();

      const result = await service.verifyWithDevBypass('tok-bypass');

      expect(result.success).toBe(true);
      expect(result.hostname).toBe('localhost');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('delegates to verify() (and calls axios) in non-dev mode', async () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_CAPTCHA = 'false';
      mockPost.mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      const result = await service.verifyWithDevBypass('tok-prod', '5.5.5.5');

      expect(result.success).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  // ── getSiteKey() ──────────────────────────────────────────────────────────

  describe('getSiteKey()', () => {
    it('returns the HCAPTCHA_SITE_KEY from the environment', () => {
      process.env.HCAPTCHA_SITE_KEY = 'my-site-key';
      const service = new CaptchaService();

      expect(service.getSiteKey()).toBe('my-site-key');
    });
  });

  // ── getCacheStats() ───────────────────────────────────────────────────────

  describe('getCacheStats()', () => {
    it('reflects the number of cached tokens after successful verifications', async () => {
      mockPost
        .mockReturnValueOnce(makeSuccessResponse())
        .mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      await service.verify('cache-tok-1');
      await service.verify('cache-tok-2');

      const stats = service.getCacheStats();
      expect(stats.cachedTokens).toBe(2);
      expect(stats.cacheSize).toBe(2);
    });
  });

  // ── clearCache() ──────────────────────────────────────────────────────────

  describe('clearCache()', () => {
    it('empties the token cache so previously-used tokens can be re-verified', async () => {
      mockPost
        .mockReturnValueOnce(makeSuccessResponse())
        .mockReturnValueOnce(makeSuccessResponse());
      const service = new CaptchaService();

      await service.verify('tok-clear');
      expect(service.getCacheStats().cachedTokens).toBe(1);

      service.clearCache();
      expect(service.getCacheStats().cachedTokens).toBe(0);

      // Token should no longer be considered already-used
      mockPost.mockReturnValueOnce(makeSuccessResponse());
      const result = await service.verify('tok-clear');
      expect(result.success).toBe(true);
    });
  });
});
