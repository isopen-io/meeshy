/**
 * The single chained room fan-out for a conversation-wide event.
 *
 * The behavior under test is the one the three copies it replaces all got
 * wrong: a participant with no `User` row must be addressed by its
 * `Participant.id`, because that is the key its personal room is named after.
 *
 * @jest-environment node
 */

import { emitToConversationParticipants } from '../../../socketio/emitToConversationParticipants';

function makeEmitter() {
  const emit = jest.fn();
  const to = jest.fn(function chain() {
    return { to, emit };
  });
  return { io: { to } as never, to, emit };
}

const conversationId = 'c_1';

describe('emitToConversationParticipants', () => {
  it('addresses an accountless participant by its participant id', () => {
    const { io, to } = makeEmitter();

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [
        { id: 'p_registered', userId: 'u_registered' },
        { id: 'p_anonymous', userId: null },
      ],
      events: ['read-status:updated'],
      payload: { any: 'thing' },
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual([
      'conversation:c_1',
      'user:u_registered',
      'user:p_anonymous',
    ]);
  });

  it('emits every event once onto the same chained emitter', () => {
    const { io, emit } = makeEmitter();
    const payload = { conversationId, type: 'received' };

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [{ id: 'p_1', userId: 'u_1' }],
      events: ['read-status:updated', 'message:read-status-updated'],
      payload,
    });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, 'read-status:updated', payload);
    expect(emit).toHaveBeenNthCalledWith(2, 'message:read-status-updated', payload);
  });

  it('joins a room at most once so a socket in two of them receives one copy', () => {
    const { io, to } = makeEmitter();

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [
        { id: 'p_1', userId: 'u_dup' },
        { id: 'p_2', userId: 'u_dup' },
        { id: 'p_3', userId: null },
        { id: 'p_3', userId: null },
      ],
      events: ['read-status:updated'],
      payload: {},
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual([
      'conversation:c_1',
      'user:u_dup',
      'user:p_3',
    ]);
  });

  it('returns the rooms it reached so callers can log them', () => {
    const { io } = makeEmitter();

    const rooms = emitToConversationParticipants({
      io,
      conversationId,
      participants: [{ id: 'p_1', userId: null }],
      events: ['read-status:updated'],
      payload: {},
    });

    expect(rooms).toEqual(['conversation:c_1', 'user:p_1']);
  });

  it('still reaches the conversation room when the participant list is empty', () => {
    const { io, to, emit } = makeEmitter();

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [],
      events: ['read-status:updated'],
      payload: {},
    });

    expect(to).toHaveBeenCalledWith('conversation:c_1');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the server is not up yet', () => {
    expect(
      emitToConversationParticipants({
        io: null,
        conversationId,
        participants: [{ id: 'p_1', userId: 'u_1' }],
        events: ['read-status:updated'],
        payload: {},
      })
    ).toEqual([]);
  });
});
