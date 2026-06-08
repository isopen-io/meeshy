/**
 * Unit tests for MutationLogCleanupJob — Wave 1 Task 3.8 (B4).
 *
 * We fake the prisma layer so the test is fast and deterministic; the
 * goal is to verify the cutoff arithmetic + the start/stop lifecycle.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  MutationLogCleanupJob,
  MUTATION_LOG_RETENTION_DAYS,
} from '../../jobs/mutation-log-cleanup';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function makeFakePrisma() {
  const deleteMany = jest.fn(async (args: any) => {
    const lt = args.where.createdAt.lt as Date;
    // Echo cutoff back via count for assertion.
    return { count: Math.floor((Date.now() - lt.getTime()) / 1000) };
  });
  return {
    prisma: { mutationLog: { deleteMany } },
    spies: { deleteMany },
  };
}

describe('MutationLogCleanupJob', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let job: MutationLogCleanupJob;

  beforeEach(() => {
    fake = makeFakePrisma();
    job = new MutationLogCleanupJob(fake.prisma as any);
  });

  it('exposes MUTATION_LOG_RETENTION_DAYS = 30 (matches docs)', () => {
    expect(MUTATION_LOG_RETENTION_DAYS).toBe(30);
  });

  it('runNow deletes rows older than the retention cutoff', async () => {
    const before = Date.now();
    const count = await job.runNow();
    const after = Date.now();

    expect(fake.spies.deleteMany).toHaveBeenCalledTimes(1);
    const args = fake.spies.deleteMany.mock.calls[0]?.[0] as { where: { createdAt: { lt: Date } } };
    const cutoff = args.where.createdAt.lt;
    expect(cutoff).toBeInstanceOf(Date);
    const cutoffMs = cutoff.getTime();
    // Cutoff should be ~30 days before "now". Allow 1s of slack so the
    // test isn't flaky on slow CI.
    expect(cutoffMs).toBeGreaterThanOrEqual(before - MUTATION_LOG_RETENTION_DAYS * ONE_DAY_MS - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - MUTATION_LOG_RETENTION_DAYS * ONE_DAY_MS + 1000);
    expect(typeof count).toBe('number');
  });

  it('runNow returns 0 when prisma throws', async () => {
    const failingPrisma = {
      mutationLog: {
        deleteMany: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('connection lost') as never),
      },
    };
    const failingJob = new MutationLogCleanupJob(failingPrisma as any);
    const count = await failingJob.runNow();
    expect(count).toBe(0);
  });

  it('start/stop lifecycle is idempotent', () => {
    job.start();
    job.start(); // second call should warn, not crash — no throw

    job.stop();
    job.stop(); // stopping a stopped job is a no-op
  });
});
