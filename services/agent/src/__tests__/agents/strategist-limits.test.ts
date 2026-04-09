import { createStrategistNode } from '../../agents/strategist';
import { getArchetype } from '@meeshy/shared/agent/archetypes';
import { MessageDirective } from '../../graph/state';

jest.mock('@meeshy/shared/agent/archetypes', () => ({
  getArchetype: jest.fn(),
}));

describe('Strategist — Dynamic Word Limits', () => {
  const llm = {
    chat: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        shouldIntervene: true,
        reason: 'test',
        interventions: [
          { type: 'message', asUserId: 'u1', topic: 'topic1', delaySeconds: 30 },
          { type: 'message', asUserId: 'u2', topic: 'topic2', replyToMessageId: 'm1', delaySeconds: 30 }
        ]
      })
    })
  };

  const makeState = (controlledUsers: any[]): any => ({
    controlledUsers,
    messages: [{ id: 'm1', senderName: 'Alice', content: 'hello' }],
    activityScore: 0.1,
    budgetRemaining: 10,
    minResponsesPerCycle: 2,
    maxResponsesPerCycle: 5,
    maxReactionsPerCycle: 5,
    reactionsEnabled: true,
    minWordsPerMessage: 3,
    maxWordsPerMessage: 400,
    todayUsersActive: 0,
    maxUsersToday: 4,
    reactionBoostFactor: 1.5,
    burstSize: 2,
    todayActiveUserIds: [],
    agentHistory: [],
    contextWindowSize: 50,
    useFullHistory: false
  });

  const makeControlledUser = (id: string, overrides: any = {}) => ({
    userId: id,
    displayName: 'User ' + id,
    role: {
      userId: id,
      archetypeId: overrides.archetypeId,
      overrideMinWordsPerMessage: overrides.minWords,
      overrideMaxWordsPerMessage: overrides.maxWords,
      personaSummary: '', tone: '', vocabularyLevel: 'courant',
      typicalLength: overrides.typicalLength ?? 'moyen', emojiUsage: '',
      topicsOfExpertise: [], topicsAvoided: [], relationshipMap: {}, catchphrases: [],
      responseTriggers: [], silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 0, confidence: 0.5, locked: false,
    }
  });

  it('calculates limits correctly based on hierarchy (dynamique vs interpellé)', async () => {
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [makeControlledUser('u1'), makeControlledUser('u2')];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const interventions = result.interventionPlan.interventions;
    const messageInterventions = interventions.filter((i: any) => i.type === 'message');
    expect(messageInterventions).toHaveLength(2);

    // Intervention 1: Dynamique — typicalLength 'moyen' → 10-60
    const int1 = messageInterventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(10);
    expect(int1.maxWords).toBe(60);

    // Intervention 2: Interpellé (reply to m1) — typicalLength 'moyen' → 10-60
    const int2 = messageInterventions.find((i: any) => i.asUserId === 'u2') as MessageDirective;
    expect(int2).toBeDefined();
    expect(int2.minWords).toBe(10);
    expect(int2.maxWords).toBe(60);
  });

  it('respects user overrides in hierarchy', async () => {
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [
      makeControlledUser('u1', { minWords: 10, maxWords: 50 }),
      makeControlledUser('u2')
    ];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const messageInterventions = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    const int1 = messageInterventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(10);
    expect(int1.maxWords).toBe(50);
  });

  it('injects reactions when LLM produces messages but no reactions', async () => {
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [makeControlledUser('u1'), makeControlledUser('u2')];
    const state = makeState(users);
    state.messages = [
      { id: 'm1', senderId: 'real-user', senderName: 'Alice', senderUsername: 'alice', content: 'Hello!', timestamp: Date.now() },
      { id: 'm2', senderId: 'real-user-2', senderName: 'Bob', senderUsername: 'bob', content: 'Super post!', timestamp: Date.now() },
    ];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(state);

    const reactions = result.interventionPlan.interventions.filter((i: any) => i.type === 'reaction');
    expect(reactions.length).toBeGreaterThanOrEqual(1);
  });

  it('maps typicalLength to distinct word ranges per user', async () => {
    const llmMulti = {
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'test',
          interventions: [
            { type: 'message', asUserId: 'short', topic: 'bref', delaySeconds: 30 },
            { type: 'message', asUserId: 'long', topic: 'detail', delaySeconds: 30 },
          ]
        })
      })
    };
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [
      makeControlledUser('short', { typicalLength: 'court' }),
      makeControlledUser('long', { typicalLength: 'long' }),
    ];
    const strategist = createStrategistNode(llmMulti as any);
    const result = await strategist(makeState(users));

    const msgs = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    const shortUser = msgs.find((i: any) => i.asUserId === 'short') as MessageDirective;
    const longUser = msgs.find((i: any) => i.asUserId === 'long') as MessageDirective;

    expect(shortUser.minWords).toBe(2);
    expect(shortUser.maxWords).toBe(30);
    expect(longUser.minWords).toBe(30);
    expect(longUser.maxWords).toBe(120);
  });

  it('does not inject reactions when LLM already provided them', async () => {
    const llmWithReactions = {
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'test',
          interventions: [
            { type: 'message', asUserId: 'u1', topic: 'topic1', delaySeconds: 30 },
            { type: 'reaction', asUserId: 'u1', targetMessageId: 'm1', emoji: '👍', delaySeconds: 5 },
          ]
        })
      })
    };
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [makeControlledUser('u1')];
    const state = makeState(users);
    state.messages = [
      { id: 'm1', senderId: 'real-user', senderName: 'Alice', senderUsername: 'alice', content: 'Cool', timestamp: Date.now() },
    ];
    const strategist = createStrategistNode(llmWithReactions as any);
    const result = await strategist(state);

    const reactions = result.interventionPlan.interventions.filter((i: any) => i.type === 'reaction');
    expect(reactions.length).toBe(1);
  });

  it('respects archetype limits in hierarchy', async () => {
    (getArchetype as jest.Mock).mockReturnValue({ minWords: 20, maxWords: 150 });
    const users = [
      makeControlledUser('u1', { archetypeId: 'curious' }),
      makeControlledUser('u2')
    ];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const messageInterventions = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    const int1 = messageInterventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(20);
    expect(int1.maxWords).toBe(150);
  });
});
