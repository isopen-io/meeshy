/**
 * #12822 (M3) — le drain de la file hors ligne est DESTRUCTIF : une entrée
 * scellée qui ne se rouvre pas à cet instant était perdue, même quand la
 * cause n'était que passagère (base des clés injoignable, clé maîtresse
 * absente ou erronée le temps d'un déploiement). Elle est désormais REMISE en
 * file, à sa place (son `enqueuedAt`) et dans sa limite de 48 h ; seule une
 * entrée qui ne s'authentifie pas (`authentication-failed`) ou qui est
 * informe (`malformed`) est jetée. Une remise ne remplace jamais une entrée
 * plus récente de même identité arrivée pendant le drain.
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { DELIVERY_QUEUE_TTL_SECONDS } from '@meeshy/shared/types/delivery-queue';
import { EncryptionService } from '../../../services/EncryptionService';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import { deliveryQueueSealer, type DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { ServerAtRestUnreadableError } from '../../../services/messaging/serverAtRest';

const MASTER = Buffer.alloc(32, 3).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const MSG_A = '507f1f77bcf86cd799439022';
const MSG_B = '507f1f77bcf86cd799439033';
const SECRET = 'Le code du coffre est 4471, porte B';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Row = Record<string, unknown>;

/** Le coffre de clés en base ; `down()` le rend injoignable, `up()` le rétablit. */
const keyStore = () => {
  const rows = new Map<string, Row>();
  const state = { down: false };
  const guard = <T>(value: () => T): T => {
    if (state.down) throw new Error('mongo down');
    return value();
  };
  const prisma = {
    conversation: { findUnique: async () => guard(() => null), updateMany: async () => ({ count: 0 }) },
    serverEncryptionKey: {
      create: async ({ data }: { data: Row }) => guard(() => { rows.set(String(data.id), data); return data; }),
      findUnique: async ({ where }: { where: { id: string } }) => guard(() => rows.get(where.id) ?? null),
      findMany: async () => [...rows.values()],
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = rows.get(where.id);
        if (row) rows.set(where.id, { ...row, ...data });
        return rows.get(where.id) ?? null;
      },
      updateMany: async () => ({ count: 0 }),
    },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    down: () => { state.down = true; },
    up: () => { state.down = false; },
  };
};

/** Un processus de passerelle neuf : aucun cache de clé. */
const gateway = (prisma: PrismaClient, masterKey: string | null = MASTER): EncryptionService => {
  if (masterKey === null) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = masterKey;
  return new EncryptionService(prisma);
};

const identity = (raw: string): string => {
  const entry = JSON.parse(raw) as QueuedMessagePayload;
  return `${entry.dedupKey ?? entry.messageId}\n${entry.eventType ?? 'new'}`;
};

/** Redis, réduit à ce que la file lui demande : enfiler, vider, remettre. */
const fakeRedis = () => {
  const lists = new Map<string, string[]>();
  const client = {
    eval: async (script: string, _keys: number, key: string, ...args: string[]) => {
      const list = lists.get(key) ?? [];
      if (args.length === 0) {
        lists.delete(key);
        return list;
      }
      if (script.includes('LPUSH')) {
        const present = new Set(list.map(identity));
        const restored = args.slice(2).filter((raw) => !present.has(identity(raw)));
        lists.set(key, [...restored, ...list]);
        return restored.length;
      }
      lists.set(key, [...list, args[0]]);
      return 1;
    },
    lrange: async (key: string) => lists.get(key) ?? [],
    llen: async (key: string) => (lists.get(key) ?? []).length,
  };
  const stored = (key = 'delivery:queue:u-1'): QueuedMessagePayload[] =>
    (lists.get(key) ?? []).map((raw) => JSON.parse(raw) as QueuedMessagePayload);
  const rewrite = (change: (entry: QueuedMessagePayload) => QueuedMessagePayload, key = 'delivery:queue:u-1') => {
    lists.set(key, stored(key).map((e) => JSON.stringify(change(e))));
  };
  return { stored, rewrite, cacheStore: { getNativeClient: () => client } as unknown as CacheStore };
};

const memoryOnly = { getNativeClient: () => null } as unknown as CacheStore;

const entry = (overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload => ({
  messageId: MSG_A,
  conversationId: CONV,
  payload: { id: MSG_A, conversationId: CONV, content: SECRET, encryptionMode: 'server' },
  enqueuedAt: new Date(Date.now() - 60_000).toISOString(),
  eventType: 'new',
  ...overrides,
});

const queueOf = (cacheStore: CacheStore, sealer: DeliveryQueueSealer) => new RedisDeliveryQueue(cacheStore, sealer);

const sealerOf = (service: EncryptionService) => deliveryQueueSealer(async () => service);

describe('une entrée qui ne se rouvre pas pour une raison PASSAGÈRE est remise en file', () => {
  it.each([
    ['Redis', () => fakeRedis()],
    ['repli mémoire', () => ({ stored: undefined, cacheStore: memoryOnly })],
  ] as const)('%s — base des clés injoignable : rien n’est rejoué, rien n’est perdu', async (_label, backend) => {
    const keys = keyStore();
    const redis = backend();
    const cipher = { current: gateway(keys.prisma) };
    const queue = queueOf(redis.cacheStore, deliveryQueueSealer(async () => cipher.current));
    await queue.enqueue('u-1', entry(), { sealAtRest: true });
    cipher.current = gateway(keys.prisma);

    keys.down();
    expect(await queue.drain('u-1')).toEqual([]);
    keys.up();

    const replayed = await queue.drain('u-1');
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.payload).toEqual(entry().payload);
  });

  it('clé maîtresse absente au drain (déploiement) : l’entrée attend la clé, scellée', async () => {
    const keys = keyStore();
    const redis = fakeRedis();
    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma))).enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma, null))).drain('u-1')).toEqual([]);

    expect(redis.stored()).toHaveLength(1);
    expect(JSON.stringify(redis.stored())).not.toContain('4471');
    expect(await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma))).drain('u-1')).toHaveLength(1);
  });

  it('la remise garde l’instant d’origine : le délai de 48 h court toujours depuis l’enfilage', async () => {
    const keys = keyStore();
    const redis = fakeRedis();
    const original = entry();
    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma))).enqueue('u-1', original, { sealAtRest: true });

    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma, null))).drain('u-1');

    expect(redis.stored().map((e) => e.enqueuedAt)).toEqual([original.enqueuedAt]);
  });

  it('une entrée de plus de 48 h n’est pas remise', async () => {
    const keys = keyStore();
    const redis = fakeRedis();
    const expired = entry({ enqueuedAt: new Date(Date.now() - (DELIVERY_QUEUE_TTL_SECONDS + 60) * 1000).toISOString() });
    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma))).enqueue('u-1', expired, { sealAtRest: true });

    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma, null))).drain('u-1');

    expect(redis.stored()).toEqual([]);
  });

  it('l’ordre est gardé : les entrées remises se rejouent avant celles arrivées après', async () => {
    const keys = keyStore();
    const redis = fakeRedis();
    const writer = queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma)));
    await writer.enqueue('u-1', entry({ enqueuedAt: new Date(Date.now() - 120_000).toISOString() }), { sealAtRest: true });
    await writer.enqueue('u-1', entry({ messageId: MSG_B, enqueuedAt: new Date(Date.now() - 60_000).toISOString() }), { sealAtRest: true });
    await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma, null))).drain('u-1');
    await writer.enqueue('u-1', entry({ messageId: 'aaaaaaaaaaaaaaaaaaaaaaaa', payload: { id: 'x' }, enqueuedAt: new Date().toISOString() }));

    const replayed = await queueOf(redis.cacheStore, sealerOf(gateway(keys.prisma))).drain('u-1');

    expect(replayed.map((e) => e.messageId)).toEqual([MSG_A, MSG_B, 'aaaaaaaaaaaaaaaaaaaaaaaa']);
  });
});

describe('seule une entrée qui ne s’authentifie pas, ou informe, est jetée', () => {
  it('chiffré altéré (authentication-failed) : jeté, jamais remis', async () => {
    const keys = keyStore();
    const redis = fakeRedis();
    const service = gateway(keys.prisma);
    await queueOf(redis.cacheStore, sealerOf(service)).enqueue('u-1', entry(), { sealAtRest: true });
    redis.rewrite((e) => ({ ...e, sealedPayload: e.sealedPayload && { ...e.sealedPayload, authTag: Buffer.alloc(16, 7).toString('base64') } }));

    expect(await queueOf(redis.cacheStore, sealerOf(service)).drain('u-1')).toEqual([]);
    expect(redis.stored()).toEqual([]);
  });

  it('charge informe (malformed) : jetée', async () => {
    const redis = fakeRedis();
    const queue = queueOf(redis.cacheStore, {
      seal: async (e) => ({ ...e, payload: {}, sealedPayload: { ciphertext: 'x', keyId: 'k', iv: 'i', authTag: 't', aad: 'delivery-queue:v2' } }),
      open: async () => { throw new ServerAtRestUnreadableError('malformed'); },
    });
    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.drain('u-1')).toEqual([]);
    expect(redis.stored()).toEqual([]);
  });
});

describe('une remise ne remplace jamais une entrée plus récente de même identité', () => {
  it('une traduction plus récente arrivée pendant le drain l’emporte sur la remise', async () => {
    const redis = fakeRedis();
    const translation = (enqueuedAt: string, text: string): QueuedMessagePayload => entry({
      eventType: 'translation', dedupKey: `${MSG_A}:en`, enqueuedAt, payload: { messageId: MSG_A, text },
    });
    const queue: { current: RedisDeliveryQueue | null } = { current: null };
    queue.current = queueOf(redis.cacheStore, {
      seal: async (e) => ({ ...e, payload: {}, sealedPayload: { ciphertext: 'c', keyId: 'k', iv: 'i', authTag: 't', aad: 'delivery-queue:v2' } }),
      open: async () => {
        await queue.current?.enqueue('u-1', translation(new Date().toISOString(), 'la plus récente'));
        throw new ServerAtRestUnreadableError('data-key-unavailable');
      },
    });
    await queue.current.enqueue('u-1', translation(new Date(Date.now() - 60_000).toISOString(), 'ancienne'), { sealAtRest: true });

    await queue.current.drain('u-1');

    expect(redis.stored().map((e) => e.payload)).toEqual([{ messageId: MSG_A, text: 'la plus récente' }]);
  });
});
