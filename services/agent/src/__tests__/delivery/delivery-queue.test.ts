import { DeliveryQueue, type SerializedDeliveryItem } from '../../delivery/delivery-queue';
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
    mentionedUsernames: [], delaySeconds: 0, delayCategory: 'immediate',
    topicCategory: 'general', topicHash: 'abc12345',
    messageSource: 'agent',
    ...overrides,
  };
}

function makeReaction(overrides: Partial<PendingReaction> = {}): PendingReaction {
  return {
    type: 'reaction', asUserId: 'bot1', targetMessageId: 'm1', emoji: '👍',
    delaySeconds: 0, delayCategory: 'immediate',
    topicCategory: 'reaction', topicHash: 'rxn12345',
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

describe('DeliveryQueue — conversation-wide gap proportional to word count', () => {
  it('enforces gap proportional to word count between conversation messages', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-bob', delaySeconds: 5, content: 'Voici un message de taille moyenne pour verifier le gap entre les messages envoyes dans cette conv' })]);

    const bobItems = queue.getScheduledForUser('conv-1', 'bot-bob');
    const aliceItems = queue.getScheduledForUser('conv-1', 'bot-alice');
    const gap = bobItems[0].scheduledAt - aliceItems[0].scheduledAt;

    // ~16 words → 30s base ± 50% jitter → 15s-45s
    expect(gap).toBeGreaterThanOrEqual(10_000);
  });

  it('uses ~10s gap for very short messages (<=4 words)', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-bob', delaySeconds: 5, content: 'Ok cool' })]);

    const bobItems = queue.getScheduledForUser('conv-1', 'bot-bob');
    const aliceItems = queue.getScheduledForUser('conv-1', 'bot-alice');
    const gap = bobItems[0].scheduledAt - aliceItems[0].scheduledAt;

    // 2 words → 10s base ± 40% jitter → 6s-14s
    expect(gap).toBeGreaterThanOrEqual(5_000);
    expect(gap).toBeLessThan(20_000);
  });

  it('uses ~120s gap for long messages (65-105 words)', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    const longContent = Array.from({ length: 80 }, (_, i) => `mot${i}`).join(' ');

    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);
    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-bob', delaySeconds: 5, content: longContent })]);

    const bobItems = queue.getScheduledForUser('conv-1', 'bot-bob');
    const aliceItems = queue.getScheduledForUser('conv-1', 'bot-alice');
    const gap = bobItems[0].scheduledAt - aliceItems[0].scheduledAt;

    // 80 words → 120s base ± 20% jitter → 96s-144s
    expect(gap).toBeGreaterThanOrEqual(90_000);
  });

  it('does not enforce gap across different conversations', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);
    queue.enqueue('conv-2', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);

    const items1 = queue.getScheduledForUser('conv-1', 'bot-alice');
    const items2 = queue.getScheduledForUser('conv-2', 'bot-alice');

    const gap = Math.abs(items1[0].scheduledAt - items2[0].scheduledAt);
    expect(gap).toBeLessThan(10_000);
  });

  it('does not enforce gap for reactions', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));

    queue.enqueue('conv-1', [makeMessage({ asUserId: 'bot-alice', delaySeconds: 5 })]);
    queue.enqueue('conv-1', [makeReaction({ asUserId: 'bot-bob', delaySeconds: 5 })]);

    expect(queue.pendingCount).toBe(2);
  });
});

describe('DeliveryQueue — getAll and getByConversation', () => {
  it('getAll returns all items sorted by scheduledAt', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);
    queue.enqueue('conv-2', [makeMessage({ delaySeconds: 30 })]);

    const items = queue.getAll();
    expect(items).toHaveLength(2);
    expect(items[0].scheduledAt).toBeLessThanOrEqual(items[1].scheduledAt);
  });

  it('getAll returns items with id and remainingMs', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    const items = queue.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeDefined();
    expect(typeof items[0].id).toBe('string');
    expect(items[0].remainingMs).toBeGreaterThanOrEqual(0);
    expect(items[0].conversationId).toBe('conv-1');
    expect(items[0].action.type).toBe('message');
  });

  it('getAll returns empty array when queue is empty', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    expect(queue.getAll()).toEqual([]);
  });

  it('getByConversation filters to the right conversation', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);
    queue.enqueue('conv-2', [makeMessage({ delaySeconds: 30 })]);
    queue.enqueue('conv-1', [makeReaction({ delaySeconds: 10 })]);

    const items = queue.getByConversation('conv-1');
    expect(items).toHaveLength(2);
    expect(items.every((i: SerializedDeliveryItem) => i.conversationId === 'conv-1')).toBe(true);
  });

  it('getByConversation returns empty for unknown conversation', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);
    expect(queue.getByConversation('unknown')).toEqual([]);
  });

  it('serialized items do not contain timer property', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    const items = queue.getAll();
    expect(items[0]).not.toHaveProperty('timer');
  });
});

describe('DeliveryQueue — deleteById', () => {
  it('deletes an item by id and prevents delivery', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    const items = queue.getAll();
    expect(items).toHaveLength(1);

    const deleted = queue.deleteById(items[0].id);
    expect(deleted).toBe(true);
    expect(queue.pendingCount).toBe(0);

    await flushTimers();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('returns false for unknown id', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    expect(queue.deleteById('nonexistent-id')).toBe(false);
    expect(queue.pendingCount).toBe(1);
  });

  it('can delete a reaction item', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeReaction({ delaySeconds: 60 })]);

    const items = queue.getAll();
    expect(queue.deleteById(items[0].id)).toBe(true);
    expect(queue.pendingCount).toBe(0);
  });
});

describe('DeliveryQueue — editMessageById', () => {
  it('edits message content and preserves scheduledAt', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ content: 'Original', delaySeconds: 60 })]);

    const items = queue.getAll();
    const original = items[0];

    const updated = queue.editMessageById(original.id, 'Modified content');
    expect(updated).not.toBeNull();
    expect(updated!.action.type).toBe('message');
    expect((updated!.action as PendingMessage).content).toBe('Modified content');
    expect(updated!.scheduledAt).toBe(original.scheduledAt);
    expect(updated!.id).toBe(original.id);
  });

  it('delivers the edited content', async () => {
    const publisher = makePublisher();
    const queue = new DeliveryQueue(publisher, makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ content: 'Original', delaySeconds: 5 })]);

    const items = queue.getAll();
    queue.editMessageById(items[0].id, 'Edited message');

    await flushTimers();
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish.mock.calls[0][0].content).toBe('Edited message');
  });

  it('returns null for unknown id', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    expect(queue.editMessageById('nonexistent', 'New content')).toBeNull();
  });

  it('returns null when trying to edit a reaction', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeReaction({ delaySeconds: 60 })]);

    const items = queue.getAll();
    expect(queue.editMessageById(items[0].id, 'New content')).toBeNull();
  });

  it('preserves queue count after edit', () => {
    const queue = new DeliveryQueue(makePublisher(), makePersistence(0));
    queue.enqueue('conv-1', [makeMessage({ delaySeconds: 60 })]);

    const items = queue.getAll();
    queue.editMessageById(items[0].id, 'Updated');

    expect(queue.pendingCount).toBe(1);
    expect(queue.getAll()[0].action.type).toBe('message');
    expect((queue.getAll()[0].action as PendingMessage).content).toBe('Updated');
  });
});
