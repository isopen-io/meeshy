/**
 * Diagnostiquer les appels Redis à 2 s de la production, sans noyer les
 * journaux (#8272).
 *
 * Incident du 2026-09-27 : 300 à 850 lignes/minute de « Circuit breaker
 * failure: Redis — Operation timed out after 2000ms » pendant que Redis
 * répondait en 12 à 18 ms. Le retard est côté passerelle — boucle
 * d'événements ou file de commandes ioredis —, et aucune ligne ne disait
 * laquelle. La ligne d'échec porte désormais la durée réelle de l'opération,
 * le retard de la boucle et l'état ioredis ; et une rafale ne journalise
 * qu'une ligne par fenêtre, qui compte celles qu'elle a tues.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { ...logger, child: () => logger } };
});

import { CircuitBreaker, CircuitBreakerFactory } from '../../../utils/circuitBreaker';
import { readEventLoopLag, startEventLoopLagMonitor } from '../../../utils/eventLoopLag';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const failuresLogged = () =>
  (enhancedLogger.error as jest.Mock).mock.calls.filter(([message]) => String(message).startsWith('Circuit breaker failure'));

const breaker = (overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {}) =>
  new CircuitBreaker({
    name: 'Redis',
    failureThreshold: 1000,
    failureWindowMs: 60_000,
    resetTimeoutMs: 20_000,
    successThreshold: 1,
    timeout: 2000,
    failureLogSampleMs: 10_000,
    diagnostics: () => ({ redisStatus: 'ready', commandQueueLength: 42 }),
    ...overrides,
  });

const fail = (b: CircuitBreaker) => b.execute(() => Promise.reject(new Error('Operation timed out after 2000ms'))).catch(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('la ligne d’échec Redis dit où le temps est passé (#8272)', () => {
  it('porte l’état ioredis et la durée réelle de l’opération', async () => {
    await fail(breaker());

    const [, , context] = failuresLogged()[0] as [string, Error, Record<string, unknown>];
    expect(context).toMatchObject({ redisStatus: 'ready', commandQueueLength: 42, elapsedMs: expect.any(Number) });
  });

  it('ne journalise qu’une ligne par fenêtre pendant une rafale, et compte celles qu’elle tait', async () => {
    jest.useFakeTimers({ now: 0 });
    const b = breaker();
    for (let i = 0; i < 50; i += 1) await fail(b);
    expect(failuresLogged()).toHaveLength(1);

    jest.setSystemTime(10_000);
    await fail(b);

    expect(failuresLogged()).toHaveLength(2);
    expect(failuresLogged()[1][2]).toMatchObject({ suppressedSinceLastLog: 49 });
  });

  it('un disjoncteur sans échantillonnage journalise chaque échec, comme avant', async () => {
    const b = breaker({ failureLogSampleMs: undefined, diagnostics: undefined });
    await fail(b);
    await fail(b);
    expect(failuresLogged()).toHaveLength(2);
  });

  it('le disjoncteur Redis de la fabrique échantillonne et porte les diagnostics qu’on lui donne', async () => {
    const b = CircuitBreakerFactory.createRedisBreaker(() => ({ redisStatus: 'reconnecting' }));
    await fail(b);
    await fail(b);
    expect(failuresLogged()).toHaveLength(1);
    expect(failuresLogged()[0][2]).toMatchObject({ redisStatus: 'reconnecting' });
  });
});

describe('le retard de la boucle d’événements se mesure depuis la lecture précédente (#8272)', () => {
  it('voit une boucle bloquée 150 ms', async () => {
    startEventLoopLagMonitor();
    readEventLoopLag();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const until = Date.now() + 150;
    while (Date.now() < until) {
      // boucle bloquée à dessein
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(readEventLoopLag()?.maxMs).toBeGreaterThanOrEqual(100);
  });
});
