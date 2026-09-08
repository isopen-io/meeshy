/**
 * #5712 — la sweep n'existait pas : `cleanupExpiredSessions()` n'avait aucun
 * appelant de production. Ce témoin garde le seul contrat qui compte ici : le
 * job délègue à `SessionService`, sur un cycle qui tourne dès `start()` (pour
 * solder le solde hérité) puis se répète.
 */
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockInitSessionService = jest.fn();
const mockCleanupExpiredSessions = jest.fn(() => Promise.resolve(0));

jest.mock('../../../services/SessionService', () => ({
  initSessionService: (prisma: unknown) => mockInitSessionService(prisma),
  cleanupExpiredSessions: () => mockCleanupExpiredSessions(),
}));

import { SessionExpirySweepJob } from '../../../jobs/session-expiry-sweep';

function makePrisma() {
  return { marker: 'prisma' } as any;
}

describe('SessionExpirySweepJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockInitSessionService.mockClear();
    mockCleanupExpiredSessions.mockClear();
    mockCleanupExpiredSessions.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('sweeps immediately on start(), against the prisma client it was given', async () => {
    const prisma = makePrisma();
    const job = new SessionExpirySweepJob(prisma);

    job.start();
    await Promise.resolve();

    expect(mockInitSessionService).toHaveBeenCalledWith(prisma);
    expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('fires again after the 30-minute interval', async () => {
    const job = new SessionExpirySweepJob(makePrisma());

    job.start();
    await Promise.resolve();
    const callsAfterStart = mockCleanupExpiredSessions.mock.calls.length;

    await jest.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(mockCleanupExpiredSessions.mock.calls.length).toBeGreaterThan(callsAfterStart);
    job.stop();
  });

  it('second start() call is a no-op (already-running guard)', async () => {
    const job = new SessionExpirySweepJob(makePrisma());

    job.start();
    await Promise.resolve();
    job.start();
    await Promise.resolve();

    expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
    job.stop();
  });

  it('stop() halts the interval', async () => {
    const job = new SessionExpirySweepJob(makePrisma());

    job.start();
    await Promise.resolve();
    job.stop();
    mockCleanupExpiredSessions.mockClear();

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mockCleanupExpiredSessions).not.toHaveBeenCalled();
  });

  it('runNow() runs the sweep without waiting for the interval', async () => {
    const job = new SessionExpirySweepJob(makePrisma());

    await job.runNow();

    expect(mockCleanupExpiredSessions).toHaveBeenCalledTimes(1);
  });

  it('a rejected sweep is swallowed — a DB hiccup must not crash the process', async () => {
    mockCleanupExpiredSessions.mockRejectedValueOnce(new Error('boom'));
    const job = new SessionExpirySweepJob(makePrisma());

    await expect(job.runNow()).resolves.toBeUndefined();
  });
});
