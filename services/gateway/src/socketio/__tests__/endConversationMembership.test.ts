/**
 * Le point de convergence des QUATRE chemins qui mettent fin à une appartenance.
 *
 * Quitter (`leave.ts`), être banni (`ban.ts`), être retiré par un admin
 * (`participants.ts`), supprimer le fil pour soi (`delete-for-me.ts`) : les
 * quatre portaient la MÊME copie du même geste — sortir les sockets du partant
 * de la room, invalider son cache d'appartenance. Le dépôt a déjà payé trois
 * fois ce genre d'alignement à la main (cycles 67, 71, 73).
 *
 * Ce que cette unité tient : une appartenance qui finit ÉTEINT ce que le membre
 * tenait de vivant dans le fil, PUIS l'en sort — et jamais l'inverse.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { endConversationMembership } from '../endConversationMembership';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-departing-001';

function makeIo(order: string[], socketIds: string[] = ['socket-a', 'socket-b']) {
  const sockets = socketIds.map(id => ({
    id,
    leave: jest.fn<any>((room: string) => {
      order.push(`leave:${id}:${room}`);
    }),
  }));
  const io = {
    in: jest.fn<any>(() => ({
      fetchSockets: jest.fn<any>(async () => sockets),
    })),
  };
  return { io, sockets };
}

function makeManager(order: string[]) {
  return {
    endLiveLocationForDepartedMember: jest.fn<any>((conversationId: string, userId: string) => {
      order.push(`end-live-location:${conversationId}:${userId}`);
    }),
    endCallParticipationForDepartedMember: jest.fn<any>(async (conversationId: string, userId: string) => {
      order.push(`end-call:${conversationId}:${userId}`);
    }),
    invalidateParticipantCache: jest.fn<any>((userId: string, conversationId: string) => {
      order.push(`invalidate:${userId}:${conversationId}`);
    }),
  };
}

describe('endConversationMembership', () => {
  it("éteint le partage de position AVANT de sortir le partant de la room", async () => {
    const order: string[] = [];
    const { io } = makeIo(order, ['socket-a']);
    const manager = makeManager(order);

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(order).toEqual([
      `end-live-location:${CONV_ID}:${USER_ID}`,
      `end-call:${CONV_ID}:${USER_ID}`,
      `leave:socket-a:${ROOMS.conversation(CONV_ID)}`,
      `invalidate:${USER_ID}:${CONV_ID}`,
    ]);
  });

  it("sort le partant de l'appel EN COURS — la room de l'appel n'est pas celle du fil", async () => {
    const order: string[] = [];
    const { io } = makeIo(order, ['socket-a']);
    const manager = makeManager(order);

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(manager.endCallParticipationForDepartedMember).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it("ATTEND la sortie d'appel avant d'évincer — le partant apprend par la room de l'appel qu'il doit démonter sa connexion", async () => {
    const order: string[] = [];
    const { io } = makeIo(order, ['socket-a']);
    const manager = makeManager(order);
    manager.endCallParticipationForDepartedMember = jest.fn<any>(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push(`end-call:${CONV_ID}:${USER_ID}`);
    });

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(order.indexOf(`end-call:${CONV_ID}:${USER_ID}`)).toBeLessThan(
      order.indexOf(`leave:socket-a:${ROOMS.conversation(CONV_ID)}`)
    );
  });

  it("sort de l'appel même quand le partant n'a AUCUN socket connecté — la ligne d'appel est un état SERVEUR", async () => {
    const order: string[] = [];
    const { io } = makeIo(order, []);
    const manager = makeManager(order);

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(manager.endCallParticipationForDepartedMember).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it('sort TOUS les appareils du partant, pas seulement celui qui a agi', async () => {
    const order: string[] = [];
    const { io, sockets } = makeIo(order, ['socket-a', 'socket-b', 'socket-c']);

    await endConversationMembership({
      io,
      manager: makeManager(order),
      conversationId: CONV_ID,
      userId: USER_ID,
    });

    expect(io.in).toHaveBeenCalledWith(ROOMS.user(USER_ID));
    for (const socket of sockets) {
      expect(socket.leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
    }
  });

  it("invalide le cache d'appartenance — le partant ne doit pas écrire pendant la fenêtre de cache", async () => {
    const order: string[] = [];
    const { io } = makeIo(order);
    const manager = makeManager(order);

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(manager.invalidateParticipantCache).toHaveBeenCalledWith(USER_ID, CONV_ID);
  });

  it("éteint même quand le partant n'a AUCUN socket connecté — le registre est un état SERVEUR", async () => {
    const order: string[] = [];
    const { io } = makeIo(order, []);
    const manager = makeManager(order);

    await endConversationMembership({ io, manager, conversationId: CONV_ID, userId: USER_ID });

    expect(manager.endLiveLocationForDepartedMember).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it('survit à une passerelle sans gestionnaire de sockets', async () => {
    await expect(
      endConversationMembership({
        io: undefined,
        manager: undefined,
        conversationId: CONV_ID,
        userId: USER_ID,
      })
    ).resolves.toBeUndefined();
  });

  it("survit à un gestionnaire qui ne porte pas encore l'extinction", async () => {
    const order: string[] = [];
    const { io, sockets } = makeIo(order, ['socket-a']);

    await expect(
      endConversationMembership({ io, manager: {}, conversationId: CONV_ID, userId: USER_ID })
    ).resolves.toBeUndefined();
    expect(sockets[0].leave).toHaveBeenCalledWith(ROOMS.conversation(CONV_ID));
  });
});
