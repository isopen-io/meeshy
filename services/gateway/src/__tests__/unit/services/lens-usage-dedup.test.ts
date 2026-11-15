/**
 * #11327 (S26), B3 — LE DÉDOUBLONNAGE DE L'USAGE D'UNE LENS EST FAIL-CLOSED RÉEL.
 *
 * `RedisCacheStore` retombe en SILENCE sur une `Map` mémoire par processus
 * quand Redis est absent ou injoignable : le dédoublonnage du jour y devient
 * local à chaque instance, et une seule personne compte pour autant
 * d'appareils que la passerelle a de processus — le seuil k (20) se franchit
 * avec une poignée de comptes. Le dédoublonnage de l'usage ne passe donc
 * JAMAIS par ce repli : sans Redis prêt, il lève, et l'usage n'est pas compté.
 *
 * Témoins sur le VRAI `RedisCacheStore`, sans Redis (aucune URL) et avec une
 * URL injoignable (le client existe, la connexion n'est pas prête).
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { RedisCacheStore } from '../../../services/CacheStore';
import { LensPartners } from '../../../services/packs/LensPartners';
import { lensUsageDedupFrom } from '../../../services/packs/lensUsageDedup';

const BOB = '68b0000000000000000000b2';
const LENS_ID = '68d000000000000000000001';

const stores: RedisCacheStore[] = [];
const storeWithoutRedis = (url?: string) => {
  const saved = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  const store = new RedisCacheStore(url);
  if (saved !== undefined) process.env.REDIS_URL = saved;
  stores.push(store);
  return store;
};

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

function usageWorld(dedup: ConstructorParameters<typeof LensPartners>[0]['dedup']) {
  const upserts: unknown[] = [];
  const prisma = {
    partnerProfile: {},
    adminAuditLog: {},
    lensPack: { findUnique: async () => ({ id: LENS_ID, status: 'approved' }) },
    userStickerPack: { findFirst: async () => ({ id: 'c1' }) },
    lensUsageDaily: {
      upsert: async (args: unknown) => {
        upserts.push(args);
        return args;
      },
    },
  };
  const partners = new LensPartners({ prisma: prisma as never, dedup, now: () => new Date('2026-11-01T12:00:00Z') });
  return { partners, upserts };
}

describe('B3 — le dédoublonnage de l’usage ne retombe jamais sur la mémoire du processus', () => {
  it('le repli mémoire du CacheStore dédoublonne PAR PROCESSUS : deux instances comptent la même personne deux fois (le défaut démontré)', async () => {
    const first = usageWorld(storeWithoutRedis());
    const second = usageWorld(storeWithoutRedis());

    await first.partners.recordUsage(BOB, 'aurore', 'camera');
    await second.partners.recordUsage(BOB, 'aurore', 'camera');

    const devices = [...first.upserts, ...second.upserts].filter((args) => (args as { create: { devices: number } }).create.devices === 1);
    expect(devices).toHaveLength(2);
  });

  it('sans Redis, le dédoublonnage strict LÈVE au lieu de répondre depuis la mémoire', async () => {
    const dedup = lensUsageDedupFrom(storeWithoutRedis());
    await expect(dedup.setnx('k', 'v', 60)).rejects.toThrow();
    await expect(dedup.get('k')).rejects.toThrow();
  });

  it('sans Redis : `counted: false`, et AUCUNE ligne d’usage écrite', async () => {
    const world = usageWorld(lensUsageDedupFrom(storeWithoutRedis()));

    expect(await world.partners.recordUsage(BOB, 'aurore', 'camera')).toEqual({ kind: 'recorded', counted: false });
    expect(world.upserts).toEqual([]);
  });

  it('Redis configuré mais injoignable (connexion pas prête) : rien n’est compté non plus', async () => {
    const world = usageWorld(lensUsageDedupFrom(storeWithoutRedis('redis://127.0.0.1:1')));

    expect(await world.partners.recordUsage(BOB, 'aurore', 'camera')).toEqual({ kind: 'recorded', counted: false });
    expect(world.upserts).toEqual([]);
  });
});
