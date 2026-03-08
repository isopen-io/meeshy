import { ReactiveHandler } from '../../reactive/reactive-handler';
import type { LlmProvider } from '../../llm/types';
import type { ControlledUser, MessageEntry } from '../../graph/state';

function makeLlm(responses: string[]): LlmProvider {
  let callIndex = 0;
  return {
    name: 'test',
    chat: jest.fn().mockImplementation(() => {
      const content = responses[callIndex] ?? '{}';
      callIndex++;
      return Promise.resolve({
        content,
        usage: { inputTokens: 100, outputTokens: 50 },
        model: 'test',
        latencyMs: 10,
      });
    }),
  };
}

function makeControlledUser(userId = 'bot-alice'): ControlledUser {
  return {
    userId,
    displayName: 'Alice Bot',
    username: 'alice',
    systemLanguage: 'fr',
    source: 'manual',
    role: {
      userId, displayName: 'Alice Bot', origin: 'observed',
      personaSummary: 'Friendly', tone: 'amical', vocabularyLevel: 'courant',
      typicalLength: 'moyen', emojiUsage: 'occasionnel',
      topicsOfExpertise: ['tech'], topicsAvoided: [],
      relationshipMap: {}, catchphrases: [], responseTriggers: [],
      silenceTriggers: [], commonEmojis: [], reactionPatterns: [],
      messagesAnalyzed: 20, confidence: 0.8, locked: false,
    },
  };
}

function makeTriggerMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
  return {
    id: 'msg-trigger', senderId: 'real-user-1', senderName: 'Jean',
    content: '@alice avis sur React?', timestamp: Date.now(),
    ...overrides,
  };
}

function makePersistence() {
  return {
    getControlledUsers: jest.fn().mockResolvedValue([makeControlledUser()]),
    getRecentMessageCount: jest.fn().mockResolvedValue(1),
  } as any;
}

function makeStateManager(messages: MessageEntry[] = []) {
  return {
    getMessages: jest.fn().mockResolvedValue(messages),
    getAgentHistory: jest.fn().mockResolvedValue([]),
    setAgentHistory: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeDeliveryQueue() {
  return {
    enqueue: jest.fn(),
    getScheduledForUser: jest.fn().mockReturnValue([]),
    rescheduleForUser: jest.fn().mockReturnValue(0),
  } as any;
}

describe('ReactiveHandler', () => {
  it('handles mention with triage + generation (2 LLM calls)', async () => {
    const triageResponse = JSON.stringify({
      shouldRespond: true,
      responses: [{ asUserId: 'bot-alice', urgency: 'medium', isGreeting: false,
        needsElaboration: false, suggestedTopic: 'React' }],
    });
    const genResponse = JSON.stringify({
      messages: [{ asUserId: 'bot-alice', content: 'React est vraiment top pour les interfaces',
        replyToId: 'msg-trigger', wordCount: 7, isGreeting: false }],
    });
    const llm = makeLlm([triageResponse, genResponse]);
    const queue = makeDeliveryQueue();
    const handler = new ReactiveHandler(llm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: makeTriggerMessage(),
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      targetUserIds: ['bot-alice'],
      interpellationType: 'mention',
    });

    expect(llm.chat).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const enqueuedActions = queue.enqueue.mock.calls[0][1];
    expect(enqueuedActions).toHaveLength(1);
    expect(enqueuedActions[0].content).toBe('React est vraiment top pour les interfaces');
  });

  it('skips when triage says shouldRespond=false', async () => {
    const triageResponse = JSON.stringify({ shouldRespond: false, reason: 'not relevant' });
    const llm = makeLlm([triageResponse]);
    const queue = makeDeliveryQueue();
    const handler = new ReactiveHandler(llm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: makeTriggerMessage({ content: '@alice lol' }),
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      targetUserIds: ['bot-alice'],
      interpellationType: 'mention',
    });

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('reschedules existing queued messages when user has pending items', async () => {
    const triageResponse = JSON.stringify({
      shouldRespond: true,
      responses: [{ asUserId: 'bot-alice', urgency: 'high', isGreeting: false,
        needsElaboration: false, suggestedTopic: 'urgent' }],
    });
    const genResponse = JSON.stringify({
      messages: [{ asUserId: 'bot-alice', content: 'Oui bien sûr!',
        replyToId: 'msg-trigger', wordCount: 3, isGreeting: false }],
    });
    const llm = makeLlm([triageResponse, genResponse]);
    const queue = makeDeliveryQueue();
    queue.getScheduledForUser.mockReturnValue([{ action: { type: 'message' }, conversationId: 'conv1' }]);
    const handler = new ReactiveHandler(llm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: makeTriggerMessage(),
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      targetUserIds: ['bot-alice'],
      interpellationType: 'mention',
    });

    expect(queue.rescheduleForUser).toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('handles LLM error gracefully', async () => {
    const errorLlm: LlmProvider = {
      name: 'error',
      chat: jest.fn().mockRejectedValue(new Error('LLM down')),
    };
    const queue = makeDeliveryQueue();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const handler = new ReactiveHandler(errorLlm, makePersistence(), makeStateManager(), queue);

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: makeTriggerMessage(),
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      targetUserIds: ['bot-alice'],
      interpellationType: 'mention',
    });

    expect(queue.enqueue).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('saves agent history after successful enqueue', async () => {
    const triageResponse = JSON.stringify({
      shouldRespond: true,
      responses: [{ asUserId: 'bot-alice', urgency: 'medium', isGreeting: false,
        needsElaboration: false, suggestedTopic: 'tech' }],
    });
    const genResponse = JSON.stringify({
      messages: [{ asUserId: 'bot-alice', content: 'Je pense que oui',
        replyToId: 'msg-trigger', wordCount: 4, isGreeting: false }],
    });
    const llm = makeLlm([triageResponse, genResponse]);
    const stateManager = makeStateManager();
    const handler = new ReactiveHandler(llm, makePersistence(), stateManager, makeDeliveryQueue());

    await handler.handleInterpellation({
      conversationId: 'conv1',
      triggerMessage: makeTriggerMessage(),
      mentionedUserIds: ['bot-alice'],
      replyToUserId: undefined,
      targetUserIds: ['bot-alice'],
      interpellationType: 'mention',
    });

    expect(stateManager.setAgentHistory).toHaveBeenCalledWith('conv1', expect.any(Array));
  });
});
