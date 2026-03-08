import type Redis from 'ioredis';
import type { MongoPersistence } from '../memory/mongo-persistence';

const CONFIG_PREFIX = 'agent:config:';
const GLOBAL_CONFIG_KEY = 'agent:global-config';
const CONFIG_TTL = 300;
const GLOBAL_CONFIG_TTL = 600;
const INVALIDATION_CHANNEL = 'agent:config-invalidated';

export class ConfigCache {
  private subscriber: Redis | null = null;

  constructor(
    private redis: Redis,
    private persistence: MongoPersistence,
  ) {}

  async getConfig(conversationId: string) {
    const key = `${CONFIG_PREFIX}${conversationId}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    const config = await this.persistence.getAgentConfig(conversationId);
    if (config) {
      await this.redis.set(key, JSON.stringify(config), 'EX', CONFIG_TTL);
    }
    return config;
  }

  async getGlobalConfig() {
    const cached = await this.redis.get(GLOBAL_CONFIG_KEY);
    if (cached) return JSON.parse(cached);

    const config = await this.persistence.getGlobalConfig();
    if (config) {
      await this.redis.set(GLOBAL_CONFIG_KEY, JSON.stringify(config), 'EX', GLOBAL_CONFIG_TTL);
    }
    return config;
  }

  async invalidate(conversationId: string) {
    await this.redis.del(`${CONFIG_PREFIX}${conversationId}`);
  }

  async invalidateGlobal() {
    await this.redis.del(GLOBAL_CONFIG_KEY);
  }

  async startListening() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(INVALIDATION_CHANNEL);

    this.subscriber.on('message', async (_channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.conversationId) {
          await this.invalidate(parsed.conversationId);
          console.log(`[ConfigCache] Invalidated config for conv=${parsed.conversationId}`);
        }
        if (parsed.global) {
          await this.invalidateGlobal();
          console.log('[ConfigCache] Invalidated global config');
        }
      } catch {
        console.error('[ConfigCache] Invalid invalidation message:', message);
      }
    });

    console.log('[ConfigCache] Listening for invalidation events');
  }

  async stopListening() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(INVALIDATION_CHANNEL);
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }
}
