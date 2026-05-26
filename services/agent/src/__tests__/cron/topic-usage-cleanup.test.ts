import { runTopicUsageCleanup, startTopicUsageCleanupCron } from '../../cron/topic-usage-cleanup';

function makePrisma(matchedCount: number = 0) {
  return {
    agentTopicUsageLog: {
      deleteMany: jest.fn(async (_args: any) => ({ count: matchedCount })),
    },
  } as any;
}

describe('topic-usage-cleanup', () => {
  test('runTopicUsageCleanup() deletes logs older than 30 days', async () => {
    const prisma = makePrisma(42);
    const result = await runTopicUsageCleanup(prisma);
    expect(prisma.agentTopicUsageLog.deleteMany).toHaveBeenCalled();
    const callArgs = prisma.agentTopicUsageLog.deleteMany.mock.calls[0][0];
    expect(callArgs.where.usedAt.lt).toBeInstanceOf(Date);
    const cutoff = callArgs.where.usedAt.lt as Date;
    const expectedCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(1000);
    expect(result).toBe(42);
  });

  test('startTopicUsageCleanupCron() returns an interval handle', () => {
    const prisma = makePrisma(0);
    const handle = startTopicUsageCleanupCron(prisma);
    expect(handle).toBeDefined();
    clearInterval(handle);
  });
});
