import { createQualityGateNode } from '../../agents/quality-gate';
import type { LlmProvider } from '../../llm/types';
import type { PendingMessage, PendingReaction, ControlledUser } from '../../graph/state';

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
    const result = await gate({
      pendingActions: [goodMessage],
      controlledUsers: [controlledUser],
    } as any);
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0].type).toBe('message');
  });

  it('rejects low quality messages', async () => {
    const gate = createQualityGateNode(mockLlm);
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const result = await gate({
      pendingActions: [badMessage],
      controlledUsers: [controlledUser],
    } as any);
    expect(result.pendingActions).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('passes reactions through without LLM check', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingActions: [reaction],
      controlledUsers: [controlledUser],
    } as any);
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0].type).toBe('reaction');
  });

  it('handles empty actions', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingActions: [],
      controlledUsers: [],
    } as any);
    expect(result.pendingActions).toEqual([]);
  });

  it('handles mixed messages and reactions', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingActions: [goodMessage, reaction, badMessage],
      controlledUsers: [controlledUser],
    } as any);
    const messages = result.pendingActions.filter((a: any) => a.type === 'message');
    const reactions = result.pendingActions.filter((a: any) => a.type === 'reaction');
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
    const result = await gate({
      pendingActions: [goodMessage],
      controlledUsers: [controlledUser],
    } as any);
    expect(result.pendingActions).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});
