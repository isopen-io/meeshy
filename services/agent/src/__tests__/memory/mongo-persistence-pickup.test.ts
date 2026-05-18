import { MongoPersistence } from '../../memory/mongo-persistence';

const HOUR = 60 * 60 * 1000;

function role(overrides: Partial<{ id: string; userId: string; conversationId: string; lastActiveAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'role-1',
    userId: overrides.userId ?? 'user-1',
    conversationId: overrides.conversationId ?? 'conv-1',
    user: { lastActiveAt: overrides.lastActiveAt ?? new Date(Date.now() - 1 * HOUR) },
  };
}

describe('MongoPersistence.evictRecentlyActiveUsers()', () => {
  it('releases an auto-picked user who reconnected within the conversation inactivity delay', async () => {
    const prisma = {
      agentUserRole: {
        findMany: jest.fn().mockResolvedValue([role({ id: 'r1', userId: 'u1', lastActiveAt: new Date(Date.now() - 2 * HOUR) })]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      agentConfig: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'conv-1', manualUserIds: [], inactivityThresholdHours: 72 },
        ]),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const evicted = await persistence.evictRecentlyActiveUsers();

    expect(evicted).toBe(1);
    expect(prisma.agentUserRole.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r1'] } } });
  });

  it('keeps an auto-picked user still inactive beyond the conversation inactivity delay', async () => {
    const prisma = {
      agentUserRole: {
        findMany: jest.fn().mockResolvedValue([role({ id: 'r1', userId: 'u1', lastActiveAt: new Date(Date.now() - 100 * HOUR) })]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentConfig: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'conv-1', manualUserIds: [], inactivityThresholdHours: 72 },
        ]),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const evicted = await persistence.evictRecentlyActiveUsers();

    expect(evicted).toBe(0);
    expect(prisma.agentUserRole.deleteMany).not.toHaveBeenCalled();
  });

  it('never releases a manually controlled user even when recently active', async () => {
    const prisma = {
      agentUserRole: {
        findMany: jest.fn().mockResolvedValue([role({ id: 'r1', userId: 'u1', lastActiveAt: new Date(Date.now() - 1 * HOUR) })]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentConfig: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'conv-1', manualUserIds: ['u1'], inactivityThresholdHours: 72 },
        ]),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const evicted = await persistence.evictRecentlyActiveUsers();

    expect(evicted).toBe(0);
    expect(prisma.agentUserRole.deleteMany).not.toHaveBeenCalled();
  });

  it('honours a per-conversation threshold shorter than the default', async () => {
    const prisma = {
      agentUserRole: {
        findMany: jest.fn().mockResolvedValue([role({ id: 'r1', userId: 'u1', lastActiveAt: new Date(Date.now() - 12 * HOUR) })]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      agentConfig: {
        findMany: jest.fn().mockResolvedValue([
          { conversationId: 'conv-1', manualUserIds: [], inactivityThresholdHours: 6 },
        ]),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    // user reconnected 12h ago, threshold is 6h → still considered inactive → kept
    const evicted = await persistence.evictRecentlyActiveUsers();

    expect(evicted).toBe(0);
  });
});

describe('MongoPersistence.getLeastActiveParticipants()', () => {
  it('filters participants by the supplied inactivity threshold (in hours)', async () => {
    const prisma = {
      participant: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const before = Date.now();
    await persistence.getLeastActiveParticipants('conv-1', 3, [], [], 48);
    const after = Date.now();

    const where = prisma.participant.findMany.mock.calls[0][0].where;
    const cutoff = where.user.lastActiveAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 48 * HOUR);
    expect(cutoff).toBeLessThanOrEqual(after - 48 * HOUR);
  });

  it('defaults to a 72h threshold when none is supplied', async () => {
    const prisma = {
      participant: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const before = Date.now();
    await persistence.getLeastActiveParticipants('conv-1', 3, [], []);
    const after = Date.now();

    const where = prisma.participant.findMany.mock.calls[0][0].where;
    const cutoff = where.user.lastActiveAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - 72 * HOUR);
    expect(cutoff).toBeLessThanOrEqual(after - 72 * HOUR);
  });
});

describe('MongoPersistence.getPotentialControlledUsers()', () => {
  it('uses one shared threshold for both conversation activity and last connection', async () => {
    const prisma = {
      agentUserRole: { findMany: jest.fn().mockResolvedValue([]) },
      participant: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const before = Date.now();
    await persistence.getPotentialControlledUsers('conv-1', 3, 30, [], []);
    const after = Date.now();

    const where = prisma.participant.findMany.mock.calls[0][0].where;
    const participantCutoff = where.lastActiveAt.lt.getTime();
    const userCutoff = where.user.lastActiveAt.lt.getTime();
    expect(participantCutoff).toBe(userCutoff);
    expect(userCutoff).toBeGreaterThanOrEqual(before - 30 * HOUR);
    expect(userCutoff).toBeLessThanOrEqual(after - 30 * HOUR);
  });
});
