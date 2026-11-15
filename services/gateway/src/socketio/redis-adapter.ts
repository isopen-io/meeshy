/**
 * Socket.IO Redis adapter wiring (#3723) — lets multiple gateway instances
 * share broadcast fan-out: an event emitted on one instance (io.to(room).emit(...))
 * reaches sockets connected to any other instance subscribed to the same Redis.
 *
 * Without REDIS_URL, the server keeps Socket.IO's default in-memory adapter —
 * exactly today's single-instance behavior. This mirrors RedisCacheStore's
 * fallback (services/gateway/src/services/CacheStore.ts): Redis is additive,
 * never a hard dependency to boot the gateway.
 */
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as SocketIOServer } from 'socket.io';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SocketIORedisAdapter' });

export type SocketIORedisAdapterHandle = {
  /** True once both pub/sub connections have completed their handshake. */
  isConnected(): boolean;
  close(): Promise<void>;
};

/**
 * `@socket.io/redis-adapter` fires these commands without awaiting or catching
 * them. At shutdown (#11468), the sockets' departures still broadcast presence
 * while `close()` has already dropped the connection: each command rejected
 * with « Connection is closed. » and reached the process as an UNHANDLED
 * rejection. Observing the promise logs the failure and leaves it to any
 * caller that does await it.
 */
const FIRE_AND_FORGET_COMMANDS: ReadonlySet<PropertyKey> = new Set(['publish', 'subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe']);

function withObservedCommands(client: Redis, role: 'pub' | 'sub'): Redis {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (!FIRE_AND_FORGET_COMMANDS.has(property) || typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const result: unknown = value.apply(target, args);
        if (result instanceof Promise) {
          result.catch((err: unknown) => logger.warn('Socket.IO Redis adapter command failed', { role, command: String(property), err }));
        }
        return result;
      };
    },
  });
}

/**
 * Attaches the Redis pub/sub adapter to `io` when a Redis URL is configured.
 * Returns `null` when no URL is available — the caller keeps the default
 * single-process adapter, so horizontal scaling is opt-in via REDIS_URL.
 */
export function attachSocketIORedisAdapter(
  io: SocketIOServer,
  redisUrl?: string
): SocketIORedisAdapterHandle | null {
  const url = redisUrl ?? process.env.REDIS_URL;

  if (!url) {
    logger.warn(
      'REDIS_URL not set — Socket.IO keeps its in-memory adapter; events broadcast on this instance will NOT reach other gateway instances'
    );
    return null;
  }

  const pubClient = new Redis(url, { maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();

  let connectedCount = 0;
  const onReady = () => {
    connectedCount += 1;
  };
  pubClient.on('ready', onReady);
  subClient.on('ready', onReady);
  pubClient.on('error', (err) => logger.error('Socket.IO Redis adapter pub client error', { err }));
  subClient.on('error', (err) => logger.error('Socket.IO Redis adapter sub client error', { err }));

  io.adapter(createAdapter(withObservedCommands(pubClient, 'pub'), withObservedCommands(subClient, 'sub')));
  logger.info('Socket.IO Redis adapter attached — broadcasts now fan out across gateway instances sharing this Redis');

  return {
    isConnected: () => connectedCount >= 2,
    async close() {
      pubClient.off('ready', onReady);
      subClient.off('ready', onReady);
      // `disconnect()` (not `quit()`): the adapter's subscriber connection
      // can have a pub/sub command permanently in flight, which makes
      // `quit()` race a reply that never comes. `disconnect()` drops the
      // socket immediately — safe here since the process is shutting this
      // adapter down, not expecting any more replies.
      pubClient.disconnect();
      subClient.disconnect();
    },
  };
}
