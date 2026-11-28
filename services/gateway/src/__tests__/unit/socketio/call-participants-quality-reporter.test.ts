import { jest, describe, it, expect } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../../../services/CallService';
import {
  QUALITY_REPORT_GRACE_MS,
  resolveQualityReporter,
} from '../../../socketio/call-participants';
import { logger } from '../../../utils/logger';

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-reporter';
const NOW = Date.parse('2026-11-27T12:00:00.000Z');

type Row = { id?: string; participantId: string; userId?: string; leftAt?: Date | null };

function makeDeps(rows: ReadonlyArray<Row>) {
  const getCallSession = jest.fn<(callId: string) => Promise<unknown>>().mockResolvedValue({
    participants: rows.map((row, index) => ({
      id: row.id ?? `cp-${index}`,
      participantId: row.participantId,
      leftAt: row.leftAt ?? null,
      participant: row.userId ? { userId: row.userId } : undefined,
    })),
  });
  return {
    deps: { prisma: {} as PrismaClient, callService: { getCallSession } as unknown as CallService },
    getCallSession,
  };
}

function leftAgo(ms: number): Date {
  return new Date(NOW - ms);
}

describe('resolveQualityReporter — the last quality report of a call that just ended (#20459)', () => {
  it('names a 30 second grace window', () => {
    expect(QUALITY_REPORT_GRACE_MS).toBe(30_000);
  });

  it('resolves an active participant as not departed', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: null }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toEqual({
      participantId: 'p-1',
      userId: USER_ID,
      departed: false,
    });
  });

  it('resolves a participant who left 5 seconds ago as departed', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: leftAgo(5_000) }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toEqual({
      participantId: 'p-1',
      userId: USER_ID,
      departed: true,
    });
  });

  it('still accepts a participant who left exactly at the end of the window', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: leftAgo(QUALITY_REPORT_GRACE_MS) }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toMatchObject({ departed: true });
  });

  it('rejects a participant who left more than 30 seconds ago', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: leftAgo(QUALITY_REPORT_GRACE_MS + 1) }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toBeNull();
  });

  it('rejects a caller who never was a participant of this call', async () => {
    const { deps } = makeDeps([{ participantId: 'p-other', userId: 'someone-else', leftAt: null }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toBeNull();
  });

  it('rejects a departure dated in the future instead of opening an endless window', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: new Date(NOW + 1_000) }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toBeNull();
  });

  it('rejects an unreadable departure date', async () => {
    const { deps } = makeDeps([{ participantId: 'p-1', userId: USER_ID, leftAt: new Date('not-a-date') }]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toBeNull();
  });

  it('prefers the active row of a user who joined twice', async () => {
    const { deps } = makeDeps([
      { participantId: 'p-first', userId: USER_ID, leftAt: leftAgo(2_000) },
      { participantId: 'p-second', userId: USER_ID, leftAt: null },
    ]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toEqual({
      participantId: 'p-second',
      userId: USER_ID,
      departed: false,
    });
  });

  it('picks the most recent departure of a user who joined twice and left both times', async () => {
    const { deps } = makeDeps([
      { participantId: 'p-recent', userId: USER_ID, leftAt: leftAgo(3_000) },
      { participantId: 'p-old', userId: USER_ID, leftAt: leftAgo(20_000) },
    ]);

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toEqual({
      participantId: 'p-recent',
      userId: USER_ID,
      departed: true,
    });
  });

  it('falls back to participantId as userId for an anonymous guest', async () => {
    const { deps } = makeDeps([{ participantId: 'p-anon', leftAt: leftAgo(1_000) }]);

    await expect(resolveQualityReporter(deps, 'p-anon', CALL_ID, { now: NOW })).resolves.toEqual({
      participantId: 'p-anon',
      userId: 'p-anon',
      departed: true,
    });
  });

  it('logs and rejects when the call session cannot be read', async () => {
    const { deps, getCallSession } = makeDeps([]);
    getCallSession.mockRejectedValueOnce(new Error('Mongo connection lost'));

    await expect(resolveQualityReporter(deps, USER_ID, CALL_ID, { now: NOW })).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'resolveQualityReporter: getCallSession failed, treating caller as unauthorized',
      expect.objectContaining({ userId: USER_ID, callId: CALL_ID, error: 'Mongo connection lost' })
    );
  });
});
