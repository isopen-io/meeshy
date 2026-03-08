import { ConfigCache } from '../../config/config-cache';
import type { MongoPersistence } from '../../memory/mongo-persistence';

function makeRedisStore() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    duplicate: jest.fn(() => ({
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    })),
  };
}

function makePersistence(overrides: Partial<MongoPersistence> = {}) {
  return {
    getAgentConfig: jest.fn().mockResolvedValue(null),
    getGlobalConfig: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as MongoPersistence;
}

function makeAgentConfig(conversationId: string) {
  return {
    id: 'cfg-1',
    conversationId,
    enabled: true,
    agentType: 'personal',
    contextWindowSize: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeGlobalConfig() {
  return {
    id: 'global-1',
    systemPrompt: 'Tu es un agent',
    enabled: true,
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    fallbackProvider: null,
    fallbackModel: null,
    globalDailyBudgetUsd: 10.0,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

describe('ConfigCache', () => {
  describe('getConfig()', () => {
    it('returns cached config on Redis hit without calling persistence', async () => {
      const config = makeAgentConfig('conv-1');
      const redis = makeRedisStore();
      redis.store.set('agent:config:conv-1', JSON.stringify(config));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getConfig('conv-1');

      expect(result).toEqual(JSON.parse(JSON.stringify(config)));
      expect(persistence.getAgentConfig).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and populates Redis cache', async () => {
      const config = makeAgentConfig('conv-2');
      const redis = makeRedisStore();
      const persistence = makePersistence({
        getAgentConfig: jest.fn().mockResolvedValue(config),
      });

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getConfig('conv-2');

      expect(result).toEqual(config);
      expect(persistence.getAgentConfig).toHaveBeenCalledWith('conv-2');
      expect(redis.set).toHaveBeenCalledWith(
        'agent:config:conv-2',
        JSON.stringify(config),
        'EX',
        300,
      );
    });

    it('returns null when config not found in Redis or DB', async () => {
      const redis = makeRedisStore();
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getConfig('conv-unknown');

      expect(result).toBeNull();
      expect(persistence.getAgentConfig).toHaveBeenCalledWith('conv-unknown');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('invalidate()', () => {
    it('removes config key from Redis', async () => {
      const redis = makeRedisStore();
      redis.store.set('agent:config:conv-1', JSON.stringify(makeAgentConfig('conv-1')));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.invalidate('conv-1');

      expect(redis.del).toHaveBeenCalledWith('agent:config:conv-1');
      expect(redis.store.has('agent:config:conv-1')).toBe(false);
    });
  });

  describe('getGlobalConfig()', () => {
    it('returns cached global config on Redis hit without calling persistence', async () => {
      const config = makeGlobalConfig();
      const redis = makeRedisStore();
      redis.store.set('agent:global-config', JSON.stringify(config));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getGlobalConfig();

      expect(result).toEqual(JSON.parse(JSON.stringify(config)));
      expect(persistence.getGlobalConfig).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and populates Redis with 10min TTL', async () => {
      const config = makeGlobalConfig();
      const redis = makeRedisStore();
      const persistence = makePersistence({
        getGlobalConfig: jest.fn().mockResolvedValue(config),
      });

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getGlobalConfig();

      expect(result).toEqual(config);
      expect(persistence.getGlobalConfig).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        'agent:global-config',
        JSON.stringify(config),
        'EX',
        600,
      );
    });

    it('returns null when global config not found anywhere', async () => {
      const redis = makeRedisStore();
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      const result = await cache.getGlobalConfig();

      expect(result).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('invalidateGlobal()', () => {
    it('removes global config key from Redis', async () => {
      const redis = makeRedisStore();
      redis.store.set('agent:global-config', JSON.stringify(makeGlobalConfig()));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.invalidateGlobal();

      expect(redis.del).toHaveBeenCalledWith('agent:global-config');
      expect(redis.store.has('agent:global-config')).toBe(false);
    });
  });

  describe('startListening()', () => {
    it('subscribes to invalidation channel via duplicated Redis connection', async () => {
      const redis = makeRedisStore();
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.startListening();

      expect(redis.duplicate).toHaveBeenCalled();
      const subscriber = redis.duplicate.mock.results[0].value;
      expect(subscriber.subscribe).toHaveBeenCalledWith('agent:config-invalidated');
      expect(subscriber.on).toHaveBeenCalledWith('message', expect.any(Function));

      await cache.stopListening();
    });

    it('invalidates conversation config when receiving invalidation message', async () => {
      const redis = makeRedisStore();
      redis.store.set('agent:config:conv-1', JSON.stringify(makeAgentConfig('conv-1')));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.startListening();

      const subscriber = redis.duplicate.mock.results[0].value;
      const messageHandler = subscriber.on.mock.calls.find(
        (call: [string, Function]) => call[0] === 'message',
      )[1];

      await messageHandler('agent:config-invalidated', JSON.stringify({ conversationId: 'conv-1' }));

      expect(redis.del).toHaveBeenCalledWith('agent:config:conv-1');

      await cache.stopListening();
    });

    it('invalidates global config when receiving global invalidation message', async () => {
      const redis = makeRedisStore();
      redis.store.set('agent:global-config', JSON.stringify(makeGlobalConfig()));
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.startListening();

      const subscriber = redis.duplicate.mock.results[0].value;
      const messageHandler = subscriber.on.mock.calls.find(
        (call: [string, Function]) => call[0] === 'message',
      )[1];

      await messageHandler('agent:config-invalidated', JSON.stringify({ global: true }));

      expect(redis.del).toHaveBeenCalledWith('agent:global-config');

      await cache.stopListening();
    });
  });

  describe('stopListening()', () => {
    it('unsubscribes and quits subscriber connection', async () => {
      const redis = makeRedisStore();
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.startListening();

      const subscriber = redis.duplicate.mock.results[0].value;
      await cache.stopListening();

      expect(subscriber.unsubscribe).toHaveBeenCalledWith('agent:config-invalidated');
      expect(subscriber.quit).toHaveBeenCalled();
    });

    it('does nothing when no subscriber exists', async () => {
      const redis = makeRedisStore();
      const persistence = makePersistence();

      const cache = new ConfigCache(redis as any, persistence);
      await cache.stopListening();

      expect(redis.duplicate).not.toHaveBeenCalled();
    });
  });
});
