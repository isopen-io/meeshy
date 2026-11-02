/**
 * #12822 (L1) — le sceau d'une entrée de file hors ligne la lie à TOUT ce qui
 * décide de son rejeu : sa conversation et son message (v1), mais aussi son
 * destinataire (la clé de file), son `eventType` et sa `dedupKey` (v2).
 *
 * En v1, quiconque écrit dans Redis pouvait déplacer une entrée scellée dans
 * la file d'un autre membre, ou la rejouer sous un autre événement (un
 * `message:new` rejoué en `message:edited`) : le sceau s'ouvrait quand même.
 * En v2, l'entrée ainsi déplacée ou relabellisée ne s'authentifie plus, et elle
 * est jetée (M3 : `authentication-failed`). Les entrées v1 déjà en file au
 * déploiement se rouvrent encore pendant leurs 48 h (rétrocompatibilité,
 * #9223).
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import * as crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { EncryptionService } from '../../../services/EncryptionService';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import { deliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { DELIVERY_QUEUE_AAD_V1, deliveryQueueAad, sealBytes } from '../../../services/messaging/serverAtRest';

const MASTER = Buffer.alloc(32, 3);
const CONV = '507f1f77bcf86cd799439011';
const MSG = '507f1f77bcf86cd799439022';
const SECRET = 'Le code du coffre est 4471, porte B';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Row = Record<string, unknown>;

const keyStore = () => {
  const rows = new Map<string, Row>();
  const prisma = {
    conversation: { findUnique: async () => null, updateMany: async () => ({ count: 0 }) },
    serverEncryptionKey: {
      create: async ({ data }: { data: Row }) => { rows.set(String(data.id), data); return data; },
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findMany: async () => [...rows.values()],
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = rows.get(where.id);
        if (row) rows.set(where.id, { ...row, ...data });
        return rows.get(where.id) ?? null;
      },
      updateMany: async () => ({ count: 0 }),
    },
  };
  return { rows, prisma: prisma as unknown as PrismaClient };
};

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
        lists.set(key, [...args.slice(2), ...list]);
        return args.length - 2;
      }
      lists.set(key, [...list, args[0]]);
      return 1;
    },
    lrange: async (key: string) => lists.get(key) ?? [],
    llen: async (key: string) => (lists.get(key) ?? []).length,
  };
  const read = (user: string): QueuedMessagePayload[] =>
    (lists.get(`delivery:queue:${user}`) ?? []).map((raw) => JSON.parse(raw) as QueuedMessagePayload);
  const write = (user: string, entries: readonly QueuedMessagePayload[]) => {
    lists.set(`delivery:queue:${user}`, entries.map((e) => JSON.stringify(e)));
  };
  return { read, write, cacheStore: { getNativeClient: () => client } as unknown as CacheStore };
};

const entry = (overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload => ({
  messageId: MSG,
  conversationId: CONV,
  payload: { id: MSG, conversationId: CONV, content: SECRET, encryptionMode: 'server' },
  enqueuedAt: new Date(Date.now() - 60_000).toISOString(),
  eventType: 'new',
  ...overrides,
});

const world = () => {
  process.env.ENCRYPTION_MASTER_KEY = MASTER.toString('base64');
  const keys = keyStore();
  const redis = fakeRedis();
  const queue = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => new EncryptionService(keys.prisma)));
  return { keys, redis, queue };
};

/** Une entrée sealée en v1, telle que la passerelle d'avant ce lot l'enfilait. */
const v1Entry = (keys: ReturnType<typeof keyStore>): QueuedMessagePayload => {
  const keyId = crypto.randomUUID();
  const dataKey = crypto.randomBytes(32);
  const wrapIv = crypto.randomBytes(12);
  const wrap = crypto.createCipheriv('aes-256-gcm', MASTER, wrapIv);
  const encryptedKey = Buffer.concat([wrap.update(dataKey), wrap.final()]);
  keys.rows.set(keyId, {
    id: keyId, encryptedKey: encryptedKey.toString('base64'), iv: wrapIv.toString('base64'),
    authTag: wrap.getAuthTag().toString('base64'), algorithm: 'aes-256-gcm', purpose: 'conversation', conversationId: CONV,
  });
  const iv = crypto.randomBytes(12);
  const sealed = sealBytes({ key: dataKey, iv, plaintext: Buffer.from(JSON.stringify(entry().payload)), aad: deliveryQueueAad(CONV, MSG) });
  return {
    ...entry(),
    payload: {},
    sealedPayload: {
      ciphertext: sealed.ciphertext.toString('base64'), keyId, iv: iv.toString('base64'),
      authTag: sealed.authTag.toString('base64'), aad: DELIVERY_QUEUE_AAD_V1,
    },
  };
};

describe('le sceau v2 lie l’entrée à son destinataire, son événement et sa clé de dédup', () => {
  it('une entrée scellée porte la liaison v2', async () => {
    const { redis, queue } = world();
    await queue.enqueue('u-1', entry(), { sealAtRest: true });
    expect(redis.read('u-1')[0]?.sealedPayload?.aad).toBe('delivery-queue:v2');
    expect(JSON.stringify(redis.read('u-1'))).not.toContain('4471');
  });

  it('déplacée dans la file d’un autre membre, elle ne s’ouvre pas et n’est pas rejouée', async () => {
    const { redis, queue } = world();
    const original = entry();
    await queue.enqueue('u-1', original, { sealAtRest: true });
    redis.write('u-2', redis.read('u-1'));

    expect(await queue.drain('u-2')).toEqual([]);
    expect(redis.read('u-2')).toEqual([]);
    expect(await queue.drain('u-1')).toEqual([original]);
  });

  it.each([
    ['un autre eventType', (e: QueuedMessagePayload): QueuedMessagePayload => ({ ...e, eventType: 'edited' })],
    ['un eventType effacé (rejoué en new par défaut) d’une traduction', (e: QueuedMessagePayload): QueuedMessagePayload => ({ ...e, eventType: undefined })],
    ['une autre clé de dédup', (e: QueuedMessagePayload): QueuedMessagePayload => ({ ...e, dedupKey: `${MSG}:de` })],
  ])('relabellisée avec %s, elle ne s’ouvre pas', async (_label, relabel) => {
    const { redis, queue } = world();
    const original = entry({ eventType: 'translation', dedupKey: `${MSG}:en`, payload: { messageId: MSG, text: SECRET } });
    await queue.enqueue('u-1', original, { sealAtRest: true });
    redis.write('u-1', redis.read('u-1').map(relabel));

    expect(await queue.drain('u-1')).toEqual([]);
  });

  it('sans relabellisation, la traduction se rouvre à l’identique', async () => {
    const { queue } = world();
    const original = entry({ eventType: 'translation', dedupKey: `${MSG}:en`, payload: { messageId: MSG, text: SECRET } });
    await queue.enqueue('u-1', original, { sealAtRest: true });
    expect(await queue.drain('u-1')).toEqual([original]);
  });
});

describe('rétrocompatibilité : une entrée v1 déjà en file au déploiement se rouvre', () => {
  it('le drain rejoue l’événement d’avant', async () => {
    const { keys, redis, queue } = world();
    redis.write('u-1', [v1Entry(keys)]);

    const [replayed] = await queue.drain('u-1');

    expect(replayed?.payload).toEqual(entry().payload);
  });
});
