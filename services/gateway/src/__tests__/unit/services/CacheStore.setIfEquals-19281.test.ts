/**
 * #19281 — `setIfEquals` : remplacer une valeur SEULEMENT si la clé porte encore
 * celle qu'on y a lue, d'un seul coup. Le cache d'authentification s'en sert
 * pour ne jamais remettre en cache une ligne qu'une écriture vient d'effacer :
 * un « lire puis écrire » laisse passer l'effacement entre les deux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const mockCircuitBreaker = {
  execute: jest.fn<any>((fn: () => Promise<unknown>) => fn()),
  getStats: jest.fn<any>().mockReturnValue({ state: 'CLOSED' }),
};

jest.mock('../../../utils/circuitBreaker', () => ({
  CircuitBreakerFactory: { createRedisBreaker: () => mockCircuitBreaker },
  circuitBreakerManager: { register: jest.fn() },
  CircuitState: { OPEN: 'OPEN', CLOSED: 'CLOSED', HALF_OPEN: 'HALF_OPEN' },
}));

const mockRedisInstance = {
  get: jest.fn<any>().mockResolvedValue(null),
  set: jest.fn<any>().mockResolvedValue('OK'),
  eval: jest.fn<any>().mockResolvedValue(1),
  disconnect: jest.fn<any>(),
  connect: jest.fn<any>().mockResolvedValue(undefined),
  on: jest.fn<any>().mockReturnThis(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

import { RedisCacheStore } from '../../../services/CacheStore';

describe('RedisCacheStore.setIfEquals — mémoire (sans Redis)', () => {
  it('remplace quand la clé porte la valeur attendue', async () => {
    const store = new RedisCacheStore();
    await store.set('k', 'claim', 10);
    expect(await store.setIfEquals('k', 'claim', 'row', 60)).toBe(true);
    expect(await store.get('k')).toBe('row');
    await store.close();
  });

  it('ne touche à rien quand la valeur a changé', async () => {
    const store = new RedisCacheStore();
    await store.set('k', 'other', 10);
    expect(await store.setIfEquals('k', 'claim', 'row', 60)).toBe(false);
    expect(await store.get('k')).toBe('other');
    await store.close();
  });

  it('ne recrée pas une clé effacée', async () => {
    const store = new RedisCacheStore();
    expect(await store.setIfEquals('k', 'claim', 'row', 60)).toBe(false);
    expect(await store.get('k')).toBeNull();
    await store.close();
  });
});

describe('RedisCacheStore.setIfEquals — Redis : une seule commande atomique', () => {
  it('compare et écrit dans un script, jamais par un GET suivi d’un SET', async () => {
    const store = new RedisCacheStore('redis://localhost:6379');
    mockRedisInstance.eval.mockResolvedValueOnce(1);
    expect(await store.setIfEquals('k', 'claim', 'row', 60)).toBe(true);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(expect.any(String), 1, 'k', 'claim', 'row', '60');
    expect(mockRedisInstance.get).not.toHaveBeenCalled();
    expect(mockRedisInstance.set).not.toHaveBeenCalled();
    await store.close();
  });

  it('rend faux quand le script n’a rien écrit', async () => {
    const store = new RedisCacheStore('redis://localhost:6379');
    mockRedisInstance.eval.mockResolvedValueOnce(0);
    expect(await store.setIfEquals('k', 'claim', 'row', 60)).toBe(false);
    await store.close();
  });
});
