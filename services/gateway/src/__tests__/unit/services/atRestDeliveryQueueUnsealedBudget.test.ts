/**
 * #19945 — ce que #19827 garde EN CLAIR faute de sceau se COMPTE et se BORNE.
 *
 * #19827 garde dans le tas une entrée qu'on n'a pas PU sceller, et une cause
 * inconnue y est transitoire par défaut : c'est juste pour UNE cause isolée.
 * Le cas qui fait mal est une cause SYSTÉMATIQUE — un `Error` nu levé à chaque
 * scellement — qui convertit le défaut « garder » en rétention GLOBALE de
 * clair, jusqu'à 50 000 charges pendant 48 h, avec un `logger.error` par
 * entrée pour seul signal. Ces témoins fixent les trois moitiés manquantes :
 * le compteur, le plafond en ENTRÉES et le plafond en OCTETS, chacun refusant
 * de garder (fail-closed) dès qu'il serait dépassé.
 */
import { describe, it, expect } from '@jest/globals';
import { Registry } from 'prom-client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import type { DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { ServerAtRestUnavailableError } from '../../../services/messaging/serverAtRest';
import { deliveryQueueSealMetrics } from '../../../services/metrics/deliveryQueueSealMetrics';

const CONV = '507f1f77bcf86cd799439011';

const entry = (index: number, content = `secret ${index}`): QueuedMessagePayload => ({
  messageId: `m-${index}`,
  dedupKey: `d-${index}`,
  conversationId: CONV,
  payload: { id: `m-${index}`, conversationId: CONV, content, encryptionMode: 'server' },
  enqueuedAt: new Date(Date.now() - 60_000).toISOString(),
  eventType: 'new',
});

const healthyRedis = (): CacheStore => {
  const client = {
    eval: async () => 1,
    lrange: async () => [],
    llen: async () => 0,
  };
  return { getNativeClient: () => client } as unknown as CacheStore;
};

/** Le bug SYSTÉMATIQUE de l'issue : un `Error` nu, que la classification lit transitoire. */
const bareErrorSealer: DeliveryQueueSealer = {
  seal: async () => { throw new Error('bug'); },
  open: async (sealed) => sealed,
};

const counted = async (registry: Registry, disposition: string): Promise<number> => {
  const metric = await registry.getSingleMetric('delivery_queue_unsealed_entries_total')?.get();
  return metric?.values.find((value) => value.labels.disposition === disposition)?.value ?? 0;
};

const queueWith = (unsealedBudget: { maxEntries: number; maxBytes: number }) => {
  const metrics = deliveryQueueSealMetrics({ registry: new Registry() });
  const queue = new RedisDeliveryQueue(healthyRedis(), bareErrorSealer, { metrics, unsealedBudget });
  return { queue, registry: metrics.registry };
};

describe('#19945 — le clair gardé faute de sceau se compte', () => {
  it('chaque entrée gardée incrémente `kept_in_memory`, sur le registre des mesures', async () => {
    const { queue, registry } = queueWith({ maxEntries: 100, maxBytes: 1_000_000 });

    await queue.enqueue('u-1', entry(1), { sealAtRest: true });
    await queue.enqueue('u-2', entry(2), { sealAtRest: true });

    expect(await counted(registry, 'kept_in_memory')).toBe(2);
    expect(await queue.size('u-1')).toBe(1);
  });

  it('un refus PERMANENT se compte aussi, sous `dropped_unsealable`', async () => {
    const metrics = deliveryQueueSealMetrics({ registry: new Registry() });
    const queue = new RedisDeliveryQueue(healthyRedis(), {
      seal: async () => { throw new ServerAtRestUnavailableError('missing'); },
      open: async (sealed) => sealed,
    }, { metrics });

    await queue.enqueue('u-1', entry(1), { sealAtRest: true });

    expect(await counted(metrics.registry, 'dropped_unsealable')).toBe(1);
    expect(await counted(metrics.registry, 'kept_in_memory')).toBe(0);
  });
});

describe('#19945 — au-delà du budget, on cesse de garder (fail-closed sur le volume)', () => {
  it('le plafond en ENTRÉES : la suivante est détruite sous `dropped_volume_cap`', async () => {
    const { queue, registry } = queueWith({ maxEntries: 3, maxBytes: 1_000_000 });

    for (let index = 0; index < 5; index++) {
      await queue.enqueue(`u-${index}`, entry(index), { sealAtRest: true });
    }

    expect(await counted(registry, 'kept_in_memory')).toBe(3);
    expect(await counted(registry, 'dropped_volume_cap')).toBe(2);
    expect(await queue.size('u-3')).toBe(0);
    expect(await queue.size('u-4')).toBe(0);
  });

  it('une entrée qui QUITTE le tas rend sa place au budget', async () => {
    const { queue, registry } = queueWith({ maxEntries: 1, maxBytes: 1_000_000 });

    await queue.enqueue('u-1', entry(1), { sealAtRest: true });
    expect(await queue.drain('u-1')).toHaveLength(1);
    await queue.enqueue('u-2', entry(2), { sealAtRest: true });

    expect(await counted(registry, 'kept_in_memory')).toBe(2);
    expect(await queue.size('u-2')).toBe(1);
  });

  it('le plafond en OCTETS : une charge qui le ferait dépasser n’est pas gardée', async () => {
    const { queue, registry } = queueWith({ maxEntries: 100, maxBytes: 2_000 });

    await queue.enqueue('u-1', entry(1, 'a'.repeat(1_200)), { sealAtRest: true });
    await queue.enqueue('u-2', entry(2, 'b'.repeat(1_200)), { sealAtRest: true });
    await queue.enqueue('u-3', entry(3, 'court'), { sealAtRest: true });

    expect(await counted(registry, 'kept_in_memory')).toBe(2);
    expect(await counted(registry, 'dropped_volume_cap')).toBe(1);
    expect(await queue.size('u-2')).toBe(0);
    expect(await queue.size('u-3')).toBe(1);
  });

  it('une entrée d’une conversation ORDINAIRE repliée dans le tas ne consomme pas le budget', async () => {
    const metrics = deliveryQueueSealMetrics({ registry: new Registry() });
    const redisDown = { getNativeClient: () => null } as unknown as CacheStore;
    const queue = new RedisDeliveryQueue(redisDown, bareErrorSealer, { metrics, unsealedBudget: { maxEntries: 1, maxBytes: 1_000_000 } });

    await queue.enqueue('u-0', entry(0));
    await queue.enqueue('u-1', entry(1), { sealAtRest: true });

    expect(await queue.size('u-0')).toBe(1);
    expect(await queue.size('u-1')).toBe(1);
    expect(await counted(metrics.registry, 'dropped_volume_cap')).toBe(0);
  });
});
