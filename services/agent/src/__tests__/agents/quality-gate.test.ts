import { createQualityGateNode } from '../../agents/quality-gate';
import type { LlmProvider } from '../../llm/types';
import type { ConversationState, PendingMessage, PendingReaction, ControlledUser } from '../../graph/state';

function makeState(partial: Partial<ConversationState>): ConversationState {
  return {
    conversationId: '',
    messages: [],
    summary: '',
    toneProfiles: {},
    triggerContext: null,
    interventionPlan: null,
    activityScore: 0,
    contextWindowSize: 50,
    agentType: 'personal',
    useFullHistory: false,
    conversationTitle: '',
    conversationDescription: '',
    agentInstructions: '',
    webSearchEnabled: false,
    minWordsPerMessage: 3,
    maxWordsPerMessage: 400,
    generationTemperature: 0.8,
    qualityGateEnabled: true,
    qualityGateMinScore: 0.5,
    minResponsesPerCycle: 2,
    maxResponsesPerCycle: 12,
    reactionsEnabled: true,
    maxReactionsPerCycle: 8,
    agentHistory: [],
    pendingActions: [],
    controlledUsers: [],
    ...partial,
  };
}

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ messages }) {
    const content = messages[0]?.content ?? '';
    const isGood = content.includes('Bonjour');
    return {
      content: JSON.stringify({ coherent: isGood, score: isGood ? 0.9 : 0.2, reason: 'test' }),
      usage: { inputTokens: 10, outputTokens: 10 },
      model: 'mock',
      latencyMs: 5,
    };
  },
};

const controlledUser: ControlledUser = {
  userId: 'user1',
  displayName: 'Bot1',
  systemLanguage: 'fr',
  source: 'manual',
  role: {
    userId: 'user1',
    displayName: 'Bot1',
    origin: 'observed',
    personaSummary: 'Friendly bot',
    tone: 'amical',
    vocabularyLevel: 'courant',
    typicalLength: 'moyen',
    emojiUsage: 'occasionnel',
    topicsOfExpertise: [],
    topicsAvoided: [],
    relationshipMap: {},
    catchphrases: [],
    responseTriggers: [],
    silenceTriggers: [],
    commonEmojis: [],
    reactionPatterns: [],
    messagesAnalyzed: 10,
    confidence: 0.5,
    locked: false,
  },
};

const goodMessage: PendingMessage = {
  type: 'message',
  asUserId: 'user1',
  content: 'Bonjour, comment ca va ?',
  originalLanguage: 'fr',
  mentionedUsernames: [],
  delaySeconds: 30,
  messageSource: 'agent',
};

const badMessage: PendingMessage = {
  type: 'message',
  asUserId: 'user1',
  content: 'Generic response without greeting',
  originalLanguage: 'fr',
  mentionedUsernames: [],
  delaySeconds: 30,
  messageSource: 'agent',
};

const reaction: PendingReaction = {
  type: 'reaction',
  asUserId: 'user1',
  targetMessageId: 'm1',
  emoji: '👍',
  delaySeconds: 5,
};

describe('Quality Gate', () => {
  it('passes good messages through', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate(makeState({
      pendingActions: [goodMessage],
      controlledUsers: [controlledUser],
    }));
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0].type).toBe('message');
  });

  it('rejects low quality messages', async () => {
    const gate = createQualityGateNode(mockLlm);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = await gate(makeState({
      pendingActions: [badMessage],
      controlledUsers: [controlledUser],
    }));
    expect(result.pendingActions).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('passes reactions through without LLM check', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate(makeState({
      pendingActions: [reaction],
      controlledUsers: [controlledUser],
    }));
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0].type).toBe('reaction');
  });

  it('handles empty actions', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate(makeState({
      pendingActions: [],
      controlledUsers: [],
    }));
    expect(result.pendingActions).toEqual([]);
  });

  it('handles mixed messages and reactions', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate(makeState({
      pendingActions: [goodMessage, reaction, badMessage],
      controlledUsers: [controlledUser],
    }));
    const messages = result.pendingActions.filter((a): a is PendingMessage => a.type === 'message');
    const reactions = result.pendingActions.filter((a): a is PendingReaction => a.type === 'reaction');
    expect(messages).toHaveLength(1);
    expect(reactions).toHaveLength(1);
  });

  it('handles LLM error gracefully by skipping message', async () => {
    const errorLlm: LlmProvider = {
      name: 'error-mock',
      async chat() { throw new Error('LLM unavailable'); },
    };
    const gate = createQualityGateNode(errorLlm);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const result = await gate(makeState({
      pendingActions: [goodMessage],
      controlledUsers: [controlledUser],
    }));
    expect(result.pendingActions).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  describe('deterministic checks', () => {
    it('rejects message with @@username (double arobase)', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const msg: PendingMessage = { ...goodMessage, content: 'Salut @@atabeth comment tu vas ?' };
      const result = await gate(makeState({ pendingActions: [msg], controlledUsers: [controlledUser] }));
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message that reveals AI identity', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const msg: PendingMessage = { ...goodMessage, content: "En tant qu'IA je pense que..." };
      const result = await gate(makeState({ pendingActions: [msg], controlledUsers: [controlledUser] }));
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects empty message', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const msg: PendingMessage = { ...goodMessage, content: '   ' };
      const result = await gate(makeState({ pendingActions: [msg], controlledUsers: [controlledUser] }));
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message below minWordsPerMessage', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const msg: PendingMessage = { ...goodMessage, content: 'Ok' };
      const result = await gate(makeState({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 5,
        maxWordsPerMessage: 400,
        qualityGateEnabled: true,
        qualityGateMinScore: 0.5,
      }));
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('rejects message above maxWordsPerMessage', async () => {
      const gate = createQualityGateNode(mockLlm);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const longContent = 'mot '.repeat(10).trim();
      const msg: PendingMessage = { ...goodMessage, content: 'Bonjour ' + longContent };
      const result = await gate(makeState({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 3,
        maxWordsPerMessage: 5,
        qualityGateEnabled: true,
        qualityGateMinScore: 0.5,
      }));
      expect(result.pendingActions).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it('skips LLM check when qualityGateEnabled is false', async () => {
      const neverCalledLlm: LlmProvider = {
        name: 'never',
        async chat() { throw new Error('LLM should not be called'); },
      };
      const gate = createQualityGateNode(neverCalledLlm);
      const msg: PendingMessage = { ...goodMessage, content: 'Bonjour tout le monde comment vous allez ?' };
      const result = await gate(makeState({
        pendingActions: [msg],
        controlledUsers: [controlledUser],
        minWordsPerMessage: 3,
        maxWordsPerMessage: 400,
        qualityGateEnabled: false,
        qualityGateMinScore: 0.5,
      }));
      expect(result.pendingActions).toHaveLength(1);
    });
  });
});
