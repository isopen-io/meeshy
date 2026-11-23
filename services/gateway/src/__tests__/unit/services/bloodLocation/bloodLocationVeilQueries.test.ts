/**
 * Constat C — le voile d'un point ne coûte pas quatre requêtes par paire : le nombre de lectures est
 * le MÊME pour deux lecteurs que pour huit, et le verdict ne change pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BLOOD_BUNDLE_VERSION } from '@meeshy/shared/utils/blood-bundle';
import { ownersHidingFrom, pointVeilOf } from '../../../../services/bloodLocation/bloodLocationVeil';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const OWNER = '6600000000000000000000a0';
const readerIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `66000000000000000000${String(i + 1).padStart(4, '0')}`);
const ACCORD = { bloodBundleAcceptedAt: new Date('2026-11-20T00:00:00Z'), bloodBundleVersion: BLOOD_BUNDLE_VERSION };

function monde(n: number) {
  const readers = readerIds(n);
  const links: CircleLink[] = readers.map((id) => [OWNER, id, 'BLOOD']);
  const world = messagingWorld({ links, users: [OWNER, ...readers].map((id) => ({ id, birthDate: ADULT_BIRTH, locationGhostAt: id === OWNER ? new Date() : null })) });
  const settings = table(readers.map((id) => ({ ownerId: OWNER, otherId: id, ...ACCORD })) as Row[]);
  let calls = 0;
  const counted = <T extends object>(target: T): T =>
    new Proxy(target, { get: (t, key) => (typeof (t as Record<string | symbol, unknown>)[key] === 'function' ? (...args: unknown[]) => { calls += 1; return ((t as Record<string | symbol, (...a: unknown[]) => unknown>)[key])(...args); } : (t as Record<string | symbol, unknown>)[key]) });
  const prisma = Object.fromEntries(Object.entries({ ...world.prisma, relationFeatureSetting: settings }).map(([k, v]) => [k, typeof v === 'object' && v !== null ? counted(v as object) : v])) as unknown as PrismaClient;
  return { prisma, readers, calls: () => calls };
}

describe('constat C — lecture groupée du verrou', () => {
  it('pointVeilOf : autant de lectures pour 2 que pour 8 lecteurs, et tous sont autorisés', async () => {
    const petit = monde(2);
    const grand = monde(8);
    const veilPetit = await pointVeilOf(petit.prisma as never, OWNER);
    const veilGrand = await pointVeilOf(grand.prisma as never, OWNER);

    expect(grand.calls()).toBe(petit.calls());
    expect([...(veilGrand.onlyTo ?? [])].sort()).toEqual([...grand.readers].sort());
    expect(veilPetit.everyone).toBe(false);
  });

  it('ownersHidingFrom : autant de lectures pour 2 que pour 8 émetteurs', async () => {
    const petit = monde(2);
    const grand = monde(8);
    await ownersHidingFrom(petit.prisma as never, OWNER, petit.readers);
    await ownersHidingFrom(grand.prisma as never, OWNER, grand.readers);
    expect(grand.calls()).toBe(petit.calls());
  });
});
