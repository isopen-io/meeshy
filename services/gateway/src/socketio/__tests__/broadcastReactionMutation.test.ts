import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastReactionMutation } from '../broadcastReactionMutation';

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
  return { getIO, enqueueOfflineReactionMutation: enqueue } as any;
}

const base = {
  conversationId: 'conv-1',
  actorParticipantId: 'participant-A',
  messageId: 'msg-1',
  emoji: '👍',
};

describe('broadcastReactionMutation', () => {
  it('reaches both audiences: the live conversation room and the offline queue', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { messageId: 'msg-1', emoji: '👍', action: 'add' };

    await broadcastReactionMutation({
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'reaction-added',
      payload,
    });

    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.REACTION_ADDED,
      payload,
    });
    expect(enqueue).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      actorParticipantId: 'participant-A',
      eventType: 'reaction-added',
      messageId: 'msg-1',
      emoji: '👍',
      payload,
    });
  });

  it('maps a removal to reaction:removed and queues it under the reaction-removed eventType', async () => {
    const emitted: Emitted[] = [];
    const enqueue = jest.fn(async (_params: any) => {});
    const payload = { messageId: 'msg-1', emoji: '👍', action: 'remove' };

    await broadcastReactionMutation({
      manager: makeManager(emitted, { enqueue }),
      ...base,
      eventType: 'reaction-removed',
      payload,
    });

    expect(emitted).toContainEqual({
      room: 'conversation:conv-1',
      event: SERVER_EVENTS.REACTION_REMOVED,
      payload,
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'reaction-removed', emoji: '👍' }),
    );
  });

  it('still queues for offline peers when the live emit throws', async () => {
    // The room emit and the offline queue are INDEPENDENT audiences: a broken
    // io must not cost the offline peer its replay.
    const enqueue = jest.fn(async (_params: any) => {});
    const onError = jest.fn();
    const manager = {
      getIO: () => ({
        to: () => ({
          emit: () => {
            throw new Error('io exploded');
          },
        }),
      }),
      enqueueOfflineReactionMutation: enqueue,
    } as any;

    await broadcastReactionMutation({
      manager,
      ...base,
      eventType: 'reaction-added',
      payload: {},
      onError,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
  });

  it('still emits live when the offline enqueue throws synchronously', async () => {
    const emitted: Emitted[] = [];
    const onError = jest.fn();
    const manager = makeManager(emitted, {
      enqueue: () => {
        throw new Error('queue exploded');
      },
    });

    await broadcastReactionMutation({
      manager,
      ...base,
      eventType: 'reaction-added',
      payload: { a: 1 },
      onError,
    });

    expect(emitted).toHaveLength(1);
    expect(onError).toHaveBeenCalled();
  });

  it('is a no-op without a manager rather than throwing', async () => {
    await expect(
      broadcastReactionMutation({
        manager: null,
        ...base,
        eventType: 'reaction-added',
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('tolerates a manager that predates the offline-reaction queue', async () => {
    // A manager double (or an older manager build) without the method must not
    // turn a committed reaction into a 500.
    const emitted: Emitted[] = [];
    const onError = jest.fn();
    const manager = {
      getIO: () => ({
        to: (room: string) => ({
          emit: (event: string, payload: unknown) => {
            emitted.push({ room, event, payload });
          },
        }),
      }),
    } as any;

    await expect(
      broadcastReactionMutation({
        manager,
        ...base,
        eventType: 'reaction-added',
        payload: {},
        onError,
      }),
    ).resolves.toBeUndefined();
    expect(emitted).toHaveLength(1);
  });

  it('does not throw when getIO returns null (socket layer not started)', async () => {
    const enqueue = jest.fn(async (_params: any) => {});
    await expect(
      broadcastReactionMutation({
        manager: { getIO: () => null, enqueueOfflineReactionMutation: enqueue } as any,
        ...base,
        eventType: 'reaction-added',
        payload: {},
      }),
    ).resolves.toBeUndefined();
    // The offline audience is still served — it does not depend on io.
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
