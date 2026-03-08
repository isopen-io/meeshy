import { buildAgentGraph } from '../../graph/graph';
import type { LlmProvider } from '../../llm/types';
import type { ControlledUser } from '../../graph/state';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ systemPrompt, messages }) {
    const userMsg = messages[0]?.content ?? '';

    if (systemPrompt?.includes('analyste conversationnel')) {
      return {
        content: JSON.stringify({
          summary: 'Test conversation about tech',
          overallTone: 'casual',
          profiles: {
            'user1': {
              tone: 'direct',
              vocabularyLevel: 'courant',
              typicalLength: 'court',
              emojiUsage: 'jamais',
              topicsOfExpertise: ['tech'],
              catchphrases: ['OK'],
              responseTriggers: ['question'],
              silenceTriggers: [],
              commonEmojis: [],
              reactionPatterns: [],
              personaSummary: 'Direct tech user',
            },
          },
        }),
        usage: { inputTokens: 100, outputTokens: 80 },
        model: 'mock',
        latencyMs: 10,
      };
    }

    if (systemPrompt?.includes('orchestrateur')) {
      return {
        content: JSON.stringify({
          shouldIntervene: true,
          reason: 'Conversation needs activity',
          interventions: [
            {
              type: 'message',
              asUserId: 'bot1',
              topic: 'tech streaming libraries',
              replyToMessageId: 'm1',
              mentionUsernames: ['Alice'],
              delaySeconds: 30,
            },
            {
              type: 'reaction',
              asUserId: 'bot1',
              targetMessageId: 'm1',
              emoji: '👍',
              delaySeconds: 5,
            },
          ],
        }),
        usage: { inputTokens: 200, outputTokens: 150 },
        model: 'mock',
        latencyMs: 20,
      };
    }

    if (userMsg.includes('Verifie cette reponse')) {
      return {
        content: JSON.stringify({ coherent: true, score: 0.9, reason: 'OK' }),
        usage: { inputTokens: 20, outputTokens: 10 },
        model: 'mock',
        latencyMs: 5,
      };
    }

    return {
      content: 'Super question ! Je recommande FFmpeg pour le streaming.',
      usage: { inputTokens: 50, outputTokens: 20 },
      model: 'mock',
      latencyMs: 15,
    };
  },
};

describe('Agent Flow E2E', () => {
  it('runs full graph: observe -> strategist -> generator -> qualityGate', async () => {
    const graph = buildAgentGraph(mockLlm);

    const controlledUser: ControlledUser = {
      userId: 'bot1',
      displayName: 'CuriousBot',
      username: 'curiousbot',
      systemLanguage: 'fr',
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
        catchphrases: ['Interessant !'],
        responseTriggers: ['question', 'tech', 'nouveau sujet'],
        silenceTriggers: [],
        commonEmojis: ['🔥', '👀'],
        reactionPatterns: ['👍', '❤️'],
        messagesAnalyzed: 0,
        confidence: 0.6,
        locked: false,
      },
    };

    const result = await graph.invoke({
      conversationId: 'conv-test',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Quelqu\'un connait une bonne lib tech pour le streaming ?', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [controlledUser],
      triggerContext: { type: 'scan' },
      pendingActions: [],
      interventionPlan: null,
      activityScore: 0.2,
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
      conversationTitle: '',
      conversationDescription: '',
      agentInstructions: '',
      webSearchEnabled: false,
      minResponsesPerCycle: 2,
      maxResponsesPerCycle: 12,
      reactionsEnabled: true,
      maxReactionsPerCycle: 8,
    });

    expect(result.summary).toBeTruthy();
    expect(result.summary).not.toBe('');
    expect(result.toneProfiles).toBeDefined();
    expect(result.interventionPlan).toBeDefined();
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
      triggerContext: { type: 'scan' },
      pendingActions: [],
      interventionPlan: null,
      activityScore: 0.2,
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
      conversationTitle: '',
      conversationDescription: '',
      agentInstructions: '',
      webSearchEnabled: false,
      minResponsesPerCycle: 2,
      maxResponsesPerCycle: 12,
      reactionsEnabled: true,
      maxReactionsPerCycle: 8,
    });

    expect(result.summary).toBeTruthy();
    expect(result.interventionPlan?.shouldIntervene).toBe(false);
    expect(result.pendingActions).toEqual([]);
  });

  it('skips when activity score is too high', async () => {
    const graph = buildAgentGraph(mockLlm);

    const controlledUser: ControlledUser = {
      userId: 'bot1',
      displayName: 'Bot',
      username: 'bot1',
      systemLanguage: 'fr',
      source: 'manual',
      role: {
        userId: 'bot1',
        displayName: 'Bot',
        origin: 'observed',
        personaSummary: 'Test bot',
        tone: 'neutre',
        vocabularyLevel: 'courant',
        typicalLength: 'court',
        emojiUsage: 'jamais',
        topicsOfExpertise: [],
        topicsAvoided: [],
        relationshipMap: {},
        catchphrases: [],
        responseTriggers: [],
        silenceTriggers: [],
        commonEmojis: [],
        reactionPatterns: [],
        messagesAnalyzed: 0,
        confidence: 0.5,
        locked: false,
      },
    };

    const result = await graph.invoke({
      conversationId: 'conv-active',
      messages: [
        { id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello', timestamp: Date.now() },
      ],
      summary: '',
      toneProfiles: {},
      controlledUsers: [controlledUser],
      triggerContext: { type: 'scan' },
      pendingActions: [],
      interventionPlan: null,
      activityScore: 0.9,
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
      conversationTitle: '',
      conversationDescription: '',
      agentInstructions: '',
      webSearchEnabled: false,
      minResponsesPerCycle: 2,
      maxResponsesPerCycle: 12,
      reactionsEnabled: true,
      maxReactionsPerCycle: 8,
    });

    expect(result.interventionPlan?.shouldIntervene).toBe(false);
    expect(result.pendingActions).toEqual([]);
  });
});
