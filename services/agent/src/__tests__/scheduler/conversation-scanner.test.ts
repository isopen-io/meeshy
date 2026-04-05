import { ConversationScanner } from '../../scheduler/conversation-scanner';

function makeMessage(overrides: Partial<{ id: string; senderId: string; senderName: string; content: string }> = {}) {
  return {
    id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello world', timestamp: Date.now(),
    ...overrides,
  };
}

function makeControlledUser(confidence = 0.8) {
  return {
    userId: 'bot1',
    displayName: 'Bot',
    username: 'bot1',
    systemLanguage: 'fr',
    source: 'manual' as const,
    role: {
      userId: 'bot1', displayName: 'Bot', origin: 'archetype' as const, personaSummary: '', tone: 'neutre',
      vocabularyLevel: 'courant', typicalLength: 'court', emojiUsage: 'jamais',
      topicsOfExpertise: [], topicsAvoided: [], relationshipMap: {}, catchphrases: [],
      responseTriggers: [], silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 10, confidence, locked: false,
    },
  };
}

function makePersistence(overrides: Record<string, jest.Mock> = {}) {
  return {
    getRecentMessageCount: jest.fn().mockResolvedValue(1),
    getRecentUniqueAuthors: jest.fn().mockResolvedValue(1),
    getControlledUsers: jest.fn().mockResolvedValue([makeControlledUser()]),
    getAgentConfig: jest.fn().mockResolvedValue({
      scanIntervalMinutes: 3,
      minResponsesPerCycle: 2,
      maxResponsesPerCycle: 12,
      reactionsEnabled: true,
      maxReactionsPerCycle: 8,
      contextWindowSize: 50,
      useFullHistory: false,
      agentType: 'personal',
      inactivityThresholdHours: 30,
      excludedRoles: [],
      excludedUserIds: [],
      agentInstructions: null,
      webSearchEnabled: false,
      minWordsPerMessage: 3,
      maxWordsPerMessage: 400,
      generationTemperature: 0.8,
      qualityGateEnabled: true,
      qualityGateMinScore: 0.5,
      weekdayMaxMessages: 10,
      weekendMaxMessages: 25,
      weekdayMaxUsers: 4,
      weekendMaxUsers: 8,
      burstEnabled: true,
      burstSize: 4,
      burstIntervalMinutes: 5,
      quietIntervalMinutes: 90,
      inactivityDaysThreshold: 3,
      prioritizeTaggedUsers: true,
      prioritizeRepliedUsers: true,
      reactionBoostFactor: 1.5,
    }),
    getConversationContext: jest.fn().mockResolvedValue({ title: 'Test', description: null }),
    getConversationWithType: jest.fn().mockResolvedValue({ type: 'group', title: 'Test' }),
    getAgentMessageEngagement: jest.fn().mockResolvedValue([]),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getPotentialControlledUsers: jest.fn().mockResolvedValue([]),
    getLeastActiveParticipants: jest.fn().mockResolvedValue([]),
    updateAnalytics: jest.fn().mockResolvedValue(undefined),
    upsertUserRole: jest.fn().mockResolvedValue(undefined),
    createScanLog: jest.fn().mockResolvedValue(undefined),
    updateScanStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function makeStateManager(messages = [makeMessage()]) {
  return {
    getMessages: jest.fn().mockResolvedValue(messages),
    getSummary: jest.fn().mockResolvedValue(''),
    getToneProfiles: jest.fn().mockResolvedValue({}),
    setSummary: jest.fn().mockResolvedValue(undefined),
    setToneProfiles: jest.fn().mockResolvedValue(undefined),
    setMessages: jest.fn().mockResolvedValue(undefined),
    getAgentHistory: jest.fn().mockResolvedValue([]),
    setAgentHistory: jest.fn().mockResolvedValue(undefined),
    getTodayActiveUserIds: jest.fn().mockResolvedValue([]),
    isOnCooldown: jest.fn().mockResolvedValue(false),
    getLastAgentUserId: jest.fn().mockResolvedValue(null),
    setLastAgentUserId: jest.fn().mockResolvedValue(undefined),
    getEngagementData: jest.fn().mockResolvedValue([]),
    setEngagementData: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeRedis() {
  return { set: jest.fn().mockResolvedValue('1'), del: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null) } as any;
}

function makeDeliveryQueue() {
  return { enqueue: jest.fn().mockResolvedValue('mock-id'), getScheduledTopicsForConversation: jest.fn().mockResolvedValue([]) } as any;
}

function makeConfigCache() {
  return { getConfig: jest.fn().mockResolvedValue(null), getGlobalConfig: jest.fn().mockResolvedValue(null) } as any;
}

function makeBudgetManager() {
  return {
    canSendMessage: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, current: 0, max: 10 }),
    canBurst: jest.fn().mockResolvedValue({ allowed: true, minutesUntilNext: 0 }),
    canAddUser: jest.fn().mockResolvedValue({ allowed: true, current: 0, max: 4 }),
    recordMessage: jest.fn().mockResolvedValue(undefined),
    recordBurst: jest.fn().mockResolvedValue(undefined),
    getTodayStats: jest.fn().mockResolvedValue({ messagesUsed: 0, usersActive: 0, isWeekend: false }),
  } as any;
}

describe('ConversationScanner — analytics upsert after cycle', () => {
  it('calls persistence.updateAnalytics after graph produces message actions', async () => {
    const pendingMessage = {
      type: 'message' as const, asUserId: 'bot1', content: 'Salut tout le monde',
      originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 10, delayCategory: 'short' as const,
      topicCategory: 'general', topicHash: 'abc12345', messageSource: 'agent' as const,
    };
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        summary: 'Updated summary', toneProfiles: {},
        controlledUsers: [makeControlledUser(0.8)],
        pendingActions: [pendingMessage],
      }),
    };
    const persistence = makePersistence();
    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(persistence.updateAnalytics).toHaveBeenCalledWith('conv-1', {
      messagesSent: 1,
      wordsSent: 4,
      avgConfidence: 0.8,
    });
  });

  it('does not call updateAnalytics when graph produces only reactions', async () => {
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        summary: '', toneProfiles: {},
        controlledUsers: [makeControlledUser()],
        pendingActions: [{ type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍', delaySeconds: 5, delayCategory: 'immediate' as const, topicCategory: 'reaction', topicHash: 'rxn12345' }],
      }),
    };
    const persistence = makePersistence();
    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(persistence.updateAnalytics).not.toHaveBeenCalled();
  });

  it('does not call updateAnalytics when graph produces no pending actions', async () => {
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        summary: 'Some summary', toneProfiles: {},
        controlledUsers: [makeControlledUser()], pendingActions: [],
      }),
    };
    const persistence = makePersistence();
    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(persistence.updateAnalytics).not.toHaveBeenCalled();
  });

  it('computes avgConfidence as average across all controlled users', async () => {
    const pendingMessage = {
      type: 'message' as const, asUserId: 'bot1', content: 'Un message',
      originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 5, delayCategory: 'immediate' as const,
      topicCategory: 'general', topicHash: 'abc12345', messageSource: 'agent' as const,
    };
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        summary: '', toneProfiles: {},
        controlledUsers: [makeControlledUser(0.6), makeControlledUser(0.4)],
        pendingActions: [pendingMessage],
      }),
    };
    const persistence = makePersistence();
    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(persistence.updateAnalytics.mock.calls[0][1].avgConfidence).toBeCloseTo(0.5, 5);
  });

  it('counts words correctly across multiple message actions', async () => {
    const messages = [
      { type: 'message' as const, asUserId: 'bot1', content: 'Hello world', originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 5, delayCategory: 'immediate' as const, topicCategory: 'general', topicHash: 'hash1', messageSource: 'agent' as const },
      { type: 'message' as const, asUserId: 'bot1', content: 'Au revoir tout le monde', originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 10, delayCategory: 'short' as const, topicCategory: 'farewell', topicHash: 'hash2', messageSource: 'agent' as const },
    ];
    const graph = {
      invoke: jest.fn().mockResolvedValue({
        summary: '', toneProfiles: {},
        controlledUsers: [makeControlledUser(1.0)], pendingActions: messages,
      }),
    };
    const persistence = makePersistence();
    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    const callArgs = persistence.updateAnalytics.mock.calls[0][1];
    expect(callArgs.messagesSent).toBe(2);
    expect(callArgs.wordsSent).toBe(7);
  });

  it('skips processing when no controlled users are configured', async () => {
    const graph = { invoke: jest.fn() };
    const persistence = makePersistence({ getControlledUsers: jest.fn().mockResolvedValue([]) });
    const scanner = new ConversationScanner(graph as any, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(graph.invoke).not.toHaveBeenCalled();
    expect(persistence.updateAnalytics).not.toHaveBeenCalled();
  });

  it('invokes graph with budgetRemaining=0 during burst cooldown (observation still runs)', async () => {
    const graph = { invoke: jest.fn().mockResolvedValue({ summary: 'obs', toneProfiles: {}, pendingActions: [] }) };
    const persistence = makePersistence();
    const budgetManager = makeBudgetManager();
    budgetManager.canBurst = jest.fn().mockResolvedValue({ allowed: false, minutesUntilNext: 45 });

    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), budgetManager);

    await scanner.scanConversation('conv-1');

    expect(graph.invoke).toHaveBeenCalled();
    const invokeArgs = graph.invoke.mock.calls[0][0];
    expect(invokeArgs.budgetRemaining).toBe(0);
  });

  it('invokes graph with budgetRemaining=0 when daily budget exhausted (observation still runs)', async () => {
    const graph = { invoke: jest.fn().mockResolvedValue({ summary: 'obs', toneProfiles: {}, pendingActions: [] }) };
    const persistence = makePersistence();
    const budgetManager = makeBudgetManager();
    budgetManager.canSendMessage = jest.fn().mockResolvedValue({ allowed: false, remaining: 0, current: 10, max: 10 });

    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), budgetManager);

    await scanner.scanConversation('conv-1');

    expect(graph.invoke).toHaveBeenCalled();
    const invokeArgs = graph.invoke.mock.calls[0][0];
    expect(invokeArgs.budgetRemaining).toBe(0);
  });

  it('skips processing when conversation is very active', async () => {
    const graph = { invoke: jest.fn() };
    const persistence = makePersistence({
      getRecentMessageCount: jest.fn().mockResolvedValue(8),
      getRecentUniqueAuthors: jest.fn().mockResolvedValue(3),
    });
    const scanner = new ConversationScanner(graph as any, persistence, makeStateManager(), makeDeliveryQueue(), makeRedis(), makeConfigCache(), makeBudgetManager());

    await scanner.scanConversation('conv-1');

    expect(graph.invoke).not.toHaveBeenCalled();
  });
});
