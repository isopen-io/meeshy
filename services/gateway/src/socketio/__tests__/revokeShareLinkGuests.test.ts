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

import { revokeShareLinkGuests, REVOCATION_WRITE_BATCH } from '../revokeShareLinkGuests';
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
      // #10468 — le cache d'appartenance tombe avant tout `await` : une
      // éviction qui échoue plus loin ne laisse plus l'invité écrire 5 min.
      `invalidate:${GUEST_A}:${CONV_ID}`,
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
  /**
   * #10464 (R1) — un `Promise.all` rejetait dès qu'une écriture levait : les
   * invités DÉJÀ passés à inactif n'étaient ni annoncés, ni évincés, ni retirés
   * du cache, et la reprise ne les retrouvait plus (ils ne sont plus actifs).
   * Leur socket lisait le fil jusqu'à la relecture suivante.
   */
  it("annonce, évince et invalide l'invité écrit même si l'écriture d'un AUTRE invité lève, puis relance l'erreur", async () => {
    const rows = [
      { id: GUEST_A, conversationId: CONV_ID, displayName: 'Invité A', isActive: true },
      { id: GUEST_B, conversationId: CONV_ID, displayName: 'Invité B', isActive: true },
    ];
    let failB = true;
    const prisma = {
      participant: {
        findMany: jest.fn<any>(async (args: any) =>
          args?.where?.OR
            ? rows.filter(row => row.isActive).map(({ id, conversationId, displayName }) => ({ id, conversationId, displayName }))
            : []
        ),
        updateMany: jest.fn<any>(async ({ where, data }: any) => {
          if (where.id === GUEST_B && failB) throw new Error('pool timeout');
          const row = rows.find(candidate => candidate.id === where.id && candidate.isActive === where.isActive);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    };
    cacheParticipant(GUEST_A, CONV_ID, { id: GUEST_A, conversationId: CONV_ID, isActive: true });
    const order: string[] = [];
    const { io } = makeIo(order);

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID })
    ).rejects.toThrow('pool timeout');

    const announcedFirst = (emitConversationMemberCountEvent as jest.Mock).mock.calls.map(([arg]: any) => arg.payload.participantId);
    expect(announcedFirst).toEqual([GUEST_A]);
    expect(order).toContain(`end-call:${CONV_ID}:${GUEST_A}`);
    expect(order).toContain(`leave:${ROOMS.user(GUEST_A)}:${ROOMS.conversation(CONV_ID)}`);
    expect(order).toContain(`disconnect:${ROOMS.user(GUEST_A)}`);
    expect(order).not.toContain(`disconnect:${ROOMS.user(GUEST_B)}`);
    expect(getCachedParticipant(GUEST_A, CONV_ID)).toBeUndefined();

    // La reprise (l'appelant garde le lien ouvert) retrouve B, et lui seul.
    failB = false;
    const retried = await revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID });

    expect(retried).toEqual([GUEST_B]);
    expect(rows.every(row => !row.isActive)).toBe(true);
    const announced = (emitConversationMemberCountEvent as jest.Mock).mock.calls.map(([arg]: any) => arg.payload.participantId);
    expect(announced).toEqual([GUEST_A, GUEST_B]);
  });

  it("une écriture qui lève n'arrête pas les paquets suivants : chaque autre invité est écrit et annoncé", async () => {
    const guests = Array.from({ length: REVOCATION_WRITE_BATCH * 2 + 3 }, (_unused, index) => ({
      id: `guest-${index}`, conversationId: CONV_ID, displayName: `Invité ${index}`,
    }));
    const failing = guests[0].id;
    const prisma = makePrisma(guests);
    prisma.participant.updateMany.mockImplementation(async ({ where }: any) => {
      if (where.id === failing) throw new Error('write failed');
      return { count: 1 };
    });

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io: null, manager: null, shareLinkId: LINK_ID })
    ).rejects.toThrow('write failed');

    expect(prisma.participant.updateMany).toHaveBeenCalledTimes(guests.length);
    expect(emitConversationMemberCountEvent).toHaveBeenCalledTimes(guests.length - 1);
  });

  /**
   * #10464 (R2) — un lien sans limite d'usage lançait autant d'écritures
   * concurrentes que d'invités actifs : de quoi saturer le pool de connexions.
   */
  it("n'a jamais plus de REVOCATION_WRITE_BATCH écritures en vol, et les écrit toutes", async () => {
    expect(REVOCATION_WRITE_BATCH).toBeGreaterThanOrEqual(25);
    expect(REVOCATION_WRITE_BATCH).toBeLessThanOrEqual(50);
    const guests = Array.from({ length: REVOCATION_WRITE_BATCH * 3 + 7 }, (_unused, index) => ({
      id: `guest-${index}`, conversationId: CONV_ID, displayName: `Invité ${index}`,
    }));
    const prisma = makePrisma(guests);
    let inFlight = 0;
    let peak = 0;
    prisma.participant.updateMany.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setImmediate(resolve));
      inFlight -= 1;
      return { count: 1 };
    });

    const revoked = await revokeShareLinkGuests({ prisma: prisma as never, io: null, manager: null, shareLinkId: LINK_ID });

    expect(peak).toBeLessThanOrEqual(REVOCATION_WRITE_BATCH);
    expect(peak).toBeGreaterThan(1);
    expect(prisma.participant.updateMany).toHaveBeenCalledTimes(guests.length);
    expect(revoked).toHaveLength(guests.length);
  });

  /**
   * #10468 — un double de Prisma qui TIENT des lignes et ÉVALUE les trois
   * lectures de l'unité : les candidats (lien, actifs), la relecture des
   * écritures rejetées (`id in`, inactives, `leftAt` exact) et l'effectif
   * restant. `commitThenThrow` simule l'écriture validée en base dont la
   * réponse s'est perdue (coupure réseau après le commit).
   */
  type Row = { id: string; conversationId: string; displayName: string; isActive: boolean; leftAt: Date | null };

  function makeRowsPrisma(rows: Row[], faults: { commitThenThrow?: string; failWrite?: string; failRemaining?: boolean } = {}) {
    const pick = ({ id, conversationId, displayName }: Row) => ({ id, conversationId, displayName });
    return {
      participant: {
        findMany: jest.fn<any>(async ({ where }: any) => {
          if (where?.OR) return rows.filter(row => row.isActive).map(pick);
          if (where?.id?.in) {
            return rows
              .filter(row => where.id.in.includes(row.id) && row.isActive === where.isActive && row.leftAt?.getTime() === where.leftAt?.getTime())
              .map(pick);
          }
          if (faults.failRemaining) throw new Error('remaining read failed');
          return [];
        }),
        updateMany: jest.fn<any>(async ({ where, data }: any) => {
          if (where.id === faults.failWrite) throw new Error('write failed before commit');
          const row = rows.find(candidate => candidate.id === where.id && candidate.isActive === where.isActive);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          if (where.id === faults.commitThenThrow) throw new Error('socket closed after commit');
          return { count: 1 };
        }),
      },
    };
  }

  const guestRow = (id: string): Row => ({ id, conversationId: CONV_ID, displayName: id, isActive: true, leftAt: null });

  function makeFailingIo(order: string[], failFetchFor: string) {
    const broadcast: any = { emit: jest.fn<any>(), to: jest.fn<any>(() => broadcast) };
    return {
      to: jest.fn<any>(() => broadcast),
      in: jest.fn<any>((room: string) => ({
        fetchSockets: jest.fn<any>(async () => {
          if (room === ROOMS.user(failFetchFor)) throw new Error('timeout reached while waiting for fetchSockets response');
          return [{
            leave: jest.fn<any>((left: string) => { order.push(`leave:${room}:${left}`); }),
            disconnect: jest.fn<any>(() => { order.push(`disconnect:${room}`); }),
          }];
        }),
      })),
    };
  }

  // Le témoin de l'audit adversarial de #10464, inversé.
  it("l'éviction d'un invité qui lève ne prive pas les suivants de la leur : sortis, déconnectés, caches invalidés, puis l'erreur relancée", async () => {
    const rows = [GUEST_A, GUEST_B, 'participant-guest-c'].map(guestRow);
    const prisma = makeRowsPrisma(rows);
    for (const row of rows) cacheParticipant(row.id, CONV_ID, { id: row.id, conversationId: CONV_ID, isActive: true });
    const order: string[] = [];
    const manager = makeManager(order);

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io: makeFailingIo(order, GUEST_A), manager, shareLinkId: LINK_ID })
    ).rejects.toThrow('fetchSockets');

    expect(rows.every(row => !row.isActive)).toBe(true);
    expect(order).toContain(`disconnect:${ROOMS.user(GUEST_B)}`);
    expect(order).toContain(`disconnect:${ROOMS.user('participant-guest-c')}`);
    expect(order).toContain(`leave:${ROOMS.user(GUEST_B)}:${ROOMS.conversation(CONV_ID)}`);
    expect(order).toContain(`end-call:${CONV_ID}:participant-guest-c`);
    for (const row of rows) {
      expect(getCachedParticipant(row.id, CONV_ID)).toBeUndefined();
      expect(manager.invalidateParticipantCache).toHaveBeenCalledWith(row.id, CONV_ID);
    }
  });

  it("le cache de chaque invité tombe avant tout `await` : un échec de l'annonce n'empêche ni l'invalidation ni l'éviction", async () => {
    const rows = [GUEST_A, GUEST_B].map(guestRow);
    const prisma = makeRowsPrisma(rows, { failRemaining: true });
    for (const row of rows) cacheParticipant(row.id, CONV_ID, { id: row.id, conversationId: CONV_ID, isActive: true });
    const order: string[] = [];
    const { io } = makeIo(order);
    const manager = makeManager(order);

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io, manager, shareLinkId: LINK_ID })
    ).rejects.toThrow('remaining read failed');

    for (const row of rows) {
      expect(getCachedParticipant(row.id, CONV_ID)).toBeUndefined();
      expect(manager.invalidateParticipantCache).toHaveBeenCalledWith(row.id, CONV_ID);
      expect(order).toContain(`disconnect:${ROOMS.user(row.id)}`);
    }
  });

  it("une écriture validée en base dont la réponse s'est perdue est rattrapée : l'invité est évincé sans être annoncé, puis l'erreur relancée", async () => {
    const revokedAt = new Date('2026-10-13T09:00:00.000Z');
    const rows = [guestRow(GUEST_A)];
    const prisma = makeRowsPrisma(rows, { commitThenThrow: GUEST_A });
    cacheParticipant(GUEST_A, CONV_ID, { id: GUEST_A, conversationId: CONV_ID, isActive: true });
    const order: string[] = [];
    const { io } = makeIo(order);

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID, revokedAt })
    ).rejects.toThrow('socket closed after commit');

    expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [GUEST_A] }, isActive: false, leftAt: revokedAt },
    }));
    expect(emitConversationMemberCountEvent).not.toHaveBeenCalled();
    expect(order).toContain(`end-call:${CONV_ID}:${GUEST_A}`);
    expect(order).toContain(`disconnect:${ROOMS.user(GUEST_A)}`);
    expect(getCachedParticipant(GUEST_A, CONV_ID)).toBeUndefined();

    const retried = await revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID });
    expect(retried).toEqual([]);
  });

  it("une écriture rejetée AVANT le commit n'évince personne : l'invité reste actif pour la reprise", async () => {
    const rows = [guestRow(GUEST_A)];
    const prisma = makeRowsPrisma(rows, { failWrite: GUEST_A });
    const order: string[] = [];
    const { io } = makeIo(order);

    await expect(
      revokeShareLinkGuests({ prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID })
    ).rejects.toThrow('write failed before commit');

    expect(order).toEqual([]);
    expect(rows[0].isActive).toBe(true);
  });

  it("une écriture rejetée sur un invité qu'une AUTRE révocation a désactivé (autre `leftAt`) ne l'évince pas une seconde fois", async () => {
    const rows = [{ ...guestRow(GUEST_A), isActive: false, leftAt: new Date('2026-10-13T08:00:00.000Z') }];
    const prisma = makeRowsPrisma([]);
    prisma.participant.findMany.mockImplementation(async ({ where }: any) =>
      where?.OR
        ? [{ id: GUEST_A, conversationId: CONV_ID, displayName: GUEST_A }]
        : rows.filter(row => where?.id?.in?.includes(row.id) && row.leftAt?.getTime() === where.leftAt?.getTime())
    );
    prisma.participant.updateMany.mockRejectedValue(new Error('socket closed'));
    const order: string[] = [];
    const { io } = makeIo(order);

    await expect(
      revokeShareLinkGuests({
        prisma: prisma as never, io, manager: makeManager(order), shareLinkId: LINK_ID,
        revokedAt: new Date('2026-10-13T09:00:00.000Z'),
      })
    ).rejects.toThrow('socket closed');

    expect(order).toEqual([]);
  });
});
