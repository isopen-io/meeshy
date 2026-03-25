import { ConversationScanner } from '../../scheduler/conversation-scanner';

function makeMessage(overrides: Partial<{ id: string; senderId: string; senderName: string; content: string }> = {}) {
  return {
    id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello world', timestamp: Date.now(),
    ...overrides,
  };
}

function makeControlledUser(id = 'bot1', source = 'manual' as const) {
  return {
    userId: id,
    displayName: 'Bot',
    username: id,
    systemLanguage: 'fr',
    source,
    role: {
      userId: id, displayName: 'Bot', origin: 'archetype' as const, personaSummary: '', tone: 'neutre',
      vocabularyLevel: 'courant', typicalLength: 'court', emojiUsage: 'jamais',
      topicsOfExpertise: [], topicsAvoided: [], relationshipMap: {}, catchphrases: [],
      responseTriggers: [], silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 10, confidence: 0.8, locked: false,
    },
  };
}

function makePotentialUser(id: string) {
  return {
    id,
    displayName: 'Potential ' + id,
    username: 'user_' + id,
    systemLanguage: 'fr',
    agentGlobalProfile: {
      personaSummary: 'Global persona',
      tone: 'enthousiaste',
      vocabularyLevel: 'courant',
      typicalLength: 'moyen',
      emojiUsage: 'occasionnel',
      topicsOfExpertise: ['AI'],
      topicsAvoided: [],
      catchphrases: ['Hello!'],
      commonEmojis: ['🤖'],
      reactionPatterns: ['👍'],
      messagesAnalyzed: 20,
      confidence: 0.9,
      locked: false,
    }
  };
}

function makePersistence(overrides: Record<string, jest.Mock> = {}) {
  return {
    getRecentMessageCount: jest.fn().mockResolvedValue(1),
    getRecentUniqueAuthors: jest.fn().mockResolvedValue(1),
    getControlledUsers: jest.fn().mockResolvedValue([makeControlledUser()]),
    getAgentConfig: jest.fn().mockResolvedValue({
      autoPickupEnabled: true,
      maxControlledUsers: 3,
      inactivityThresholdHours: 72,
      excludedRoles: [],
      excludedUserIds: [],
    }),
    getConversationContext: jest.fn().mockResolvedValue({ title: 'Test', description: null }),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    getPotentialControlledUsers: jest.fn().mockResolvedValue([]),
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
    getAgentHistory: jest.fn().mockResolvedValue([]),
    setAgentHistory: jest.fn().mockResolvedValue(undefined),
    getTodayActiveUserIds: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeRedis() {
  return { set: jest.fn().mockResolvedValue('1'), del: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null) } as any;
}

describe('ConversationScanner — Dynamic User Pickup', () => {
  it('includes potential users when autoPickupEnabled is true and capacity remains', async () => {
    const graph = { invoke: jest.fn().mockResolvedValue({ pendingActions: [] }) };
    const persistence = makePersistence({
      getPotentialControlledUsers: jest.fn().mockResolvedValue([makePotentialUser('p1'), makePotentialUser('p2')]),
    });

    const scanner = new ConversationScanner(
      graph,
      persistence,
      makeStateManager(),
      { enqueue: jest.fn() } as any,
      makeRedis(),
      { getGlobalConfig: jest.fn().mockResolvedValue(null) } as any,
      {
        canSendMessage: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
        canBurst: jest.fn().mockResolvedValue({ allowed: true }),
        getTodayStats: jest.fn().mockResolvedValue({ messagesUsed: 0, usersActive: 0 }),
      } as any
    );

    await scanner.scanConversation('conv-1');

    expect(persistence.getPotentialControlledUsers).toHaveBeenCalledWith('conv-1', 2, 72, [], []);
    const invokeArgs = graph.invoke.mock.calls[0][0];
    expect(invokeArgs.controlledUsers).toHaveLength(3); // 1 manual + 2 potential
    expect(invokeArgs.controlledUsers.find((u: any) => u.source === 'auto_rule')).toBeDefined();
    expect(invokeArgs.controlledUsers.find((u: any) => u.userId === 'p1').role.tone).toBe('enthousiaste');
  });

  it('does not include potential users if autoPickupEnabled is false', async () => {
    const graph = { invoke: jest.fn().mockResolvedValue({ pendingActions: [] }) };
    const persistence = makePersistence({
      getAgentConfig: jest.fn().mockResolvedValue({ autoPickupEnabled: false, maxControlledUsers: 5 }),
    });

    const scanner = new ConversationScanner(graph, persistence, makeStateManager(), { enqueue: jest.fn() } as any, makeRedis(), { getGlobalConfig: jest.fn().mockResolvedValue(null) } as any, {
      canSendMessage: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
      canBurst: jest.fn().mockResolvedValue({ allowed: true }),
      getTodayStats: jest.fn().mockResolvedValue({ messagesUsed: 0, usersActive: 0 }),
    } as any);

    await scanner.scanConversation('conv-1');

    expect(persistence.getPotentialControlledUsers).not.toHaveBeenCalled();
    const invokeArgs = graph.invoke.mock.calls[0][0];
    expect(invokeArgs.controlledUsers).toHaveLength(1);
  });
});
