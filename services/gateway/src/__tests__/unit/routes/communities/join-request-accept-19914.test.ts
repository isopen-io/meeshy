/**
 * Accepter une demande d'entrée ne la rouvre jamais quand la personne est
 * déjà entrée (#19914).
 *
 * Le retour arrière `accepted` → `pending` ne se fait que si l'appartenance
 * n'a PAS été écrite. Une panne APRÈS l'écriture (diffusion, engagement,
 * succès « cercles ») rend la réponse de succès, sans rouvrir la demande :
 * sinon la personne serait membre active ET sa demande tranchable de nouveau,
 * et l'intendant recevrait un 500 pour une entrée qui a eu lieu.
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

import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { scheduleCommunityMemberBroadcastFrom } from '../../../../services/community-member-broadcast';

const ADMIN = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ARRIVANT = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';
const ROW = '507f1f77bcf86cd799430066';

const USABLE = { isActive: true, deletedAt: null, deactivatedAt: null };

const memberRow = (data: Record<string, unknown> = {}) => ({
  id: ROW,
  communityId: COMM,
  userId: ARRIVANT,
  role: 'member',
  isActive: true,
  joinedAt: new Date('2026-11-19T12:00:00Z'),
  user: { id: ARRIVANT, username: 'n', displayName: 'N', avatar: null, isOnline: true, deactivatedAt: null },
  ...data,
});

type Options = {
  readonly create?: () => Promise<unknown>;
  readonly activeAfter?: boolean;
};

function makePrisma(options: Options = {}) {
  let reads = 0;
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
        members: [{ userId: ADMIN, role: 'admin' }],
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>(async () => {
        reads += 1;
        if (reads === 1) return null;
        return options.activeAfter ? memberRow() : null;
      }),
      count: jest.fn<any>().mockResolvedValue(3),
      create: jest.fn<any>(options.create ?? (async ({ data }: any) => memberRow(data))),
      update: jest.fn<any>(async ({ data }: any) => memberRow(data)),
    },
    communityJoinRequest: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: REQUEST, userId: ARRIVANT, via: 'self', country: null, user: { id: ARRIVANT, ...USABLE },
      }),
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

const apps: FastifyInstance[] = [];
async function build(prisma: any, engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) }) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true, userId: ADMIN, hasFullAccess: true,
      registeredUser: { id: ADMIN, username: 'a', displayName: 'A', role: 'USER' },
    };
  });
  app.decorate('prisma', prisma);
  await registerEntryRoutes(app, { engagement } as any);
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  (scheduleCommunityMemberBroadcastFrom as jest.Mock).mockReset();
});

const reopenings = (prisma: any) =>
  prisma.communityJoinRequest.updateMany.mock.calls
    .map((c: any) => c[0])
    .filter((args: any) => args.data.status === 'pending');

const accept = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

describe('POST /communities/:id/join-requests/:requestId/accept — une panne après l\'entrée (#19914)', () => {
  it('la diffusion lève APRÈS l\'écriture : succès, le membre servi, la demande reste `accepted`', async () => {
    (scheduleCommunityMemberBroadcastFrom as jest.Mock).mockImplementation(() => {
      throw new Error('adapter down');
    });
    const prisma = makePrisma({ activeAfter: true });
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(expect.objectContaining({ userId: ARRIVANT }));
    expect(prisma.communityMember.create).toHaveBeenCalledTimes(1);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('l\'engagement lève en synchrone APRÈS l\'écriture : succès, aucune réouverture', async () => {
    const prisma = makePrisma({ activeAfter: true });
    const engagement = { recordActivity: jest.fn<any>(() => { throw new Error('engagement down'); }) };
    const app = await build(prisma, engagement);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('l\'écriture de l\'appartenance échoue et la relecture ne trouve personne : 500, la demande redevient tranchable', async () => {
    const prisma = makePrisma({ create: async () => { throw new Error('write failed'); }, activeAfter: false });
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(500);
    expect(reopenings(prisma)).toEqual([
      expect.objectContaining({
        where: { id: REQUEST, status: 'accepted', decidedBy: ADMIN },
        data: { status: 'pending', decidedAt: null, decidedBy: null },
      }),
    ]);
  });

  it('l\'écriture répond une erreur mais la relecture trouve la personne ACTIVE (écriture engagée) : succès, aucune réouverture', async () => {
    const prisma = makePrisma({ create: async () => { throw new Error('socket closed after commit'); }, activeAfter: true });
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(expect.objectContaining({ userId: ARRIVANT }));
    expect(reopenings(prisma)).toEqual([]);
  });

  it('la relecture elle-même lève : on ne conclut rien, la demande reste `accepted` (jamais rouverte sur une ignorance)', async () => {
    const prisma = makePrisma({ create: async () => { throw new Error('write failed'); } });
    prisma.communityMember.findFirst
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('read failed'));
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(500);
    expect(reopenings(prisma)).toEqual([]);
  });

  it('l\'acceptation nominale ne sert pas la présence du nouveau membre à un intendant qui n\'est pas son ami', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.isOnline).toBe(false);
    expect(res.json().data.user).not.toHaveProperty('deactivatedAt');
  });

  it('le chemin `entered` (écriture engagée malgré l\'erreur) ne la sert pas non plus', async () => {
    const prisma = makePrisma({ create: async () => { throw new Error('socket closed after commit'); }, activeAfter: true });
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.isOnline).toBe(false);
  });

  it('une panne des suites n\'interroge pas la base sur l\'entrée : la relecture ne sert qu\'à une écriture en échec', async () => {
    (scheduleCommunityMemberBroadcastFrom as jest.Mock).mockImplementation(() => Promise.reject(new Error('async down')));
    const prisma = makePrisma({ activeAfter: true });
    const app = await build(prisma);

    const res = await accept(app);

    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.findFirst).toHaveBeenCalledTimes(1);
    expect(reopenings(prisma)).toEqual([]);
  });
});
