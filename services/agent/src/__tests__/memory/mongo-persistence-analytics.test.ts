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
  it('calls upsert with atomic increment for messagesSent and totalWordsSent', async () => {
    const existing = makeAnalyticRecord({ messagesSent: 10, totalWordsSent: 120, avgConfidence: 0.8 });
    const upserted = makeAnalyticRecord({ messagesSent: 13, totalWordsSent: 165 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue(upserted),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const result = await persistence.updateAnalytics('conv-1', {
      messagesSent: 3,
      wordsSent: 45,
      avgConfidence: 0.6,
    });

    expect(prisma.agentAnalytic.upsert).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      create: expect.objectContaining({
        conversationId: 'conv-1',
        messagesSent: 3,
        totalWordsSent: 45,
        avgConfidence: 0.6,
        lastResponseAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        messagesSent: { increment: 3 },
        totalWordsSent: { increment: 45 },
        avgConfidence: expect.closeTo(0.7538, 3),
        lastResponseAt: expect.any(Date),
      }),
    });
    expect(result).toEqual(upserted);
  });

  it('creates a new record via upsert when none exists', async () => {
    const created = makeAnalyticRecord({ messagesSent: 5, totalWordsSent: 60, avgConfidence: 0.9 });
    const prisma = {
      agentAnalytic: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(created),
      },
    } as any;

    const persistence = new MongoPersistence(prisma);
    const result = await persistence.updateAnalytics('conv-1', {
      messagesSent: 5,
      wordsSent: 60,
      avgConfidence: 0.9,
    });

    expect(prisma.agentAnalytic.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(created);
  });
});
