/**
 * #19946 — le tas de la file portait DEUX usages sous UN budget, et son
 * éviction globale était le seul chemin de plafond muet sur le volume.
 *
 * Avant #19827, le plafond de comptes du tas (1 000) n'était atteignable que
 * pendant une panne Redis. Depuis, un incident de la base des clés, Redis
 * sain, suffit à le franchir : l'arriéré de repli d'une panne et le clair
 * gardé faute de sceau partageaient la même carte, donc le même budget, et
 * se détruisaient mutuellement — les deux incidents dépendant de Mongo, leur
 * superposition est le cas probable. Et l'éviction du compte le plus ancien
 * journalisait QUI elle évinçait, jamais COMBIEN d'entrées elle détruisait,
 * alors que les quatre autres chemins de plafond le disent depuis #18733.
 *
 * Ces témoins fixent les trois moitiés du critère de fin :
 * 1. l'éviction globale passe par `noteBoundEviction` et dit combien ;
 * 2. chaque usage a son budget, et aucun n'évince l'autre ;
 * 3. un sixième chemin de destruction qui se tairait fait tomber la garde.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../../../utils/logger-enhanced', () => {
  const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { enhancedLogger: { child: () => sink, ...sink } };
});

import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import type { DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const ACCOUNTS_CAP = 1000;
const CONV = '507f1f77bcf86cd799439011';

type Sink = { debug: jest.Mock; warn: jest.Mock; error: jest.Mock };
const sink = enhancedLogger.child({ module: 'RedisDeliveryQueue' }) as unknown as Sink;

const evictionTraces = (): Record<string, unknown>[] =>
  sink.warn.mock.calls
    .map((call) => call[1] as Record<string, unknown> | undefined)
    .filter((context): context is Record<string, unknown> => !!context && typeof context.destroyed === 'number');

const entry = (id: string): QueuedMessagePayload => ({
  messageId: id,
  dedupKey: id,
  conversationId: CONV,
  payload: { id, conversationId: CONV, content: `contenu ${id}`, encryptionMode: 'server' },
  enqueuedAt: new Date(Date.now() - 60_000).toISOString(),
  eventType: 'new',
});

/** Redis joignable mais dont chaque commande lève : l'enfilage nominal se replie dans le tas. */
const failingRedis = (): CacheStore => {
  const fail = async () => { throw new Error('conn reset'); };
  const client = { eval: fail, llen: fail, lrange: fail, scan: fail };
  return { getNativeClient: () => client } as unknown as CacheStore;
};

/** Le scellement échoue pour une cause lue transitoire : l'entrée est gardée en clair dans le tas. */
const transientSealer: DeliveryQueueSealer = {
  seal: async () => { throw new Error('mongo down'); },
  open: async (sealed) => sealed,
};

const bothIncidents = () => new RedisDeliveryQueue(failingRedis(), transientSealer, {
  soleInstance: { isSoleInstance: () => true },
  unsealedBudget: { maxEntries: 100_000, maxBytes: 1024 * 1024 * 1024 },
});

const fillOutage = async (queue: RedisDeliveryQueue, prefix: string, count: number) => {
  for (let index = 0; index < count; index++) await queue.enqueue(`${prefix}-${index}`, entry(`${prefix}-m-${index}`));
};

const fillUnsealed = async (queue: RedisDeliveryQueue, prefix: string, count: number) => {
  for (let index = 0; index < count; index++) {
    await queue.enqueue(`${prefix}-${index}`, entry(`${prefix}-m-${index}`), { sealAtRest: true });
  }
};

beforeEach(() => {
  sink.debug.mockClear();
  sink.warn.mockClear();
  sink.error.mockClear();
});

describe("#19946 — l'éviction globale du tas dit COMBIEN elle détruit", () => {
  it('le 1001e compte évince le plus ancien et nomme ses entrées détruites', async () => {
    const queue = new RedisDeliveryQueue(failingRedis());
    await queue.enqueue('panne-0', entry('panne-0-a'));
    await queue.enqueue('panne-0', entry('panne-0-b'));
    await fillOutage(queue, 'panne-suite', ACCOUNTS_CAP - 1);
    sink.warn.mockClear();

    await queue.enqueue('nouveau', entry('nouveau-m'));

    expect(await queue.size('panne-0')).toBe(0);
    expect(evictionTraces()).toEqual([
      expect.objectContaining({
        scope: 'enqueue', slice: 'memory', heap: 'outage', bound: 'accounts',
        userId: 'panne-0', destroyed: 2, cap: ACCOUNTS_CAP,
      }),
    ]);
  });
});

describe('#19946 — le repli de panne et le clair gardé ont chacun leur budget', () => {
  it("un incident de clés qui remplit le tas n'évince pas l'arriéré d'une panne Redis", async () => {
    const queue = bothIncidents();
    await fillOutage(queue, 'panne', 1);
    await fillUnsealed(queue, 'cles', ACCOUNTS_CAP);

    expect(await queue.size('panne-0')).toBe(1);
    expect(evictionTraces()).toEqual([]);
  });

  it("et réciproquement : une panne Redis qui remplit le tas n'évince pas le clair gardé", async () => {
    const queue = bothIncidents();
    await fillUnsealed(queue, 'cles', 1);
    await fillOutage(queue, 'panne', ACCOUNTS_CAP);

    expect(await queue.size('cles-0')).toBe(1);
    expect(evictionTraces()).toEqual([]);
  });

  it("le budget de chaque usage reste borné : son propre 1001e compte évince le plus ancien de CET usage", async () => {
    const queue = bothIncidents();
    await fillOutage(queue, 'panne', 1);
    await fillUnsealed(queue, 'cles', ACCOUNTS_CAP + 1);

    expect(await queue.size('cles-0')).toBe(0);
    expect(await queue.size('panne-0')).toBe(1);
    expect(evictionTraces()).toEqual([
      expect.objectContaining({ heap: 'unsealed', bound: 'accounts', userId: 'cles-0', destroyed: 1 }),
    ]);
  });

  it('le drain rend les deux usages du même compte, et vide les deux', async () => {
    const queue = bothIncidents();
    await queue.enqueue('u', entry('panne-m'));
    await queue.enqueue('u', entry('cles-m'), { sealAtRest: true });

    expect(await queue.size('u')).toBe(2);
    const drained = await queue.drain('u');

    expect(drained.map((replayed) => replayed.messageId).sort()).toEqual(['cles-m', 'panne-m']);
    expect(await queue.size('u')).toBe(0);
  });

  it("Redis en panne au drain : un même `new` posé dans les deux usages ne se rejoue qu'une fois", async () => {
    const seals = { count: 0 };
    const flakySealer: DeliveryQueueSealer = {
      seal: async (queued) => {
        seals.count += 1;
        if (seals.count > 1) throw new Error('mongo down');
        return { ...queued, sealedPayload: 'scelle' } as QueuedMessagePayload;
      },
      open: async (sealed) => ({ ...sealed, sealedPayload: undefined }),
    };
    const queue = new RedisDeliveryQueue(failingRedis(), flakySealer, {
      soleInstance: { isSoleInstance: () => true },
      unsealedBudget: { maxEntries: 100, maxBytes: 1024 * 1024 },
    });
    await queue.enqueue('u', entry('double'), { sealAtRest: true });
    await queue.enqueue('u', { ...entry('double'), enqueuedAt: new Date().toISOString() }, { sealAtRest: true });

    const drained = await queue.drain('u');

    expect(drained.map((replayed) => replayed.messageId)).toEqual(['double']);
  });

  it('la purge par message et le balayage des échues traversent les deux usages', async () => {
    const queue = bothIncidents();
    await queue.enqueue('a', entry('brule'));
    await queue.enqueue('b', entry('brule'), { sealAtRest: true });
    const stale = { ...entry('vieux'), enqueuedAt: new Date(Date.now() - 49 * 3600 * 1000).toISOString() };
    await queue.enqueue('c', stale);
    await queue.enqueue('d', { ...stale, messageId: 'vieux-2', dedupKey: 'vieux-2' }, { sealAtRest: true });

    expect(await queue.purgeMessage('brule')).toBe(2);
    expect(await queue.cleanup()).toBe(2);
    expect(await queue.size('a') + await queue.size('b') + await queue.size('c') + await queue.size('d')).toBe(0);
  });
});

/**
 * La garde de SOURCE. Un chemin qui détruit au plafond s'écrit toujours avec
 * l'une de ces formes : le plafond Redis remis au script (enfilage, remise),
 * le plafond de comptes comparé à la carte, le dépassement d'un plafond par
 * compte (`length - N` à l'enfilage, `slice(-N)` à la remise). Il y en
 * a CINQ, et chacun a son `noteBoundEviction` : un sixième qui se tairait
 * romprait l'égalité.
 */
describe('#19946 — un chemin de destruction au plafond ne peut pas se taire', () => {
  const services = join(__dirname, '../../../services');
  const source = ['RedisDeliveryQueue.ts', 'deliveryQueueHeapSlice.ts']
    .map((file) => readFileSync(join(services, file), 'utf8'))
    .join('\n');
  const count = (pattern: RegExp) => (source.match(pattern) ?? []).length;

  it('autant de sites qui appliquent un plafond que de traces qui le nomment — cinq', () => {
    const destructionSites = count(/String\(DELIVERY_QUEUE_MAX_PER_USER\)/g)
      + count(/>=\s*HEAP_MAX_ACCOUNTS/g)
      + count(/\.length\s*-\s*HEAP_MAX_PER_ACCOUNT\b/g)
      + count(/\.slice\(-HEAP_MAX_PER_ACCOUNT\)/g);
    const named = count(/\bnote(?:BoundEviction)?\(\{/g);

    expect(destructionSites).toBe(5);
    expect(named).toBe(destructionSites);
  });
});
