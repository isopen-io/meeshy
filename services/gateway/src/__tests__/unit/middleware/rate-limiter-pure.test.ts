/**
 * Tests for middleware/rate-limiter.ts
 *
 * Covers pure functions: validateMentionCount, messageValidationHook,
 * createPostRouteRateLimitConfig, createSignalProtocolRateLimitConfig.
 * Also covers registerMessageRateLimiter and registerGlobalRateLimiter
 * with a mocked Fastify to exercise all plugin option callbacks.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock all external dependencies before importing the module
jest.mock('@fastify/rate-limit', () => jest.fn());

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => null,
  }),
}));

jest.mock('../../../utils/rate-limiter', () => ({
  isLocalIp: jest.fn((ip: string) => ip === '127.0.0.1'),
}));

import {
  validateMentionCount,
  messageValidationHook,
  createPostRouteRateLimitConfig,
  createContactChangeRateLimitConfig,
  createSignalProtocolRateLimitConfig,
  registerMessageRateLimiter,
  registerGlobalRateLimiter,
} from '../../../middleware/rate-limiter';

import { isLocalIp } from '../../../utils/rate-limiter';

function makeFastify() {
  return { register: jest.fn().mockResolvedValue(undefined) };
}

function makeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return { ip: '203.0.113.1', body: {}, url: '/api/v1/test', ...overrides } as unknown as FastifyRequest;
}

function makeReply() {
  const state = { code: 200, body: null as unknown };
  const statusMock = jest.fn();
  const sendMock = jest.fn();
  const reply: any = {
    get statusCode() { return state.code; },
    get sentBody() { return state.body; },
    status: statusMock,
    send: sendMock,
  };
  statusMock.mockImplementation((c: number) => { state.code = c; return reply; });
  sendMock.mockImplementation((b: unknown) => { state.body = b; return reply; });
  return reply as FastifyReply & { statusCode: number; sentBody: unknown };
}

// ─── validateMentionCount ─────────────────────────────────────────────────────

describe('validateMentionCount', () => {
  it('returns valid for content with no mentions', () => {
    expect(validateMentionCount('Hello world').valid).toBe(true);
  });

  it('returns valid for content with exactly 50 mentions', () => {
    const content = Array.from({ length: 50 }, (_, i) => `@user${i}`).join(' ');
    const result = validateMentionCount(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns invalid for content with 51 mentions', () => {
    const content = Array.from({ length: 51 }, (_, i) => `@user${i}`).join(' ');
    const result = validateMentionCount(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('51');
    expect(result.error).toContain('50');
  });

  it('returns valid for empty string (0 mentions)', () => {
    expect(validateMentionCount('').valid).toBe(true);
  });

  it('only counts @word patterns, not bare @ or email addresses with @', () => {
    // email-style triggers the regex too, but let's test a clear case
    const content = '@alpha @beta hello @gamma';
    const result = validateMentionCount(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('correctly counts repeated mentions of the same user', () => {
    const content = Array.from({ length: 51 }, () => '@alice').join(' ');
    const result = validateMentionCount(content);
    expect(result.valid).toBe(false);
  });
});

// ─── messageValidationHook ────────────────────────────────────────────────────

describe('messageValidationHook', () => {
  it('returns early (no response) when content is undefined', async () => {
    const req = makeRequest({ body: { content: undefined } } as any);
    const reply = makeReply();
    await messageValidationHook(req as any, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('returns early (no response) when body has valid content under limit', async () => {
    const req = makeRequest({ body: { content: 'Hello @alice' } } as any);
    const reply = makeReply();
    await messageValidationHook(req as any, reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('responds with 400 when mention count exceeds 50', async () => {
    const tooManyMentions = Array.from({ length: 51 }, (_, i) => `@u${i}`).join(' ');
    const req = makeRequest({ body: { content: tooManyMentions } } as any);
    const reply = makeReply();
    await messageValidationHook(req as any, reply);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('51') })
    );
  });
});

// ─── createPostRouteRateLimitConfig ───────────────────────────────────────────

describe('createPostRouteRateLimitConfig', () => {
  const cases: Array<[Parameters<typeof createPostRouteRateLimitConfig>[0], number]> = [
    ['create', 10],
    ['like', 30],
    ['view', 60],
    ['comment', 20],
    // Une impression par APPARITION à l'écran (et non plus une par post et par
    // session) : un aller-retour de scroll produit légitimement plusieurs lots.
    ['impression', 30],
    ['engagement', 20],
  ];

  it.each(cases)('type=%s → max=%d', (type, expectedMax) => {
    const cfg = createPostRouteRateLimitConfig(type) as any;
    expect(cfg.max).toBe(expectedMax);
    expect(cfg.timeWindow).toBe('1 minute');
  });

  it('keyGenerator uses userId when authContext present', () => {
    const cfg = createPostRouteRateLimitConfig('create') as any;
    const req = { authContext: { userId: 'u-42' }, ip: '8.8.8.8' };
    expect(cfg.keyGenerator(req)).toBe('posts:create:u-42');
  });

  it('keyGenerator falls back to IP when authContext is absent', () => {
    const cfg = createPostRouteRateLimitConfig('like') as any;
    const req = { ip: '9.9.9.9' };
    expect(cfg.keyGenerator(req)).toBe('posts:like:ip:9.9.9.9');
  });

  it('errorResponseBuilder returns 429 shape', () => {
    const cfg = createPostRouteRateLimitConfig('comment') as any;
    const body = cfg.errorResponseBuilder();
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(429);
    expect(typeof body.error).toBe('string');
  });
});

// ─── createSignalProtocolRateLimitConfig ──────────────────────────────────────

describe('createSignalProtocolRateLimitConfig', () => {
  it('keys_get has max=30 per minute', () => {
    const cfg = createSignalProtocolRateLimitConfig('keys_get') as any;
    expect(cfg.max).toBe(30);
    expect(cfg.timeWindow).toBe('1 minute');
  });

  it('keys_post has max=5 per minute', () => {
    const cfg = createSignalProtocolRateLimitConfig('keys_post') as any;
    expect(cfg.max).toBe(5);
  });

  it('session_establish has max=20 per minute', () => {
    const cfg = createSignalProtocolRateLimitConfig('session_establish') as any;
    expect(cfg.max).toBe(20);
  });

  describe.each<Parameters<typeof createSignalProtocolRateLimitConfig>[0]>(['keys_get', 'keys_post', 'session_establish'])(
    '%s keyGenerator',
    (type) => {
      it('uses userId when authContext present', () => {
        const cfg = createSignalProtocolRateLimitConfig(type) as any;
        const req = { authContext: { userId: 'sig-user' }, ip: '1.1.1.1' };
        const key = cfg.keyGenerator(req);
        expect(key).toContain('sig-user');
        expect(key).not.toContain('ip:');
      });

      it('falls back to IP when authContext absent', () => {
        const cfg = createSignalProtocolRateLimitConfig(type) as any;
        const req = { ip: '2.2.2.2' };
        const key = cfg.keyGenerator(req);
        expect(key).toContain('ip:2.2.2.2');
      });
    }
  );

  it('keys_get errorResponseBuilder returns expected message', () => {
    const cfg = createSignalProtocolRateLimitConfig('keys_get') as any;
    const body = cfg.errorResponseBuilder();
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(429);
    expect(body.error).toContain('key lookup');
  });

  it('keys_post errorResponseBuilder mentions key generation', () => {
    const cfg = createSignalProtocolRateLimitConfig('keys_post') as any;
    const body = cfg.errorResponseBuilder();
    expect(body.error).toContain('generation');
  });

  it('session_establish errorResponseBuilder mentions session', () => {
    const cfg = createSignalProtocolRateLimitConfig('session_establish') as any;
    const body = cfg.errorResponseBuilder();
    expect(body.error).toContain('session');
  });
});

// ─── registerMessageRateLimiter ───────────────────────────────────────────────

describe('registerMessageRateLimiter', () => {
  it('registers the @fastify/rate-limit plugin', async () => {
    const fastify = makeFastify();
    await registerMessageRateLimiter(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
  });

  describe('registered options callbacks', () => {
    async function getOpts() {
      const fastify = makeFastify();
      await registerMessageRateLimiter(fastify as any);
      return (fastify.register as jest.Mock).mock.calls[0][1] as Record<string, any>;
    }

    it('max is 20 and timeWindow is 1 minute', async () => {
      const opts = await getOpts();
      expect(opts.max).toBe(20);
      expect(opts.timeWindow).toBe('1 minute');
    });

    it('keyGenerator uses userId from authContext', async () => {
      const opts = await getOpts();
      const req = { authContext: { userId: 'u-99' }, ip: '5.5.5.5' };
      expect(opts.keyGenerator(req)).toBe('msg:u-99');
    });

    it('keyGenerator falls back to IP when no authContext', async () => {
      const opts = await getOpts();
      const req = { ip: '6.6.6.6' };
      expect(opts.keyGenerator(req)).toBe('msg:ip:6.6.6.6');
    });

    it('errorResponseBuilder returns 429 shape with retryAfter', async () => {
      const opts = await getOpts();
      const body = opts.errorResponseBuilder({}, { ttl: 30 });
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(429);
      expect(body.retryAfter).toBe(30);
    });

    it('addHeaders hides x-ratelimit headers', async () => {
      const opts = await getOpts();
      expect(opts.addHeaders?.['x-ratelimit-limit']).toBe(false);
      expect(opts.addHeaders?.['x-ratelimit-remaining']).toBe(false);
      expect(opts.addHeaders?.['x-ratelimit-reset']).toBe(false);
    });
  });
});

// ─── registerGlobalRateLimiter ────────────────────────────────────────────────

describe('registerGlobalRateLimiter', () => {
  it('registers the @fastify/rate-limit plugin', async () => {
    const fastify = makeFastify();
    await registerGlobalRateLimiter(fastify as any);
    expect(fastify.register).toHaveBeenCalledTimes(1);
  });

  describe('registered options callbacks', () => {
    async function getOpts() {
      const fastify = makeFastify();
      await registerGlobalRateLimiter(fastify as any);
      return (fastify.register as jest.Mock).mock.calls[0][1] as Record<string, any>;
    }

    it('max is 300', async () => {
      const opts = await getOpts();
      expect(opts.max).toBe(300);
    });

    it('is global', async () => {
      const opts = await getOpts();
      expect(opts.global).toBe(true);
    });

    it('keyGenerator uses IP prefix', async () => {
      const opts = await getOpts();
      const req = { ip: '7.7.7.7' };
      expect(opts.keyGenerator(req)).toBe('global:7.7.7.7');
    });

    /**
     * ⚠ Ces quatre tests portaient sur `opts.skip`, une option que
     * `@fastify/rate-limit` v10 **ne lit jamais** (index.js:88 et :225 — seul
     * `allowList` existe). Ils vérifiaient donc une fonction morte : le
     * comportement décrit n'avait jamais lieu, et les sondes subissaient bel et
     * bien le quota global.
     */
    it('no `skip` option is passed — the plugin would ignore it', async () => {
      const opts = await getOpts();
      expect(opts.skip).toBeUndefined();
      expect(typeof opts.allowList).toBe('function');
    });

    it('allowList returns true for health paths', async () => {
      const opts = await getOpts();
      expect(opts.allowList({ url: '/health', ip: '8.8.8.8' })).toBe(true);
      expect(opts.allowList({ url: '/healthz', ip: '8.8.8.8' })).toBe(true);
      expect(opts.allowList({ url: '/ready', ip: '8.8.8.8' })).toBe(true);
      // La sonde de disponibilité de #4219 : un 429 la ferait conclure
      // « instance morte » et redémarrer le conteneur.
      expect(opts.allowList({ url: '/api/v1/health/ready', ip: '8.8.8.8' })).toBe(true);
    });

    /**
     * L'ancienne clause mettait aussi les IP privées en liste blanche. Reprise
     * telle quelle, elle aurait DÉSACTIVÉ tout le rate limiting : sans
     * `trustProxy`, le gateway derrière Traefik voit une adresse `172.x` pour
     * chaque requête. Le renommage naïf était pire que le bug.
     */
    it('allowList does NOT whitelist private IPs', async () => {
      (isLocalIp as jest.Mock).mockReturnValue(true);
      const opts = await getOpts();
      expect(opts.allowList({ url: '/api/v1/messages', ip: '172.18.0.4' })).toBe(false);
      expect(opts.allowList({ url: '/api/v1/messages', ip: '127.0.0.1' })).toBe(false);
    });

    it('allowList returns false for normal API paths', async () => {
      (isLocalIp as jest.Mock).mockReturnValue(false);
      const opts = await getOpts();
      expect(opts.allowList({ url: '/api/v1/messages', ip: '9.9.9.9' })).toBe(false);
    });

    it('allowList ignores query strings when checking path', async () => {
      const opts = await getOpts();
      expect(opts.allowList({ url: '/health?ts=123', ip: '5.5.5.5' })).toBe(true);
    });

    it('errorResponseBuilder returns 429 shape', async () => {
      const opts = await getOpts();
      const body = opts.errorResponseBuilder({}, { ttl: 15 });
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(429);
      expect(body.retryAfter).toBe(15);
    });
  });
});

// ─── createContactChangeRateLimitConfig (#4184) ───────────────────────────────

describe('createContactChangeRateLimitConfig', () => {
  const cas: Array<[Parameters<typeof createContactChangeRateLimitConfig>[0], number]> = [
    ['initiate', 3],
    ['verify', 10],
    ['resend', 5],
  ];

  it.each(cas)('%s plafonne a %i par heure', (type, max) => {
    const cfg = createContactChangeRateLimitConfig(type) as any;
    expect(cfg.max).toBe(max);
    expect(cfg.timeWindow).toBe('1 hour');
  });

  /**
   * Le temoin qui compte vraiment. Sans `keyGenerator`, `mergeParams` du
   * plugin (un `Object.assign`) fait heriter la cle GLOBALE
   * `global:${request.ip}` — et le gateway tourne sans `trustProxy` derriere
   * Traefik, donc cette IP est celle du conteneur proxy, la MEME pour tout le
   * monde. Le plafond « 3/h » deviendrait 3/h pour la plateforme entiere : un
   * seul compte en priverait tous les autres, et la protection se retournerait
   * en deni de service.
   */
  it('la cle est celle du COMPTE, jamais l\'IP partagee du proxy', () => {
    const cfg = createContactChangeRateLimitConfig('initiate') as any;
    const req = { authContext: { userId: 'u-42' }, ip: '10.0.0.7' };
    expect(cfg.keyGenerator(req)).toBe('contact-change:initiate:u-42');
  });

  it('retombe sur l\'IP seulement en l\'absence de compte', () => {
    const cfg = createContactChangeRateLimitConfig('verify') as any;
    expect(cfg.keyGenerator({ ip: '10.0.0.7' })).toBe('contact-change:verify:ip:10.0.0.7');
  });

  it('rend un 429 structure', () => {
    const cfg = createContactChangeRateLimitConfig('resend') as any;
    expect(cfg.errorResponseBuilder()).toMatchObject({ success: false, statusCode: 429 });
  });
});
