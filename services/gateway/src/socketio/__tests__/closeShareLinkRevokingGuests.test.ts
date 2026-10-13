/**
 * #10470 — fermer un GROS lien ne fait plus attendre l'hôte.
 *
 * `PATCH /links/:id/toggle`, `DELETE /links/:id` et la fermeture admin
 * attendaient la révocation ENTIÈRE, invité par invité : ~5 s pour 1 000
 * invités, ~50 s pour 10 000 (délai client iOS 60 s). Au-delà d'un seuil, le
 * lien est fermé tout de suite — et la révocation en attente est ÉCRITE dans la
 * même écriture (`guestRevocationPendingAt`), pour qu'un échec ou un
 * redémarrage la laisse au balayage horaire, jamais perdue.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../emitConversationMemberCount', () => ({
  emitConversationMemberCountEvent: jest.fn(),
}));

import {
  ASYNC_GUEST_REVOCATION_THRESHOLD,
  DEFERRED_REVOCATION_RETRY_MS,
  closeShareLinkRevokingGuests,
  runPendingGuestRevocation,
} from '../closeShareLinkRevokingGuests';
import { FETCH_SOCKETS_DEADLINE_MS, revokeShareLinkGuests } from '../revokeShareLinkGuests';
import { ExpiredShareLinksCleanupService } from '../../services/ExpiredShareLinksCleanupService';
import { resetParticipantLookupCache } from '../../utils/participant-lookup-cache';
import { matchesMongoWhere } from '../../__tests__/helpers/mongo-where';

const LINK_ID = '507f1f77bcf86cd799439099';
const CONV_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-10-13T10:00:00.000Z');

function makePrisma(activeGuests: number, order: string[] = []) {
  return {
    participant: {
      count: jest.fn<any>(async () => activeGuests),
      findMany: jest.fn<any>(async ({ where }: any) =>
        where?.isActive === true
          ? [{ id: 'guest-1', conversationId: CONV_ID, displayName: 'Invité' }]
          : []
      ),
      updateMany: jest.fn<any>(async () => {
        order.push('guest-write');
        return { count: 1 };
      }),
    },
    callParticipant: { findMany: jest.fn<any>(async () => []) },
    conversationShareLink: {
      updateMany: jest.fn<any>(async () => ({ count: 1 })),
      findMany: jest.fn<any>(async () => []),
      findUnique: jest.fn<any>(async () => ({ isActive: true })),
    },
  };
}

function makeIo() {
  const broadcast: any = { emit: jest.fn<any>(), to: jest.fn<any>(() => broadcast), except: jest.fn<any>(() => broadcast) };
  return {
    to: jest.fn<any>(() => broadcast),
    in: jest.fn<any>(() => ({ fetchSockets: jest.fn<any>(async () => []) })),
  };
}

const closeRecorder = (order: string[]) =>
  jest.fn<any>(async (extra: Record<string, unknown>) => {
    order.push('close');
    return { closed: true, extra };
  });

describe('closeShareLinkRevokingGuests — le geste de l’hôte ne porte plus la révocation d’un gros lien (#10470)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetParticipantLookupCache();
  });

  it('un petit lien : la révocation précède la fermeture, comme avant', async () => {
    const order: string[] = [];
    const prisma = makePrisma(3, order);
    const close = closeRecorder(order);
    const detach = jest.fn<any>();

    const outcome = await closeShareLinkRevokingGuests({
      prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, close, detach, now: () => NOW,
    });

    expect(outcome.revocation).toBe('done');
    expect(order).toEqual(['guest-write', 'close']);
    expect(close).toHaveBeenCalledWith({});
    expect(detach).not.toHaveBeenCalled();
  });

  it('un gros lien : fermé tout de suite, la révocation en attente écrite DANS la fermeture, aucun invité écrit avant la réponse', async () => {
    const order: string[] = [];
    const prisma = makePrisma(ASYNC_GUEST_REVOCATION_THRESHOLD + 1, order);
    const close = closeRecorder(order);
    const detached: Array<() => Promise<void>> = [];

    const outcome = await closeShareLinkRevokingGuests({
      prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, close,
      detach: (task) => { detached.push(task); }, now: () => NOW,
    });

    expect(outcome.revocation).toBe('deferred');
    expect(outcome.result).toEqual({ closed: true, extra: { guestRevocationPendingAt: NOW } });
    expect(order).toEqual(['close']);
    expect(detached).toHaveLength(1);

    await detached[0]();

    expect(order).toEqual(['close', 'guest-write']);
    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'guest-1', isActive: true },
      data: { isActive: false, leftAt: NOW },
    });
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: LINK_ID, guestRevocationPendingAt: NOW },
      data: { guestRevocationPendingAt: null },
    });
  });

  it('audit 1 — tant que le lien reste FERMÉ, la révocation différée retire aussi l’invité créé après la marque', async () => {
    const world = [
      { id: 'guest-old', conversationId: CONV_ID, displayName: 'Ancien', type: 'anonymous', isActive: true, shareLinkId: LINK_ID, joinedAt: new Date(NOW.getTime() - 60_000) },
      { id: 'guest-late', conversationId: CONV_ID, displayName: 'Tardif', type: 'anonymous', isActive: true, shareLinkId: LINK_ID, joinedAt: new Date(NOW.getTime() + 60_000) },
    ];
    const prisma = makePrisma(0);
    prisma.conversationShareLink.findUnique.mockResolvedValue({ isActive: false });
    prisma.participant.findMany.mockImplementation(async ({ where }: any) =>
      world.filter((row) => matchesMongoWhere(row as never, where)).map(({ id, conversationId, displayName }) => ({ id, conversationId, displayName }))
    );

    await runPendingGuestRevocation({ prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, pendingSince: NOW });

    const written = prisma.participant.updateMany.mock.calls.map(([args]: any) => args.where.id);
    expect(written).toEqual(['guest-old', 'guest-late']);
  });

  it('audit 3 — une révocation différée qui échoue est relancée sans attendre le balayage horaire', async () => {
    jest.useFakeTimers();
    try {
      const prisma = makePrisma(ASYNC_GUEST_REVOCATION_THRESHOLD + 1);
      prisma.participant.updateMany.mockRejectedValueOnce(new Error('pool saturé'));

      await closeShareLinkRevokingGuests({
        prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, close: closeRecorder([]), now: () => NOW,
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(DEFERRED_REVOCATION_RETRY_MS[0]);
      expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
        where: { id: LINK_ID, guestRevocationPendingAt: NOW },
        data: { guestRevocationPendingAt: null },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('R7 — la révocation différée épargne le nouveau venu entré après la fermeture (lien rouvert)', async () => {
    const world = [
      { id: 'guest-old', conversationId: CONV_ID, displayName: 'Ancien', type: 'anonymous', isActive: true, shareLinkId: LINK_ID, joinedAt: new Date(NOW.getTime() - 60_000) },
      { id: 'guest-new', conversationId: CONV_ID, displayName: 'Nouveau', type: 'anonymous', isActive: true, shareLinkId: LINK_ID, joinedAt: new Date(NOW.getTime() + 60_000) },
    ];
    const prisma = makePrisma(0);
    prisma.participant.findMany.mockImplementation(async ({ where }: any) =>
      world.filter((row) => matchesMongoWhere(row as never, where)).map(({ id, conversationId, displayName }) => ({ id, conversationId, displayName }))
    );

    await runPendingGuestRevocation({ prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, pendingSince: NOW });

    const written = prisma.participant.updateMany.mock.calls.map(([args]: any) => args.where.id);
    expect(written).toEqual(['guest-old']);
  });

  it('R7 — une passe plus ancienne ne lève pas une marque plus récente', async () => {
    const link = { id: LINK_ID, guestRevocationPendingAt: new Date(NOW.getTime() + 60_000) };
    const prisma = makePrisma(0);
    prisma.conversationShareLink.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (!matchesMongoWhere(link as never, where)) return { count: 0 };
      Object.assign(link, data);
      return { count: 1 };
    });

    await runPendingGuestRevocation({ prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, pendingSince: NOW });

    expect(link.guestRevocationPendingAt).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('une révocation différée qui échoue garde sa marque pour le balayage, sans rejet détaché', async () => {
    const prisma = makePrisma(0);
    prisma.participant.updateMany.mockRejectedValue(new Error('pool saturé'));

    await expect(
      runPendingGuestRevocation({ prisma: prisma as never, io: makeIo(), manager: null, shareLinkId: LINK_ID, pendingSince: NOW })
    ).resolves.toBe(false);

    expect(prisma.conversationShareLink.updateMany).not.toHaveBeenCalled();
  });

  // R6 — l'ordre de la reprise et sa rotation se lisent par leur EFFET dans
  // `ExpiredShareLinksCleanupService.pending-rotation.test.ts` (#10492).
  it('le balayage horaire reprend chaque lien dont la révocation est restée en attente', async () => {
    const prisma = makePrisma(0);
    prisma.conversationShareLink.findMany.mockImplementation(async ({ where }: any) =>
      where?.guestRevocationPendingAt ? [{ id: LINK_ID, guestRevocationPendingAt: NOW }] : []
    );

    await new ExpiredShareLinksCleanupService(prisma as never, { now: () => NOW, resolveIO: () => makeIo() }).cleanup();

    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'guest-1', isActive: true },
      data: { isActive: false, leftAt: NOW },
    });
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: LINK_ID, guestRevocationPendingAt: NOW },
      data: { guestRevocationPendingAt: null },
    });
  });
});

describe('revokeShareLinkGuests — un fetchSockets qui ne répond plus ne bloque pas la révocation (#10470)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejette au-delà du délai au lieu de pendre, les invités déjà écrits restant inactifs', async () => {
    jest.useFakeTimers();
    const prisma = makePrisma(1);
    const io = {
      to: makeIo().to,
      in: jest.fn<any>(() => ({ fetchSockets: () => new Promise<never>(() => {}) })),
    };

    const revocation = revokeShareLinkGuests({ prisma: prisma as never, io, manager: null, shareLinkId: LINK_ID });
    const settled = revocation.then(() => 'resolved', () => 'rejected');
    await jest.advanceTimersByTimeAsync(FETCH_SOCKETS_DEADLINE_MS * 4);

    await expect(settled).resolves.toBe('rejected');
    expect(prisma.participant.updateMany).toHaveBeenCalled();
  });

  it('R3 — une passe de N invités ne coûte qu’UN délai : après le premier dépassement, les fetchSockets restants sont sautés', async () => {
    jest.useFakeTimers();
    const guests = Array.from({ length: 5 }, (_unused, index) => ({ id: `guest-${index}`, conversationId: CONV_ID, displayName: `Invité ${index}` }));
    const prisma = makePrisma(guests.length);
    prisma.participant.findMany.mockImplementation(async ({ where }: any) => (where?.isActive === true ? guests : []));
    const fetchSockets = jest.fn<any>(() => new Promise<never>(() => {}));
    const io = { to: makeIo().to, in: jest.fn<any>(() => ({ fetchSockets })) };

    const settled = revokeShareLinkGuests({ prisma: prisma as never, io, manager: null, shareLinkId: LINK_ID })
      .then(() => 'resolved', () => 'rejected');
    await jest.advanceTimersByTimeAsync(FETCH_SOCKETS_DEADLINE_MS + 100);

    await expect(settled).resolves.toBe('rejected');
    expect(fetchSockets).toHaveBeenCalledTimes(1);
  });
});

describe('ExpiredShareLinksCleanupService — deux balayages ne se chevauchent pas (#10470, R3)', () => {
  it('un balayage lancé pendant qu’un autre tourne ne relit rien et rend une passe vide', async () => {
    const prisma = makePrisma(0);
    let release: (rows: unknown[]) => void = () => {};
    prisma.conversationShareLink.findMany.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const service = new ExpiredShareLinksCleanupService(prisma as never, { now: () => NOW });

    const first = service.cleanup();
    const second = await service.cleanup();
    release([]);
    await first;

    expect(second).toEqual({ revokedLinks: 0, revokedGuests: 0 });
    expect(prisma.conversationShareLink.findMany).toHaveBeenCalledTimes(2);
  });
});
