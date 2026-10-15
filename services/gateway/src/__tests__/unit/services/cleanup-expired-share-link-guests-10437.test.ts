/**
 * #10437 — le balayage journalier ne RENDAIT pas l'accès aux invités d'un lien
 * expiré en supprimant ce lien.
 *
 * Les portes du lien échu (`middleware/auth.ts`, `AuthHandler`, les lectures
 * par route) tiennent un lien INTROUVABLE pour ouvert : un lien retiré à la
 * main révoque ses invités (`revokeShareLinkGuests`). `cleanupExpiredData`
 * supprimait pourtant chaque lien expiré sans toucher à ses invités : au
 * balayage suivant l'échéance, leur session redevenait valide.
 *
 * #10440 — les invités ne sont plus terminés par un `updateMany` appauvri
 * (ni départ annoncé, ni socket coupé, ni cache invalidé) : le balayage passe
 * par `revokeShareLinkGuests`, l'unité du balayage horaire, LIEN PAR LIEN ; un
 * lien dont la révocation échoue n'est pas supprimé, et la suppression relit
 * l'échéance dans son `where` — un lien prolongé entre la lecture et la
 * suppression reste.
 *
 * Le double de Prisma JUGE chaque `where` contre des documents.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../services/SessionService', () => ({ cleanupExpiredSessions: jest.fn(async () => 0) }));
jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: { cleanupExpiredVisitSessions: jest.fn(async () => ({ success: true, deletedCount: 0 })) },
}));
jest.mock('../../../services/engagement/EngagementQuotas', () => ({
  EngagementQuotas: jest.fn().mockImplementation(() => ({ purgeVisitBuckets: jest.fn(async () => 0) })),
}));
jest.mock('../../../services/messaging/repairOrphanedMessageSenders', () => ({ repairOrphanedMessageSenders: jest.fn(async () => undefined) }));
jest.mock('../../../services/message-translation/conversationLanguageChanges', () => ({ announceConversationLanguageChange: jest.fn() }));

import { cleanupExpiredData } from '../../../services/cleanupExpiredData';

const EXPIRED = '507f1f77bcf86cd7994390e1';
const EXPIRED_2 = '507f1f77bcf86cd7994390e2';
const LIVE = '507f1f77bcf86cd7994390a1';
const CONV = '507f1f77bcf86cd7994390c1';
const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 3_600_000);

type WorldOptions = {
  readonly guestEndFails?: boolean;
  readonly failingLink?: string;
  readonly extendedDuringRevocation?: string;
  readonly extendedAfterSweepRead?: string;
};

function world(options: WorldOptions = {}) {
  const links: MongoDocument[] = [
    { id: EXPIRED, expiresAt: PAST },
    { id: EXPIRED_2, expiresAt: PAST },
    { id: LIVE, expiresAt: FUTURE },
  ];
  const participants: MongoDocument[] = [
    { id: 'g-col', conversationId: CONV, type: 'anonymous', isActive: true, lastActiveAt: new Date(), shareLinkId: EXPIRED, displayName: 'A' },
    { id: 'g-emb', conversationId: CONV, type: 'anonymous', isActive: true, lastActiveAt: new Date(), anonymousSession: { shareLinkId: EXPIRED }, displayName: 'B' },
    { id: 'g-two', conversationId: CONV, type: 'anonymous', isActive: true, lastActiveAt: new Date(), shareLinkId: EXPIRED_2, displayName: 'C' },
    { id: 'g-live', conversationId: CONV, type: 'anonymous', isActive: true, lastActiveAt: new Date(), shareLinkId: LIVE, displayName: 'D' },
    { id: 'u-reg', conversationId: CONV, type: 'user', userId: 'u1', isActive: true, lastActiveAt: new Date(), shareLinkId: EXPIRED, displayName: 'E' },
  ];
  const linkOf = (where: MongoDocument): string | undefined =>
    (where.OR as MongoDocument[] | undefined)?.[0]?.shareLinkId as string | undefined;
  const prisma = {
    participant: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async ({ where }: { where: MongoDocument }) => {
        const shareLinkId = linkOf(where);
        if (shareLinkId && shareLinkId === options.failingLink) throw new Error('mongo down');
        if (shareLinkId && shareLinkId === options.extendedDuringRevocation) {
          const link = links.find((row) => row.id === shareLinkId);
          if (link) link.expiresAt = FUTURE;
        }
        return participants.filter((row) => matchesMongoWhere(row, where));
      }),
      updateMany: jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (options.guestEndFails && 'id' in where) throw new Error('mongo down');
        const rows = participants.filter((row) => !('sentMessages' in where) && matchesMongoWhere(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async ({ where }: { where: MongoDocument }) => {
        const read = links.filter((row) => matchesMongoWhere(row, where)).map((row) => ({ ...row }));
        const extended = links.find((row) => row.id === options.extendedAfterSweepRead);
        if (extended) extended.expiresAt = FUTURE;
        return read;
      }),
      findFirst: jest.fn(async ({ where }: { where: MongoDocument }) => links.find((row) => matchesMongoWhere(row, where)) ?? null),
      deleteMany: jest.fn(async ({ where }: { where: MongoDocument }) => {
        const doomed = links.filter((row) => matchesMongoWhere(row, where));
        doomed.forEach((row) => links.splice(links.indexOf(row), 1));
        return { count: doomed.length };
      }),
    },
  };
  return { prisma, links, participants };
}

function liveRegistry() {
  const disconnected: string[] = [];
  const emitted: string[] = [];
  const broadcast: Record<string, unknown> = {
    emit: jest.fn((event: string) => { emitted.push(event); }),
    to: jest.fn(() => broadcast),
    except: jest.fn(() => broadcast),
  };
  const io = {
    to: jest.fn(() => broadcast),
    except: jest.fn(() => broadcast),
    in: jest.fn((room: string) => ({
      fetchSockets: jest.fn(async () => [{ leave: jest.fn(), disconnect: jest.fn(() => { disconnected.push(room); }) }]),
    })),
  };
  return { io, disconnected, emitted };
}

const byId = (rows: MongoDocument[], id: string) => rows.find((row) => row.id === id);

describe('cleanupExpiredData termine les invités d’un lien expiré avant de supprimer le lien (#10437)', () => {
  it('termine les invités du lien expiré (colonne et session embarquée), supprime le lien, épargne le reste', async () => {
    const { prisma, links, participants } = world();

    await cleanupExpiredData(prisma as never);

    expect(byId(participants, 'g-col')?.isActive).toBe(false);
    expect(byId(participants, 'g-emb')?.isActive).toBe(false);
    expect(byId(participants, 'g-two')?.isActive).toBe(false);
    expect(byId(participants, 'g-live')?.isActive).toBe(true);
    expect(byId(participants, 'u-reg')?.isActive).toBe(true);
    expect(links.map((link) => link.id)).toEqual([LIVE]);
  });

  it('ne supprime AUCUN lien quand les invités n’ont pas pu être terminés', async () => {
    const { prisma, links } = world({ guestEndFails: true });

    await cleanupExpiredData(prisma as never);

    expect(links.map((link) => link.id)).toEqual([EXPIRED, EXPIRED_2, LIVE]);
  });
});

describe('cleanupExpiredData révoque par revokeShareLinkGuests (#10440)', () => {
  it('annonce le départ et coupe le socket de chaque invité révoqué, par le vivant que le manager lui donne', async () => {
    const { prisma } = world();
    const { io, disconnected, emitted } = liveRegistry();

    await cleanupExpiredData(prisma as never, { resolveIO: () => io as never, resolveManager: () => null });

    expect([...disconnected].sort()).toEqual(['user:g-col', 'user:g-emb', 'user:g-two']);
    expect(emitted.filter((event) => event === 'conversation:participant-left').length).toBeGreaterThanOrEqual(3);
  });

  it('un lien dont la révocation échoue reste — les autres liens expirés sont révoqués et supprimés', async () => {
    const { prisma, links, participants } = world({ failingLink: EXPIRED });

    await cleanupExpiredData(prisma as never);

    expect(links.map((link) => link.id)).toEqual([EXPIRED, LIVE]);
    expect(byId(participants, 'g-col')?.isActive).toBe(true);
    expect(byId(participants, 'g-two')?.isActive).toBe(false);
  });

  it('la suppression relit l’échéance : un lien PROLONGÉ entre la lecture et la suppression n’est pas supprimé', async () => {
    const { prisma, links } = world({ extendedDuringRevocation: EXPIRED });

    await cleanupExpiredData(prisma as never);

    expect(links.map((link) => link.id)).toEqual([EXPIRED, LIVE]);
  });
});

/**
 * #10443 — l'audit adversarial de #10440 : la suppression relisait l'échéance,
 * la RÉVOCATION non. Un lien prolongé entre la lecture du balayage et la
 * révocation voyait ses invités révoqués alors que le lien survivait. Le
 * balayage relit désormais l'échéance juste avant de révoquer chaque lien.
 */
describe('cleanupExpiredData ne révoque pas les invités d’un lien prolongé après sa lecture (#10443)', () => {
  it('un lien PROLONGÉ entre la lecture du balayage et sa révocation garde ses invités et reste', async () => {
    const { prisma, links, participants } = world({ extendedAfterSweepRead: EXPIRED });

    await cleanupExpiredData(prisma as never);

    expect(byId(participants, 'g-col')?.isActive).toBe(true);
    expect(byId(participants, 'g-emb')?.isActive).toBe(true);
    expect(byId(participants, 'g-two')?.isActive).toBe(false);
    expect(links.map((link) => link.id)).toEqual([EXPIRED, LIVE]);
  });
});
