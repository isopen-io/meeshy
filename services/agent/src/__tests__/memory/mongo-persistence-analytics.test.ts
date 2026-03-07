import { MongoPersistence } from '../../memory/mongo-persistence';

function makeAnalyticRecord(overrides: Partial<{
  messagesSent: number;
  totalWordsSent: number;
  avgConfidence: number;
  lastResponseAt: Date | null;
}> = {}) {
  return {
    conversationId: 'conv-1',
    messagesSent: 10,
    totalWordsSent: 120,
    avgConfidence: 0.8,
    lastResponseAt: new Date('2026-03-07T00:00:00Z'),
    ...overrides,
  };
}

function makeSummaryRecord(overrides: Partial<{
  summary: string;
  currentTopics: string[];
  overallTone: string;
  messageCount: number;
}> = {}) {
  return {
    conversationId: 'conv-1',
    summary: 'Discussion about tech',
    currentTopics: ['tech', 'swift'],
    overallTone: 'casual',
    messageCount: 42,
    ...overrides,
  };
}

describe('MongoPersistence.getAnalytics()', () => {
  it('returns the analytic record when it exists', async () => {
    const record = makeAnalyticRecord();
    const prisma = {
      agentAnalytic: { findUnique: jest.fn().mockResolvedValue(record) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const result = await persistence.getAnalytics('conv-1');

    expect(result).toEqual(record);
    expect(prisma.agentAnalytic.findUnique).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
    });
  });

  it('returns null when no analytic record exists', async () => {
    const prisma = {
      agentAnalytic: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    expect(await persistence.getAnalytics('conv-unknown')).toBeNull();
  });
});

describe('MongoPersistence.getSummaryRecord()', () => {
  it('returns the summary record when it exists', async () => {
    const record = makeSummaryRecord();
    const prisma = {
      agentConversationSummary: { findUnique: jest.fn().mockResolvedValue(record) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const result = await persistence.getSummaryRecord('conv-1');

    expect(result).toEqual(record);
    expect(prisma.agentConversationSummary.findUnique).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
    });
  });

  it('returns null when no summary record exists', async () => {
    const prisma = {
      agentConversationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;

    const persistence = new MongoPersistence(prisma);
    expect(await persistence.getSummaryRecord('conv-none')).toBeNull();
  });
});

describe('MongoPersistence.updateAnalytics()', () => {
  it('creates a new record when none exists', async () => {
    const created = makeAnalyticRecord({ messagesSent: 3, totalWordsSent: 40, avgConfidence: 0.7 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn(),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const result = await persistence.updateAnalytics('conv-1', {
      messagesSent: 3,
      wordsSent: 40,
      avgConfidence: 0.7,
    });

    expect(prisma.agentAnalytic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        messagesSent: 3,
        totalWordsSent: 40,
        avgConfidence: 0.7,
        lastResponseAt: expect.any(Date),
      }),
    });
    expect(prisma.agentAnalytic.update).not.toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it('accumulates messagesSent and totalWordsSent on existing record', async () => {
    const existing = makeAnalyticRecord({ messagesSent: 10, totalWordsSent: 120, avgConfidence: 0.8 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({ ...existing, messagesSent: 13, totalWordsSent: 165 }),
        create: jest.fn(),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    await persistence.updateAnalytics('conv-1', {
      messagesSent: 3,
      wordsSent: 45,
      avgConfidence: 0.6,
    });

    expect(prisma.agentAnalytic.update).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      data: expect.objectContaining({
        messagesSent: 13,
        totalWordsSent: 165,
        lastResponseAt: expect.any(Date),
      }),
    });
    expect(prisma.agentAnalytic.create).not.toHaveBeenCalled();
  });

  it('computes weighted average confidence on update', async () => {
    const existing = makeAnalyticRecord({ messagesSent: 10, totalWordsSent: 100, avgConfidence: 0.8 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    await persistence.updateAnalytics('conv-1', {
      messagesSent: 5,
      wordsSent: 50,
      avgConfidence: 0.5,
    });

    const updateCall = prisma.agentAnalytic.update.mock.calls[0][0];
    expect(updateCall.data.avgConfidence).toBeCloseTo(0.7, 5);
  });

  it('uses incoming avgConfidence directly when existing messagesSent is 0', async () => {
    const existing = makeAnalyticRecord({ messagesSent: 0, totalWordsSent: 0, avgConfidence: 0 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    await persistence.updateAnalytics('conv-1', {
      messagesSent: 4,
      wordsSent: 60,
      avgConfidence: 0.9,
    });

    const updateCall = prisma.agentAnalytic.update.mock.calls[0][0];
    expect(updateCall.data.avgConfidence).toBeCloseTo(0.9, 5);
  });
});
