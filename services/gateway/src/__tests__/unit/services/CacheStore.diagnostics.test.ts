/**
 * Le disjoncteur Redis du cache reçoit l'état de SA connexion ioredis et le
 * retard de la boucle d'événements, pour que la ligne d'échec dise si le
 * temps s'est perdu dans la file de commandes ou dans la boucle (#8272).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const captured: { diagnostics?: () => Record<string, unknown> } = {};

jest.mock('../../../utils/circuitBreaker', () => ({
  CircuitBreakerFactory: {
    createRedisBreaker: (diagnostics: () => Record<string, unknown>) => {
      captured.diagnostics = diagnostics;
      return { execute: (fn: () => Promise<unknown>) => fn(), getStats: () => ({ state: 'CLOSED' }) };
    },
  },
  circuitBreakerManager: { register: jest.fn() },
  CircuitState: { OPEN: 'OPEN', CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN' },
}));

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    status: 'reconnecting',
    commandQueue: { length: 17 },
    connect: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn<any>().mockReturnThis(),
    disconnect: jest.fn(),
  }))
);

import { RedisCacheStore } from '../../../services/CacheStore';

describe('les diagnostics du disjoncteur Redis du cache (#8272)', () => {
  it('portent l’état ioredis, la longueur de sa file de commandes et le retard de la boucle', async () => {
    const store = new RedisCacheStore('redis://localhost:6379');

    expect(captured.diagnostics?.()).toEqual({
      redisStatus: 'reconnecting',
      commandQueueLength: 17,
      eventLoopLag: expect.objectContaining({ p99Ms: expect.any(Number), maxMs: expect.any(Number) }),
    });
    await store.close();
  });

  it('disent « absent » quand le cache tourne sans Redis', async () => {
    const store = new RedisCacheStore('');
    expect(captured.diagnostics?.()).toMatchObject({ redisStatus: 'absent', commandQueueLength: 0 });
    await store.close();
  });
});
