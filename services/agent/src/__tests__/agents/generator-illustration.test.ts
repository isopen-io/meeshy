import { createGeneratorNode } from '../../agents/generator';
import type { ConversationState, ControlledUser, MessageDirective, ToneProfile } from '../../graph/state';
import type { LlmChatParams, LlmChatResponse, LlmProvider } from '../../llm/types';

function makeProfile(overrides: Partial<ToneProfile> = {}): ToneProfile {
  return {
    userId: 'u1',
    displayName: 'Mireille',
    origin: 'archetype',
    archetypeId: 'gossip',
    personaSummary: 'Reine du kongossa',
    tone: 'complice',
    vocabularyLevel: 'familier',
    typicalLength: 'court',
    emojiUsage: 'abondant',
    topicsOfExpertise: ['faits divers'],
    topicsAvoided: [],
    relationshipMap: {},
    catchphrases: [],
    responseTriggers: [],
    silenceTriggers: [],
    commonEmojis: [],
    reactionPatterns: [],
    messagesAnalyzed: 0,
    confidence: 0.4,
    locked: false,
    ...overrides,
  };
}

function makeUser(overrides: Partial<ControlledUser> = {}): ControlledUser {
  return {
    userId: 'u1',
    displayName: 'Mireille',
    username: 'mireille',
    systemLanguage: 'fr',
    source: 'auto_rule',
    role: makeProfile(),
    ...overrides,
  };
}

function makeDirective(overrides: Partial<MessageDirective> = {}): MessageDirective {
  return {
    type: 'message',
    asUserId: 'u1',
    topic: 'Un fait divers à Douala',
    mentionUsernames: [],
    delaySeconds: 30,
    delayCategory: 'short',
    topicCategory: 'faits_divers_cameroun',
    needsWebSearch: true,
    searchHint: 'faits divers Douala cette semaine',
    ...overrides,
  };
}

function makeState(directive: MessageDirective, overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'conv-1',
    messages: [
      { id: 'm1', senderId: 'human-1', senderName: 'Paul', content: 'Salut le groupe', timestamp: Date.now() - 60_000, originalLanguage: 'fr' },
    ],
    summary: '',
    toneProfiles: {},
    controlledUsers: [makeUser()],
    triggerContext: null,
    pendingActions: [],
    interventionPlan: { shouldIntervene: true, reason: 'test', interventions: [directive] },
    activityScore: 0,
    contextWindowSize: 50,
    agentType: 'animator',
    useFullHistory: false,
    conversationTitle: 'Les amis de Douala',
    conversationDescription: '',
    agentInstructions: '',
    webSearchEnabled: true,
    minWordsPerMessage: 1,
    maxWordsPerMessage: 500,
    generationTemperature: 0.8,
    qualityGateEnabled: true,
    qualityGateMinScore: 0.5,
    minResponsesPerCycle: 1,
    maxResponsesPerCycle: 4,
    reactionsEnabled: true,
    maxReactionsPerCycle: 2,
    budgetRemaining: 5,
    todayUsersActive: 0,
    maxUsersToday: 4,
    burstMode: false,
    burstSize: 2,
    prioritizeTaggedUsers: true,
    prioritizeRepliedUsers: true,
    reactionBoostFactor: 1.5,
    agentHistory: [],
    todayActiveUserIds: [],
    lastAgentUserId: null,
    recentTopicCategories: [],
    engagementData: [],
    scheduledActions: [],
    minDelayMinutes: 1,
    maxDelayMinutes: 360,
    spreadOverDayEnabled: true,
    maxMessagesPerUserPer10Min: 4,
    freshTopicProbability: 0.2,
    freshTopicCategoryHints: [],
    freshTopicBlockedSlugs: [],
    ...overrides,
  } as ConversationState;
}

function makeLlm(response: Partial<LlmChatResponse>): LlmProvider & { calls: LlmChatParams[] } {
  const calls: LlmChatParams[] = [];
  return {
    name: 'fake',
    calls,
    async chat(params: LlmChatParams): Promise<LlmChatResponse> {
      calls.push(params);
      return {
        content: 'Vous avez vu ce qui s\'est passé à Bonabéri ? 😳',
        usage: { inputTokens: 10, outputTokens: 10 },
        model: 'fake',
        latencyMs: 1,
        ...response,
      };
    },
  };
}

const ARTICLE = { url: 'https://www.camerounweb.com/faits-divers/bonaberi-123', title: 'Bonabéri : ...' };

describe('generator — illustration of a fresh topic', () => {
  it('attaches the first web citation as the illustration source of a message that OPENS a topic', async () => {
    const llm = makeLlm({ citations: [ARTICLE, { url: 'https://example.org/other' }] });
    const directive = makeDirective();
    const result = await createGeneratorNode(llm)(makeState(directive));
    const [message] = result.pendingActions;
    expect(message.type).toBe('message');
    expect(message.type === 'message' && message.illustration).toEqual({ sourceUrl: ARTICLE.url });
  });

  it('does not illustrate a REPLY, even when the search returned citations', async () => {
    const llm = makeLlm({ citations: [ARTICLE] });
    const directive = makeDirective({ replyToMessageId: 'm1' });
    const result = await createGeneratorNode(llm)(makeState(directive));
    const [message] = result.pendingActions;
    expect(message.type === 'message' && message.illustration).toBeUndefined();
  });

  it('does not illustrate a message that was not web-searched', async () => {
    const llm = makeLlm({ citations: [ARTICLE] });
    const directive = makeDirective({ needsWebSearch: false, searchHint: undefined });
    const result = await createGeneratorNode(llm)(makeState(directive));
    const [message] = result.pendingActions;
    expect(message.type === 'message' && message.illustration).toBeUndefined();
  });

  it('leaves the message without illustration when the provider returned no citation', async () => {
    const llm = makeLlm({});
    const result = await createGeneratorNode(llm)(makeState(makeDirective()));
    const [message] = result.pendingActions;
    expect(message.type === 'message' && message.illustration).toBeUndefined();
  });

  it('ignores citations that are not http(s) pages', async () => {
    const llm = makeLlm({ citations: [{ url: 'ftp://files.example.org/x' }, { url: 'javascript:alert(1)' }] });
    const result = await createGeneratorNode(llm)(makeState(makeDirective()));
    const [message] = result.pendingActions;
    expect(message.type === 'message' && message.illustration).toBeUndefined();
  });

  it('tells a gossip persona to write like someone sharing what they just read', async () => {
    const llm = makeLlm({ citations: [ARTICLE] });
    await createGeneratorNode(llm)(makeState(makeDirective()));
    const systemPrompt = llm.calls[0]?.systemPrompt ?? '';
    expect(systemPrompt.toLowerCase()).toMatch(/ragot|kongossa|secret/);
  });
});
