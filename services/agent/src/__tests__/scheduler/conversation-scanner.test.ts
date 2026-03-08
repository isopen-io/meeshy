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
      inactivityThresholdHours: 72,
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
    getRecentMessages: jest.fn().mockResolvedValue([]),
    updateAnalytics: jest.fn().mockResolvedValue(undefined),
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
  } as any;
}

function makeRedis() {
  return { set: jest.fn().mockResolvedValue('1'), del: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null) } as any;
}

function makeDeliveryQueue() {
  return { enqueue: jest.fn() } as any;
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
      originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 10, messageSource: 'agent' as const,
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
        pendingActions: [{ type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍', delaySeconds: 5 }],
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
      originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 5, messageSource: 'agent' as const,
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
      { type: 'message' as const, asUserId: 'bot1', content: 'Hello world', originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 5, messageSource: 'agent' as const },
      { type: 'message' as const, asUserId: 'bot1', content: 'Au revoir tout le monde', originalLanguage: 'fr', mentionedUsernames: [], delaySeconds: 10, messageSource: 'agent' as const },
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
