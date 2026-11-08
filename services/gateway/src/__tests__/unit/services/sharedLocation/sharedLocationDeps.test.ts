/**
 * LE MAGASIN STRICT du partage temporaire de position (#16980, contre-audit A de #16986) :
 * `CacheStore` se replie en mémoire locale quand Redis manque. Le partage, lui, ne s'y
 * range jamais : sans client Redis natif, démarrer, mettre à jour et arrêter rendent
 * `UNAVAILABLE`, et rien n'est rangé ni annoncé.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SHARED_LOCATION_ERROR_CODES } from '@meeshy/shared/types/shared-location';

const repli = new Map<string, string>();
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => null,
    get: async (key: string) => repli.get(key) ?? null,
    set: async (key: string, value: string) => {
      repli.set(key, value);
    },
    del: async (key: string) => {
      repli.delete(key);
    },
  }),
}));

import { endSharedLocationAfter, sharedLocationRelayDepsOf } from '../../../../services/sharedLocation/sharedLocationDeps';
import { startSharedLocation, stopSharedLocation, updateSharedLocation } from '../../../../services/sharedLocation/sharedLocationRelay';
import { messagingWorld } from '../../../helpers/messaging-circle-world';

const MOI = '6300000000000000000000a1';
const AMI = '6300000000000000000000a2';

describe('sans Redis, le partage est indisponible — jamais rangé dans la mémoire d\'une instance', () => {
  it('démarrer, mettre à jour et arrêter rendent UNAVAILABLE ; rien n\'est rangé, rien ne part', async () => {
    const world = messagingWorld({ users: [{ id: MOI }, { id: AMI }], links: [[MOI, AMI, 'FRIEND']] });
    const emissions: unknown[] = [];
    const deps = sharedLocationRelayDepsOf({
      prisma: world.prisma as unknown as PrismaClient,
      io: { to: () => ({ emit: (...args: unknown[]) => emissions.push(args) }) } as never,
    });
    const indisponible = { success: false, code: SHARED_LOCATION_ERROR_CODES.UNAVAILABLE };

    expect(await startSharedLocation(deps, MOI, { recipients: [{ userId: AMI }], durationMinutes: 60, position: { latitude: 48.85, longitude: 2.35 } })).toMatchObject(indisponible);
    expect(await updateSharedLocation(deps, MOI, { latitude: 48.86, longitude: 2.34 })).toMatchObject(indisponible);
    expect(await stopSharedLocation(deps, MOI)).toMatchObject(indisponible);
    expect(repli.size).toBe(0);
    expect(emissions).toEqual([]);
  });
});

describe('un compte qui part sans Redis (#16987)', () => {
  it('l\'extinction ne lève jamais : la panne est rapportée, une fois', async () => {
    const world = messagingWorld({ users: [{ id: MOI }], links: [] });
    const report = jest.fn();
    await expect(endSharedLocationAfter({ prisma: world.prisma as unknown as PrismaClient, io: undefined, report }, MOI, { forget: true })).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
  });
});
