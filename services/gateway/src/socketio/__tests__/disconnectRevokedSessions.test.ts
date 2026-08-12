import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { disconnectRevokedSessions } from '../disconnectRevokedSessions';

type Emitted = { event: string; payload: any };

function makeSocket(sink: Emitted[], closed: boolean[]) {
  return {
    emit: (event: string, payload: unknown) => {
      sink.push({ event, payload });
    },
    disconnect: (close?: boolean) => {
      closed.push(close === true);
    },
  };
}

function makeIo(sockets: unknown[], rooms: string[] = []) {
  return {
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets: async () => sockets };
    },
  };
}

describe('disconnectRevokedSessions', () => {
  it('emits auth:session-revoked then closes every socket of the user room', async () => {
    const emitted: Emitted[] = [];
    const closed: boolean[] = [];
    const rooms: string[] = [];
    const io = makeIo(
      [makeSocket(emitted, closed), makeSocket(emitted, closed)],
      rooms,
    );

    const count = await disconnectRevokedSessions({
      io,
      userId: 'user-1',
      reason: 'password_changed',
    });

    expect(count).toBe(2);
    expect(rooms).toEqual([ROOMS.user('user-1')]);
    expect(emitted).toHaveLength(2);
    for (const entry of emitted) {
      expect(entry.event).toBe(SERVER_EVENTS.AUTH_SESSION_REVOKED);
      expect(entry.payload.code).toBe('session_revoked');
      expect(entry.payload.reason).toBe('password_changed');
      expect(typeof entry.payload.message).toBe('string');
      expect(entry.payload.message.length).toBeGreaterThan(0);
    }
    // `true` closes the underlying connection rather than only the namespace —
    // a revocation that leaves the transport open is not a revocation.
    expect(closed).toEqual([true, true]);
  });

  it('emits before disconnecting so a compliant client can clear its local session', async () => {
    const order: string[] = [];
    const io = makeIo([
      {
        emit: () => order.push('emit'),
        disconnect: () => order.push('disconnect'),
      },
    ]);

    await disconnectRevokedSessions({ io, userId: 'user-1', reason: 'logout_all_devices' });

    expect(order).toEqual(['emit', 'disconnect']);
  });

  it('carries the caller message when one is given', async () => {
    const emitted: Emitted[] = [];
    const closed: boolean[] = [];
    const io = makeIo([makeSocket(emitted, closed)]);

    await disconnectRevokedSessions({
      io,
      userId: 'user-1',
      reason: 'admin_revoke',
      message: 'Revoked by an administrator',
    });

    expect(emitted[0].payload.message).toBe('Revoked by an administrator');
  });

  it('closes the remaining sockets when one of them throws', async () => {
    const emitted: Emitted[] = [];
    const closed: boolean[] = [];
    const onError = jest.fn();
    const io = makeIo([
      {
        emit: () => {
          throw new Error('socket already gone');
        },
        disconnect: () => {
          throw new Error('socket already gone');
        },
      },
      makeSocket(emitted, closed),
    ]);

    const count = await disconnectRevokedSessions({
      io,
      userId: 'user-1',
      reason: 'password_changed',
      onError,
    });

    expect(count).toBe(1);
    expect(closed).toEqual([true]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('never throws when the room lookup fails, and reports it', async () => {
    const onError = jest.fn();
    const io = {
      in: () => ({
        fetchSockets: async () => {
          throw new Error('adapter unavailable');
        },
      }),
    };

    await expect(
      disconnectRevokedSessions({ io, userId: 'user-1', reason: 'password_changed', onError }),
    ).resolves.toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without an io or without a userId', async () => {
    const rooms: string[] = [];
    await expect(
      disconnectRevokedSessions({ io: null, userId: 'user-1', reason: 'password_changed' }),
    ).resolves.toBe(0);
    await expect(
      disconnectRevokedSessions({ io: undefined, userId: 'user-1', reason: 'password_changed' }),
    ).resolves.toBe(0);
    await expect(
      disconnectRevokedSessions({ io: makeIo([], rooms), userId: '', reason: 'password_changed' }),
    ).resolves.toBe(0);
    // An empty userId must not reach `io.in('user:')` — a room whose name is a
    // prefix of nothing, but which any future join bug would make a broadcast
    // channel to strangers.
    expect(rooms).toEqual([]);
  });
});
