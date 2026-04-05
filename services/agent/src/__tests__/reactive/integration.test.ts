import { ReactiveHandler } from '../../reactive/reactive-handler';
import { detectInterpellation } from '../../reactive/interpellation-detector';
import { calculateResponseDelay } from '../../reactive/timing-calculator';
import type { LlmProvider } from '../../llm/types';
import type { ControlledUser, MessageEntry } from '../../graph/state';

function makeControlledUser(userId = 'bot-alice', displayName = 'Alice'): ControlledUser {
  return {
    userId, displayName, username: displayName.toLowerCase(), systemLanguage: 'fr', source: 'manual',
    role: {
      userId, displayName, origin: 'observed',
      personaSummary: 'Friendly dev', tone: 'amical', vocabularyLevel: 'courant',
      typicalLength: 'moyen', emojiUsage: 'occasionnel',
      topicsOfExpertise: ['tech'], topicsAvoided: [],
      relationshipMap: {}, catchphrases: [], responseTriggers: [],
      silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 20, confidence: 0.8, locked: false,
    },
  };
}

describe('Reactive Integration', () => {
  describe('Full flow: mention → triage → generation → enqueue', () => {
    it('processes a mention and enqueues a response with correct timing', async () => {
      const triageResponse = JSON.stringify({
        shouldRespond: true,
        responses: [{ asUserId: 'bot-alice', urgency: 'medium', isGreeting: false,
          needsElaboration: false, suggestedTopic: 'React' }],
      });
      const genResponse = JSON.stringify({
        messages: [{ asUserId: 'bot-alice', content: 'React est top pour ca',
          replyToId: 'msg-1', wordCount: 5, isGreeting: false }],
      });
      let callIndex = 0;
      const llm: LlmProvider = {
        name: 'test',
        chat: jest.fn().mockImplementation(() => {
          const content = callIndex === 0 ? triageResponse : genResponse;
          callIndex++;
          return Promise.resolve({ content, usage: { inputTokens: 100, outputTokens: 50 }, model: 'test', latencyMs: 10 });
        }),
      };

      const queue = {
        enqueue: jest.fn().mockResolvedValue('mock-id'),
        getScheduledForUser: jest.fn().mockResolvedValue([]),
      } as any;
      const persistence = {
        getControlledUsers: jest.fn().mockResolvedValue([makeControlledUser()]),
      } as any;
      const stateManager = {
        getMessages: jest.fn().mockResolvedValue([
          { id: 'msg-0', senderId: 'user-jean', senderName: 'Jean', content: 'Hello', timestamp: Date.now() - 60000 },
        ]),
        getAgentHistory: jest.fn().mockResolvedValue([]),
        setAgentHistory: jest.fn().mockResolvedValue(undefined),
      } as any;

      const handler = new ReactiveHandler(llm, persistence, stateManager, queue);

      await handler.handleInterpellation({
        conversationId: 'conv-integration',
        triggerMessage: { id: 'msg-1', senderId: 'user-jean', senderName: 'Jean',
          content: '@alice avis sur React?', timestamp: Date.now() },
        mentionedUserIds: ['bot-alice'],
        replyToUserId: undefined,
        targetUserIds: ['bot-alice'],
        interpellationType: 'mention',
      });

      // Verify 2 LLM calls
      expect(llm.chat).toHaveBeenCalledTimes(2);
      // Verify enqueue
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      const [convId, action] = queue.enqueue.mock.calls[0];
      expect(convId).toBe('conv-integration');
      expect(action.type).toBe('message');
      expect(action.content).toBe('React est top pour ca');
      expect(action.asUserId).toBe('bot-alice');
      // Verify timing is reasonable (> 0 seconds)
      expect(action.delaySeconds).toBeGreaterThan(0);
      // Verify history was saved
      expect(stateManager.setAgentHistory).toHaveBeenCalledWith('conv-integration', expect.any(Array));
    });
  });

  describe('InterpellationDetector + TimingCalculator integration', () => {
    it('greeting detection produces fast timing', () => {
      const interpellation = detectInterpellation({
        mentionedUserIds: ['bot-alice'],
        replyToUserId: undefined,
        content: 'Salut @alice!',
        controlledUserIds: new Set(['bot-alice']),
      });
      expect(interpellation.detected).toBe(true);
      expect(interpellation.type).toBe('greeting');

      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateResponseDelay({
          interpellationType: interpellation.type,
          wordCount: 2,
          lastUserMessageAgoMs: 60_000,
          unreadMessageCount: 1,
        }));
      }
      const avgDelay = delays.reduce((a, b) => a + b) / delays.length;
      expect(avgDelay).toBeLessThan(40_000); // Greetings < 40s avg
    });

    it('mention detection produces longer timing for inactive user', () => {
      const interpellation = detectInterpellation({
        mentionedUserIds: ['bot-alice'],
        replyToUserId: undefined,
        content: '@alice que penses-tu de cette architecture?',
        controlledUserIds: new Set(['bot-alice']),
      });
      expect(interpellation.detected).toBe(true);

      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateResponseDelay({
          interpellationType: interpellation.type,
          wordCount: 15,
          lastUserMessageAgoMs: 3 * 60 * 60 * 1000, // 3h ago
          unreadMessageCount: 5,
        }));
      }
      const avgDelay = delays.reduce((a, b) => a + b) / delays.length;
      expect(avgDelay).toBeGreaterThan(60_000); // Inactive user > 60s avg
    });
  });

  describe('Queue conflict resolution', () => {
    it('reschedules existing queued message when reactive response arrives', async () => {
      const triageResponse = JSON.stringify({
        shouldRespond: true,
        responses: [{ asUserId: 'bot-alice', urgency: 'high', isGreeting: false,
          needsElaboration: false, suggestedTopic: 'urgent' }],
      });
      const genResponse = JSON.stringify({
        messages: [{ asUserId: 'bot-alice', content: 'Oui!',
          replyToId: 'msg-1', wordCount: 1, isGreeting: false }],
      });
      let callIndex = 0;
      const llm: LlmProvider = {
        name: 'test',
        chat: jest.fn().mockImplementation(() => {
          const content = callIndex === 0 ? triageResponse : genResponse;
          callIndex++;
          return Promise.resolve({ content, usage: { inputTokens: 50, outputTokens: 30 }, model: 'test', latencyMs: 5 });
        }),
      };

      const queue = {
        enqueue: jest.fn().mockResolvedValue('mock-id'),
        getScheduledForUser: jest.fn().mockResolvedValue([{ action: { type: 'message' } }]),
      } as any;
      const persistence = { getControlledUsers: jest.fn().mockResolvedValue([makeControlledUser()]) } as any;
      const stateManager = {
        getMessages: jest.fn().mockResolvedValue([]),
        getAgentHistory: jest.fn().mockResolvedValue([]),
        setAgentHistory: jest.fn().mockResolvedValue(undefined),
      } as any;

      const handler = new ReactiveHandler(llm, persistence, stateManager, queue);

      await handler.handleInterpellation({
        conversationId: 'conv-conflict',
        triggerMessage: { id: 'msg-1', senderId: 'user-1', senderName: 'Jean',
          content: '@alice urgent!', timestamp: Date.now() },
        mentionedUserIds: ['bot-alice'],
        replyToUserId: undefined,
        targetUserIds: ['bot-alice'],
        interpellationType: 'mention',
      });

      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
