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
 * Désormais les invités d'un lien expiré sont terminés AVANT la suppression du
 * lien, et un échec de cette écriture ne supprime aucun lien.
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

import { cleanupExpiredData } from '../../../services/cleanupExpiredData';

const EXPIRED = '507f1f77bcf86cd7994390e1';
const LIVE = '507f1f77bcf86cd7994390a1';
const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 3_600_000);

function world(options: { guestEndFails?: boolean } = {}) {
  const links: MongoDocument[] = [
    { id: EXPIRED, expiresAt: PAST },
    { id: LIVE, expiresAt: FUTURE },
  ];
  const participants: MongoDocument[] = [
    { id: 'g-col', type: 'anonymous', isActive: true, lastActiveAt: new Date(), shareLinkId: EXPIRED },
    { id: 'g-emb', type: 'anonymous', isActive: true, lastActiveAt: new Date(), anonymousSession: { shareLinkId: EXPIRED } },
    { id: 'g-live', type: 'anonymous', isActive: true, lastActiveAt: new Date(), shareLinkId: LIVE },
    { id: 'u-reg', type: 'user', userId: 'u1', isActive: true, lastActiveAt: new Date(), shareLinkId: EXPIRED },
  ];
  const prisma = {
    participant: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      updateMany: jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (options.guestEndFails && (where as { OR?: unknown }).OR) throw new Error('mongo down');
        const rows = participants.filter((row) => !('sentMessages' in where) && matchesMongoWhere(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async ({ where }: { where: MongoDocument }) => links.filter((row) => matchesMongoWhere(row, where))),
      deleteMany: jest.fn(async ({ where }: { where: MongoDocument }) => {
        const doomed = links.filter((row) => matchesMongoWhere(row, where));
        doomed.forEach((row) => links.splice(links.indexOf(row), 1));
        return { count: doomed.length };
      }),
    },
  };
  return { prisma, links, participants };
}

const byId = (rows: MongoDocument[], id: string) => rows.find((row) => row.id === id);

describe('cleanupExpiredData termine les invités d’un lien expiré avant de supprimer le lien (#10437)', () => {
  it('termine les invités du lien expiré (colonne et session embarquée), supprime le lien, épargne le reste', async () => {
    const { prisma, links, participants } = world();

    await cleanupExpiredData(prisma as never);

    expect(byId(participants, 'g-col')?.isActive).toBe(false);
    expect(byId(participants, 'g-emb')?.isActive).toBe(false);
    expect(byId(participants, 'g-live')?.isActive).toBe(true);
    expect(byId(participants, 'u-reg')?.isActive).toBe(true);
    expect(links.map((link) => link.id)).toEqual([LIVE]);
  });

  it('ne supprime AUCUN lien quand les invités n’ont pas pu être terminés', async () => {
    const { prisma, links } = world({ guestEndFails: true });

    await cleanupExpiredData(prisma as never);

    expect(links.map((link) => link.id)).toEqual([EXPIRED, LIVE]);
  });
});
