import { describe, it, expect, jest } from '@jest/globals';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';

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
    findMany,
    deps: {
      deliveryQueue: { enqueue } as any,
      prisma: { participant: { findMany } } as any,
      connectedUsers: new Map(online.map(u => [u, {}])) as any,
    },
  };
}

const THREE = [
  { id: 'participant-A', userId: 'user-A' },
  { id: 'participant-B', userId: 'user-B' },
  { id: 'participant-C', userId: null },
];

const base = {
  conversationId: 'conv-1',
  eventType: 'link-message' as const,
  messageId: 'msg-1',
  payload: { message: { id: 'msg-1' } },
};

describe('enqueueForOfflineParticipants — the audience', () => {
  it('queues for every offline participant, keyed by userId or participant id', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' });

    // 'participant-C' is anonymous (no User row): its queue key is the
    // participant id, the same key `connectedUsers` and `ROOMS.user` use.
    expect(sink.map(e => e.userId).sort()).toEqual(['participant-C', 'user-B']);
  });

  it('skips participants who are connected — they already got the live emit', async () => {
    const { sink, deps } = makeDeps(THREE, ['user-B']);

    await enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' });

    expect(sink.map(e => e.userId)).toEqual(['participant-C']);
  });
});

// The five implementations this function replaced excluded the actor on two
// DIFFERENT identities: the socket paths hold a Participant.id, the REST pin and
// edit routes run under `requiredAuth` and hold only a User.id. Honouring one
// and ignoring the other would queue the event straight back to its own author.
describe('enqueueForOfflineParticipants — actor exclusion', () => {
  it('excludes the actor given as a participant id', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-B' });

    expect(sink.map(e => e.userId)).not.toContain('user-B');
  });

  it('excludes the actor given as a user id', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorUserId: 'user-B' });

    expect(sink.map(e => e.userId)).not.toContain('user-B');
  });

  it('keeps every recipient when no actor is given', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, base);

    expect(sink.map(e => e.userId).sort()).toEqual(['participant-C', 'user-A', 'user-B']);
  });

  // A null actor must not match the anonymous participant whose `userId` is
  // also null — that participant is a recipient, not the author.
  it('does not mistake a null actor id for the anonymous participant', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorUserId: null, actorParticipantId: null });

    expect(sink.map(e => e.userId)).toContain('participant-C');
  });
});

describe('enqueueForOfflineParticipants — the queued entry', () => {
  it('carries the event type and the caller payload verbatim', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' });

    expect(sink[0].entry).toMatchObject({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      eventType: 'link-message',
      payload: { message: { id: 'msg-1' } },
    });
  });

  // `RedisDeliveryQueue` dedups on (dedupKey ?? messageId, eventType). Writing
  // a `dedupKey: undefined` key would be harmless in Redis but changes the
  // in-memory fallback's stored object, so it is omitted rather than blanked.
  it('omits dedupKey entirely when the caller does not scope the dedup', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' });

    expect(sink[0].entry).not.toHaveProperty('dedupKey');
  });

  it('forwards a caller-scoped dedupKey untouched', async () => {
    const { sink, deps } = makeDeps(THREE);

    await enqueueForOfflineParticipants(deps, {
      ...base,
      actorParticipantId: 'participant-A',
      dedupKey: 'msg-1:participant-A:👍',
    });

    expect(sink[0].entry.dedupKey).toBe('msg-1:participant-A:👍');
  });
});

// `broadcastNewMessage` runs on the hottest path in the service and has already
// fetched the active participants to build its emits. Re-querying them here,
// once per message, is the cost that justified an inline copy of this fan-out
// for years — so reusing the caller's list is part of the contract, not an
// optimisation detail.
describe('enqueueForOfflineParticipants — preloaded participants', () => {
  it('fans out over the caller list without querying the database', async () => {
    const { sink, deps, findMany } = makeDeps([], [], { findMany: jest.fn(async () => { throw new Error('must not query'); }) });

    await enqueueForOfflineParticipants(deps, {
      ...base,
      actorParticipantId: 'participant-A',
      participants: THREE,
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(sink.map(e => e.userId).sort()).toEqual(['participant-C', 'user-B']);
  });
});

// The event is already committed when this runs. A queue failure must never
// turn a successful send into a 500 or flip an already-sent ACK to failure.
describe('enqueueForOfflineParticipants — best effort', () => {
  it('resolves when there is no delivery queue configured', async () => {
    const { deps } = makeDeps(THREE);

    await expect(
      enqueueForOfflineParticipants({ ...deps, deliveryQueue: null }, { ...base, actorParticipantId: 'participant-A' })
    ).resolves.toBeUndefined();
  });

  it('resolves when the participant lookup throws', async () => {
    const { deps } = makeDeps(THREE, [], { findMany: jest.fn(async () => { throw new Error('db down'); }) });

    await expect(
      enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' })
    ).resolves.toBeUndefined();
  });

  it('resolves when an individual enqueue rejects, and still tries every peer', async () => {
    const attempted: string[] = [];
    const { deps } = makeDeps(THREE, [], {
      enqueue: jest.fn(async (userId: string) => {
        attempted.push(userId);
        throw new Error('redis down');
      }),
    });

    await expect(
      enqueueForOfflineParticipants(deps, { ...base, actorParticipantId: 'participant-A' })
    ).resolves.toBeUndefined();
    expect(attempted.sort()).toEqual(['participant-C', 'user-B']);
  });
});
