/**
 * La qualité réseau d'un appel suit une règle explicite (#20709) : pendant
 * l'appel, le dernier relevé fait foi ; une fois l'appel terminé, un relevé
 * tardif (fenêtre de grâce après `leftAt`, #20459) ne peut que la DÉGRADER.
 * `persistCallStats` dit si le résumé de l'appel terminé est devenu périmé.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { persistCallStats } from '../callStatsPersistence';

const CALL_ID = '6650000000000000000000bb';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matchesField = (row: Row, field: string, condition: unknown): boolean => {
  const value = row[field];
  if (condition === null) return value === null || value === undefined;
  if (typeof condition !== 'object') return value === condition;
  const ops = condition as Record<string, unknown>;
  if ('isSet' in ops) return ops.isSet === (field in row);
  if ('in' in ops) return (ops.in as ReadonlyArray<unknown>).includes(value);
  if ('notIn' in ops) return !(ops.notIn as ReadonlyArray<unknown>).includes(value);
  return false;
};

const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as ReadonlyArray<Where>).every((w) => matches(row, w));
    if (key === 'OR') return (condition as ReadonlyArray<Where>).some((w) => matches(row, w));
    return matchesField(row, key, condition);
  });

const callSessionStore = (initial: Row) => {
  const state = { row: { id: CALL_ID, ...initial } as Row };
  const callSession = {
    findUnique: jest.fn(async () => ({ ...state.row })),
    updateMany: jest.fn(async (args: { where: Where; data: Row }) => {
      if (!matches(state.row, args.where)) return { count: 0 };
      state.row = { ...state.row, ...args.data };
      return { count: 1 };
    })
  };
  return { prisma: { callSession }, row: () => state.row };
};

const endedCall = (over: Row = {}): Row => ({
  status: 'ended', bytesSent: 1_000, bytesReceived: 2_000, bytesSentTotal: 1_000, bytesReceivedTotal: 2_000, ...over
});

const liveCall = (over: Row = {}): Row => endedCall({ status: 'active', ...over });

describe('persistCallStats — pendant l’appel, le dernier relevé de qualité fait foi', () => {
  it('une qualité meilleure remplace une qualité moins bonne', async () => {
    const store = callSessionStore(liveCall({ networkQuality: 'poor' }));

    await persistCallStats(store.prisma as never, CALL_ID, { level: 'excellent' });

    expect(store.row().networkQuality).toBe('excellent');
  });

  it('une qualité moins bonne remplace une meilleure', async () => {
    const store = callSessionStore(liveCall({ networkQuality: 'excellent' }));

    await persistCallStats(store.prisma as never, CALL_ID, { level: 'fair' });

    expect(store.row().networkQuality).toBe('fair');
  });
});

describe('persistCallStats — après la fin de l’appel, un relevé tardif ne peut que dégrader la qualité', () => {
  it('dégrade « good » en « poor » et signale le résumé périmé', async () => {
    const store = callSessionStore(endedCall({ networkQuality: 'good' }));

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { level: 'poor' });

    expect(store.row().networkQuality).toBe('poor');
    expect(stale).toBe(true);
  });

  it('n’embellit pas « fair » en « excellent » et ne signale rien', async () => {
    const store = callSessionStore(endedCall({ networkQuality: 'fair' }));

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { level: 'excellent' });

    expect(store.row().networkQuality).toBe('fair');
    expect(stale).toBe(false);
  });

  it('une qualité identique ne change rien et ne signale rien', async () => {
    const store = callSessionStore(endedCall({ networkQuality: 'good' }));

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { level: 'good' });

    expect(store.row().networkQuality).toBe('good');
    expect(stale).toBe(false);
  });

  it('pose la qualité quand aucune n’avait été retenue', async () => {
    const store = callSessionStore(endedCall());

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { level: 'good' });

    expect(store.row().networkQuality).toBe('good');
    expect(stale).toBe(true);
  });

  it('des octets qui grandissent signalent le résumé périmé', async () => {
    const store = callSessionStore(endedCall({ networkQuality: 'good' }));

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { bytesSent: 5_000, bytesReceived: 9_000, level: 'good' });

    expect(store.row().bytesReceivedTotal).toBe(9_000);
    expect(stale).toBe(true);
  });

  it('des octets qui ne grandissent pas ne signalent rien', async () => {
    const store = callSessionStore(endedCall({ networkQuality: 'good' }));

    const stale = await persistCallStats(store.prisma as never, CALL_ID, { bytesSent: 500, bytesReceived: 600, level: 'good' });

    expect(store.row().bytesSentTotal).toBe(1_000);
    expect(stale).toBe(false);
  });
});
