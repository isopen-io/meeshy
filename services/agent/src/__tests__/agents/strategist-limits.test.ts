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
      personaSummary: '', tone: '', vocabularyLevel: '', typicalLength: '', emojiUsage: '',
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
    expect(interventions).toHaveLength(2);

    // Intervention 1: Dynamique (auto-pick)
    const int1 = interventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(3); // default from state
    expect(int1.maxWords).toBe(300); // default capped at 300 for dynamic

    // Intervention 2: Interpellé (reply to m1)
    const int2 = interventions.find((i: any) => i.asUserId === 'u2') as MessageDirective;
    expect(int2).toBeDefined();
    expect(int2.minWords).toBe(3); // default from state
    expect(int2.maxWords).toBe(400); // default from state for interpelle
  });

  it('respects user overrides in hierarchy', async () => {
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [
      makeControlledUser('u1', { minWords: 10, maxWords: 50 }),
      makeControlledUser('u2')
    ];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const interventions = result.interventionPlan.interventions;
    const int1 = interventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(10);
    expect(int1.maxWords).toBe(50);
  });

  it('respects archetype limits in hierarchy', async () => {
    (getArchetype as jest.Mock).mockReturnValue({ minWords: 20, maxWords: 150 });
    const users = [
      makeControlledUser('u1', { archetypeId: 'curious' }),
      makeControlledUser('u2')
    ];
    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const interventions = result.interventionPlan.interventions;
    const int1 = interventions.find((i: any) => i.asUserId === 'u1') as MessageDirective;
    expect(int1).toBeDefined();
    expect(int1.minWords).toBe(20);
    expect(int1.maxWords).toBe(150);
  });
});
