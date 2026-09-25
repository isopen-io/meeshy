/**
 * `GET /admin/users/:userId/stats` — les compteurs d'un membre, vus depuis sa
 * fiche d'administration (#7845 C).
 *
 * Le faux Prisma HONORE les `where` qui portent une décision (`bansActive`,
 * `sessionsActive`) : un double qui rendrait le même nombre quel que soit le
 * filtre ne pourrait pas voir un filtre oublié — leçon 300.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { registerAdminUserStatsRoute } from '../../../../routes/admin/user-stats-admin';
import { computeAdminUserStats, ADMIN_STAT_KEYS } from '../../../../services/admin/admin-user-stats';
import {
  REPORTED_MESSAGES_MESSAGE_SCAN_CAP,
  REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP,
} from '../../../../routes/admin/user-reports';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';
const NOW = new Date('2026-09-24T12:00:00Z');

type Where = Record<string, unknown>;
// `liftedAt` ABSENT (`undefined`) est la forme qu'écrit `createBan` sur
// MongoDB : le faux distingue « valant null » de « jamais écrit », comme la base.
type Ban = { liftedAt?: Date | null; expiresAt: Date | null };
type Session = { isValid: boolean; expiresAt: Date };

const BANS: readonly Ban[] = [
  { liftedAt: null, expiresAt: null },
  { liftedAt: null, expiresAt: new Date('2026-12-01') },
  { liftedAt: new Date('2026-08-01'), expiresAt: null },
  { liftedAt: null, expiresAt: new Date('2026-09-01') },
  { expiresAt: null },
];

const SESSIONS: readonly Session[] = [
  { isValid: true, expiresAt: new Date('2026-10-01') },
  { isValid: true, expiresAt: new Date('2026-09-01') },
  { isValid: false, expiresAt: new Date('2026-10-01') },
];

type Clause = Record<string, unknown>;

function clauseLiftedAt(ban: Ban, condition: unknown): boolean {
  if (condition === null) return ban.liftedAt === null;
  if ((condition as { isSet?: boolean }).isSet === false) return ban.liftedAt === undefined;
  return false;
}

function clauseExpiresAt(ban: Ban, condition: unknown): boolean {
  if (condition === null) return ban.expiresAt === null;
  const gt = (condition as { gt?: Date }).gt;
  return ban.expiresAt !== null && gt !== undefined && ban.expiresAt > gt;
}

function satisfait(ban: Ban, clause: Clause): boolean {
  return Object.entries(clause).every(([cle, valeur]) => {
    if (cle === 'userId') return true;
    if (cle === 'AND') return (valeur as Clause[]).every((c) => satisfait(ban, c));
    if (cle === 'OR') return (valeur as Clause[]).some((c) => satisfait(ban, c));
    if (cle === 'liftedAt') return clauseLiftedAt(ban, valeur);
    if (cle === 'expiresAt') return clauseExpiresAt(ban, valeur);
    return false;
  });
}

function banActif(ban: Ban, where: Where): boolean {
  return satisfait(ban, where);
}

function sessionActive(session: Session, where: Where): boolean {
  const gt = (where.expiresAt as { gt?: Date } | undefined)?.gt;
  return (where.isValid === undefined || session.isValid === where.isValid) && (gt === undefined || session.expiresAt > gt);
}

function compteur(valeur: number) {
  return { count: jest.fn(async () => valeur) };
}

function fauxPrisma(options: { existe?: boolean; participations?: readonly string[]; messages?: readonly string[] } = {}) {
  const participations = options.participations ?? ['p1'];
  const messages = options.messages ?? ['m1', 'm2'];
  return {
    user: {
      findUnique: jest.fn(async () =>
        options.existe === false ? null : { id: TARGET_ID, createdAt: new Date('2026-09-14T12:00:00Z') }
      ),
    },
    message: {
      count: jest.fn(async () => 40),
      groupBy: jest.fn(async () => [{ originalLanguage: 'fr' }, { originalLanguage: 'en' }]),
      findMany: jest.fn(async () => messages.map((id) => ({ id }))),
    },
    participant: { count: jest.fn(async () => 6), findMany: jest.fn(async () => participations.map((id) => ({ id }))) },
    friendRequest: {
      count: jest.fn(async (args: { where: Where }) => {
        if (args.where.status === 'accepted') return 9;
        if (args.where.status === 'pending') return args.where.senderId ? 4 : 2;
        return 11;
      }),
    },
    post: {
      count: jest.fn(async (args: { where: Where }) => ({ POST: 5, REEL: 3, STORY: 7 } as Record<string, number>)[String(args.where.type)] ?? 0),
    },
    postComment: compteur(12),
    reaction: compteur(33),
    postReaction: compteur(21),
    commentReaction: compteur(6),
    messageAttachment: compteur(14),
    postMedia: compteur(8),
    userContact: compteur(17),
    communityMember: compteur(4),
    report: {
      count: jest.fn(async (args: { where: Where }) => {
        if (args.where.reporterId) return 1;
        return args.where.reportedType === 'message' ? 8 : 3;
      }),
    },
    userSession: {
      count: jest.fn(async (args: { where: Where }) => SESSIONS.filter((s) => sessionActive(s, args.where)).length),
    },
    ban: {
      count: jest.fn(async (args: { where: Where }) => BANS.filter((b) => banActif(b, args.where)).length),
    },
    conversationShareLink: compteur(2),
    trackingLink: compteur(5),
    affiliateToken: compteur(1),
  };
}

async function monter(role: string, prisma = fauxPrisma()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown as FastifyInstance['prisma']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
      hasFullAccess: true,
    };
  });
  await app.register(async (scope) => registerAdminUserStatsRoute(scope, { now: () => NOW }), { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const MODERATEUR = { canReadReports: true } as const;

type Appel = { where: Where };
const wheres = (mock: jest.Mock): Where[] => mock.mock.calls.map((c) => (c[0] as Appel).where);

describe('computeAdminUserStats', () => {
  it('sert chaque compteur de la fiche', async () => {
    const prisma = fauxPrisma();
    const stats = await computeAdminUserStats(prisma as never, TARGET_ID, NOW, MODERATEUR);

    expect(Object.keys(stats.counts).sort()).toEqual([...ADMIN_STAT_KEYS].sort());
    expect(stats.counts).toMatchObject({
      messagesSent: 40,
      conversations: 6,
      posts: 5,
      reels: 3,
      stories: 7,
      comments: 12,
      messageReactions: 33,
      postReactions: 21,
      commentReactions: 6,
      attachments: 14,
      postMedia: 8,
      friends: 9,
      friendRequestsPending: 2,
      friendRequestsSent: 4,
      contacts: 17,
      communities: 4,
      reportsReceived: 3,
      reportsMade: 1,
      reportsOnMessages: 8,
      shareLinks: 2,
      trackingLinks: 5,
      affiliations: 1,
      bansTotal: 5,
    });
    expect(stats.languages).toEqual(['fr', 'en']);
    expect(stats.computedAt).toBe(NOW.toISOString());
  });

  it('bansActive exclut les bans levés et échus, et compte celui dont liftedAt n\'a jamais été écrit', async () => {
    const stats = await computeAdminUserStats(fauxPrisma() as never, TARGET_ID, NOW, MODERATEUR);
    expect(stats.counts.bansActive).toBe(3);
  });

  it('sessionsActive exclut les sessions expirées ou invalidées', async () => {
    const stats = await computeAdminUserStats(fauxPrisma() as never, TARGET_ID, NOW, MODERATEUR);
    expect(stats.counts.sessionsActive).toBe(1);
  });

  it('compte les réactions de messages par la participation, jamais par un userId absent du modèle', async () => {
    const prisma = fauxPrisma();
    await computeAdminUserStats(prisma as never, TARGET_ID, NOW, MODERATEUR);
    expect(prisma.reaction.count).toHaveBeenCalledWith({ where: { participant: { userId: TARGET_ID } } });
  });
});

describe('computeAdminUserStats — signalements', () => {
  it('compte les signalements visant les MESSAGES du membre, énumérés sous les plafonds de reported-messages', async () => {
    const prisma = fauxPrisma();
    await computeAdminUserStats(prisma as never, TARGET_ID, NOW, MODERATEUR);
    expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: TARGET_ID, type: 'user' },
      take: REPORTED_MESSAGES_PARTICIPANT_SCAN_CAP,
    }));
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { senderId: { in: ['p1'] } },
      take: REPORTED_MESSAGES_MESSAGE_SCAN_CAP,
    }));
    expect(wheres(prisma.report.count)).toContainEqual({ reportedType: 'message', reportedEntityId: { in: ['m1', 'm2'] } });
  });

  it('rend 0 signalement sur messages sans participation, sans énumérer de message', async () => {
    const prisma = fauxPrisma({ participations: [] });
    const stats = await computeAdminUserStats(prisma as never, TARGET_ID, NOW, MODERATEUR);
    expect(stats.counts.reportsOnMessages).toBe(0);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('rend les trois compteurs de signalements à null sans le droit de modérer, sans lire la table', async () => {
    const prisma = fauxPrisma();
    const stats = await computeAdminUserStats(prisma as never, TARGET_ID, NOW, { canReadReports: false });
    expect(stats.counts.reportsReceived).toBeNull();
    expect(stats.counts.reportsMade).toBeNull();
    expect(stats.counts.reportsOnMessages).toBeNull();
    expect(prisma.report.count).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /admin/users/:userId/stats', () => {
  it('rend les signalements à null pour AUDIT (canViewUserDetails sans canModerateContent), à travers le sérialiseur', async () => {
    const prisma = fauxPrisma();
    const app = await monter('AUDIT', prisma);
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const { counts } = res.json().data;
    expect(counts.reportsReceived).toBeNull();
    expect(counts.reportsMade).toBeNull();
    expect(counts.reportsOnMessages).toBeNull();
    expect(counts.messagesSent).toBe(40);
    expect(prisma.report.count).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert les signalements à un MODERATOR', async () => {
    const app = await monter('MODERATOR');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.counts).toMatchObject({ reportsReceived: 3, reportsMade: 1, reportsOnMessages: 8 });
    await app.close();
  });

  it('refuse un identifiant qui n\'est pas un ObjectId (400) avant toute lecture', async () => {
    const prisma = fauxPrisma();
    const app = await monter('ADMIN', prisma);
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users/not-an-id/stats' });
    expect(res.statusCode).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('sert les compteurs à un ADMIN', async () => {
    const app = await monter('ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.userId).toBe(TARGET_ID);
    expect(data.counts.bansActive).toBe(3);
    expect(Array.isArray(data.achievements)).toBe(true);
    await app.close();
  });

  it('rend 404 pour un membre inexistant', async () => {
    const app = await monter('ADMIN', fauxPrisma({ existe: false }));
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse un rôle sans canViewUsers (USER)', async () => {
    const app = await monter('USER');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/stats` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('computeAdminUserStats — soft-delete Mongo', () => {
  it('compte les commentaires vivants par NOT_DELETED (champ absent), jamais par deletedAt: null', async () => {
    const prisma = fauxPrisma();
    await computeAdminUserStats(prisma as never, TARGET_ID, NOW, MODERATEUR);
    expect(prisma.postComment.count).toHaveBeenCalledWith({ where: { authorId: TARGET_ID, deletedAt: { isSet: false } } });
  });
});
