/**
 * Une demande acceptée dont l'entrée n'a pas eu lieu redevient tranchable (#19924).
 *
 * Quand l'écriture de l'appartenance ET sa relecture échouent, l'acceptation
 * ne rouvre rien (une ignorance ne rouvre rien, #19914) : la demande reste
 * `accepted` sans membre. Une RÉPARATION différée la rouvre, au prochain accès
 * des intendants (liste des demandes) ou du demandeur (détail) — et seulement
 * sur PREUVE que personne n'est entré depuis la décision :
 *  - aucune ligne d'appartenance pour la paire ;
 *  - ou une ligne inactive dont le départ PRÉCÈDE la décision.
 * Une ligne active, une ligne quittée APRÈS la décision (entrée puis départ),
 * une ligne inactive sans date de départ (rien ne prouve) : rien ne se rouvre.
 * Une décision trop récente (acceptation peut-être en cours) non plus.
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

import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { viewerJoinRequestState } from '../../../../routes/communities/join-request-state';
import {
  ORPHAN_ACCEPTANCE_GRACE_MS,
  JOIN_REQUEST_TTL_MS,
  reopenOrphanedAcceptances,
} from '../../../../services/community-join-request-lifecycle';

const ADMIN = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ARRIVANT = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';
const OTHER = '507f1f77bcf86cd799430077';
const NOW = new Date('2026-11-20T08:00:00Z');
const DECIDED = new Date(NOW.getTime() - ORPHAN_ACCEPTANCE_GRACE_MS - 60_000);
const CREATED = new Date(DECIDED.getTime() - 3_600_000);

type Row = { userId: string; isActive: boolean; leftAt: Date | null };

const accepted = (data: Record<string, unknown> = {}) => ({
  id: REQUEST,
  userId: ARRIVANT,
  decidedAt: DECIDED,
  createdAt: CREATED,
  ...data,
});

function makePrisma(options: {
  readonly acceptedRequests?: readonly Record<string, unknown>[];
  readonly members?: readonly Row[];
  readonly livePendingOf?: readonly string[];
  readonly laterRequests?: readonly Record<string, unknown>[];
  readonly memberRead?: (args: any) => Promise<unknown>;
} = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
        members: [{ userId: ADMIN, role: 'admin' }],
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(options.memberRead ?? (async ({ where }: any) =>
        (options.members ?? []).filter((m) => where.isActive === undefined || m.isActive === where.isActive))),
    },
    communityJoinRequest: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where.status === 'accepted') return options.acceptedRequests ?? [accepted()];
        if (where.status === undefined && where.userId?.in) {
          const accepts = (options.acceptedRequests ?? [accepted()]).map((a) => ({ ...a, status: 'accepted' }));
          const pendings = (options.livePendingOf ?? []).map((userId) => ({ id: `p-${userId}`, userId, status: 'pending', createdAt: CREATED }));
          return [...accepts, ...pendings, ...(options.laterRequests ?? [])].filter((r: any) => where.userId.in.includes(r.userId));
        }
        return [];
      }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as any;
}

const reopenings = (prisma: any) =>
  prisma.communityJoinRequest.updateMany.mock.calls
    .map((c: any) => c[0])
    .filter((args: any) => args.data.status === 'pending');

describe('reopenOrphanedAcceptances — la réparation d\'une acceptation sans entrée (#19924)', () => {
  it('aucune ligne d\'appartenance : la demande redevient `pending`, sous condition de son état lu', async () => {
    const prisma = makePrisma();

    const count = await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    expect(count).toBe(1);
    expect(reopenings(prisma)).toEqual([
      {
        where: { id: REQUEST, communityId: COMM, status: 'accepted', decidedAt: DECIDED },
        data: { status: 'pending', decidedAt: null, decidedBy: null },
      },
    ]);
  });

  it('une ligne inactive quittée AVANT la décision : rouverte (personne n\'est entré depuis)', async () => {
    const prisma = makePrisma({ members: [{ userId: ARRIVANT, isActive: false, leftAt: new Date(DECIDED.getTime() - 86_400_000) }] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(1);
  });

  it('une ligne ACTIVE : la personne est entrée, rien ne se rouvre', async () => {
    const prisma = makePrisma({ members: [{ userId: ARRIVANT, isActive: true, leftAt: null }] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('une ligne quittée APRÈS la décision (entrée puis départ) : rien ne se rouvre', async () => {
    const prisma = makePrisma({ members: [{ userId: ARRIVANT, isActive: false, leftAt: new Date(DECIDED.getTime() + 60_000) }] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('une ligne inactive SANS date de départ : rien ne prouve l\'absence, rien ne se rouvre', async () => {
    const prisma = makePrisma({ members: [{ userId: ARRIVANT, isActive: false, leftAt: null }] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
  });

  it('deux lignes pour la paire (#16696), dont une active : rien ne se rouvre', async () => {
    const prisma = makePrisma({
      members: [
        { userId: ARRIVANT, isActive: false, leftAt: new Date(DECIDED.getTime() - 86_400_000) },
        { userId: ARRIVANT, isActive: true, leftAt: null },
      ],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
  });

  it('la personne a déjà une demande vivante en attente : la vieille acceptation reste close', async () => {
    const prisma = makePrisma({ livePendingOf: [ARRIVANT] });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('une demande PLUS RÉCENTE refusée a pris la suite : la vieille acceptation reste close (le refus tient)', async () => {
    const prisma = makePrisma({
      laterRequests: [{ id: OTHER, userId: ARRIVANT, status: 'rejected', createdAt: new Date(DECIDED.getTime() + 86_400_000) }],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(0);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('une demande plus ANCIENNE de la personne (refusée avant) n\'empêche pas la réparation', async () => {
    const prisma = makePrisma({
      laterRequests: [{ id: OTHER, userId: ARRIVANT, status: 'rejected', createdAt: new Date(CREATED.getTime() - 86_400_000) }],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(1);
  });

  it('la personne entre par une autre porte PENDANT la réparation : la demande rouverte se reclôt', async () => {
    let reads = 0;
    const prisma = makePrisma({
      memberRead: async () => {
        reads += 1;
        return reads === 1 ? [] : [{ userId: ARRIVANT }];
      },
    });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    const closures = prisma.communityJoinRequest.updateMany.mock.calls
      .map((c: any) => c[0])
      .filter((args: any) => args.data.status === 'accepted');
    expect(closures).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({ communityId: COMM, userId: { in: [ARRIVANT] }, status: 'pending' }),
        data: expect.objectContaining({ status: 'accepted', decidedBy: null }),
      }),
    ]);
  });

  it('ne lit que les acceptations décidées hors du délai de grâce et encore VIVANTES par leur âge, bornées', async () => {
    const prisma = makePrisma({ acceptedRequests: [] });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW });

    const read = prisma.communityJoinRequest.findMany.mock.calls[0][0];
    expect(read.where).toEqual({
      communityId: COMM,
      status: 'accepted',
      decidedAt: { lte: new Date(NOW.getTime() - ORPHAN_ACCEPTANCE_GRACE_MS) },
      createdAt: { gte: new Date(NOW.getTime() - JOIN_REQUEST_TTL_MS) },
    });
    expect(read.take).toBeGreaterThan(0);
    expect(read.take).toBeLessThanOrEqual(100);
    expect(prisma.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('restreinte à une personne quand on la nomme', async () => {
    const prisma = makePrisma({ acceptedRequests: [] });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, userId: ARRIVANT, now: NOW });

    expect(prisma.communityJoinRequest.findMany.mock.calls[0][0].where.userId).toBe(ARRIVANT);
  });

  it('la relecture des appartenances lève : on ne conclut rien, rien ne se rouvre, rien ne lève', async () => {
    const prisma = makePrisma({ memberRead: async () => { throw new Error('read failed'); } });

    await expect(reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).resolves.toBe(0);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('plusieurs demandeurs : seul celui qui n\'est pas entré est rouvert', async () => {
    const prisma = makePrisma({
      acceptedRequests: [accepted(), accepted({ id: '507f1f77bcf86cd799430088', userId: OTHER })],
      members: [{ userId: OTHER, isActive: true, leftAt: null }],
    });

    expect(await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW })).toBe(1);
    expect(reopenings(prisma).map((r: any) => r.where.id)).toEqual([REQUEST]);
  });
});

const apps: FastifyInstance[] = [];
async function build(prisma: any) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true, userId: ADMIN, hasFullAccess: true,
      registeredUser: { id: ADMIN, username: 'a', displayName: 'A', role: 'USER' },
    };
  });
  app.decorate('prisma', prisma);
  await registerEntryRoutes(app, { engagement: { recordActivity: jest.fn() } } as any);
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('la réparation se fait au prochain accès (#19924)', () => {
  it('l\'intendant qui ouvre la liste des demandes répare d\'abord : la demande orpheline y revient', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });

    expect(res.statusCode).toBe(200);
    expect(reopenings(prisma)).toEqual([expect.objectContaining({ where: expect.objectContaining({ id: REQUEST }) })]);
    const order = (fn: any) => fn.mock.invocationCallOrder[0];
    expect(prisma.communityJoinRequest.findMany.mock.calls.some((c: any) => c[0].include?.user !== undefined)).toBe(true);
    const listing = prisma.communityJoinRequest.findMany.mock.calls.findIndex((c: any) => c[0].include?.user !== undefined);
    expect(order(prisma.communityJoinRequest.updateMany)).toBeLessThan(
      prisma.communityJoinRequest.findMany.mock.invocationCallOrder[listing],
    );
  });

  it('un lecteur qui n\'est pas intendant ne déclenche aucune réparation (404 générique)', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
      members: [{ userId: ADMIN, role: 'member' }],
    });
    const app = await build(prisma);

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });

    expect(res.statusCode).toBe(404);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('le demandeur qui relit le détail répare la sienne, et relit « Demande envoyée »', async () => {
    const prisma = makePrisma();
    prisma.communityJoinRequest.findFirst.mockResolvedValue({ id: REQUEST });

    const state = await viewerJoinRequestState(prisma, {
      communityId: COMM, viewerId: ARRIVANT, requiresJoinApproval: true, isMember: false,
    }, NOW);

    expect(state).toBe('pending');
    expect(reopenings(prisma)).toEqual([expect.objectContaining({ where: expect.objectContaining({ id: REQUEST }) })]);
    expect(prisma.communityJoinRequest.findMany.mock.calls[0][0].where.userId).toBe(ARRIVANT);
  });

  it('un membre qui relit le détail ne déclenche rien', async () => {
    const prisma = makePrisma();

    await viewerJoinRequestState(prisma, {
      communityId: COMM, viewerId: ARRIVANT, requiresJoinApproval: true, isMember: true,
    }, NOW);

    expect(prisma.communityJoinRequest.findMany).not.toHaveBeenCalled();
  });
});
