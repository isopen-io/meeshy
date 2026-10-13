/**
 * Ce que RETIRER UN LIEN DE PARTAGE doit retirer à ses invités.
 *
 * Les deux routes qui retirent un lien — `PATCH /links/:linkId/toggle` à
 * `false` et `DELETE /links/:linkId` — déclarent chacune, dans leur propre
 * description OpenAPI, que l'accès des invités DÉJÀ entrés cesse. Aucune ne
 * portait de code derrière cette phrase : l'invité gardait sa socket dans
 * `conversation:<id>`, donc chaque message, chaque réaction et chaque frappe,
 * indéfiniment.
 *
 * Ce que cette unité tient : l'appartenance cesse EN BASE d'abord, puis dans le
 * vivant — et la seconde moitié passe par `endConversationMembership`, le point
 * de convergence déjà écrit, plutôt que par une cinquième copie de ses gestes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn(),
}));

import { revokeShareLinkGuests } from '../revokeShareLinkGuests';
import { emitConversationMemberCountEvent } from '../emitConversationMemberCount';
import {
  cacheParticipant,
  getCachedParticipant,
  resetParticipantLookupCache,
} from '../../utils/participant-lookup-cache';

const LINK_ID = '507f1f77bcf86cd799439099';
const CONV_ID = '507f1f77bcf86cd799439011';
const GUEST_A = 'participant-guest-a';
const GUEST_B = 'participant-guest-b';

type Guest = { id: string; conversationId: string; displayName: string };

function makePrisma(guests: Guest[], remaining: unknown[] = []) {
  const calls: string[] = [];
  return {
    calls,
    participant: {
      findMany: jest.fn<any>(async (args: any) => {
        // Le second `findMany` est celui de l'effectif restant.
        if (args?.where?.isActive === true && args?.where?.OR) {
          calls.push('find-guests');
          return guests;
        }
        calls.push('find-remaining');
        return remaining;
      }),
      updateMany: jest.fn<any>(async () => {
        calls.push('update');
        return { count: 1 };
      }),
    },
  };
}

function makeIo(order: string[]) {
  const socketsByRoom = new Map<string, Array<{ id: string; leave: jest.Mock; disconnect: jest.Mock }>>();
  const broadcast: any = { emit: jest.fn<any>(), to: jest.fn<any>(() => broadcast) };
  const io = {
    // `emitConversationMemberCountEvent` est doublé dans ce fichier : `to`
    // n'est là que pour satisfaire le contrat structurel de l'émetteur.
    to: jest.fn<any>(() => broadcast),
    in: jest.fn<any>((room: string) => ({
      fetchSockets: jest.fn<any>(async () => {
        const existing = socketsByRoom.get(room);
        if (existing) return existing;
        const created = [
          {
            id: `${room}#0`,
            leave: jest.fn<any>((left: string) => { order.push(`leave:${room}:${left}`); }),
            disconnect: jest.fn<any>(() => { order.push(`disconnect:${room}`); }),
          },
        ];
        socketsByRoom.set(room, created);
        return created;
      }),
    })),
  };
  return { io, socketsByRoom };
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

describe('revokeShareLinkGuests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
  });

  // #10440 — le lien d'un invité se lit sur la colonne de sa participation
  // ET, en repli, sur sa session embarquée (`guestShareLinkId`) : les deux sont
  // posées à l'entrée par lien, et une ligne qui ne porte que la seconde
  // échappait à la révocation (le balayage journalier, qui la lisait, passe
  // désormais par cette unité).
  it("ne cherche que les invités ANONYMES et ACTIFS du lien retiré, par la colonne comme par la session embarquée", async () => {
    const prisma = makePrisma([]);
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID });

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'anonymous',
          isActive: true,
          OR: [{ shareLinkId: LINK_ID }, { anonymousSession: { is: { shareLinkId: LINK_ID } } }],
        },
      })
    );
  });

  it("n'écrit ni n'annonce rien quand le lien n'a aucun invité actif", async () => {
    const prisma = makePrisma([]);
    const order: string[] = [];
    const { io } = makeIo(order);

    const revoked = await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID,
    });

    expect(revoked).toEqual([]);
    expect(prisma.participant.updateMany).not.toHaveBeenCalled();
    expect(emitConversationMemberCountEvent).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it("clôt l'appartenance EN BASE avant de toucher au vivant", async () => {
    const revokedAt = new Date('2026-08-28T10:00:00.000Z');
    const prisma = makePrisma([{ id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' }]);
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID, revokedAt,
    });

    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: GUEST_A, isActive: true },
      data: { isActive: false, leftAt: revokedAt },
    });
    // L'écriture précède la lecture de l'effectif restant : l'annonce porte
    // l'effectif d'APRÈS, jamais celui d'avant.
    expect(prisma.calls).toEqual(['find-guests', 'update', 'find-remaining']);
  });

  it("éteint position et appel, sort de la room, PUIS coupe la socket de l'invité", async () => {
    const prisma = makePrisma([{ id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' }]);
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID,
    });

    expect(order).toEqual([
      `end-live-location:${CONV_ID}:${GUEST_A}`,
      `end-call:${CONV_ID}:${GUEST_A}`,
      `leave:${ROOMS.user(GUEST_A)}:${ROOMS.conversation(CONV_ID)}`,
      `invalidate:${GUEST_A}:${CONV_ID}`,
      `disconnect:${ROOMS.user(GUEST_A)}`,
    ]);
  });

  it("invalide le cache de recherche REST, qui autoriserait sinon l'écriture 30 s de plus", async () => {
    cacheParticipant(GUEST_A, CONV_ID, { id: GUEST_A, conversationId: CONV_ID, isActive: true });
    const prisma = makePrisma([{ id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' }]);
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID,
    });

    expect(getCachedParticipant(GUEST_A, CONV_ID)).toBeUndefined();
  });

  it("annonce le départ de chaque invité avec l'effectif ACTIF restant", async () => {
    const revokedAt = new Date('2026-08-28T10:00:00.000Z');
    const remaining = [
      { id: 'p-host', userId: 'user-host', role: 'admin', user: { role: 'USER' } },
      { id: 'p-member', userId: 'user-member', role: 'member', user: { role: 'USER' } },
    ];
    const prisma = makePrisma(
      [
        { id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' },
        { id: GUEST_B, conversationId: CONV_ID, displayName: 'Invité B' },
      ],
      remaining
    );
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID, revokedAt,
    });

    expect(emitConversationMemberCountEvent).toHaveBeenCalledTimes(2);
    expect(emitConversationMemberCountEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      io,
      conversationId: CONV_ID,
      participants: remaining,
      event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
      memberCount: 2,
      payload: {
        conversationId: CONV_ID,
        participantId: GUEST_A,
        // Un invité de lien n'a AUCUNE ligne `User` : y recopier son
        // `Participant.id` ferait passer une clé de participant pour une clé
        // d'utilisateur dans tout ce qui la consomme.
        userId: null,
        displayName: 'Invité A',
        leftAt: revokedAt.toISOString(),
      },
    }));
  });

  it("clôt l'appartenance même sans sockets — une passerelle sans Socket.IO reste une révocation", async () => {
    const prisma = makePrisma([{ id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' }]);

    const revoked = await revokeShareLinkGuests({
      prisma: prisma as never, io: null, manager: null, shareLinkId: LINK_ID,
    });

    expect(revoked).toEqual([GUEST_A]);
    expect(prisma.participant.updateMany).toHaveBeenCalled();
  });

  it("évince chaque invité de SA conversation, jamais de celle du voisin", async () => {
    const otherConv = '507f1f77bcf86cd799439022';
    const prisma = makePrisma([
      { id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' },
      { id: GUEST_B, conversationId: otherConv, displayName: 'Invité B' },
    ]);
    const order: string[] = [];
    const { io } = makeIo(order);

    await revokeShareLinkGuests({
      prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID,
    });

    expect(order).toContain(`leave:${ROOMS.user(GUEST_A)}:${ROOMS.conversation(CONV_ID)}`);
    expect(order).toContain(`leave:${ROOMS.user(GUEST_B)}:${ROOMS.conversation(otherConv)}`);
  });

  /**
   * #10457 — deux balayages CONCURRENTS (le nettoyage admin et le journalier,
   * ou un geste de l'hôte pendant un balayage) lisaient les mêmes invités
   * actifs et annonçaient chacun leur départ : deux `participant-left` par
   * invité. Seule l'écriture qui a fait passer la ligne à inactif l'annonce.
   */
  it("deux révocations concurrentes n'annoncent, n'évincent et ne rendent chaque invité qu'UNE fois", async () => {
    const rows = [
      { id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A', isActive: true },
      { id: GUEST_B, conversationId: CONV_ID, displayName: 'Invité B', isActive: true },
    ];
    const prisma = {
      participant: {
        findMany: jest.fn<any>(async (args: any) =>
          args?.where?.OR
            ? rows.filter(row => row.isActive).map(({ id, conversationId, displayName }) => ({ id, conversationId, displayName }))
            : []
        ),
        updateMany: jest.fn<any>(async ({ where, data }: any) => {
          const row = rows.find(candidate => candidate.id === where.id && candidate.isActive === where.isActive);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    };
    const order: string[] = [];
    const { io } = makeIo(order);

    const [first, second] = await Promise.all([
      revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID }),
      revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID }),
    ]);

    expect([...first, ...second].sort()).toEqual([GUEST_A, GUEST_B].sort());
    expect(emitConversationMemberCountEvent).toHaveBeenCalledTimes(2);
    const announced = (emitConversationMemberCountEvent as jest.Mock).mock.calls.map(([arg]: any) => arg.payload.participantId);
    expect(announced.sort()).toEqual([GUEST_A, GUEST_B].sort());
    expect(order.filter(step => step.startsWith('disconnect:'))).toHaveLength(2);
    expect(order.filter(step => step.startsWith('end-call:'))).toHaveLength(2);
  });

  it("un invité qu'une autre écriture a déjà désactivé n'est ni annoncé, ni évincé, ni rendu", async () => {
    const prisma = makePrisma([
      { id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' },
      { id: GUEST_B, conversationId: CONV_ID, displayName: 'Invité B' },
    ]);
    prisma.participant.updateMany.mockImplementation(async ({ where }: any) => ({ count: where.id === GUEST_A ? 1 : 0 }));
    const order: string[] = [];
    const { io } = makeIo(order);

    const revoked = await revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID });

    expect(revoked).toEqual([GUEST_A]);
    expect(emitConversationMemberCountEvent).toHaveBeenCalledTimes(1);
    expect(order).not.toContain(`disconnect:${ROOMS.user(GUEST_B)}`);
    expect(order).toContain(`disconnect:${ROOMS.user(GUEST_A)}`);
  });

  it("n'annonce rien quand chaque invité lu a déjà été désactivé par une autre écriture", async () => {
    const prisma = makePrisma([{ id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A' }]);
    prisma.participant.updateMany.mockResolvedValue({ count: 0 });
    const order: string[] = [];
    const { io } = makeIo(order);

    const revoked = await revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID });

    expect(revoked).toEqual([]);
    expect(emitConversationMemberCountEvent).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });
});
