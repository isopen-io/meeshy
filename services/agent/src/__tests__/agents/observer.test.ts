import { createObserverNode } from '../../agents/observer';
import type { LlmProvider } from '../../llm/types';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat() {
    return {
      content: JSON.stringify({
        summary: 'Discussion about project deadlines',
        overallTone: 'professional',
        profiles: {
          'user1': {
            tone: 'direct',
            vocabularyLevel: 'courant',
            typicalLength: 'court',
            emojiUsage: 'jamais',
            topicsOfExpertise: ['management'],
            catchphrases: ['Concretement'],
            responseTriggers: ['deadline'],
            silenceTriggers: [],
            commonEmojis: [],
            reactionPatterns: [],
            personaSummary: 'Direct project manager',
          },
        },
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'mock',
      latencyMs: 10,
    };
  },
};

const baseState = {
  conversationId: 'conv1',
  messages: [
    { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'On doit finir le projet', timestamp: Date.now() },
    { id: 'm2', senderId: 'user2', senderName: 'Bob', content: 'OK je m\'en occupe', timestamp: Date.now() },
  ],
  summary: '',
  toneProfiles: {},
  controlledUsers: [],
  triggerContext: null,
  pendingActions: [],
  interventionPlan: null,
  activityScore: 0,
  contextWindowSize: 50,
  agentType: 'personal',
  useFullHistory: false,
  agentHistory: [],
};

describe('Observer Agent', () => {
  it('updates summary from conversation', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe(baseState);
    expect(result.summary).toBe('Discussion about project deadlines');
  });

  it('builds tone profiles', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe(baseState);
    expect(result.toneProfiles).toBeDefined();
    expect(result.toneProfiles!['user1']).toBeDefined();
    expect(result.toneProfiles!['user1'].tone).toBe('direct');
  });

  it('does not modify locked profiles', async () => {
    const observe = createObserverNode(mockLlm);
    const stateWithLocked = {
      ...baseState,
      toneProfiles: {
        'user1': {
          userId: 'user1', displayName: 'Alice', origin: 'observed' as const,
          personaSummary: 'Locked profile', tone: 'original', vocabularyLevel: 'soutenu',
          typicalLength: 'long', emojiUsage: 'abondant', topicsOfExpertise: [],
          topicsAvoided: [], relationshipMap: {}, catchphrases: [], responseTriggers: [],
          silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 60, confidence: 1.0, locked: true,
        },
      },
    };
    const result = await observe(stateWithLocked);
    expect(result.toneProfiles!['user1'].tone).toBe('original');
  });

  it('returns empty on empty messages', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe({ ...baseState, messages: [] });
    expect(result).toEqual({ ...baseState, messages: [] });
  });

  it('resolves displayName from messages', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe(baseState);
    expect(result.toneProfiles!['user1'].displayName).toBe('Alice');
  });

  it('increments messagesAnalyzed count', async () => {
    const observe = createObserverNode(mockLlm);
    const result = await observe(baseState);
    expect(result.toneProfiles!['user1'].messagesAnalyzed).toBe(1);
  });

  it('calculates confidence from messagesAnalyzed', async () => {
    const observe = createObserverNode(mockLlm);
    const stateWithExisting = {
      ...baseState,
      toneProfiles: {
        'user1': {
          userId: 'user1', displayName: 'Alice', origin: 'observed' as const,
          personaSummary: '', tone: 'neutre', vocabularyLevel: 'courant',
          typicalLength: 'moyen', emojiUsage: 'occasionnel', topicsOfExpertise: [],
          topicsAvoided: [], relationshipMap: {}, catchphrases: [], responseTriggers: [],
          silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 24, confidence: 0.48, locked: false,
        },
      },
    };
    const result = await observe(stateWithExisting);
    expect(result.toneProfiles!['user1'].messagesAnalyzed).toBe(25);
    expect(result.toneProfiles!['user1'].confidence).toBe(0.5);
  });

  it('locks profile at 50 messages', async () => {
    const observe = createObserverNode(mockLlm);
    const stateWithHighCount = {
      ...baseState,
      toneProfiles: {
        'user1': {
          userId: 'user1', displayName: 'Alice', origin: 'observed' as const,
          personaSummary: '', tone: 'neutre', vocabularyLevel: 'courant',
          typicalLength: 'moyen', emojiUsage: 'occasionnel', topicsOfExpertise: [],
          topicsAvoided: [], relationshipMap: {}, catchphrases: [], responseTriggers: [],
          silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
          messagesAnalyzed: 49, confidence: 0.98, locked: false,
        },
      },
    };
    const result = await observe(stateWithHighCount);
    expect(result.toneProfiles!['user1'].messagesAnalyzed).toBe(50);
    expect(result.toneProfiles!['user1'].confidence).toBe(1.0);
    expect(result.toneProfiles!['user1'].locked).toBe(true);
  });

  it('handles LLM returning invalid JSON gracefully', async () => {
    const badLlm: LlmProvider = {
      name: 'bad',
      async chat() {
        return {
          content: 'not valid json {{{',
          usage: { inputTokens: 10, outputTokens: 5 },
          model: 'bad',
          latencyMs: 10,
        };
      },
    };
    const observe = createObserverNode(badLlm);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const result = await observe(baseState);
    expect(result).toEqual({});
    consoleSpy.mockRestore();
  });

  it('handles LLM throwing an error gracefully', async () => {
    const errorLlm: LlmProvider = {
      name: 'error',
      async chat() {
        throw new Error('Network timeout');
      },
    };
    const observe = createObserverNode(errorLlm);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const result = await observe(baseState);
    expect(result).toEqual({});
    consoleSpy.mockRestore();
  });
});
