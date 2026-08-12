import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastMessageMutation } from '../broadcastMessageMutation';

type Emitted = { room: string; event: string; payload: any };

function makeManager(sink: Emitted[], overrides: Partial<{ getIO: any; enqueue: any }> = {}) {
  const enqueue = overrides.enqueue ?? jest.fn(async (_params: any) => {});
  const getIO =
    overrides.getIO ??
    (() => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          sink.push({ room, event, payload });
        },
      }),
    }));
  return { getIO, enqueueOfflineMessageMutation: enqueue } as any;
}

function makePrisma() {
  return {
    participant: { findMany: jest.fn(async () => [{ userId: 'user-B' }]) },
    message: {
      findFirst: jest.fn(async () => ({
        id: 'msg-latest',
        content: 'latest',
        senderId: 'participant-A',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        metadata: null,
      })),
    },
  } as any;
}

const base = {
  conversationId: 'conv-1',
  actorUserId: 'user-A',
  messageId: 'msg-1',
};

describe('broadcastMessageMutation', () => {
  it('reaches all three audiences: conversation room, list-screen user rooms, offline queue', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { id: 'msg-1', conversationId: 'conv-1', content: 'edited' };

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'edited',
      payload,
    });

    // (1) live room emit
    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.MESSAGE_EDITED,
      payload,
    });
    // (2) conversation-list preview refresh, on the participant's user room
    expect(emitted.some(
      (e) => e.room === 'user:user-B' && e.event === SERVER_EVENTS.CONVERSATION_UPDATED,
    )).toBe(true);
    // (3) offline replay
    expect(enqueue).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      actorUserId: 'user-A',
      eventType: 'edited',
      messageId: 'msg-1',
      payload,
    });
  });

  it('maps a deletion to message:deleted and queues it under the deleted eventType', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { messageId: 'msg-1', conversationId: 'conv-1' };

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'deleted',
      payload,
    });

    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.MESSAGE_DELETED,
      payload,
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'deleted' }));
  });

  it('does nothing when no manager is available', async () => {
    const prisma = makePrisma();

    await expect(
      broadcastMessageMutation({
        prisma,
        manager: null,
        ...base,
        eventType: 'edited',
        payload: {},
      }),
    ).resolves.toBeUndefined();

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  // The mutation is already committed by the time this runs: a broadcast
  // failure must never turn a successful edit/delete into a 500. Each channel
  // is independent, so a failure in one must not cost the caller the others.
  it('still reaches the preview and the offline queue when the room emit throws', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const onError = jest.fn();
    let firstCall = true;
    const getIO = () => ({
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          if (firstCall) {
            firstCall = false;
            throw new Error('room emit exploded');
          }
          emitted.push({ room, event, payload });
        },
      }),
    });

    await broadcastMessageMutation({
      prisma: makePrisma(),
      manager: makeManager(emitted, { getIO, enqueue }),
      ...base,
      eventType: 'edited',
      payload: {},
      onError,
    });

    expect(onError).toHaveBeenCalled();
    expect(emitted.some((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED)).toBe(true);
    expect(enqueue).toHaveBeenCalled();
  });

  it('reports, but does not rethrow, an enqueue that throws synchronously', async () => {
    const emitted: Emitted[] = [];
    const onError = jest.fn();
    const enqueue = jest.fn((_params: any) => {
      throw new Error('no delivery queue wired');
    });

    await expect(
      broadcastMessageMutation({
        prisma: makePrisma(),
        manager: makeManager(emitted, { enqueue }),
        ...base,
        eventType: 'deleted',
        payload: {},
        onError,
      }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalled();
    // The live emit happened before the failing channel — it is not lost.
    expect(emitted.some((e) => e.event === SERVER_EVENTS.MESSAGE_DELETED)).toBe(true);
  });
});
