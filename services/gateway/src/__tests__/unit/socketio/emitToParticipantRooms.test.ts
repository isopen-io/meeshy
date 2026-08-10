/**
 * The personal-room fan-out shared by every emitter that addresses the
 * participants of a conversation one device-set at a time.
 *
 * The behavior under test is the one its three call sites all got wrong: a
 * participant with no `User` row must be addressed by its `Participant.id`,
 * because that is the key `AuthHandler` names its personal room after. Skipping
 * it does not avoid a room that does not exist — it skips one that does.
 *
 * @jest-environment node
 */

import {
  emitToParticipantRooms,
  type ParticipantRoomTarget,
} from '../../../socketio/emitToParticipantRooms';

function makeEmitter() {
  const emit = jest.fn();
  const to = jest.fn(function chain() {
    return { to, emit };
  });
  return { io: { to } as never, to, emit };
}

const participants: ReadonlyArray<ParticipantRoomTarget> = [
  { id: 'p_registered', userId: 'u_registered' },
  { id: 'p_anonymous', userId: null },
];

describe('emitToParticipantRooms', () => {
  it('addresses an accountless participant by its participant id', () => {
    const { io, to } = makeEmitter();

    const rooms = emitToParticipantRooms({
      io,
      participants,
      events: ['conversation:updated'],
      payload: { conversationId: 'c_1' },
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual(['user:u_registered', 'user:p_anonymous']);
    expect(rooms).toEqual(['user:u_registered', 'user:p_anonymous']);
  });

  it('emits every event exactly once onto the same chained emitter', () => {
    const { io, emit } = makeEmitter();
    const payload = { conversationId: 'c_1' };

    emitToParticipantRooms({
      io,
      participants,
      events: ['conversation:updated', 'conversation:unread-updated'],
      payload,
    });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, 'conversation:updated', payload);
    expect(emit).toHaveBeenNthCalledWith(2, 'conversation:unread-updated', payload);
  });

  it('collapses two participant rows of the same user into a single room', () => {
    const { io, to } = makeEmitter();

    const rooms = emitToParticipantRooms({
      io,
      participants: [
        { id: 'p_a', userId: 'u_same' },
        { id: 'p_b', userId: 'u_same' },
      ],
      events: ['conversation:updated'],
      payload: {},
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual(['user:u_same']);
    expect(rooms).toEqual(['user:u_same']);
  });

  it('prepends seed rooms ahead of the participant rooms, deduped against them', () => {
    const { io, to } = makeEmitter();

    const rooms = emitToParticipantRooms({
      io,
      participants: [{ id: 'p_1', userId: 'u_1' }],
      events: ['read-status:updated'],
      payload: {},
      seedRooms: ['conversation:c_1', 'user:u_1'],
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual(['conversation:c_1', 'user:u_1']);
    expect(rooms).toEqual(['conversation:c_1', 'user:u_1']);
  });

  it('emits nothing when there is no room to address', () => {
    const { io, to, emit } = makeEmitter();

    const rooms = emitToParticipantRooms({
      io,
      participants: [],
      events: ['conversation:updated'],
      payload: {},
    });

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(rooms).toEqual([]);
  });

  it('is a no-op without an io — a best-effort side channel never throws', () => {
    expect(() =>
      emitToParticipantRooms({
        io: null,
        participants,
        events: ['conversation:updated'],
        payload: {},
      }),
    ).not.toThrow();
  });
});
