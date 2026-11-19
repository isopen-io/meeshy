/**
 * #19827 — un scellement REFUSÉ ne détruit plus l'entrée quand il est TRANSITOIRE.
 *
 * `sealedForStorage` est fail-closed, et c'est juste : le clair d'une
 * conversation chiffrée au repos ne se pose jamais dans Redis, dont les
 * sauvegardes AOF sont exactement le modèle de menace que le sceau couvre.
 * Mais le refus décidait AUSSI d'une LIVRAISON : l'entrée était jetée, sans
 * remise, avec un `logger.error` pour seule trace. Chaque participant hors
 * ligne d'une telle conversation perdait donc ses messages, définitivement,
 * pendant toute la durée d'un incident de la base des clés.
 *
 * C'est l'inversion de la doctrine du dépôt sur le drain — fail-CLOSED sur la
 * preuve, où un secret est en jeu ; fail-OPEN sur l'ABSENCE de preuve, où c'est
 * une livraison. Un échec de scellement n'est pas une preuve que ce contenu ne
 * doit pas voyager : c'est l'aveu qu'on n'a pas PU le sceller.
 *
 * Ces témoins fixent la classification, et surtout sa moitié la plus facile à
 * perdre : une entrée gardée faute de sceau reste dans le TAS et ne part
 * JAMAIS vers Redis, même quand Redis se porte bien.
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { EncryptionService } from '../../../services/EncryptionService';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import { deliveryQueueSealer, type DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import {
  ConversationKeyGenerationFailedError,
  ServerAtRestUnavailableError,
} from '../../../services/messaging/serverAtRest';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const MSG = '507f1f77bcf86cd799439022';
const SECRET = 'Le code du coffre est 4471, porte B';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

const ENQUEUED_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const entry = (overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload => ({
  messageId: MSG,
  conversationId: CONV,
  payload: { id: MSG, conversationId: CONV, content: SECRET, encryptionMode: 'server' },
  enqueuedAt: ENQUEUED_AT,
  eventType: 'new',
  ...overrides,
});

/**
 * Un Redis en PLEINE SANTÉ, et c'est tout l'intérêt : le témoin de rétention
 * ne prouve rien si la seule raison pour laquelle Redis ne reçoit rien est que
 * Redis est en panne.
 */
const fakeRedis = () => {
  const lists = new Map<string, string[]>();
  const client = {
    eval: async (script: string, numkeys: number, ...rest: string[]) => {
      const keys = rest.slice(0, numkeys);
      const args = rest.slice(numkeys);
      const key = keys[0];
      if (args.length === 0) {
        const entries = lists.get(key) ?? [];
        lists.delete(key);
        return entries;
      }
      if (script.includes('LPUSH')) {
        lists.set(key, [...args.slice(2), ...(lists.get(key) ?? [])]);
        return args.length - 2;
      }
      lists.set(key, [...(lists.get(key) ?? []), args[0]]);
      return 1;
    },
    lrange: async (key: string) => lists.get(key) ?? [],
    llen: async (key: string) => (lists.get(key) ?? []).length,
  };
  const stored = () => [...lists.values()].flat().join('\n');
  return { stored, cacheStore: { getNativeClient: () => client } as unknown as CacheStore };
};

/** Un sceau qui refuse toujours, de la cause exacte qu'on lui donne. */
const refusingSealer = (error: unknown): DeliveryQueueSealer => ({
  seal: async () => { throw error; },
  open: async (sealed) => sealed,
});

describe('#19827 — un refus de scellement TRANSITOIRE ne détruit plus l’entrée', () => {
  it('la clé de la conversation n’a pas pu être CRÉÉE : l’entrée survit et se rejoue', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(
      redis.cacheStore,
      refusingSealer(new ConversationKeyGenerationFailedError(CONV, new Error('mongo down'))),
    );

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(1);
    expect(await queue.drain('u-1')).toEqual([entry()]);
  });

  it('la base des clés est injoignable (`key-unavailable`) : l’entrée survit', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, refusingSealer(new ServerAtRestUnavailableError('key-unavailable')));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.drain('u-1')).toEqual([entry()]);
  });

  it('une cause INCONNUE est transitoire : on ne détruit pas une livraison sur une erreur qu’on ne sait pas lire', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, refusingSealer(new Error('etimedout')));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.drain('u-1')).toEqual([entry()]);
  });

  it('l’entrée gardée faute de sceau ne part JAMAIS vers Redis, même Redis en pleine santé', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(
      redis.cacheStore,
      refusingSealer(new ConversationKeyGenerationFailedError(CONV, new Error('mongo down'))),
    );

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    // Les DEUX moitiés, sinon le témoin ne discrimine rien : « Redis n'a rien
    // reçu » est trivialement vrai tant que l'entrée est DÉTRUITE.
    expect(await queue.size('u-1')).toBe(1);
    expect(redis.stored()).toBe('');
    expect(redis.stored()).not.toContain('4471');
  });

  it('l’entrée gardée reste soumise au plafond du tas et à la fenêtre de rétention', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(
      redis.cacheStore,
      refusingSealer(new ConversationKeyGenerationFailedError(CONV, new Error('mongo down'))),
    );

    for (let i = 0; i < 60; i++) {
      await queue.enqueue('u-1', entry({ messageId: `m-${i}`, dedupKey: `d-${i}` }), { sealAtRest: true });
    }

    expect(await queue.size('u-1')).toBe(50);
  });
});

describe('#19827 — un refus PERMANENT détruit l’entrée, comme avant', () => {
  it('aucune clé maîtresse : le remède est une configuration et un redémarrage, qui vide le tas', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, refusingSealer(new ServerAtRestUnavailableError('missing')));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
    expect(redis.stored()).toBe('');
  });

  it('clé maîtresse ERRONÉE (`key-unwrap-failed`) : même remède, même verdict', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, refusingSealer(new ServerAtRestUnavailableError('key-unwrap-failed')));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
  });

  it('une file construite SANS sceau ne gardera jamais rien en clair', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
    expect(redis.stored()).toBe('');
  });

  it('une charge qui ne se SÉRIALISE pas ne se scellera jamais', async () => {
    const redis = fakeRedis();
    const circular: Record<string, unknown> = { id: MSG };
    circular.self = circular;
    const queue = new RedisDeliveryQueue(
      redis.cacheStore,
      deliveryQueueSealer(async () => new EncryptionService(((): PrismaClient => {
        process.env.ENCRYPTION_MASTER_KEY = MASTER;
        return {
          conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
          serverEncryptionKey: {
            create: async ({ data }: { data: Record<string, unknown> }) => data,
            findUnique: async () => null,
            findMany: async () => [],
            update: async () => null,
            updateMany: async () => ({ count: 0 }),
          },
        } as unknown as PrismaClient;
      })())),
    );

    await queue.enqueue('u-1', entry({ payload: circular }), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
  });
});

describe('#19827 — la cause transitoire REMONTE du vrai sceau, pas seulement d’un double', () => {
  it('une base des clés qui refuse l’écriture fait garder l’entrée', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const prisma = {
      conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
      serverEncryptionKey: {
        create: async () => { throw new Error('connection to mongo lost'); },
        findUnique: async () => null,
        findMany: async () => [],
        update: async () => null,
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(
      redis.cacheStore,
      deliveryQueueSealer(async () => new EncryptionService(prisma)),
    );

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(redis.stored()).toBe('');
    expect(await queue.drain('u-1')).toEqual([entry()]);
  });
});
