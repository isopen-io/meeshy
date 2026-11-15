/**
 * #18733 — le plafond de la file de remise ÉVINCE sans aucune trace.
 *
 * `DELIVERY_QUEUE_MAX_PER_USER` (500) et `MEMORY_QUEUE_MAX_PER_USER` (50)
 * bornent la file hors ligne par destinataire : au-delà, les arrivées les plus
 * anciennes sont DÉTRUITES, et leur rejeu n'aura jamais lieu. Trois issues
 * nomment ce plafond comme la cause d'un défaut VISIBLE par l'utilisateur
 * (#18614, #18701, #18707), chacune en insistant sur le fait qu'il n'exige
 * aucune panne — et aucune n'a pu dire à quelle fréquence il est franchi,
 * parce qu'aucun des chemins ne le DISAIT. Tout le reste du chemin d'enfilage
 * est journalisé : dédoublonnage, supplantation, repli mémoire, map pleine,
 * entrée informe. L'éviction au plafond, qui vit sur le chemin de PRODUCTION
 * et détruit du rejeu, était la seule muette.
 *
 * Les deux moitiés que ces témoins gardent, et elles ne se valent pas :
 *
 * 1. **l'éviction se NOMME** — le destinataire et le nombre d'entrées
 *    détruites, sur les QUATRE chemins qui en détruisent (enfilage Redis,
 *    enfilage mémoire, remise Redis, remise mémoire) ;
 * 2. **en deçà du plafond, RIEN ne part** — le chemin nominal est le plus
 *    chaud du produit, et une trace par enfilage serait pire que le silence
 *    qu'on vient de retirer.
 *
 * Et une troisième, qui est la raison pour laquelle l'arithmétique vit en
 * TypeScript et non en Lua : **une forme de retour qui ne porte pas la
 * longueur ne PROUVE aucune éviction.** Aucun double Lua n'existe dans ce
 * dépôt (cf. le § du témoin de capacité de `RedisDeliveryQueue.test.ts`), donc
 * tous les doubles rendent l'entier nu d'avant ce lot ; un lecteur qui en
 * déduirait une éviction annoncerait une perte imaginaire.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => {
  const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { enhancedLogger: { child: () => sink, ...sink } };
});

import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import { destroyedAtBound, readBoundedPushReply } from '../../../services/deliveryQueueBound';
import type { CacheStore } from '../../../services/CacheStore';
import type { DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import type { QueuedMessagePayload, SealedQueuedPayload } from '@meeshy/shared/types/delivery-queue';
import { DELIVERY_QUEUE_MAX_PER_USER } from '@meeshy/shared/types/delivery-queue';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const MEMORY_CAP = 50;

type Sink = { debug: jest.Mock; warn: jest.Mock; error: jest.Mock };
const sink = enhancedLogger.child({ module: 'RedisDeliveryQueue' }) as unknown as Sink;

/** La trace d'éviction, et elle seule : les autres `warn` du module ne la concernent pas. */
const evictionTraces = (): Record<string, unknown>[] =>
  sink.warn.mock.calls
    .map((call) => call[1] as Record<string, unknown> | undefined)
    .filter((context): context is Record<string, unknown> => !!context && typeof context.destroyed === 'number');

function makePayload(overrides: Partial<QueuedMessagePayload> = {}): QueuedMessagePayload {
  return {
    messageId: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439022',
    payload: { content: 'hello', senderId: 'user-a' },
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCacheStore(redis: unknown = null): CacheStore {
  return {
    getNativeClient: jest.fn().mockReturnValue(redis),
    get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn(),
    setnx: jest.fn(), expire: jest.fn(), publish: jest.fn(),
  } as unknown as CacheStore;
}

/** Un double Redis dont le `eval` répond PAR SCRIPT : drain, enfilage, remise. */
function makeRedis(answers: { enqueue?: unknown; drain?: unknown; restore?: unknown }) {
  const scripts: string[] = [];
  const evalFn = jest.fn(async (...args: unknown[]) => {
    const script = String(args[0]);
    scripts.push(script);
    if (script.includes('LPUSH')) return answers.restore ?? 0;
    if (script.includes('RPUSH')) return answers.enqueue ?? 1;
    return answers.drain ?? [];
  });
  return {
    scripts,
    redis: {
      eval: evalFn,
      rpush: jest.fn(), expire: jest.fn(), lrange: jest.fn().mockResolvedValue([]),
      del: jest.fn(), llen: jest.fn().mockResolvedValue(0), scan: jest.fn().mockResolvedValue(['0', []]),
      pipeline: jest.fn(),
    },
  };
}

/** Un sceau dont l'ouverture échoue POUR UNE RAISON PASSAGÈRE : le drain remet en file. */
const transientSealer: DeliveryQueueSealer = {
  seal: async (entry) => ({ ...entry, payload: {}, sealedPayload: { v: 'delivery-queue:v2' } as unknown as SealedQueuedPayload }),
  open: async () => { throw new Error('mongo down'); },
};

beforeEach(() => {
  sink.debug.mockClear();
  sink.warn.mockClear();
  sink.error.mockClear();
});

describe("L'éviction au plafond de la file de remise se NOMME (#18733)", () => {
  test('enfilage MÉMOIRE — la 51e arrivée dit QUI perd, et COMBIEN', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));

    for (let i = 0; i <= MEMORY_CAP; i++) {
      await queue.enqueue('user-plein', makePayload({
        messageId: `msg-${i}`,
        enqueuedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      }));
    }

    expect(evictionTraces()).toEqual([
      expect.objectContaining({ userId: 'user-plein', destroyed: 1, cap: MEMORY_CAP, slice: 'memory', scope: 'enqueue' }),
    ]);
  });

  test('enfilage MÉMOIRE — en deçà du plafond, RIEN ne part', async () => {
    const queue = new RedisDeliveryQueue(makeCacheStore(null));

    for (let i = 0; i < MEMORY_CAP; i++) {
      await queue.enqueue('user-calme', makePayload({ messageId: `msg-${i}` }));
    }

    expect(evictionTraces()).toEqual([]);
    expect(sink.warn).not.toHaveBeenCalled();
  });

  test('enfilage REDIS — la longueur rendue par la poussée nomme ce que le LTRIM a détruit', async () => {
    const { redis } = makeRedis({ enqueue: [1, DELIVERY_QUEUE_MAX_PER_USER + 3] });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-redis', makePayload());

    expect(evictionTraces()).toEqual([
      expect.objectContaining({ userId: 'user-redis', destroyed: 3, cap: DELIVERY_QUEUE_MAX_PER_USER, slice: 'redis', scope: 'enqueue' }),
    ]);
  });

  test('enfilage REDIS — une file PILE au plafond ne détruit rien, et ne dit rien', async () => {
    const { redis } = makeRedis({ enqueue: [1, DELIVERY_QUEUE_MAX_PER_USER] });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-redis', makePayload());

    expect(evictionTraces()).toEqual([]);
    expect(sink.warn).not.toHaveBeenCalled();
  });

  /**
   * Le code de retour garde son sens — `1` veut dire « poussée », quelle que
   * soit l'éviction. C'est tout l'argument du SECOND élément plutôt que d'une
   * quatrième valeur : les deux autres issues du script continuent de se
   * journaliser comme avant.
   */
  test('enfilage REDIS — dédoublonnage et supplantation gardent leur trace, et n\'évincent rien', async () => {
    const dedup = makeRedis({ enqueue: [0, 0] });
    await new RedisDeliveryQueue(makeCacheStore(dedup.redis)).enqueue('user-dedup', makePayload());
    expect(sink.debug).toHaveBeenCalledWith(expect.stringContaining('dedup'), expect.objectContaining({ userId: 'user-dedup' }));

    sink.debug.mockClear();
    const supersede = makeRedis({ enqueue: [2, 0] });
    await new RedisDeliveryQueue(makeCacheStore(supersede.redis)).enqueue('user-sup', makePayload({ eventType: 'edited' }));
    expect(sink.debug).toHaveBeenCalledWith(expect.stringContaining('supersede'), expect.objectContaining({ userId: 'user-sup' }));

    expect(evictionTraces()).toEqual([]);
  });

  /**
   * La forme d'AVANT ce lot — un entier nu. Tous les doubles du dépôt la
   * rendent, et une éviction ne s'ANNONCE jamais sur une longueur qu'on n'a
   * pas observée : `0` dit « je n'ai pas mesuré », jamais « la file est vide ».
   */
  test('enfilage REDIS — un entier NU ne prouve aucune éviction', async () => {
    const { redis } = makeRedis({ enqueue: 1 });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis));

    await queue.enqueue('user-entier', makePayload());

    expect(evictionTraces()).toEqual([]);
    expect(sink.warn).not.toHaveBeenCalled();
  });

  /**
   * La JUMELLE, trouvée en posant la question au moment du correctif : le
   * plafond de l'enfilage n'est pas le seul `LTRIM` du fichier. La REMISE
   * (#12822, M3) borne de la même façon les entrées scellées qu'un drain n'a
   * pas pu rouvrir — une destruction de rejeu identique, dans le même silence.
   * Et son `LPUSH` rend déjà la longueur : la mesure n'y coûte rien non plus.
   */
  test('remise REDIS — le plafond de la remise nomme ce qu\'il détruit', async () => {
    const sealed = Array.from({ length: 4 }, (_, i) => JSON.stringify({
      messageId: `507f1f77bcf86cd79943901${i}`,
      conversationId: '507f1f77bcf86cd799439022',
      payload: {},
      sealedPayload: { v: 'delivery-queue:v2' },
      enqueuedAt: new Date().toISOString(),
    }));
    const { redis } = makeRedis({ drain: sealed, restore: [4, DELIVERY_QUEUE_MAX_PER_USER + 2] });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis), transientSealer);

    await queue.drain('user-remise');

    expect(evictionTraces()).toEqual([
      expect.objectContaining({ userId: 'user-remise', destroyed: 2, cap: DELIVERY_QUEUE_MAX_PER_USER, slice: 'redis', scope: 'restore' }),
    ]);
  });

  test('les deux scripts rendent la longueur de leur poussée À CÔTÉ de leur code', async () => {
    const { redis, scripts } = makeRedis({
      drain: [JSON.stringify({ messageId: '507f1f77bcf86cd799439011', conversationId: '507f1f77bcf86cd799439022', payload: {}, sealedPayload: { v: 'delivery-queue:v2' }, enqueuedAt: new Date().toISOString() })],
      restore: [1, 1],
    });
    const queue = new RedisDeliveryQueue(makeCacheStore(redis), transientSealer);

    await queue.enqueue('user-script', makePayload());
    await queue.drain('user-script');

    const enqueueScript = scripts.find((script) => script.includes('RPUSH') && script.includes('LTRIM'));
    const restoreScript = scripts.find((script) => script.includes('LPUSH'));

    // La longueur est celle que la poussée REND — aucune commande de plus sur
    // le chemin le plus chaud du produit.
    expect(enqueueScript).toMatch(/local\s+len\s*=\s*redis\.call\('RPUSH'/);
    expect(enqueueScript).toMatch(/return\s*\{\s*1\s*,\s*len\s*\}/);
    expect(restoreScript).toMatch(/len\s*=\s*redis\.call\('LPUSH'/);
    expect(restoreScript).toMatch(/return\s*\{\s*restored\s*,\s*len\s*\}/);
  });
});

describe("L'arithmétique du plafond vit en TypeScript, où un témoin l'exerce (#18733)", () => {
  test('destroyedAtBound — ne compte que ce qui DÉPASSE', () => {
    expect(destroyedAtBound(503, 500)).toBe(3);
    expect(destroyedAtBound(500, 500)).toBe(0);
    expect(destroyedAtBound(0, 500)).toBe(0);
  });

  test('destroyedAtBound — une longueur illisible ne fabrique aucune perte', () => {
    expect(destroyedAtBound(Number.NaN, 500)).toBe(0);
    expect(destroyedAtBound(Number.POSITIVE_INFINITY, 500)).toBe(0);
    expect(destroyedAtBound(-1, 500)).toBe(0);
  });

  test('readBoundedPushReply — le couple (code, longueur) se lit, et le code garde son sens', () => {
    expect(readBoundedPushReply([1, 501])).toEqual({ outcome: 1, lengthAfterPush: 501 });
    expect(readBoundedPushReply([0, 0])).toEqual({ outcome: 0, lengthAfterPush: 0 });
    expect(readBoundedPushReply([2, 0])).toEqual({ outcome: 2, lengthAfterPush: 0 });
  });

  test('readBoundedPushReply — toute forme qui ne PORTE pas la longueur rend 0', () => {
    expect(readBoundedPushReply(1)).toEqual({ outcome: 1, lengthAfterPush: 0 });
    expect(readBoundedPushReply([1])).toEqual({ outcome: 1, lengthAfterPush: 0 });
    expect(readBoundedPushReply([1, 'beaucoup'])).toEqual({ outcome: 1, lengthAfterPush: 0 });
    expect(readBoundedPushReply(null).lengthAfterPush).toBe(0);
  });

  /**
   * Un `outcome` illisible ne se lit NI comme un dédoublonnage NI comme une
   * supplantation : l'enfilage le tient pour une poussée, exactement comme
   * l'entier nu d'avant ce lot. C'est le repli qui perd le moins — une trace
   * de debug manquante, jamais une entrée réputée en file qui ne l'est pas.
   */
  test('readBoundedPushReply — un code illisible ne se confond avec aucune des deux autres issues', () => {
    const reply = readBoundedPushReply('poussée');
    expect(reply.outcome === 0).toBe(false);
    expect(reply.outcome === 2).toBe(false);
  });
});
