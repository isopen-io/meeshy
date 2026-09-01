/**
 * Tests for middleware/rate-limit.ts
 *
 * Covers: RATE_LIMITS constants, createRateLimitConfig, ROUTE_RATE_LIMITS.
 *
 * `registerRateLimiting` a été SUPPRIMÉ par #4687 — enregistreur global qu'
 * aucun appelant de production n'invoquait, et dont le `keyGenerator`
 * annonçait une clé par compte en rendant l'adresse : un patron à copier, pas
 * un limiteur. Ses témoins partent avec lui, y compris la garde négative
 * « pas d'allowList » (#4137) : elle gardait la forme d'un plugin qui ne
 * s'enregistre plus. La même garde vit, sur le SEUL enregistreur monté, dans
 * `rate-limiter-pure.test.ts` (`registerGlobalRateLimiter`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/rate-limiter', () => ({
  isLocalIp: jest.fn((ip: string) => ip === '127.0.0.1'),
}));

import {
  RATE_LIMITS,
  createRateLimitConfig,
  ROUTE_RATE_LIMITS,
} from '../../../middleware/rate-limit';

import { isLocalIp } from '../../../utils/rate-limiter';

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
  // explicite herite du keyGenerator GLOBAL, soit `global:${request.ip}` —
  // l'ADRESSE de l'appelant, `trustProxy` etant pose depuis #4137. Une limite
  // qui se veut par compte et compte par adresse se trompe dans les deux sens
  // (plusieurs comptes derriere une sortie partagent un credit ; un compte a
  // plusieurs adresses en cumule autant). Ces tests prouvent que la config
  // fournit une cle PAR UTILISATEUR, jamais la cle globale brute.
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
