/**
 * Tests for middleware/rate-limit.ts
 *
 * Covers: RATE_LIMITS constants, createRateLimitConfig, ROUTE_RATE_LIMITS,
 * registerRateLimiting (disabled path + enabled path with callbacks).
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../utils/logger', () => ({ logger: mockLogger }));

jest.mock('@fastify/rate-limit', () => jest.fn());

jest.mock('../../../utils/rate-limiter', () => ({
  isLocalIp: jest.fn((ip: string) => ip === '127.0.0.1'),
}));

import {
  RATE_LIMITS,
  createRateLimitConfig,
  ROUTE_RATE_LIMITS,
  registerRateLimiting,
} from '../../../middleware/rate-limit';

import { isLocalIp } from '../../../utils/rate-limiter';

function makeMockFastify(redis: unknown = null) {
  return {
    register: jest.fn().mockResolvedValue(undefined),
    redis,
  };
}

describe('RATE_LIMITS', () => {
  it('INITIATE_CALL has max=5 and timeWindow=1 minute', () => {
    expect(RATE_LIMITS.INITIATE_CALL.max).toBe(5);
    expect(RATE_LIMITS.INITIATE_CALL.timeWindow).toBe('1 minute');
  });

  it('JOIN_CALL has max=20', () => {
    expect(RATE_LIMITS.JOIN_CALL.max).toBe(20);
  });

  it('CALL_OPERATIONS has max=10', () => {
    expect(RATE_LIMITS.CALL_OPERATIONS.max).toBe(10);
  });

  it('DEFAULT has numeric max and timeWindow', () => {
    expect(typeof RATE_LIMITS.DEFAULT.max).toBe('number');
    expect(typeof RATE_LIMITS.DEFAULT.timeWindow).toBe('number');
  });
});

describe('createRateLimitConfig', () => {
  it('wraps max and timeWindow in the expected shape', () => {
    const cfg = createRateLimitConfig(10, '1 minute', 'initiate');
    expect(cfg.config.rateLimit.max).toBe(10);
    expect(cfg.config.rateLimit.timeWindow).toBe('1 minute');
  });

  it('works with numeric timeWindow', () => {
    const cfg = createRateLimitConfig(50, 30_000, 'operations');
    expect(cfg.config.rateLimit.timeWindow).toBe(30_000);
    expect(cfg.config.rateLimit.max).toBe(50);
  });

  // Piege documente du projet : un rate limit par-route SANS keyGenerator
  // explicite herite du keyGenerator GLOBAL (seau IP plateforme derriere
  // Traefik sans trustProxy -> IDENTIQUE pour tout le monde). Ces tests
  // prouvent que la config fournit une cle PAR UTILISATEUR, jamais le seau
  // plateforme brut `global:${request.ip}`.
  it('keyGenerator uses a per-user key when authContext is present', () => {
    const cfg = createRateLimitConfig(5, '1 minute', 'initiate');
    const req = { authContext: { userId: 'user-42' }, ip: '10.0.0.5' } as any;
    const key = cfg.config.rateLimit.keyGenerator(req);
    expect(key).toContain('user-42');
    expect(key).not.toBe(`global:${req.ip}`);
  });

  it('keyGenerator falls back to a per-IP key (not the bare platform bucket) when unauthenticated', () => {
    const cfg = createRateLimitConfig(5, '1 minute', 'initiate');
    const req = { ip: '10.0.0.9' } as any;
    const key = cfg.config.rateLimit.keyGenerator(req);
    expect(key).toContain('10.0.0.9');
    expect(key).not.toBe(`global:${req.ip}`);
  });

  it('keyGenerator namespaces by label so distinct call routes never share a bucket', () => {
    const initiate = createRateLimitConfig(5, '1 minute', 'initiate');
    const operations = createRateLimitConfig(10, '1 minute', 'operations');
    const req = { authContext: { userId: 'user-42' }, ip: '10.0.0.5' } as any;
    expect(initiate.config.rateLimit.keyGenerator(req)).not.toBe(
      operations.config.rateLimit.keyGenerator(req),
    );
  });

  it('errorResponseBuilder returns a structured 429 payload', () => {
    const cfg = createRateLimitConfig(5, '1 minute', 'initiate');
    const body = cfg.config.rateLimit.errorResponseBuilder();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

describe('ROUTE_RATE_LIMITS', () => {
  it('initiateCall uses INITIATE_CALL limits', () => {
    const { config } = ROUTE_RATE_LIMITS.initiateCall as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.INITIATE_CALL.max);
    expect(config.rateLimit.timeWindow).toBe(RATE_LIMITS.INITIATE_CALL.timeWindow);
  });

  it('joinCall uses JOIN_CALL limits', () => {
    const { config } = ROUTE_RATE_LIMITS.joinCall as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.JOIN_CALL.max);
  });

  it('callOperations uses CALL_OPERATIONS limits', () => {
    const { config } = ROUTE_RATE_LIMITS.callOperations as any;
    expect(config.rateLimit.max).toBe(RATE_LIMITS.CALL_OPERATIONS.max);
  });

  // Comportement attendu par-dessus le piege keyGenerator herite : chaque
  // route calls doit produire une cle par UTILISATEUR (repli IP), jamais
  // dependre du keyGenerator global enregistre ailleurs dans le bootstrap.
  it.each([
    ['initiateCall', 'user-a'],
    ['joinCall', 'user-b'],
    ['callOperations', 'user-c'],
  ] as const)('%s keyGenerator keys by authenticated user, not by bare IP', (routeKey, userId) => {
    const { config } = (ROUTE_RATE_LIMITS as any)[routeKey];
    const req = { authContext: { userId }, ip: '203.0.113.7' };
    const key = config.rateLimit.keyGenerator(req);
    expect(key).toContain(userId);
    expect(key).not.toBe('203.0.113.7');
    expect(key).not.toBe(`global:${req.ip}`);
  });

  it('each route key namespace is distinct so buckets never collide across call routes', () => {
    const req = { authContext: { userId: 'same-user' }, ip: '203.0.113.7' };
    const keys = [
      (ROUTE_RATE_LIMITS.initiateCall as any).config.rateLimit.keyGenerator(req),
      (ROUTE_RATE_LIMITS.joinCall as any).config.rateLimit.keyGenerator(req),
      (ROUTE_RATE_LIMITS.callOperations as any).config.rateLimit.keyGenerator(req),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('registerRateLimiting', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns without registering when ENABLE_RATE_LIMITING=false', async () => {
    process.env.ENABLE_RATE_LIMITING = 'false';
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('DISABLED'),
    );
  });

  it('registers the plugin when rate limiting is enabled', async () => {
    process.env.ENABLE_RATE_LIMITING = 'true';
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('enabled'),
      expect.any(Object),
    );
  });

  it('registers the plugin when ENABLE_RATE_LIMITING is not set', async () => {
    delete process.env.ENABLE_RATE_LIMITING;
    const fastify = makeMockFastify();
    await registerRateLimiting(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
  });

  describe('registered plugin options callbacks', () => {
    async function getOptions() {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const fastify = makeMockFastify();
      await registerRateLimiting(fastify as any);
      return (fastify.register as jest.Mock).mock.calls[0][1] as Record<string, any>;
    }

    // Témoin NÉGATIF (#4137). Le plugin portait `allowList: (req) => isLocalIp(req.ip)`,
    // ce qui, derrière Traefik sur un réseau Docker — `request.ip` en 172.16.0.0/12
    // pour TOUS les appelants —, exemptait la planète entière. La bonne forme est
    // l'ABSENCE d'allowList : aucune faveur ne se déduit de la forme d'une adresse.
    //
    // Cette garde est négative, donc elle meurt en silence si l'option disparaît du
    // plugin pour une autre raison. `getOptions()` la protège : elle échoue si le
    // plugin n'est plus enregistré du tout, ce qui distingue « pas d'allowList » de
    // « pas de plugin ».
    it("n'exempte aucune adresse : le plugin ne déclare PAS d'allowList", async () => {
      const opts = await getOptions();

      expect(opts).toBeDefined();
      expect(opts.keyGenerator).toBeInstanceOf(Function);
      expect(opts.allowList).toBeUndefined();
    });

    it('keyGenerator uses userId when auth context present', async () => {
      const opts = await getOptions();
      const req = { authContext: { userId: 'user-123' }, ip: '8.8.8.8' };
      const key = opts.keyGenerator(req);
      expect(key).toBe('user:user-123');
    });

    it('keyGenerator falls back to IP when no auth context', async () => {
      const opts = await getOptions();
      const req = { ip: '1.2.3.4' };
      const key = opts.keyGenerator(req);
      expect(key).toBe('1.2.3.4');
    });

    it('keyGenerator returns unknown when IP is missing', async () => {
      const opts = await getOptions();
      const req = {};
      const key = opts.keyGenerator(req);
      expect(key).toBe('unknown');
    });

    it('errorResponseBuilder returns structured 429 response', async () => {
      const opts = await getOptions();
      const req = { ip: '5.6.7.8', url: '/api/v1/test' };
      const ctx = { max: 100, after: '30s' };
      const body = opts.errorResponseBuilder(req, ctx);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.error.message).toContain('30s');
    });

    it('onExceeding logs a debug message with key and path', async () => {
      const opts = await getOptions();
      const req = { ip: '5.6.7.8', url: '/api/test' };
      opts.onExceeding(req, 'some-key');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limit warning',
        expect.objectContaining({ key: 'some-key' }),
      );
    });

    it('passes redis option when fastify.redis is set', async () => {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const mockRedis = { get: jest.fn() };
      const fastify = makeMockFastify(mockRedis);
      await registerRateLimiting(fastify as any);
      const opts = (fastify.register as jest.Mock).mock.calls[0][1];
      expect(opts.redis).toBe(mockRedis);
    });

    it('passes undefined redis when fastify.redis is null', async () => {
      process.env.ENABLE_RATE_LIMITING = 'true';
      const fastify = makeMockFastify(null);
      await registerRateLimiting(fastify as any);
      const opts = (fastify.register as jest.Mock).mock.calls[0][1];
      expect(opts.redis).toBeUndefined();
    });
  });
});
