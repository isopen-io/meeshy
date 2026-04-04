import Fastify from 'fastify';
import { analyticsRoutes } from '../../routes/analytics';

function makeControlledUser(overrides: Partial<{ userId: string; displayName: string; confidence: number; locked: boolean }> = {}) {
  return {
    userId: 'u1',
    displayName: 'Alice',
    username: 'alice',
    systemLanguage: 'fr',
    source: 'manual' as const,
    role: {
      userId: 'u1', displayName: 'Alice', origin: 'observed' as const, personaSummary: '', tone: 'direct',
      vocabularyLevel: 'courant', typicalLength: 'court', emojiUsage: 'jamais',
      topicsOfExpertise: [], topicsAvoided: [], relationshipMap: {}, catchphrases: [],
      responseTriggers: [], silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 10, confidence: 0.9, locked: false,
      ...overrides,
    },
    ...overrides,
  };
}

function makeStubs(overrides: {
  summary?: string;
  toneProfiles?: Record<string, unknown>;
  messages?: unknown[];
  analyticsRecord?: unknown;
  summaryRecord?: unknown;
  controlledUsers?: unknown[];
  agentConfig?: unknown;
} = {}) {
  return {
    stateManager: {
      getSummary: jest.fn().mockResolvedValue(overrides.summary ?? 'Test summary'),
      getToneProfiles: jest.fn().mockResolvedValue(overrides.toneProfiles ?? {}),
      getMessages: jest.fn().mockResolvedValue(overrides.messages ?? []),
    } as any,
    persistence: {
      getRecentMessageCount: jest.fn().mockResolvedValue(2),
      getRecentUniqueAuthors: jest.fn().mockResolvedValue(1),
      getAnalytics: jest.fn().mockResolvedValue(overrides.analyticsRecord ?? null),
      getSummaryRecord: jest.fn().mockResolvedValue(overrides.summaryRecord ?? null),
      getControlledUsers: jest.fn().mockResolvedValue(overrides.controlledUsers ?? []),
      getAgentConfig: jest.fn().mockResolvedValue(overrides.agentConfig ?? null),
    } as any,
  };
}

async function buildApp(overrides = {}) {
  const app = Fastify();
  const deps = makeStubs(overrides);
  await analyticsRoutes(app, deps);
  await app.ready();
  return app;
}

describe('GET /api/agent/live/:conversationId', () => {
  it('returns success:true with all data keys', async () => {
    const app = await buildApp();
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('conversationId', 'conv-1');
    expect(body.data).toHaveProperty('summary');
    expect(body.data).toHaveProperty('toneProfiles');
    expect(body.data).toHaveProperty('cachedMessageCount');
    expect(body.data).toHaveProperty('activity');
    expect(body.data).toHaveProperty('analytics');
    expect(body.data).toHaveProperty('summaryRecord');
    expect(body.data).toHaveProperty('controlledUsers');
  });

  it('returns analytics: null when no analytic record exists', async () => {
    const app = await buildApp({ analyticsRecord: null });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });
    expect(JSON.parse(resp.body).data.analytics).toBeNull();
  });

  it('returns shaped analytics when record exists', async () => {
    const record = {
      messagesSent: 5,
      totalWordsSent: 80,
      avgConfidence: 0.75,
      lastResponseAt: new Date('2026-03-07T10:00:00Z'),
    };
    const app = await buildApp({ analyticsRecord: record });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });

    expect(JSON.parse(resp.body).data.analytics).toEqual({
      messagesSent: 5,
      totalWordsSent: 80,
      avgConfidence: 0.75,
      lastResponseAt: '2026-03-07T10:00:00.000Z',
    });
  });

  it('returns analytics.lastResponseAt as null when field is null', async () => {
    const record = { messagesSent: 1, totalWordsSent: 10, avgConfidence: 0.5, lastResponseAt: null };
    const app = await buildApp({ analyticsRecord: record });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });
    expect(JSON.parse(resp.body).data.analytics.lastResponseAt).toBeNull();
  });

  it('returns summaryRecord: null when none exists', async () => {
    const app = await buildApp({ summaryRecord: null });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });
    expect(JSON.parse(resp.body).data.summaryRecord).toBeNull();
  });

  it('returns shaped summaryRecord when it exists', async () => {
    const record = { summary: 'Chat about Swift', currentTopics: ['swift', 'ios'], overallTone: 'casual', messageCount: 20 };
    const app = await buildApp({ summaryRecord: record });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });
    expect(JSON.parse(resp.body).data.summaryRecord).toEqual(record);
  });

  it('maps controlled users to public projection', async () => {
    const app = await buildApp({ controlledUsers: [makeControlledUser()] });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });

    expect(JSON.parse(resp.body).data.controlledUsers).toEqual([
      { userId: 'u1', displayName: 'Alice', systemLanguage: 'fr', confidence: 0.9, locked: false },
    ]);
  });

  it('reports cachedMessageCount from redis messages array length', async () => {
    const messages = [
      { id: 'm1', senderId: 'u1', senderName: 'Alice', content: 'Hi', timestamp: Date.now() },
      { id: 'm2', senderId: 'u2', senderName: 'Bob', content: 'Hey', timestamp: Date.now() },
    ];
    const app = await buildApp({ messages });
    const resp = await app.inject({ method: 'GET', url: '/api/agent/live/conv-1' });
    expect(JSON.parse(resp.body).data.cachedMessageCount).toBe(2);
  });
});
