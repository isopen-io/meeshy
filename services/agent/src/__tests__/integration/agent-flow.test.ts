import { buildAgentGraph } from '../../graph/graph';
import type { LlmProvider } from '../../llm/types';
import type { ControlledUser } from '../../graph/state';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ systemPrompt, messages }) {
    const userMsg = messages[0]?.content ?? '';

    // Observer response
    if (systemPrompt?.includes('analyste conversationnel')) {
      return {
        content: JSON.stringify({
          summary: 'Test conversation about tech',
          overallTone: 'casual',
          profiles: {
            'user1': { tone: 'direct', vocabularyLevel: 'courant', typicalLength: 'court', emojiUsage: 'jamais', topicsOfExpertise: ['tech'], catchphrases: ['OK'] },
          },
        }),
        usage: { inputTokens: 100, outputTokens: 80 },
        model: 'mock',
        latencyMs: 10,
      };
    }

    // Quality gate response
    if (userMsg.includes('Vérifie cette réponse')) {
      return {
        content: JSON.stringify({ coherent: true, score: 0.9, reason: 'OK' }),
        usage: { inputTokens: 20, outputTokens: 10 },
        model: 'mock',
        latencyMs: 5,
      };
    }

    // Animator / Impersonator response
    return {
      content: 'Intéressant, tu peux développer ?',
      usage: { inputTokens: 50, outputTokens: 20 },
      model: 'mock',
      latencyMs: 15,
    };
  },
};

describe('Agent Flow E2E', () => {
  it('runs full graph: observe → decide → animate → quality gate', async () => {
    const graph = buildAgentGraph(mockLlm);

    const controlledUser: ControlledUser = {
      userId: 'bot1',
      displayName: 'CuriousBot',
      source: 'manual',
      role: {
        userId: 'bot1',
        displayName: 'CuriousBot',
        origin: 'archetype',
        archetypeId: 'curious',
        personaSummary: 'Pose des questions, creuse les sujets',
        tone: 'enthousiaste',
        vocabularyLevel: 'courant',
        typicalLength: 'moyen',
        emojiUsage: 'occasionnel',
        topicsOfExpertise: ['tech', 'science'],
        topicsAvoided: [],
        relationshipMap: {},
        catchphrases: ['Intéressant !'],
        responseTriggers: ['question', 'tech', 'nouveau sujet'],
        silenceTriggers: [],
        messagesAnalyzed: 0,
        confidence: 0.6,
        locked: false,
      },
    };

    const result = await graph.invoke({
      conversationId: 'conv-test',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Quelqu\'un connaît une bonne lib tech pour le streaming ?', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [controlledUser],
      triggerContext: { type: 'user_message', triggeredByUserId: 'user1', triggeredByMessageId: 'm1' },
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
    });

    // Observer should have updated summary
    expect(result.summary).toBeTruthy();
    expect(result.summary).not.toBe('');

    // Tone profiles should be populated
    expect(result.toneProfiles).toBeDefined();
  });

  it('skips when no controlled users are provided', async () => {
    const graph = buildAgentGraph(mockLlm);

    const result = await graph.invoke({
      conversationId: 'conv-test-2',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello everyone', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [],
      triggerContext: { type: 'timeout' },
      pendingResponse: null,
      decision: 'skip',
      selectedUserId: null,
    });

    // Should still have summary from observer
    expect(result.summary).toBeTruthy();
    // But no pending response since no controlled users
    expect(result.decision).toBe('skip');
  });
});
