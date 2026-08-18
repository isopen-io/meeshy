/**
 * Le point de convergence des trois chemins de clôture.
 *
 * Trois routes ferment une conversation, et chacune portait sa copie de
 * l'annonce. Une décision répétée à trois endroits diverge à deux — le dépôt l'a
 * déjà payé deux fois sur ce même geste (cycle 67 : le quatrième écrivain qui
 * n'écrivait qu'`isActive: false` ; cycle 71 : une règle appliquée à un verbe
 * quand quatre l'exigeaient).
 *
 * Ce que cette unité tient : fermer un fil ÉTEINT ce qu'il portait de vivant,
 * PUIS l'annonce — et jamais l'inverse, parce que les clients retirent la
 * conversation de leur cache sur `conversation:closed`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { announceConversationClosed } from '../announceConversationClosed';

const CONV_ID = '507f1f77bcf86cd799439011';
const CLOSED_BY = 'user-closer-001';
const CLOSED_AT = new Date('2026-08-18T09:00:00Z');

const MEMBER = { id: 'participant-1', userId: 'user-member-002' };
/** Un invité de lien partagé : aucune ligne `User`, une room personnelle quand même. */
const GUEST = { id: 'participant-2', userId: null };

function makeIo() {
  const order: string[] = [];
  const emitter = {
    to: jest.fn<any>(() => emitter),
    except: jest.fn<any>(() => emitter),
    emit: jest.fn<any>((event: string) => {
      order.push(`emit:${event}`);
    }),
  };
  return { io: emitter, order };
}

function makeManager(order: string[]) {
  return {
    endLiveLocationsForClosedConversation: jest.fn<any>((conversationId: string) => {
      order.push(`end-live-locations:${conversationId}`);
    }),
  };
}

describe('announceConversationClosed', () => {
  it('éteint les partages de position AVANT de diffuser la clôture', () => {
    const { io, order } = makeIo();
    const manager = makeManager(order);

    announceConversationClosed({
      io,
      manager,
      conversationId: CONV_ID,
      participants: [MEMBER],
      closedBy: CLOSED_BY,
      closedAt: CLOSED_AT,
    });

    expect(order).toEqual([
      `end-live-locations:${CONV_ID}`,
      `emit:${SERVER_EVENTS.CONVERSATION_CLOSED}`,
    ]);
  });

  it('éteint même quand il ne reste PERSONNE à prévenir', () => {
    const { io, order } = makeIo();
    const manager = makeManager(order);

    const rooms = announceConversationClosed({
      io,
      manager,
      conversationId: CONV_ID,
      participants: [],
      closedBy: CLOSED_BY,
      closedAt: CLOSED_AT,
    });

    expect(manager.endLiveLocationsForClosedConversation).toHaveBeenCalledWith(CONV_ID);
    expect(io.emit).not.toHaveBeenCalled();
    expect(rooms).toEqual([]);
  });

  it('porte la charge utile de clôture, closedAt en ISO', () => {
    const { io, order } = makeIo();

    announceConversationClosed({
      io,
      manager: makeManager(order),
      conversationId: CONV_ID,
      participants: [MEMBER],
      closedBy: CLOSED_BY,
      closedAt: CLOSED_AT,
    });

    expect(io.emit).toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_CLOSED, {
      conversationId: CONV_ID,
      closedBy: CLOSED_BY,
      closedAt: CLOSED_AT.toISOString(),
    });
  });

  it('sert la room de conversation ET la room personnelle de chaque membre, invité compris', () => {
    const { io, order } = makeIo();

    const rooms = announceConversationClosed({
      io,
      manager: makeManager(order),
      conversationId: CONV_ID,
      participants: [MEMBER, GUEST],
      closedBy: CLOSED_BY,
      closedAt: CLOSED_AT,
    });

    expect(rooms).toEqual([
      ROOMS.conversation(CONV_ID),
      ROOMS.user(MEMBER.userId),
      ROOMS.user(GUEST.id),
    ]);
  });

  it("survit à une passerelle sans gestionnaire de sockets", () => {
    expect(() =>
      announceConversationClosed({
        io: undefined,
        manager: undefined,
        conversationId: CONV_ID,
        participants: [MEMBER],
        closedBy: CLOSED_BY,
        closedAt: CLOSED_AT,
      })
    ).not.toThrow();
  });

  it("survit à un gestionnaire qui ne porte pas encore l'extinction", () => {
    const { io, order } = makeIo();

    expect(() =>
      announceConversationClosed({
        io,
        manager: {},
        conversationId: CONV_ID,
        participants: [MEMBER],
        closedBy: CLOSED_BY,
        closedAt: CLOSED_AT,
      })
    ).not.toThrow();
    expect(order).toEqual([`emit:${SERVER_EVENTS.CONVERSATION_CLOSED}`]);
  });
});
