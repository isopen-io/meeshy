/**
 * #12822, contre-audit E1 — la file de livraison hors ligne (Redis, 48 h,
 * `appendonly`) ne porte jamais le clair d'une conversation `server`/`hybrid`.
 *
 * `message:new` et `message:translation` y étaient rangés EN CLAIR : un disque
 * volé livrait le texte que MongoDB ne livrait plus. La charge d'une entrée de
 * ces conversations est désormais SCELLÉE par la passerelle (AES-256-GCM, clé de
 * la conversation, liée à son message), puis rouverte au rejeu : le client — y
 * compris un ancien — reçoit exactement l'événement d'avant. Une entrée qui ne
 * se scelle pas n'est pas enfilée ; une entrée qui ne se rouvre pas n'est pas
 * rejouée. Jamais de clair à la place.
 */
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { EncryptionService } from '../../../services/EncryptionService';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import { deliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { enqueueForOfflineParticipants } from '../../../socketio/offlineParticipantQueue';
import { deliverTextTranslation } from '../../../socketio/deliverTextTranslation';
import { syncConversationListOnNewMessage } from '../../../socketio/postMessageSyncFanOut';
import type { OfflineParticipantQueueParams } from '../../../socketio/offlineParticipantQueue';

const MASTER_A = Buffer.alloc(32, 3).toString('base64');
const MASTER_B = Buffer.alloc(32, 4).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439099';
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

const serviceUnder = (masterKey: string | undefined, prisma: PrismaClient): EncryptionService => {
  if (masterKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = masterKey;
  return new EncryptionService(prisma);
};

const fakeRedis = () => {
  const lists = new Map<string, string[]>();
  const client = {
    eval: async (script: string, _keys: number, key: string, ...args: string[]) => {
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

// Une heure avant l'exécution, jamais une date fixe : une entrée de plus de
// 48 h n'est plus remise en file, et le témoin vieillissait avec le calendrier.
const ENQUEUED_AT = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const entry = (overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload => ({
  messageId: MSG,
  conversationId: CONV,
  payload: { id: MSG, conversationId: CONV, content: SECRET, encryptionMode: 'server' },
  enqueuedAt: ENQUEUED_AT,
  eventType: 'new',
  ...overrides,
});

let store = keyStore();

beforeEach(() => {
  store = keyStore();
});

describe('la file hors ligne scelle la charge d’une conversation chiffrée au repos', () => {
  it('Redis ne reçoit aucun octet du clair, et le rejeu rend l’événement d’avant', async () => {
    const service = serviceUnder(MASTER_A, store.prisma);
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => service));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(redis.stored()).not.toContain(SECRET);
    expect(redis.stored()).not.toContain('4471');
    const drained = await queue.drain('u-1');
    expect(drained).toEqual([entry()]);
  });

  it('peek rouvre aussi : l’aperçu de file ne montre jamais une charge vide', async () => {
    const service = serviceUnder(MASTER_A, store.prisma);
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => service));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.peek('u-1')).toEqual([entry()]);
  });

  it('le repli mémoire est scellé de même', async () => {
    const service = serviceUnder(MASTER_A, store.prisma);
    const queue = new RedisDeliveryQueue({ getNativeClient: () => null } as unknown as CacheStore, deliveryQueueSealer(async () => service));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.drain('u-1')).toEqual([entry()]);
  });

  it('sans clé maîtresse, l’entrée n’est PAS enfilée — jamais en clair à la place', async () => {
    const service = serviceUnder(undefined, store.prisma);
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => service));

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(redis.stored()).toBe('');
    expect(await queue.size('u-1')).toBe(0);
  });

  it('une file construite sans sceau refuse une entrée à sceller', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore);

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(redis.stored()).toBe('');
  });

  it('une entrée qu’aucune clé ne rouvre n’est pas rejouée, et rien de clair ne sort', async () => {
    const redis = fakeRedis();
    const writer = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => serviceUnder(MASTER_A, store.prisma)));
    await writer.enqueue('u-1', entry(), { sealAtRest: true });

    const reader = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => serviceUnder(MASTER_B, store.prisma)));

    expect(await reader.drain('u-1')).toEqual([]);
    // #12822 (M3) — une clé maîtresse erronée peut n'être qu'un déploiement raté :
    // l'entrée reste en file, toujours scellée, pour la bonne clé.
    expect(redis.stored()).not.toBe('');
    expect(redis.stored()).not.toContain('4471');
    expect(await writer.drain('u-1')).toEqual([entry()]);
  });

  it('une entrée ordinaire reste telle quelle (rétrocompatibilité)', async () => {
    const redis = fakeRedis();
    const queue = new RedisDeliveryQueue(redis.cacheStore, deliveryQueueSealer(async () => serviceUnder(MASTER_A, store.prisma)));
    const plain = entry({ payload: { id: MSG, content: 'bonjour' } });

    await queue.enqueue('u-1', plain);

    expect(redis.stored()).toContain('bonjour');
    expect(await queue.drain('u-1')).toEqual([plain]);
  });
});

const binding = () => ({ conversationId: CONV, messageId: MSG, recipient: 'u-1', eventType: 'new' });

describe('le sceau de file est lié à SON message et à SA conversation', () => {
  it('une charge scellée ne se rouvre pas sous un autre message', async () => {
    const service = serviceUnder(MASTER_A, store.prisma);
    const sealed = await service.sealQueuedPayload({ plaintext: SECRET, ...binding() });

    await expect(service.openQueuedPayload(sealed, { ...binding(), messageId: 'aaaaaaaaaaaaaaaaaaaaaaaa' })).rejects.toThrow();
    await expect(service.openQueuedPayload(sealed, { ...binding(), conversationId: OTHER_CONV })).rejects.toThrow();
    await expect(service.openQueuedPayload(sealed, binding())).resolves.toBe(SECRET);
  });

  it('recopiée dans une ligne Message, elle ne parle pas comme un texte au repos', async () => {
    const service = serviceUnder(MASTER_A, store.prisma);
    const sealed = await service.sealQueuedPayload({ plaintext: SECRET, ...binding() });

    await expect(service.openAtRest({ ...sealed }, CONV)).rejects.toThrow();
  });
});

describe('l’unité de file hors ligne décide du sceau', () => {
  const offline = () => {
    const calls: unknown[][] = [];
    const deps = {
      deliveryQueue: { enqueue: jest.fn(async (...args: unknown[]) => { calls.push(args); }) },
      prisma: { participant: { findMany: jest.fn(async () => [{ id: 'p-1', userId: 'u-1' }]) } } as never,
      connectedUsers: new Set<string>(),
    };
    return { calls, deps };
  };

  it('l’appelant qui déclare atRest fait sceller', async () => {
    const { calls, deps } = offline();

    await enqueueForOfflineParticipants(deps, {
      conversationId: CONV, messageId: MSG, eventType: 'translation', payload: { messageId: MSG }, atRest: true,
    } as OfflineParticipantQueueParams);

    expect(calls[0]?.[2]).toEqual({ sealAtRest: true });
  });

  it('message:new d’une conversation hybrid se scelle sans que l’appelant le dise', async () => {
    const { calls, deps } = offline();

    await enqueueForOfflineParticipants(deps, {
      conversationId: CONV, messageId: MSG, eventType: 'new', payload: { id: MSG, encryptionMode: 'hybrid' },
    } as OfflineParticipantQueueParams);

    expect(calls[0]?.[2]).toEqual({ sealAtRest: true });
  });

  // L'enveloppe que `routes/links/messages.ts` (`buildLinkMessagePayload`) émet
  // vraiment : elle ne porte AUCUN `encryptionMode`. Le témoin précédent lui en
  // prêtait un, et restait vert pendant que la route rangeait le clair (#12822, H2).
  const linkEnvelope = () => ({
    message: {
      id: MSG, conversationId: CONV, senderId: 'p-anon', content: SECRET, originalLanguage: 'fr',
      messageType: 'text', isEdited: false, editedAt: null, deletedAt: null, replyToId: null,
      createdAt: new Date('2026-10-24T10:00:00Z'), updatedAt: new Date('2026-10-24T10:00:00Z'),
      sender: { id: 'p-anon', userId: null, displayName: 'anon', type: 'anonymous' }, validatedMentions: [],
    },
  });

  it.each([
    [true, [{ sealAtRest: true }]],
    [false, []],
  ])('message de lien (enveloppe réelle, sans mode), atRest %s : seule la déclaration de l’appelant décide', async (atRest, sealOption) => {
    const { calls, deps } = offline();

    await enqueueForOfflineParticipants(deps, {
      conversationId: CONV, messageId: MSG, eventType: 'link-message', payload: linkEnvelope(), atRest,
    } as OfflineParticipantQueueParams);

    expect(calls[0]?.slice(2)).toEqual(sealOption);
  });

  it.each([
    ['non chiffré', { id: MSG }],
    ['bout en bout (déjà chiffré par le client)', { id: MSG, encryptionMode: 'e2ee' }],
  ])('un message %s s’enfile comme avant', async (_label, payload) => {
    const { calls, deps } = offline();

    await enqueueForOfflineParticipants(deps, {
      conversationId: CONV, messageId: MSG, eventType: 'new', payload,
    } as OfflineParticipantQueueParams);

    expect(calls[0]).toHaveLength(2);
  });
});

describe('les deux sites qui enfilent du texte déclarent le régime', () => {
  it('la traduction d’un message server part scellée vers les absents', async () => {
    const enfile: OfflineParticipantQueueParams[] = [];
    const prisma = {
      message: { findUnique: jest.fn(async () => ({ conversationId: CONV, senderId: 'p-1', createdAt: new Date(), encryptionMode: 'server' })) },
      participant: { findMany: jest.fn(async () => []) },
      conversationShareLink: { findMany: jest.fn(async () => []) },
      conversation: { findUnique: jest.fn(async () => null) },
    };

    await deliverTextTranslation(
      {
        prisma: prisma as never,
        io: { to: () => ({ emit: () => undefined }), sockets: { adapter: { rooms: new Map() } } } as never,
        normalizeConversationId: async (id) => id,
        enqueueForOfflineParticipants: async (params) => { enfile.push(params); },
        stats: { translations_sent: 0, errors: 0 },
      },
      { taskId: 't-1', targetLanguage: 'en', result: { messageId: MSG, translatedText: 'The safe code is 4471', sourceLanguage: 'fr' } },
    );

    expect(enfile).toHaveLength(1);
    expect(enfile[0]?.atRest).toBe(true);
  });

  it('message:new (REST) d’une conversation server part scellé, même si la charge ne dit pas son mode', async () => {
    const calls: unknown[][] = [];
    const prisma = {
      participant: { findMany: jest.fn(async () => [{ id: 'p-2', userId: 'u-2', user: null, language: 'fr', joinedAt: new Date() }]) },
    };

    await syncConversationListOnNewMessage(
      {
        prisma: prisma as never,
        io: { to: () => ({ emit: () => undefined }) } as never,
        readStatusService: {} as never,
        deliveryQueue: { enqueue: async (...args: unknown[]) => { calls.push(args); } },
        connectedUsers: new Set<string>(),
      },
      {
        normalizedId: CONV,
        message: { id: MSG, conversationId: CONV, senderId: 'p-1', content: SECRET, encryptionMode: 'server', createdAt: new Date() } as never,
        broadcastPayload: { id: MSG, conversationId: CONV, content: SECRET } as never,
        resolvedSenderId: 'u-1',
      },
    ).catch(() => undefined);

    expect(calls[0]?.[2]).toEqual({ sealAtRest: true });
  });
});
