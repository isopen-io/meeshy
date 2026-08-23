/**
 * The single chained room fan-out for a conversation-wide event.
 *
 * The behavior under test is the one the three copies it replaces all got
 * wrong: a participant with no `User` row must be addressed by its
 * `Participant.id`, because that is the key its personal room is named after.
 *
 * @jest-environment node
 */

import type { ReadStatusUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import {
  emitToConversationParticipants,
  participantUserRooms,
} from '../../../socketio/emitToConversationParticipants';

function makeEmitter() {
  const emit = jest.fn();
  const except = jest.fn(function chain() {
    return { to, except, emit };
  });
  const to = jest.fn(function chain() {
    return { to, except, emit };
  });
  return { io: { to } as never, to, except, emit };
}

const conversationId = 'c_1';

/**
 * La charge RÉELLE de `read-status:updated`, copiée clé par clé.
 *
 * Les fixtures de ce fichier étaient des esquisses (`{ any: 'thing' }`, et huit
 * fois `{}`), ce que `payload: unknown` acceptait. Depuis que ce fan-out est
 * générique sur le nom de l'événement (cycle 104), la charge est vérifiée contre
 * `ServerToClientEvents` — chez les appelants comme ici. Ce que ces témoins
 * gardent (les ROOMS atteintes) est inchangé ; ce qui change, c'est qu'ils ne
 * peuvent plus l'attester sur une charge que personne n'émettrait.
 */
function makeReadStatusPayload(
  overrides: Partial<ReadStatusUpdatedEventData> = {},
): ReadStatusUpdatedEventData {
  return {
    conversationId,
    participantId: 'p_registered',
    userId: 'u_registered',
    type: 'received',
    updatedAt: new Date('2026-08-23T10:00:00.000Z'),
    summary: { totalMembers: 2, deliveredCount: 1, readCount: 0 },
    ...overrides,
  };
}

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
      event: 'read-status:updated',
      payload: makeReadStatusPayload(),
    });

    expect(to.mock.calls.map((c) => c[0])).toEqual([
      'conversation:c_1',
      'user:u_registered',
      'user:p_anonymous',
    ]);
  });

  it('emits the event exactly once onto the chained emitter', () => {
    const { io, emit } = makeEmitter();
    const payload = makeReadStatusPayload({ type: 'received' });

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [{ id: 'p_1', userId: 'u_1' }],
      event: 'read-status:updated',
      payload,
    });

    // UNE émission, pas « une par nom » : le paramètre est au singulier depuis
    // le cycle 64, quand le dernier dual-émetteur a été retiré. Une chaîne de
    // rooms rejouée par nom, c'est autant de fois les octets sur le fil.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenNthCalledWith(1, 'read-status:updated', payload);
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
      event: 'read-status:updated',
      payload: makeReadStatusPayload(),
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
      event: 'read-status:updated',
      payload: makeReadStatusPayload(),
    });

    expect(rooms).toEqual(['conversation:c_1', 'user:p_1']);
  });

  it('still reaches the conversation room when the participant list is empty', () => {
    const { io, to, emit } = makeEmitter();

    emitToConversationParticipants({
      io,
      conversationId,
      participants: [],
      event: 'read-status:updated',
      payload: makeReadStatusPayload(),
    });

    expect(to).toHaveBeenCalledWith('conversation:c_1');
    expect(emit).toHaveBeenCalledTimes(1);
  });

  /**
   * `exceptRooms` — la moitié qui permet à un émetteur de servir DEUX payloads
   * sans jamais en livrer deux au même socket.
   *
   * Un accusé de lecture porte, pour l'acteur seul, sa frontière de lecture et
   * son arriéré (`lastReadAt`/`unreadCount`). Les pairs n'en ont aucun usage et
   * ne doivent pas les recevoir. Retirer l'acteur de l'ÉVENTAIL est la seule
   * façon de lui envoyer ensuite la version complète dans sa room personnelle
   * sans qu'il reçoive l'événement deux fois — la room de conversation
   * l'atteindrait sinon quand il regarde le fil.
   */
  describe('exceptRooms', () => {
    it('drops the excluded room from the chain AND hands it to except()', () => {
      const { io, to, except } = makeEmitter();

      emitToConversationParticipants({
        io,
        conversationId,
        participants: [
          { id: 'p_actor', userId: 'u_actor' },
          { id: 'p_peer', userId: 'u_peer' },
        ],
        event: 'read-status:updated',
        payload: makeReadStatusPayload(),
        exceptRooms: ['user:u_actor'],
      });

      expect(to.mock.calls.map((c) => c[0])).toEqual([
        'conversation:c_1',
        'user:u_peer',
      ]);
      // Chaîner la room de conversation sans l'exclusion laisserait l'acteur
      // recevoir la copie destinée aux pairs dès qu'il a le fil ouvert.
      expect(except).toHaveBeenCalledWith('user:u_actor');
    });

    it('excludes the actor even when they are the only participant left in the room', () => {
      const { io, to, except, emit } = makeEmitter();

      const rooms = emitToConversationParticipants({
        io,
        conversationId,
        participants: [{ id: 'p_actor', userId: null }],
        event: 'read-status:updated',
        payload: makeReadStatusPayload(),
        exceptRooms: ['user:p_actor'],
      });

      expect(rooms).toEqual(['conversation:c_1']);
      expect(to.mock.calls.map((c) => c[0])).toEqual(['conversation:c_1']);
      expect(except).toHaveBeenCalledWith('user:p_actor');
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('leaves the chain untouched when no room is excluded', () => {
      const { io, except } = makeEmitter();

      const rooms = emitToConversationParticipants({
        io,
        conversationId,
        participants: [{ id: 'p_1', userId: 'u_1' }],
        event: 'read-status:updated',
        payload: makeReadStatusPayload(),
      });

      expect(rooms).toEqual(['conversation:c_1', 'user:u_1']);
      expect(except).not.toHaveBeenCalled();
    });
  });

  it('is a no-op when the server is not up yet', () => {
    expect(
      emitToConversationParticipants({
        io: null,
        conversationId,
        participants: [{ id: 'p_1', userId: 'u_1' }],
        event: 'read-status:updated',
        payload: makeReadStatusPayload(),
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
