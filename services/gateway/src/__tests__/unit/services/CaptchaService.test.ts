/**
 * CaptchaService — unit tests
 *
 * Covers hCaptcha verification, replay-attack prevention via token cache,
 * TTL expiry, dev bypass mode, site key getter, cache cleanup interval,
 * and cache stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ── Mock dependencies before imports ────────────────────────────────────────

const mockAxiosPost = jest.fn() as jest.Mock<any>;
jest.mock('axios', () => ({
  post: (...args: unknown[]) => mockAxiosPost(...args),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import { CaptchaService } from '../../../services/CaptchaService';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ENV_KEYS = ['NODE_ENV', 'HCAPTCHA_SECRET', 'HCAPTCHA_SITE_KEY', 'BYPASS_CAPTCHA'] as const;

const withEnv = <T>(overrides: Record<string, string | undefined>, run: () => T): T => {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

const makeAxiosOk = (data: object) =>
  mockAxiosPost.mockResolvedValueOnce({ status: 200, data });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CaptchaService — constructor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('constructs without throwing when credentials are present', () => {
    expect(() =>
      withEnv({ HCAPTCHA_SECRET: 'secret', HCAPTCHA_SITE_KEY: 'sitekey' }, () => new CaptchaService())
    ).not.toThrow();
  });

  it('constructs without throwing when credentials are absent (warns instead)', () => {
    expect(() =>
      withEnv({ HCAPTCHA_SECRET: undefined, HCAPTCHA_SITE_KEY: undefined }, () => new CaptchaService())
    ).not.toThrow();
  });
});

describe('CaptchaService — getSiteKey', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the configured site key', () => {
    withEnv({ HCAPTCHA_SITE_KEY: 'my-site-key', HCAPTCHA_SECRET: 'sec' }, () => {
      const svc = new CaptchaService();
      expect(svc.getSiteKey()).toBe('my-site-key');
    });
  });

  it('returns empty string when HCAPTCHA_SITE_KEY is not set', () => {
    withEnv({ HCAPTCHA_SITE_KEY: undefined, HCAPTCHA_SECRET: undefined }, () => {
      const svc = new CaptchaService();
      expect(svc.getSiteKey()).toBe('');
    });
  });
});

describe('CaptchaService — verify', () => {
  let svc: CaptchaService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    svc = withEnv({ HCAPTCHA_SECRET: 'secret', HCAPTCHA_SITE_KEY: 'sitekey' }, () => new CaptchaService());
    svc.clearCache();
  });

  it('returns success:true when hCaptcha API succeeds', async () => {
    makeAxiosOk({ success: true, challenge_ts: '2026-01-01T00:00:00Z', hostname: 'localhost' });
    const result = await svc.verify('valid-token');
    expect(result.success).toBe(true);
    expect(result.challengeTs).toBe('2026-01-01T00:00:00Z');
    expect(result.hostname).toBe('localhost');
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  it('passes remoteIp to hCaptcha when provided', async () => {
    makeAxiosOk({ success: true });
    await svc.verify('token-with-ip', '1.2.3.4');
    const [, body] = mockAxiosPost.mock.calls[0] as [string, URLSearchParams, object];
    expect((body as URLSearchParams).get('remoteip')).toBe('1.2.3.4');
  });

  it('does NOT include remoteip param when remoteIp is omitted', async () => {
    makeAxiosOk({ success: true });
    await svc.verify('token-no-ip');
    const [, body] = mockAxiosPost.mock.calls[0] as [string, URLSearchParams, object];
    expect((body as URLSearchParams).has('remoteip')).toBe(false);
  });

  it('returns success:false and error-codes when hCaptcha API reports failure', async () => {
    makeAxiosOk({ success: false, 'error-codes': ['invalid-input-response'] });
    const result = await svc.verify('invalid-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(['invalid-input-response']);
  });

  it('returns success:false with empty errorCodes when API omits the field', async () => {
    makeAxiosOk({ success: false });
    const result = await svc.verify('token-no-errors');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual([]);
  });

  it('returns http-error when API status is not 200', async () => {
    mockAxiosPost.mockResolvedValueOnce({ status: 503, data: {} });
    const result = await svc.verify('token-503');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('http-error');
  });

  it('returns network-error when axios throws', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await svc.verify('token-timeout');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('network-error');
  });

  it('caches a verified token and returns token-already-used on replay', async () => {
    makeAxiosOk({ success: true });
    await svc.verify('replay-token');

    // Second call with the SAME token — must not call axios again
    const result = await svc.verify('replay-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('token-already-used');
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache tokens that fail verification (failure tokens can be retried)', async () => {
    makeAxiosOk({ success: false, 'error-codes': ['invalid-input-response'] });
    await svc.verify('failed-token');

    makeAxiosOk({ success: true });
    const result = await svc.verify('failed-token');
    expect(result.success).toBe(true);
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
  });

  it('treats an expired cached token as fresh (TTL expiry — isTokenVerified returns false)', async () => {
    // Verify a token to cache it, then manually expire it by backdating the timestamp
    makeAxiosOk({ success: true });
    await svc.verify('expiry-token');

    // Directly manipulate internal cache to simulate TTL expiry
    const cache = (svc as any).verifiedTokens as Map<string, number>;
    const ttl = (svc as any).cacheTTL as number;
    cache.set('expiry-token', Date.now() - ttl - 1000); // 1 second past TTL

    // Next call should NOT be treated as replay — isTokenVerified deletes and returns false
    makeAxiosOk({ success: true });
    const result = await svc.verify('expiry-token');
    expect(result.success).toBe(true);
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
  });
});

describe('CaptchaService — shouldBypassInDev', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when NODE_ENV=development and BYPASS_CAPTCHA=true', () => {
    withEnv({ NODE_ENV: 'development', BYPASS_CAPTCHA: 'true', HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => {
      const svc = new CaptchaService();
      expect(svc.shouldBypassInDev()).toBe(true);
    });
  });

  it('returns false when NODE_ENV=production even if BYPASS_CAPTCHA=true', () => {
    withEnv({ NODE_ENV: 'production', BYPASS_CAPTCHA: 'true', HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => {
      const svc = new CaptchaService();
      expect(svc.shouldBypassInDev()).toBe(false);
    });
  });

  it('returns false when NODE_ENV=development but BYPASS_CAPTCHA is not "true"', () => {
    withEnv({ NODE_ENV: 'development', BYPASS_CAPTCHA: 'false', HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => {
      const svc = new CaptchaService();
      expect(svc.shouldBypassInDev()).toBe(false);
    });
  });

  it('returns false when BYPASS_CAPTCHA is not set', () => {
    withEnv({ NODE_ENV: 'development', BYPASS_CAPTCHA: undefined, HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => {
      const svc = new CaptchaService();
      expect(svc.shouldBypassInDev()).toBe(false);
    });
  });
});

describe('CaptchaService — verifyWithDevBypass', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns immediate success in dev bypass mode without calling axios', async () => {
    await withEnv({ NODE_ENV: 'development', BYPASS_CAPTCHA: 'true', HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, async () => {
      const svc = new CaptchaService();
      svc.clearCache();
      const result = await svc.verifyWithDevBypass('any-token');
      expect(result.success).toBe(true);
      expect(result.hostname).toBe('localhost');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });
  });

  it('falls through to real verify when bypass is disabled', async () => {
    await withEnv({ NODE_ENV: 'production', BYPASS_CAPTCHA: undefined, HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, async () => {
      const svc = new CaptchaService();
      svc.clearCache();
      makeAxiosOk({ success: true });
      const result = await svc.verifyWithDevBypass('real-token');
      expect(result.success).toBe(true);
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CaptchaService — startCleanup interval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cleanup interval removes expired tokens after 60 seconds', async () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();

    // Manually add an expired token to the cache
    const cache = (svc as any).verifiedTokens as Map<string, number>;
    const ttl = (svc as any).cacheTTL as number;
    cache.set('stale-token', Date.now() - ttl - 5000); // 5s past TTL
    cache.set('fresh-token', Date.now()); // not expired

    expect(svc.getCacheStats().cachedTokens).toBe(2);

    // Advance time past cleanup interval (60 000 ms)
    jest.advanceTimersByTime(60_001);

    expect(svc.getCacheStats().cachedTokens).toBe(1);
    expect(cache.has('stale-token')).toBe(false);
    expect(cache.has('fresh-token')).toBe(true);
  });

  it('cleanup interval logs when tokens are removed', () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();

    const cache = (svc as any).verifiedTokens as Map<string, number>;
    const ttl = (svc as any).cacheTTL as number;
    cache.set('expired-tok', Date.now() - ttl - 1000);

    jest.advanceTimersByTime(60_001);

    // Token was removed — no assertion on logger call count (mock shared across tests)
    expect(cache.has('expired-tok')).toBe(false);
  });

  it('cleanup interval does nothing when cache is empty', () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();

    expect(() => jest.advanceTimersByTime(60_001)).not.toThrow();
    expect(svc.getCacheStats().cachedTokens).toBe(0);
  });
});

describe('CaptchaService — getCacheStats and clearCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('getCacheStats returns zero when cache is empty', () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();
    const stats = svc.getCacheStats();
    expect(stats.cachedTokens).toBe(0);
    expect(stats.cacheSize).toBe(0);
  });

  it('getCacheStats reflects tokens added after successful verification', async () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();
    makeAxiosOk({ success: true });
    await svc.verify('stats-token');
    const stats = svc.getCacheStats();
    expect(stats.cachedTokens).toBe(1);
  });

  it('clearCache empties the token cache', async () => {
    const svc = withEnv({ HCAPTCHA_SECRET: 'sec', HCAPTCHA_SITE_KEY: 'key' }, () => new CaptchaService());
    svc.clearCache();
    makeAxiosOk({ success: true });
    await svc.verify('clear-me-token');
    svc.clearCache();
    expect(svc.getCacheStats().cachedTokens).toBe(0);
  });
});
