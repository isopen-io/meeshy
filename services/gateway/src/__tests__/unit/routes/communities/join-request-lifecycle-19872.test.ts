/**
 * La vie d'une demande d'entrée en communauté (#19872).
 *
 * 1. Entrer par une AUTRE porte (invitation, ajout d'un administrateur, entrée
 *    implicite par un salon, adhésion directe) CLÔT les demandes en attente de
 *    la personne : quitter ensuite ne ressuscite pas « Demande envoyée », et
 *    accepter la vieille demande ne la fait pas revenir.
 * 2. Une demande que personne ne tranche n'attend pas indéfiniment : passé
 *    `JOIN_REQUEST_TTL_MS`, elle n'est plus servie à personne (ni au demandeur,
 *    ni aux intendants), ne se tranche plus, et une nouvelle demande peut partir
 *    — sans que le demandeur apprenne POURQUOI personne ne l'a tranchée
 *    (blocage avec les intendants, par exemple).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../services/community-member-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-member-broadcast') as Record<string, unknown>;
  return { ...actual, scheduleCommunityMemberBroadcastFrom: jest.fn() };
});

jest.mock('../../../../services/community-join-request-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-join-request-broadcast') as Record<string, unknown>;
  return { ...actual, scheduleCommunityJoinRequestedFrom: jest.fn() };
});

jest.mock('../../../../services/notifications/community-added', () => ({
  scheduleCommunityAddedAnnouncement: jest.fn(),
}));

import { registerMembershipRoutes } from '../../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../../routes/communities/members';
import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { requestCommunityEntry } from '../../../../routes/communities/admission';
import { viewerJoinRequestState } from '../../../../routes/communities/join-request-state';
import {
  JOIN_REQUEST_TTL_MS,
  closePendingJoinRequests,
  liveJoinRequestWhere,
} from '../../../../services/community-join-request-lifecycle';
import { applyCommunityAdmission } from '../../../../services/conversations/communityMembershipSync';

const ADMIN = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ARRIVANT = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';
const ROW = '507f1f77bcf86cd799430066';
const NOW = new Date('2026-11-19T12:00:00Z');

const authAs = (userId: string) => ({
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'u', displayName: 'U', role: 'USER' },
});

const USABLE = { isActive: true, deletedAt: null, deactivatedAt: null };

function makePrisma(options: { requiresJoinApproval?: boolean; joinRequestUpdate?: () => Promise<unknown> } = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false,
        requiresJoinApproval: options.requiresJoinApproval ?? true,
        members: [{ userId: ADMIN, role: 'admin' }],
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(3),
      create: jest.fn<any>(async ({ data }: any) => ({ id: ROW, isActive: true, ...data, user: { id: data.userId, username: 'n', displayName: 'N', avatar: null } })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
    },
    communityJoinRequest: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: REQUEST, userId: ARRIVANT, via: 'self', country: null, user: { id: ARRIVANT, ...USABLE },
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>(async ({ data }: any) => ({ id: REQUEST, ...data })),
      updateMany: jest.fn<any>(options.joinRequestUpdate ?? (async () => ({ count: 1 }))),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn<any>(async ({ where }: any) => (where.OR ? null : { id: ARRIVANT, birthDate: null })),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const apps: FastifyInstance[] = [];
const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };
async function build(prisma: any, userId = ADMIN): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authAs(userId); });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app, { engagement });
  await registerMemberRoutes(app);
  await registerEntryRoutes(app, { engagement });
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

const closures = (prisma: any) =>
  prisma.communityJoinRequest.updateMany.mock.calls
    .map((c: any) => c[0])
    .filter((args: any) => args.data.status === 'accepted' && args.where.status === 'pending' && args.where.userId);

describe('closePendingJoinRequests — la clôture à l\'entrée', () => {
  it('bascule en `accepted` les demandes EN ATTENTE des personnes entrées, dans CETTE communauté seulement', async () => {
    const prisma = makePrisma();
    const closed = await closePendingJoinRequests(prisma, { communityId: COMM, userIds: [ARRIVANT], decidedBy: ADMIN, now: NOW });

    expect(closed).toBe(1);
    expect(prisma.communityJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { communityId: COMM, userId: { in: [ARRIVANT] }, status: 'pending' },
      data: { status: 'accepted', decidedAt: NOW, decidedBy: ADMIN },
    });
  });

  it('personne n\'entre : aucune écriture', async () => {
    const prisma = makePrisma();
    expect(await closePendingJoinRequests(prisma, { communityId: COMM, userIds: [], decidedBy: null, now: NOW })).toBe(0);
    expect(prisma.communityJoinRequest.updateMany).not.toHaveBeenCalled();
  });

  it('ne lève jamais : l\'entrée a eu lieu, une clôture en panne ne la défait pas', async () => {
    const prisma = makePrisma({ joinRequestUpdate: async () => { throw new Error('mongo'); } });
    await expect(closePendingJoinRequests(prisma, { communityId: COMM, userIds: [ARRIVANT], decidedBy: ADMIN, now: NOW })).resolves.toBe(0);
  });
});

describe('Entrer par une autre porte clôt la demande en attente', () => {
  it('POST …/invite : la demande de l\'invité est close au nom de celui qui invite', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/invite`, payload: { userId: ARRIVANT } });

    expect(res.statusCode).toBe(200);
    expect(closures(prisma)).toEqual([
      expect.objectContaining({
        where: { communityId: COMM, userId: { in: [ARRIVANT] }, status: 'pending' },
        data: expect.objectContaining({ status: 'accepted', decidedBy: ADMIN }),
      }),
    ]);
  });

  it('POST …/members (administrateur) : la demande de la personne ajoutée est close', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/members`, payload: { userId: ARRIVANT } });

    expect(res.statusCode).toBe(200);
    expect(closures(prisma)).toHaveLength(1);
  });

  it('POST …/members sur un membre DÉJÀ actif : rien à clore, rien n\'est écrit', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findFirst.mockResolvedValue({ id: ROW, isActive: true, userId: ARRIVANT, role: 'member' });
    const app = await build(prisma);
    await app.inject({ method: 'POST', url: `/communities/${COMM}/members`, payload: { userId: ARRIVANT } });

    expect(closures(prisma)).toEqual([]);
  });

  it('POST …/join sur une communauté à entrée directe : une demande restée d\'avant (la communauté validait) est close', async () => {
    const prisma = makePrisma({ requiresJoinApproval: false });
    const app = await build(prisma, ARRIVANT);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join` });

    expect(res.statusCode).toBe(200);
    expect(closures(prisma)).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ status: 'accepted', decidedBy: ARRIVANT }) }),
    ]);
  });

  it('une clôture en panne ne fait pas échouer l\'invitation : la personne est entrée', async () => {
    const prisma = makePrisma({ joinRequestUpdate: async () => { throw new Error('mongo'); } });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/invite`, payload: { userId: ARRIVANT } });

    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).toHaveBeenCalledTimes(1);
  });

  it('applyCommunityAdmission (entrée implicite par un salon) clôt les demandes de ceux qu\'il a ÉCRITS, pas des autres', async () => {
    const prisma = makePrisma();
    prisma.communityMember.updateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
    prisma.communityMember.createMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const OTHER = '507f1f77bcf86cd799430077';

    await applyCommunityAdmission(prisma, COMM, {
      kind: 'admitted',
      reactivations: [{ id: ROW, userId: OTHER, role: 'member', via: 'invited' }],
      creations: [{ userId: ARRIVANT, role: 'member', via: 'invited' }],
    }, () => undefined);

    expect(closures(prisma)).toEqual([
      expect.objectContaining({ where: { communityId: COMM, userId: { in: [ARRIVANT] }, status: 'pending' } }),
    ]);
  });
});

describe('Une demande sans juge expire', () => {
  const cutoff = new Date(NOW.getTime() - JOIN_REQUEST_TTL_MS);

  it('une demande vit trente jours', () => {
    expect(JOIN_REQUEST_TTL_MS).toBe(30 * 24 * 3_600_000);
    expect(liveJoinRequestWhere(NOW)).toEqual({ status: 'pending', createdAt: { gte: cutoff } });
  });

  it('le détail ne sert « Demande envoyée » que pour une demande VIVANTE', async () => {
    const prisma = makePrisma();
    prisma.communityJoinRequest.findFirst.mockResolvedValue(null);
    await viewerJoinRequestState(prisma, { communityId: COMM, viewerId: ARRIVANT, requiresJoinApproval: true, isMember: false }, NOW);

    expect(prisma.communityJoinRequest.findFirst.mock.calls[0][0].where).toEqual({
      communityId: COMM, userId: ARRIVANT, status: 'pending', createdAt: { gte: cutoff },
    });
  });

  it('redemander après l\'expiration : la vieille demande est close (`expired`), une nouvelle part et les intendants sont prévenus', async () => {
    const prisma = makePrisma();
    prisma.communityJoinRequest.findFirst.mockResolvedValue(null);
    prisma.communityJoinRequest.findMany.mockResolvedValue([{ id: REQUEST }]);

    const outcome = await requestCommunityEntry({ prisma } as any, {
      communityId: COMM, userId: ARRIVANT, via: 'self', country: null,
    }, NOW);

    expect(outcome).toEqual({ kind: 'pending', requestId: REQUEST });
    expect(prisma.communityJoinRequest.updateMany).toHaveBeenCalledWith({
      where: { communityId: COMM, userId: ARRIVANT, status: 'pending', createdAt: { lt: cutoff } },
      data: { status: 'expired', decidedAt: NOW },
    });
    const lookups = prisma.communityJoinRequest.findFirst.mock.calls.map((c: any) => c[0].where);
    expect(lookups[0]).toEqual({ communityId: COMM, userId: ARRIVANT, status: 'pending', createdAt: { gte: cutoff } });
    expect(prisma.communityJoinRequest.findMany.mock.calls[0][0].where).toEqual(
      { communityId: COMM, userId: ARRIVANT, status: 'pending', createdAt: { gte: cutoff } },
    );
  });

  it('les intendants ne listent que les demandes vivantes', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });

    const where = prisma.communityJoinRequest.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
    expect(where.createdAt.gte.getTime()).toBeGreaterThan(Date.now() - JOIN_REQUEST_TTL_MS - 60_000);
    expect(where.createdAt.gte.getTime()).toBeLessThanOrEqual(Date.now() - JOIN_REQUEST_TTL_MS + 60_000);
  });

  it('une demande expirée ne se tranche plus : accepter la cherche parmi les vivantes, et sa bascule l\'exige aussi', async () => {
    const prisma = makePrisma();
    prisma.communityJoinRequest.findFirst.mockResolvedValue(null);
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

    expect(res.statusCode).toBe(404);
    expect(prisma.communityJoinRequest.findFirst.mock.calls[0][0].where.createdAt).toEqual({ gte: expect.any(Date) });
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });

  it('la bascule de décision exige une demande vivante (une expiration entre la lecture et l\'écriture ne se tranche pas)', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });

    const flip = prisma.communityJoinRequest.updateMany.mock.calls.map((c: any) => c[0]).find((a: any) => a.data.status === 'rejected');
    expect(flip.where).toEqual(expect.objectContaining({ id: REQUEST, status: 'pending', createdAt: { gte: expect.any(Date) } }));
  });
});
