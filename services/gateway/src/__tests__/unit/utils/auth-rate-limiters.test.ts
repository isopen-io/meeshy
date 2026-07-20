/**
 * Auth Rate Limiter Factory Functions
 *
 * Tests behaviour (enforced limits, key isolation per identity) for all
 * authentication-related factory functions in src/utils/rate-limiter.ts.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => {
  const child = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  return { enhancedLogger: { ...child, child: () => child } };
});

import {
  createLoginRateLimiter,
  createRegisterRateLimiter,
  createPasswordResetRateLimiter,
  createPasswordResetDailyRateLimiter,
  createAuthGlobalRateLimiter,
  createPhoneResetLookupRateLimiter,
  createPhoneResetIdentityRateLimiter,
  createPhoneResetCodeRateLimiter,
  createPhoneResetResendRateLimiter,
  createPhoneTransferRateLimiter,
  createPhoneTransferCodeRateLimiter,
  createPhoneTransferResendRateLimiter,
  createStrictRateLimiter,
  createBatchRateLimiter,
  RateLimiter,
} from '../../../utils/rate-limiter';

// Non-local IP so middleware() doesn't skip via isLocalIp()
const IP = '203.0.113.42';

function makeReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return { ip: IP, body: {}, ...overrides } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply & { statusCode: number; sentBody: unknown } {
  const state = { statusCode: 200, sentBody: null as unknown, statusCalled: false };
  return {
    ...state,
    header: jest.fn().mockReturnThis(),
    status(code: number) {
      state.statusCode = code;
      (this as any).statusCode = code;
      return this;
    },
    send(body: unknown) {
      state.sentBody = body;
      (this as any).sentBody = body;
      return this;
    },
  } as unknown as FastifyReply & { statusCode: number; sentBody: unknown };
}

async function exhaust(mw: ReturnType<RateLimiter['middleware']>, req: FastifyRequest, n: number) {
  for (let i = 0; i < n; i++) {
    await mw(req, makeReply());
  }
}

describe('createLoginRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createLoginRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 5 attempts then blocks the 6th for the same IP+username prefix', async () => {
    const mw = createLoginRateLimiter().middleware();
    const req = makeReq({ body: { username: 'bob' } } as any);
    await exhaust(mw, req, 5);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('gives separate buckets for different username prefixes from the same IP', async () => {
    const mw = createLoginRateLimiter().middleware();
    await exhaust(mw, makeReq({ body: { username: 'bob' } } as any), 5);
    const reply = makeReply();
    await mw(makeReq({ body: { username: 'alice' } } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('uses email as fallback identifier when username is absent', async () => {
    const mw = createLoginRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ body: { email: 'test@example.com' } } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('handles missing body gracefully', async () => {
    const mw = createLoginRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ body: undefined } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('handles missing IP gracefully', async () => {
    const mw = createLoginRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: undefined, body: {} } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('resets after the 15-minute window', async () => {
    const mw = createLoginRateLimiter().middleware();
    const req = makeReq({ body: { username: 'carol' } } as any);
    await exhaust(mw, req, 5);
    jest.advanceTimersByTime(16 * 60 * 1000);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createRegisterRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createRegisterRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 attempts then blocks the 4th from the same IP', async () => {
    const mw = createRegisterRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.10' });
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('does not share buckets across different IPs', async () => {
    const mw = createRegisterRateLimiter().middleware();
    await exhaust(mw, makeReq({ ip: '203.0.113.11' }), 3);
    const reply = makeReply();
    await mw(makeReq({ ip: '203.0.113.12' }), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('resets after the 5-minute window', async () => {
    const mw = createRegisterRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.13' });
    await exhaust(mw, req, 3);
    jest.advanceTimersByTime(6 * 60 * 1000);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createPasswordResetRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPasswordResetRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 attempts then blocks the 4th for same IP+email', async () => {
    const mw = createPasswordResetRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.20', body: { email: 'reset@ex.com' } } as any);
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('gives separate buckets for different emails from the same IP', async () => {
    const mw = createPasswordResetRateLimiter().middleware();
    await exhaust(mw, makeReq({ ip: '203.0.113.21', body: { email: 'a@ex.com' } } as any), 3);
    const reply = makeReply();
    await mw(makeReq({ ip: '203.0.113.21', body: { email: 'b@ex.com' } } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('handles missing email gracefully', async () => {
    const mw = createPasswordResetRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ ip: '203.0.113.22', body: {} } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createPasswordResetDailyRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPasswordResetDailyRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 attempts per email then blocks the 4th', async () => {
    const mw = createPasswordResetDailyRateLimiter().middleware();
    const req = makeReq({ body: { email: 'daily@ex.com' } } as any);
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('uses the same bucket for same email from different IPs', async () => {
    const mw = createPasswordResetDailyRateLimiter().middleware();
    await exhaust(mw, makeReq({ ip: '203.0.113.30', body: { email: 'shared@ex.com' } } as any), 3);
    const reply = makeReply();
    await mw(makeReq({ ip: '203.0.113.31', body: { email: 'shared@ex.com' } } as any), reply);
    expect(reply.statusCode).toBe(429);
  });

  it('lowercases and trims the email for keying', async () => {
    const mw = createPasswordResetDailyRateLimiter().middleware();
    await exhaust(mw, makeReq({ body: { email: '  DAILY2@EX.COM  ' } } as any), 3);
    const reply = makeReply();
    await mw(makeReq({ body: { email: 'daily2@ex.com' } } as any), reply);
    expect(reply.statusCode).toBe(429);
  });

  it('gives separate buckets for different emails', async () => {
    const mw = createPasswordResetDailyRateLimiter().middleware();
    await exhaust(mw, makeReq({ body: { email: 'e1@ex.com' } } as any), 3);
    const reply = makeReply();
    await mw(makeReq({ body: { email: 'e2@ex.com' } } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('handles missing email gracefully', async () => {
    const mw = createPasswordResetDailyRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ body: {} } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createAuthGlobalRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createAuthGlobalRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 20 attempts per minute per IP then blocks the 21st', async () => {
    const mw = createAuthGlobalRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.40' });
    await exhaust(mw, req, 20);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('handles missing IP gracefully', async () => {
    const mw = createAuthGlobalRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: undefined, body: {} } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createPhoneResetLookupRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneResetLookupRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 lookups per hour per IP then blocks', async () => {
    const mw = createPhoneResetLookupRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.50' });
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});

describe('createPhoneResetIdentityRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneResetIdentityRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 attempts per tokenId then blocks the 4th', async () => {
    const mw = createPhoneResetIdentityRateLimiter().middleware();
    const req = makeReq({ body: { tokenId: 'tok-abc' } } as any);
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('gives separate buckets for different tokenIds', async () => {
    const mw = createPhoneResetIdentityRateLimiter().middleware();
    await exhaust(mw, makeReq({ body: { tokenId: 'tok-1' } } as any), 3);
    const reply = makeReply();
    await mw(makeReq({ body: { tokenId: 'tok-2' } } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('handles missing tokenId gracefully', async () => {
    const mw = createPhoneResetIdentityRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ body: {} } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createPhoneResetCodeRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneResetCodeRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 5 attempts per tokenId then blocks', async () => {
    const mw = createPhoneResetCodeRateLimiter().middleware();
    const req = makeReq({ body: { tokenId: 'code-tok-1' } } as any);
    await exhaust(mw, req, 5);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });

  it('handles missing tokenId gracefully', async () => {
    const mw = createPhoneResetCodeRateLimiter().middleware();
    const reply = makeReply();
    await mw(makeReq({ body: {} } as any), reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createPhoneResetResendRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneResetResendRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows only 1 resend per minute per tokenId then blocks', async () => {
    const mw = createPhoneResetResendRateLimiter().middleware();
    const req = makeReq({ body: { tokenId: 'resend-tok' } } as any);
    await mw(req, makeReply());
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});

describe('createPhoneTransferRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneTransferRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 3 requests per hour then blocks the 4th (default IP key)', async () => {
    const mw = createPhoneTransferRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.60' });
    await exhaust(mw, req, 3);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});

describe('createPhoneTransferCodeRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneTransferCodeRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows 5 attempts then blocks the 6th', async () => {
    const mw = createPhoneTransferCodeRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.70' });
    await exhaust(mw, req, 5);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});

describe('createPhoneTransferResendRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns a RateLimiter', () => {
    expect(createPhoneTransferResendRateLimiter()).toBeInstanceOf(RateLimiter);
  });

  it('allows only 1 resend per minute then blocks the 2nd', async () => {
    const mw = createPhoneTransferResendRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.80' });
    await mw(req, makeReply());
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});

// ─── Missing-IP / missing-field edge cases for uncovered || branches ──────────

describe('keyGenerator edge cases — missing IP falls back to unknown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('createRegisterRateLimiter uses unknown when IP is absent', async () => {
    const mw = createRegisterRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: undefined, body: {} } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('createPasswordResetRateLimiter uses unknown when IP is absent', async () => {
    const mw = createPasswordResetRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: undefined, body: { email: 'x@x.com' } } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('createPhoneResetLookupRateLimiter uses unknown when IP is absent', async () => {
    const mw = createPhoneResetLookupRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: undefined, body: {} } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });

  it('createPhoneResetResendRateLimiter uses empty string when tokenId absent', async () => {
    const mw = createPhoneResetResendRateLimiter().middleware();
    const reply = makeReply();
    await mw({ ip: IP, body: {} } as any, reply);
    expect(reply.statusCode).not.toBe(429);
  });
});

describe('createStrictRateLimiter — anonymous fallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses anonymous key when request has no user', async () => {
    const mw = createStrictRateLimiter().middleware();
    const req1 = makeReq({ ip: '203.0.113.90' });
    (req1 as any).user = undefined;
    const req2 = makeReq({ ip: '203.0.113.91' });
    (req2 as any).user = undefined;

    // Two "anonymous" requests share the same bucket
    await exhaust(mw, req1, 10);
    const reply = makeReply();
    await mw(req1, reply);
    expect(reply.statusCode).toBe(429);

    // A different IP without user also uses 'anonymous' — same bucket
    const reply2 = makeReply();
    await mw(req2, reply2);
    expect(reply2.statusCode).toBe(429);
  });
});

describe('createBatchRateLimiter — anonymous fallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses anonymous key when request has no user', async () => {
    const mw = createBatchRateLimiter().middleware();
    const req = makeReq({ ip: '203.0.113.95' });
    (req as any).user = undefined;

    await exhaust(mw, req, 5);
    const reply = makeReply();
    await mw(req, reply);
    expect(reply.statusCode).toBe(429);
  });
});
