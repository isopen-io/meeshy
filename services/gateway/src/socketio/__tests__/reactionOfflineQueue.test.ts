import { describe, it, expect, jest } from '@jest/globals';
import { enqueueOfflineReactionEvent } from '../reactionOfflineQueue';

type Enqueued = { userId: string; entry: any };

function makeDeps(
  participants: Array<{ id: string; userId: string | null }>,
  online: string[] = [],
  overrides: Partial<{ enqueue: any; findMany: any }> = {},
) {
  const sink: Enqueued[] = [];
  const enqueue =
    overrides.enqueue ??
    jest.fn(async (userId: string, entry: any) => {
      sink.push({ userId, entry });
    });
  const findMany = overrides.findMany ?? jest.fn(async () => participants);
  return {
    sink,
    enqueue,
    deps: {
      deliveryQueue: { enqueue } as any,
      prisma: { participant: { findMany } } as any,
      connectedUsers: new Map(online.map(u => [u, {}])) as any,
    },
  };
}

const params = {
  conversationId: 'conv-1',
  actorParticipantId: 'participant-A',
  eventType: 'reaction-added' as const,
  messageId: 'msg-1',
  emoji: '👍',
  payload: { messageId: 'msg-1', emoji: '👍' },
};

describe('enqueueOfflineReactionEvent', () => {
  it('queues the event for every offline participant', async () => {
    const { sink, deps } = makeDeps([
      { id: 'participant-A', userId: 'user-A' },
      { id: 'participant-B', userId: 'user-B' },
      { id: 'participant-C', userId: 'user-C' },
    ]);

    await enqueueOfflineReactionEvent(deps, params);

    expect(sink.map(e => e.userId).sort()).toEqual(['user-B', 'user-C']);
    expect(sink[0].entry).toMatchObject({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      eventType: 'reaction-added',
      payload: { messageId: 'msg-1', emoji: '👍' },
    });
  });

  it('never queues the reaction back to its own actor', async () => {
    const { sink, deps } = makeDeps([
      { id: 'participant-A', userId: 'user-A' },
      { id: 'participant-B', userId: 'user-B' },
    ]);

    await enqueueOfflineReactionEvent(deps, params);

    expect(sink.map(e => e.userId)).not.toContain('user-A');
  });

  it('skips participants who are connected — they already got the live emit', async () => {
    const { sink, deps } = makeDeps(
      [
        { id: 'participant-A', userId: 'user-A' },
        { id: 'participant-B', userId: 'user-B' },
        { id: 'participant-C', userId: 'user-C' },
      ],
      ['user-B'],
    );

    await enqueueOfflineReactionEvent(deps, params);

    expect(sink.map(e => e.userId)).toEqual(['user-C']);
  });

  it('scopes the dedup identity to (message, reactor, emoji) so two reactors both survive', async () => {
    // RedisDeliveryQueue's default dedup identity is (messageId, eventType),
    // which would collapse two different reactors' 'reaction-added' on the same
    // message into one entry — silently dropping every reactor after the first
    // for the offline peer.
    const { sink, deps } = makeDeps([
      { id: 'participant-A', userId: 'user-A' },
      { id: 'participant-B', userId: 'user-B' },
      { id: 'participant-C', userId: 'user-C' },
    ]);

    await enqueueOfflineReactionEvent(deps, params);
    await enqueueOfflineReactionEvent(deps, { ...params, actorParticipantId: 'participant-B' });

    const keys = sink.map(e => e.entry.dedupKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain('msg-1:participant-A:👍');
    expect(keys).toContain('msg-1:participant-B:👍');
  });

  it('separates the same reactor’s two different emojis', async () => {
    const { sink, deps } = makeDeps([
      { id: 'participant-A', userId: 'user-A' },
      { id: 'participant-B', userId: 'user-B' },
    ]);

    await enqueueOfflineReactionEvent(deps, params);
    await enqueueOfflineReactionEvent(deps, { ...params, emoji: '🎉' });

    expect(new Set(sink.map(e => e.entry.dedupKey)).size).toBe(2);
  });

  it('falls back to the participant id as queue key for anonymous participants', async () => {
    const { sink, deps } = makeDeps([
      { id: 'participant-A', userId: 'user-A' },
      { id: 'participant-anon', userId: null },
    ]);

    await enqueueOfflineReactionEvent(deps, params);

    expect(sink.map(e => e.userId)).toEqual(['participant-anon']);
  });

  it('is a no-op without a delivery queue rather than throwing', async () => {
    const findMany = jest.fn(async () => []);
    await expect(
      enqueueOfflineReactionEvent(
        {
          deliveryQueue: null,
          prisma: { participant: { findMany } } as any,
          connectedUsers: new Map() as any,
        },
        params,
      ),
    ).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('swallows a participant lookup failure — the reaction is already committed', async () => {
    const { deps } = makeDeps([], [], {
      findMany: jest.fn(async () => {
        throw new Error('db down');
      }),
    });

    await expect(enqueueOfflineReactionEvent(deps, params)).resolves.toBeUndefined();
  });

  it('swallows a per-user enqueue rejection without dropping the other peers', async () => {
    const attempted: string[] = [];
    const { deps } = makeDeps(
      [
        { id: 'participant-A', userId: 'user-A' },
        { id: 'participant-B', userId: 'user-B' },
        { id: 'participant-C', userId: 'user-C' },
      ],
      [],
      {
        enqueue: jest.fn(async (userId: string) => {
          attempted.push(userId);
          if (userId === 'user-B') throw new Error('redis down');
        }),
      },
    );

    await expect(enqueueOfflineReactionEvent(deps, params)).resolves.toBeUndefined();
    expect(attempted.sort()).toEqual(['user-B', 'user-C']);
  });
});
