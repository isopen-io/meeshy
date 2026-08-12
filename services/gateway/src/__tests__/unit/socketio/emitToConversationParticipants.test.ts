/**
 * The single chained room fan-out for a conversation-wide event.
 *
 * The behavior under test is the one the three copies it replaces all got
 * wrong: a participant with no `User` row must be addressed by its
 * `Participant.id`, because that is the key its personal room is named after.
 *
 * @jest-environment node
 */

import {
  emitToConversationParticipants,
  participantUserRooms,
} from '../../../socketio/emitToConversationParticipants';

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

/**
 * The room-naming half of the fan-out, on its own.
 *
 * Two families of emitter need it and they do NOT share an emit shape: the
 * receipts chain the conversation room together with the personal ones, while
 * `conversation:updated` addresses personal rooms ONLY (a conversation-room
 * copy would be redundant for anyone already looking at the thread). Sharing
 * the emit loop would have forced one shape onto the other; sharing the room
 * list is what they actually have in common — and it is where every copy of
 * this code got it wrong.
 */
describe('participantUserRooms', () => {
  it('names an accountless participant room after its participant id', () => {
    expect(
      participantUserRooms([
        { id: 'p_registered', userId: 'u_registered' },
        { id: 'p_anonymous', userId: null },
      ])
    ).toEqual(['user:u_registered', 'user:p_anonymous']);
  });

  it('dedupes a user present under two participant rows', () => {
    expect(
      participantUserRooms([
        { id: 'p_1', userId: 'u_dup' },
        { id: 'p_2', userId: 'u_dup' },
      ])
    ).toEqual(['user:u_dup']);
  });

  it('carries the seed rooms first and dedupes against them', () => {
    expect(
      participantUserRooms([{ id: 'p_1', userId: 'u_1' }], ['conversation:c_1', 'user:u_1'])
    ).toEqual(['conversation:c_1', 'user:u_1']);
  });

  it('names no room for a participant carrying neither identity', () => {
    // Un `select` qui oublie les deux colonnes produirait `user:undefined` —
    // une room unique où tout le trafic de toutes les conversations atterrit.
    expect(
      participantUserRooms([
        { id: undefined as unknown as string, userId: null },
        { id: 'p_1', userId: null },
      ])
    ).toEqual(['user:p_1']);
  });

  it('returns just the seed for an empty participant list', () => {
    expect(participantUserRooms([], ['conversation:c_1'])).toEqual(['conversation:c_1']);
    expect(participantUserRooms([])).toEqual([]);
  });
});
