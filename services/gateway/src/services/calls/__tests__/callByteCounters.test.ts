import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  boundByteCounter,
  effectiveCallBytes,
  planCallByteWrite,
  LEGACY_INT32_BYTE_CEILING
} from '../callByteCounters';
import { persistCallStats } from '../callStatsPersistence';

const THREE_GB = 3_000_000_000;
const ONE_GB = 1_000_000_000;
const CALL_ID = '6650000000000000000000aa';

type StoredRow = {
  readonly bytesSent?: number | null;
  readonly bytesReceived?: number | null;
  readonly bytesSentTotal?: number | null;
  readonly bytesReceivedTotal?: number | null;
};

type UpdateArgs = { readonly where: Record<string, unknown>; readonly data: Record<string, unknown> };

const legacyRow = (over: StoredRow = {}): StoredRow => ({
  bytesSent: null,
  bytesReceived: null,
  bytesSentTotal: null,
  bytesReceivedTotal: null,
  ...over
});

const makePrisma = (options: {
  readonly row?: StoredRow | null;
  readonly readFails?: boolean;
  readonly byteWrite?: 'ok' | 'stale' | 'rejects';
} = {}) => {
  const updateMany = jest.fn(async (args: UpdateArgs) => {
    const writesBytes = 'bytesSentTotal' in args.data;
    if (writesBytes && options.byteWrite === 'rejects') throw new Error('Int overflow');
    if (writesBytes && options.byteWrite === 'stale') return { count: 0 };
    return { count: 1 };
  });
  const findUnique = jest.fn(async () => {
    if (options.readFails) throw new Error('DB connection lost');
    return options.row === undefined ? legacyRow() : options.row;
  });
  return { callSession: { findUnique, updateMany } };
};

const writes = (prisma: ReturnType<typeof makePrisma>): ReadonlyArray<UpdateArgs> =>
  prisma.callSession.updateMany.mock.calls.map(([args]) => args);
const byteWrite = (prisma: ReturnType<typeof makePrisma>) => writes(prisma).find((w) => 'bytesSentTotal' in w.data);
const qualityWrite = (prisma: ReturnType<typeof makePrisma>) => writes(prisma).find((w) => 'networkQuality' in w.data);

describe('boundByteCounter — une mesure d’octets bornée à l’entier exact (#20152)', () => {
  it('garde 3 Go entiers, au-delà de l’int32', () => {
    expect(boundByteCounter(THREE_GB)).toBe(THREE_GB);
  });

  it('plancher d’une mesure fractionnaire', () => {
    expect(boundByteCounter(12.9)).toBe(12);
  });

  it('garde 2^53 − 1, la borne des clients', () => {
    expect(boundByteCounter(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejette au-delà de 2^53 − 1 plutôt que de tronquer en silence', () => {
    expect(boundByteCounter(2 ** 53)).toBeNull();
    expect(boundByteCounter(1e300)).toBeNull();
  });

  it('rejette une mesure non finie, négative ou absente', () => {
    expect(boundByteCounter(Number.POSITIVE_INFINITY)).toBeNull();
    expect(boundByteCounter(Number.NaN)).toBeNull();
    expect(boundByteCounter(-1)).toBeNull();
    expect(boundByteCounter(undefined)).toBeNull();
    expect(boundByteCounter(null)).toBeNull();
  });
});

describe('effectiveCallBytes — les octets d’une ligne, le plus grand du total exact et de l’int32 hérité', () => {
  it('lit le total exact quand il est posé', () => {
    expect(
      effectiveCallBytes(legacyRow({ bytesSent: LEGACY_INT32_BYTE_CEILING, bytesSentTotal: THREE_GB, bytesReceived: ONE_GB, bytesReceivedTotal: ONE_GB }))
    ).toEqual({ bytesSent: THREE_GB, bytesReceived: ONE_GB });
  });

  it('relit un ancien enregistrement qui n’a que les champs int32', () => {
    expect(effectiveCallBytes({ bytesSent: 1000, bytesReceived: 2000 })).toEqual({ bytesSent: 1000, bytesReceived: 2000 });
  });

  it('une ancienne passerelle qui écrit l’int32 APRÈS le total n’est pas masquée par un total périmé (R3)', () => {
    expect(
      effectiveCallBytes({ bytesSent: 1_500_000_000, bytesSentTotal: 1_000_000, bytesReceived: 7, bytesReceivedTotal: 9 })
    ).toEqual({ bytesSent: 1_500_000_000, bytesReceived: 9 });
  });

  it('une nouvelle mesure se compare au maximum lu, le CAS restant sur les valeurs BRUTES lues (R3)', () => {
    const stored = { bytesSent: 1_500_000_000, bytesReceived: 0, bytesSentTotal: 1_000_000, bytesReceivedTotal: 0 };

    expect(planCallByteWrite(stored, { bytesSent: 1_200_000_000, bytesReceived: 0 })).toBeNull();
    expect(planCallByteWrite(stored, { bytesSent: THREE_GB, bytesReceived: 0 })?.where).toEqual({
      AND: [
        { OR: [{ bytesSent: 1_500_000_000 }] },
        { OR: [{ bytesReceived: 0 }] },
        { OR: [{ bytesSentTotal: 1_000_000 }] },
        { OR: [{ bytesReceivedTotal: 0 }] }
      ]
    });
  });

  it('rend null quand rien n’a jamais été mesuré', () => {
    expect(effectiveCallBytes({})).toEqual({ bytesSent: null, bytesReceived: null });
  });
});

describe('planCallByteWrite — le CAS des octets', () => {
  it('écrit 3 Go exacts dans les totaux et sature l’int32 hérité à 2147483647', () => {
    const plan = planCallByteWrite(legacyRow(), { bytesSent: THREE_GB, bytesReceived: ONE_GB });

    expect(plan?.data).toEqual({
      bytesSentTotal: THREE_GB,
      bytesReceivedTotal: ONE_GB,
      bytesSent: 2_147_483_647,
      bytesReceived: ONE_GB
    });
  });

  it('un champ lu absent ou nul se compare « nul OU absent », jamais « nul » seul', () => {
    const plan = planCallByteWrite({ bytesSent: 100, bytesReceived: 200 }, { bytesSent: 900, bytesReceived: 900 });

    expect(plan?.where).toEqual({
      AND: [
        { OR: [{ bytesSent: 100 }] },
        { OR: [{ bytesReceived: 200 }] },
        { OR: [{ bytesSentTotal: null }, { bytesSentTotal: { isSet: false } }] },
        { OR: [{ bytesReceivedTotal: null }, { bytesReceivedTotal: { isSet: false } }] }
      ]
    });
  });

  it('un ancien enregistrement int32 est remplacé par une mesure plus grande', () => {
    const plan = planCallByteWrite({ bytesSent: 1_000_000, bytesReceived: 1_000_000 }, { bytesSent: THREE_GB, bytesReceived: 0 });

    expect(plan?.data).toMatchObject({ bytesSentTotal: THREE_GB, bytesReceivedTotal: 0 });
  });

  it('compare au total exact lu, pas à l’int32 saturé', () => {
    const stored = legacyRow({
      bytesSent: LEGACY_INT32_BYTE_CEILING,
      bytesReceived: 0,
      bytesSentTotal: THREE_GB,
      bytesReceivedTotal: 0
    });

    expect(planCallByteWrite(stored, { bytesSent: 2_500_000_000, bytesReceived: 0 })).toBeNull();
  });

  it('ignore une mesure plus petite', () => {
    expect(planCallByteWrite({ bytesSent: 1_000_000, bytesReceived: 1_000_000 }, { bytesSent: 1_800_000, bytesReceived: 100_000 })).toBeNull();
  });

  it('ignore une mesure non finie ou au-delà de 2^53 − 1', () => {
    expect(planCallByteWrite(legacyRow(), { bytesSent: Number.POSITIVE_INFINITY, bytesReceived: 2 ** 53 })).toBeNull();
  });

  it('complète le côté non rapporté par la valeur effective lue', () => {
    const plan = planCallByteWrite(legacyRow({ bytesReceived: LEGACY_INT32_BYTE_CEILING, bytesReceivedTotal: THREE_GB }), { bytesSent: 10 });

    expect(plan?.data).toEqual({
      bytesSentTotal: 10,
      bytesReceivedTotal: THREE_GB,
      bytesSent: 10,
      bytesReceived: LEGACY_INT32_BYTE_CEILING
    });
  });
});

describe('persistCallStats — les octets et la qualité réseau s’écrivent séparément', () => {
  it('persiste 3 Go dans les totaux, scopé à l’instantané lu', async () => {
    const prisma = makePrisma();

    await persistCallStats(prisma as never, CALL_ID, { bytesSent: THREE_GB, bytesReceived: ONE_GB });

    expect(byteWrite(prisma)?.data).toMatchObject({ bytesSentTotal: THREE_GB, bytesSent: LEGACY_INT32_BYTE_CEILING });
    expect(byteWrite(prisma)?.where).toMatchObject({ id: CALL_ID });
  });

  it('la qualité réseau est persistée même quand l’écriture des octets rejette', async () => {
    const prisma = makePrisma({ byteWrite: 'rejects' });

    await expect(
      persistCallStats(prisma as never, CALL_ID, { bytesSent: THREE_GB, bytesReceived: ONE_GB, level: 'good' })
    ).resolves.toEqual(expect.any(Boolean));

    expect(qualityWrite(prisma)).toMatchObject({ where: { id: CALL_ID }, data: { networkQuality: 'good' } });
  });

  it('la qualité réseau est persistée même quand le CAS des octets perd la course', async () => {
    const prisma = makePrisma({ byteWrite: 'stale' });

    await persistCallStats(prisma as never, CALL_ID, { bytesSent: 500, bytesReceived: 600, level: 'poor' });

    expect(qualityWrite(prisma)?.data).toEqual({ networkQuality: 'poor' });
  });

  it('la qualité réseau est persistée même quand la lecture de l’instantané échoue', async () => {
    const prisma = makePrisma({ readFails: true });

    await persistCallStats(prisma as never, CALL_ID, { bytesSent: 500, level: 'fair' });

    expect(byteWrite(prisma)).toBeUndefined();
    expect(qualityWrite(prisma)?.data).toEqual({ networkQuality: 'fair' });
  });

  it('n’écrit rien pour une qualité inconnue et des octets invalides', async () => {
    const prisma = makePrisma();

    await persistCallStats(prisma as never, CALL_ID, { bytesSent: -1, bytesReceived: Number.NaN, level: 'amazing' });

    expect(prisma.callSession.updateMany).not.toHaveBeenCalled();
  });
});
