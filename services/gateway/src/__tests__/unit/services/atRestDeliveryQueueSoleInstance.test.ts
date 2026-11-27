/**
 * #19947 — garder une entrée dans le TAS suppose UN processus, et cela se VÉRIFIE.
 *
 * #19827 garde en mémoire, EN CLAIR, l'entrée d'une conversation chiffrée au
 * repos qu'on n'a pas PU sceller. Sa promesse — « l'entrée survit et se
 * rejoue » — suppose que la reconnexion du destinataire tombe sur le processus
 * qui la tient. Avec deux répliques (la cible « passerelle sans état », #9232),
 * elle peut tomber sur l'AUTRE : non livrée, et le clair retenu 48 h quand
 * même. Ces témoins fixent la réponse : on ne garde que si l'instance unique
 * est ATTESTÉE, et un recensement Redis par battement en est le témoin.
 */
import { describe, it, expect } from '@jest/globals';
import { Registry } from 'prom-client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';
import type { CacheStore } from '../../../services/CacheStore';
import type { DeliveryQueueSealer } from '../../../services/deliveryQueueSealing';
import { deliveryQueueSealMetrics } from '../../../services/metrics/deliveryQueueSealMetrics';
import {
  GatewayInstanceCensus,
  declaredGatewayInstances,
  type InstanceCensusClient,
  type SoleInstanceWitness,
} from '../../../services/gatewayInstanceCensus';

const CONV = '507f1f77bcf86cd799439011';

const entry = (): QueuedMessagePayload => ({
  messageId: 'm-1',
  conversationId: CONV,
  payload: { id: 'm-1', conversationId: CONV, content: 'Le code du coffre est 4471', encryptionMode: 'server' },
  enqueuedAt: new Date(Date.now() - 60_000).toISOString(),
  eventType: 'new',
});

const healthyRedis = (): CacheStore => {
  const client = { eval: async () => 1, lrange: async () => [], llen: async () => 0 };
  return { getNativeClient: () => client } as unknown as CacheStore;
};

const transientSealer: DeliveryQueueSealer = {
  seal: async () => { throw new Error('etimedout'); },
  open: async (sealed) => sealed,
};

const counted = async (registry: Registry, disposition: string): Promise<number> => {
  const metric = await registry.getSingleMetric('delivery_queue_unsealed_entries_total')?.get();
  return metric?.values.find((value) => value.labels.disposition === disposition)?.value ?? 0;
};

const queueWith = (soleInstance?: SoleInstanceWitness) => {
  const metrics = deliveryQueueSealMetrics({ registry: new Registry() });
  const queue = new RedisDeliveryQueue(healthyRedis(), transientSealer, soleInstance ? { metrics, soleInstance } : { metrics });
  return { queue, registry: metrics.registry };
};

describe('#19947 — on ne garde en clair dans le tas que sous une instance unique ATTESTÉE', () => {
  it('instance unique attestée : l’entrée est gardée, comme #19827 le promet', async () => {
    const { queue, registry } = queueWith({ isSoleInstance: () => true });

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(1);
    expect(await counted(registry, 'kept_in_memory')).toBe(1);
  });

  it('plusieurs instances servent : l’entrée n’est PAS gardée, et le refus se compte', async () => {
    const { queue, registry } = queueWith({ isSoleInstance: () => false });

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
    expect(await counted(registry, 'dropped_multi_instance')).toBe(1);
    expect(await counted(registry, 'kept_in_memory')).toBe(0);
  });

  it('aucun témoin câblé : l’instance unique n’est pas SUPPOSÉE (fail-closed)', async () => {
    const { queue, registry } = queueWith();

    await queue.enqueue('u-1', entry(), { sealAtRest: true });

    expect(await queue.size('u-1')).toBe(0);
    expect(await counted(registry, 'dropped_multi_instance')).toBe(1);
  });

  it('une conversation ORDINAIRE n’interroge pas le témoin : son repli mémoire ne change pas', async () => {
    const redisDown = { getNativeClient: () => null } as unknown as CacheStore;
    const queue = new RedisDeliveryQueue(redisDown, transientSealer, { soleInstance: { isSoleInstance: () => false } });

    await queue.enqueue('u-1', entry());

    expect(await queue.size('u-1')).toBe(1);
  });
});

/**
 * Un Redis partagé par plusieurs instances, qui honore `PX` sur une horloge
 * commune, pagine `SCAN` comme le vrai (COUNT clés de l'espace par appel) et
 * compte les commandes reçues.
 */
const sharedRedis = (clock: { now: number }, unrelatedKeys = 0) => {
  const keys = new Map<string, number>(
    Array.from({ length: unrelatedKeys }, (_, index) => [`cache:${index}`, Number.POSITIVE_INFINITY] as const),
  );
  const sets = new Map<string, Set<string>>();
  const commands = { count: 0 };
  const alive = (key: string) => (keys.get(key) ?? Number.NEGATIVE_INFINITY) > clock.now;
  const sent = () => { commands.count += 1; };
  const client = {
    set: async (key: string, _value: string, _mode: 'PX', ttlMs: number) => { sent(); keys.set(key, clock.now + ttlMs); return 'OK'; },
    scan: async (cursor: string, _match: 'MATCH', pattern: string, _count: 'COUNT', size: number): Promise<[string, string[]]> => {
      sent();
      const all = [...keys.keys()];
      const start = Number(cursor);
      const page = all.slice(start, start + size).filter((key) => alive(key) && key.startsWith(pattern.replace('*', '')));
      const next = start + size >= all.length ? '0' : String(start + size);
      return [next, page];
    },
    mget: async (...names: string[]) => { sent(); return names.map((name) => (alive(name) ? 'x' : null)); },
    sadd: async (key: string, ...members: string[]) => { sent(); sets.set(key, new Set([...(sets.get(key) ?? []), ...members])); return members.length; },
    smembers: async (key: string) => { sent(); return [...(sets.get(key) ?? [])]; },
    srem: async (key: string, ...members: string[]) => {
      sent();
      sets.set(key, new Set([...(sets.get(key) ?? [])].filter((member) => !members.includes(member))));
      return members.length;
    },
    del: async (key: string) => { sent(); keys.delete(key); return 1; },
  };
  return Object.assign(client as InstanceCensusClient, { commands });
};

const census = (client: InstanceCensusClient | null, clock: { now: number }, instanceId: string, declaredInstances: number | null = null) =>
  new GatewayInstanceCensus({ client: () => client, instanceId, declaredInstances, ttlMs: 30_000, now: () => clock.now });

describe('#19947 — le recensement des instances : la condition « processus unique » est VÉRIFIÉE', () => {
  it('une instance qui bat seule est l’instance unique', async () => {
    const clock = { now: 1_000 };
    const alone = census(sharedRedis(clock), clock, 'a');

    await alone.beat();

    expect(alone.isSoleInstance()).toBe(true);
  });

  it('avant tout battement, rien n’est attesté', () => {
    const clock = { now: 1_000 };

    expect(census(sharedRedis(clock), clock, 'a').isSoleInstance()).toBe(false);
  });

  it('deux instances sur le même Redis : aucune ne se croit seule', async () => {
    const clock = { now: 1_000 };
    const redis = sharedRedis(clock);
    const first = census(redis, clock, 'a');
    const second = census(redis, clock, 'b');

    await first.beat();
    await second.beat();
    await first.beat();

    expect(first.isSoleInstance()).toBe(false);
    expect(second.isSoleInstance()).toBe(false);
  });

  it('une instance arrêtée cesse de compter : la survivante redevient unique au battement suivant', async () => {
    const clock = { now: 1_000 };
    const redis = sharedRedis(clock);
    const first = census(redis, clock, 'a');
    const second = census(redis, clock, 'b');
    await first.beat();
    await second.beat();

    await second.stop();
    await first.beat();

    expect(first.isSoleInstance()).toBe(true);
  });

  it('un recensement PÉRIMÉ n’atteste plus rien', async () => {
    const clock = { now: 1_000 };
    const alone = census(sharedRedis(clock), clock, 'a');
    await alone.beat();

    clock.now += 30_001;

    expect(alone.isSoleInstance()).toBe(false);
  });

  it('Redis absent : le recensement est INCONNU, donc rien n’est attesté', async () => {
    const clock = { now: 1_000 };
    const blind = census(null, clock, 'a');

    await blind.beat();

    expect(blind.isSoleInstance()).toBe(false);
  });

  it('un battement qui échoue efface l’attestation précédente', async () => {
    const clock = { now: 1_000 };
    const redis = sharedRedis(clock);
    const flaky = census(redis, clock, 'a');
    await flaky.beat();
    const failing: InstanceCensusClient = { ...redis, smembers: async () => { throw new Error('ECONNRESET'); } };
    const sameInstance = new GatewayInstanceCensus({ client: () => failing, instanceId: 'a', ttlMs: 30_000, now: () => clock.now });

    await sameInstance.beat();

    expect(sameInstance.isSoleInstance()).toBe(false);
  });

  it('un battement coûte autant de commandes quel que soit l’espace de clés : il ne parcourt pas tout Redis', async () => {
    const clock = { now: 1_000 };
    const crowded = sharedRedis(clock, 50_000);
    const alone = census(crowded, clock, 'a');
    await alone.beat();
    const before = crowded.commands.count;

    await alone.beat();

    expect(alone.isSoleInstance()).toBe(true);
    expect(crowded.commands.count - before).toBeLessThanOrEqual(5);
  });

  it('une instance arrêtée sans `stop()` cesse de compter quand sa clé expire', async () => {
    const clock = { now: 1_000 };
    const redis = sharedRedis(clock);
    const first = census(redis, clock, 'a');
    const crashed = census(redis, clock, 'b');
    await crashed.beat();
    await first.beat();
    expect(first.isSoleInstance()).toBe(false);

    clock.now += 30_001;
    await first.beat();

    expect(first.isSoleInstance()).toBe(true);
  });

  it('un déploiement qui DÉCLARE plusieurs répliques n’est jamais unique, même seul à battre', async () => {
    const clock = { now: 1_000 };
    const declared = census(sharedRedis(clock), clock, 'a', 2);

    await declared.beat();

    expect(declared.isSoleInstance()).toBe(false);
  });
});

describe('#19947 — la déclaration de répliques se lit dans GATEWAY_INSTANCES', () => {
  it('absente ou illisible : rien n’est déclaré', () => {
    expect(declaredGatewayInstances({})).toBeNull();
    expect(declaredGatewayInstances({ GATEWAY_INSTANCES: 'deux' })).toBeNull();
  });

  it('un entier positif est la déclaration', () => {
    expect(declaredGatewayInstances({ GATEWAY_INSTANCES: '3' })).toBe(3);
    expect(declaredGatewayInstances({ GATEWAY_INSTANCES: '1' })).toBe(1);
  });
});
