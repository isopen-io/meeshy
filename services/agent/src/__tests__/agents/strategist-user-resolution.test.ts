import { createStrategistNode } from '../../agents/strategist';
import { getArchetype } from '@meeshy/shared/agent/archetypes';

jest.mock('@meeshy/shared/agent/archetypes', () => ({
  getArchetype: jest.fn(),
}));

// Reproduces the 2026-05-30 production regression: gpt-4o-mini returns the
// `asUserId` field as a displayName / username instead of the 24-hex Mongo id,
// and validateInterventions silently dropped every such message → the agent
// produced reactions only. The strategist must resolve those references back to
// the canonical controlled-user id.
describe('Strategist — asUserId resolution (id / displayName / username)', () => {
  const makeState = (controlledUsers: any[]): any => ({
    conversationId: 'conv1',
    controlledUsers,
    messages: [{ id: 'm1', senderId: 'real', senderName: 'Alice', senderUsername: 'alice', content: 'hello', timestamp: Date.now() }],
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
    useFullHistory: false,
  });

  const makeUser = (id: string, displayName: string, username: string) => ({
    userId: id,
    displayName,
    username,
    role: {
      userId: id, personaSummary: '', tone: 'neutre', vocabularyLevel: 'courant',
      typicalLength: 'moyen', emojiUsage: 'occasionnel',
      topicsOfExpertise: [], topicsAvoided: [], relationshipMap: {}, catchphrases: [],
      responseTriggers: [], silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 0, confidence: 0.5, locked: false,
    },
  });

  it('resolves asUserId returned as displayName or username to the canonical user id', async () => {
    const llm = {
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'relance',
          interventions: [
            { type: 'message', asUserId: 'Grâce Salem', topic: 'IA', delayCategory: 'short' },
            { type: 'message', asUserId: 'inocentguesseu', topic: 'Tech', replyToMessageId: 'm1', delayCategory: 'medium' },
          ],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'gpt-4o-mini',
      }),
    };
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [
      makeUser('6905ccaa0dc3cf73f7a31037', 'Grâce Salem', 'gsalem'),
      makeUser('68f76b6fa3d995a7322a88d0', 'Innocent Guess', 'inocentguesseu'),
    ];

    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const msgs = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m: any) => m.asUserId).sort()).toEqual(
      ['6905ccaa0dc3cf73f7a31037', '68f76b6fa3d995a7322a88d0'].sort(),
    );
  });

  it('resolves asUserId despite whitespace differences (LLM splits/joins names)', async () => {
    const llm = {
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'relance',
          interventions: [
            // username is "inocentguesseu" (no space) — LLM emitted it with a space
            { type: 'message', asUserId: 'inocent guesseu', topic: 'Android', delayCategory: 'short' },
          ],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'gpt-4o-mini',
      }),
    };
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [makeUser('68f76b6fa3d995a7322a88d0', 'Innocent Guess', 'inocentguesseu')];

    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const msgs = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].asUserId).toBe('68f76b6fa3d995a7322a88d0');
  });

  it('still drops interventions whose asUserId matches no controlled user', async () => {
    const llm = {
      chat: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'relance',
          interventions: [
            { type: 'message', asUserId: 'Ghost User', topic: 'IA', delayCategory: 'short' },
          ],
        }),
        usage: { inputTokens: 1, outputTokens: 1 },
        model: 'gpt-4o-mini',
      }),
    };
    (getArchetype as jest.Mock).mockReturnValue(null);
    const users = [makeUser('6905ccaa0dc3cf73f7a31037', 'Grâce Salem', 'gsalem')];

    const strategist = createStrategistNode(llm as any);
    const result = await strategist(makeState(users));

    const msgs = result.interventionPlan.interventions.filter((i: any) => i.type === 'message');
    expect(msgs).toHaveLength(0);
  });
});
