jest.mock('@meeshy/shared/prisma/client', () => {
  const mockAnalyticFindUnique = jest.fn();
  const mockSummaryFindUnique = jest.fn();

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      agentConfig: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
      agentAnalytic: { findUnique: mockAnalyticFindUnique },
      agentConversationSummary: { findUnique: mockSummaryFindUnique },
    })),
    __mockAnalyticFindUnique: mockAnalyticFindUnique,
    __mockSummaryFindUnique: mockSummaryFindUnique,
  };
});

import Fastify from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { configRoutes } from '../../routes/config';

const sharedMock = jest.requireMock('@meeshy/shared/prisma/client');

async function buildApp() {
  const app = Fastify();
  const prisma = new PrismaClient();
  const redis = { set: jest.fn() };
  await configRoutes(app, prisma, redis);
  await app.ready();
  return app;
}

describe('GET /api/agent/analytics/:conversationId', () => {
  beforeEach(() => {
    sharedMock.__mockAnalyticFindUnique.mockReset();
    sharedMock.__mockSummaryFindUnique.mockReset();
  });

  it('returns success:true with analytics and summary', async () => {
    const analyticRecord = {
      conversationId: 'conv-1',
      messagesSent: 7,
      totalWordsSent: 90,
      avgConfidence: 0.85,
      lastResponseAt: new Date('2026-03-07T12:00:00Z'),
    };
    const summaryRecord = {
      conversationId: 'conv-1',
      summary: 'Tech discussion',
      currentTopics: ['tech'],
      overallTone: 'professional',
      messageCount: 15,
    };

    sharedMock.__mockAnalyticFindUnique.mockResolvedValue(analyticRecord);
    sharedMock.__mockSummaryFindUnique.mockResolvedValue(summaryRecord);

    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/api/agent/analytics/conv-1' });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.success).toBe(true);
    expect(body.data.analytics).toMatchObject({ messagesSent: 7, totalWordsSent: 90 });
    expect(body.data.summary).toMatchObject({ summary: 'Tech discussion' });
  });

  it('returns null analytics and null summary when neither exist', async () => {
    sharedMock.__mockAnalyticFindUnique.mockResolvedValue(null);
    sharedMock.__mockSummaryFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/api/agent/analytics/conv-empty' });

    const body = JSON.parse(resp.body);
    expect(body.success).toBe(true);
    expect(body.data.analytics).toBeNull();
    expect(body.data.summary).toBeNull();
  });

  it('queries by the correct conversationId', async () => {
    sharedMock.__mockAnalyticFindUnique.mockResolvedValue(null);
    sharedMock.__mockSummaryFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/api/agent/analytics/conv-xyz' });

    expect(sharedMock.__mockAnalyticFindUnique).toHaveBeenCalledWith({
      where: { conversationId: 'conv-xyz' },
    });
    expect(sharedMock.__mockSummaryFindUnique).toHaveBeenCalledWith({
      where: { conversationId: 'conv-xyz' },
    });
  });
});
