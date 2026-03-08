import { DeliveryQueue } from '../../delivery/delivery-queue';
import type { PendingMessage, PendingReaction } from '../../graph/state';

function makePublisher() {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
    publishReaction: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makePersistence(recentCount = 0) {
  return { getRecentMessageCount: jest.fn().mockResolvedValue(recentCount) } as any;
}

function makeMessage(overrides: Partial<PendingMessage> = {}): PendingMessage {
  return {
    type: 'message', asUserId: 'bot1', content: 'Bonjour !', originalLanguage: 'fr',
    mentionedUsernames: [], delaySeconds: 0, messageSource: 'agent',
    ...overrides,
  };
}

function makeReaction(overrides: Partial<PendingReaction> = {}): PendingReaction {
  return {
    type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍', delaySeconds: 0,
    ...overrides,
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function flushTimers() {
  jest.runAllTimers();
  await Promise.resolve();
  await Promise.resolve();
}

describe('DeliveryQueue — mentionedUsernames in AgentResponse', () => {
  it('passes mentionedUsernames to publisher when non-empty', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ mentionedUsernames: ['alice', 'bob'] })]);
    await flushTimers();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish.mock.calls[0][0].mentionedUsernames).toEqual(['alice', 'bob']);
  });

  it('omits mentionedUsernames from payload when array is empty', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ mentionedUsernames: [] })]);
    await flushTimers();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish.mock.calls[0][0].mentionedUsernames).toBeUndefined();
  });

  it('publishes correct AgentResponse shape', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({
      content: 'Salut Alice !', asUserId: 'bot1', originalLanguage: 'fr',
      replyToId: 'm5', mentionedUsernames: ['alice'],
    })]);
    await flushTimers();

    expect(publisher.publish.mock.calls[0][0]).toEqual({
      type: 'agent:response',
      conversationId: 'conv-1',
      asUserId: 'bot1',
      content: 'Salut Alice !',
      originalLanguage: 'fr',
      replyToId: 'm5',
      mentionedUsernames: ['alice'],
      messageSource: 'agent',
      metadata: { agentType: 'orchestrator', roleConfidence: 1.0 },
    });
  });

  it('does not deliver message when recent human activity exceeds threshold', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(5));

    queue.enqueue('conv-1', [makeMessage()]);
    await flushTimers();

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('delivers message when recent activity is at or below threshold', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(3));

    queue.enqueue('conv-1', [makeMessage()]);
    await flushTimers();

    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('delivers reactions regardless of recent message count', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(10));

    queue.enqueue('conv-1', [makeReaction()]);
    await flushTimers();

    expect(publisher.publishReaction).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('cancelForConversation stops pending delivery', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 5 })]);
    queue.cancelForConversation('conv-1');

    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(0);
  });

  it('clearAll cancels all pending deliveries', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 5 })]);
    queue.enqueue('conv-2', [makeReaction({ delaySeconds: 3 })]);
    queue.clearAll();

    jest.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(publisher.publish).not.toHaveBeenCalled();
    expect(publisher.publishReaction).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(0);
  });
});

describe('DeliveryQueue — queue introspection and rescheduling', () => {
  it('getScheduledForUser returns pending items for a user', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 60 })]);
    expect(queue.getScheduledForUser('conv-1', 'bot-alice')).toHaveLength(1);
  });

  it('getScheduledForUser returns empty for unknown user', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 60 })]);
    expect(queue.getScheduledForUser('conv-1', 'bot-bob')).toHaveLength(0);
  });

  it('getScheduledForUser scopes to conversation', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 60 })]);
    queue.enqueue('conv-2', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 60 })]);
    expect(queue.getScheduledForUser('conv-1', 'bot-alice')).toHaveLength(1);
  });

  it('rescheduleForUser delays existing items and returns count', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 30 })]);
    const count = queue.rescheduleForUser('conv-1', 'bot-alice', 60);
    expect(count).toBe(1);
  });

  it('rescheduleForUser returns 0 when no items match', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    const count = queue.rescheduleForUser('conv-1', 'nobody', 60);
    expect(count).toBe(0);
  });
});
