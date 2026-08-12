import Redis from 'ioredis';
import type { Server } from 'socket.io';
import {
  AGENT_ADMIN_EVENT_CHANNEL,
  AGENT_ADMIN_EVENT_KINDS,
  ROOMS,
  SERVER_EVENTS,
  type AgentAdminEventData,
  type AgentAdminEventKind,
} from '@meeshy/shared/types/socketio-events';
import { logger } from '../utils/logger';

type RedisSubscriber = Pick<Redis, 'connect' | 'subscribe' | 'unsubscribe' | 'quit' | 'on'>;

export function parseAgentAdminEvent(message: string): AgentAdminEventData | null {
  try {
    const parsed: unknown = JSON.parse(message);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { kind, conversationId } = parsed as { kind?: unknown; conversationId?: unknown };
    if (typeof kind !== 'string' || !(AGENT_ADMIN_EVENT_KINDS as readonly string[]).includes(kind)) return null;
    if (conversationId === undefined) return { kind: kind as AgentAdminEventKind };
    if (typeof conversationId !== 'string') return null;
    return { kind: kind as AgentAdminEventKind, conversationId };
  } catch {
    return null;
  }
}

function createDefaultSubscriber(): RedisSubscriber | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => (times > 5 ? null : 2000),
  });
}

/**
 * Relaie le canal Redis `agent:admin-event` (publié par le service agent et
 * les routes admin gateway) vers la room Socket.IO `admin:agent`.
 * Connexion Redis dédiée : une connexion en mode subscribe ne peut exécuter
 * aucune autre commande, d'où l'impossibilité de réutiliser le CacheStore.
 */
export class AgentAdminRelay {
  private subscriber: RedisSubscriber | null = null;

  constructor(
    private io: Server,
    private createSubscriber: () => RedisSubscriber | null = createDefaultSubscriber,
  ) {}

  async start(): Promise<void> {
    if (this.subscriber) return;
    const subscriber = this.createSubscriber();
    if (!subscriber) {
      logger.warn('AgentAdminRelay disabled: no REDIS_URL configured');
      return;
    }
    this.subscriber = subscriber;

    subscriber.on('error', (error: Error) => {
      logger.warn('AgentAdminRelay redis error', { error: error.message });
    });

    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== AGENT_ADMIN_EVENT_CHANNEL) return;
      const event = parseAgentAdminEvent(message);
      if (!event) {
        logger.warn('AgentAdminRelay ignored invalid payload', { message });
        return;
      }
      this.io.to(ROOMS.adminAgent()).emit(SERVER_EVENTS.AGENT_ADMIN_EVENT, event);
    });

    // Le subscriber est créé lazyConnect + enableOfflineQueue:false : un
    // subscribe() émis avant l'établissement du stream est REJETÉ («Stream
    // isn't writeable») — connect() explicite d'abord, sinon le relay ne
    // démarre jamais (observé à chaque boot en prod).
    await subscriber.connect();
    await subscriber.subscribe(AGENT_ADMIN_EVENT_CHANNEL);
    logger.info('AgentAdminRelay subscribed', { channel: AGENT_ADMIN_EVENT_CHANNEL });
  }

  async stop(): Promise<void> {
    if (!this.subscriber) return;
    const subscriber = this.subscriber;
    this.subscriber = null;
    await subscriber.unsubscribe(AGENT_ADMIN_EVENT_CHANNEL).catch((err) => logger.debug('AgentAdminRelay: unsubscribe error on stop', { err }));
    await subscriber.quit().catch((err) => logger.debug('AgentAdminRelay: quit error on stop', { err }));
  }
}
