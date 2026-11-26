/**
 * Une demande d'entrée ne se tranche plus pour qui est DÉJÀ membre actif
 * (#19927).
 *
 * Une acceptation dont l'écriture de l'appartenance expire, puis s'applique
 * APRÈS la relecture, rouvre la demande (`pending`) alors que la personne est
 * entrée. L'intendant pouvait ensuite REFUSER la demande d'un membre actif.
 * Au moment de la décision, la garde relit l'appartenance : un membre actif
 * n'a plus de demande à trancher — elle se clôt, la route rend le 404 générique.
 *
 * Et l'adhésion directe (`POST /communities/:id/join`) rend le membre (200)
 * quand une suite de l'entrée lève : l'entrée a eu lieu.
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

jest.mock('../../../../services/community-join-request-decided', () => {
  const actual = jest.requireActual('../../../../services/community-join-request-decided') as Record<string, unknown>;
  return { ...actual, scheduleJoinRequestRejectedFrom: jest.fn() };
});

import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { registerMembershipRoutes } from '../../../../routes/communities/membership';
import { scheduleJoinRequestRejectedFrom } from '../../../../services/community-join-request-decided';
import { scheduleCommunityMemberBroadcastFrom } from '../../../../services/community-member-broadcast';

const STEWARD = '507f1f77bcf86cd799430011';
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
  readonly activeMember?: boolean;
  readonly requiresJoinApproval?: boolean;
  readonly closureFails?: boolean;
};

function makePrisma(options: Options = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: options.requiresJoinApproval ?? true,
        joinLinkPausedAt: null,
        members: [{ userId: STEWARD, role: 'admin' }],
      }),
    },
    communityMember: {
      findFirst: jest.fn<any>(async () => (options.activeMember ? memberRow() : null)),
      count: jest.fn<any>().mockResolvedValue(3),
      create: jest.fn<any>(async ({ data }: any) => memberRow(data)),
      update: jest.fn<any>(async ({ data }: any) => memberRow(data)),
    },
    communityJoinRequest: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: REQUEST, userId: ARRIVANT, via: 'self', country: null, user: { id: ARRIVANT, ...USABLE },
      }),
      updateMany: jest.fn<any>(async ({ data }: any) => {
        if (options.closureFails && data.entryVerifiedAt) throw new Error('closure down');
        return { count: 1 };
      }),
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
async function build(prisma: any, userId: string, engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) }) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true, userId, hasFullAccess: true,
      registeredUser: { id: userId, username: 'a', displayName: 'A', role: 'USER' },
    };
  });
  app.decorate('prisma', prisma);
  await registerEntryRoutes(app, { engagement } as any);
  await registerMembershipRoutes(app, { engagement } as any);
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  (scheduleJoinRequestRejectedFrom as jest.Mock).mockReset();
  (scheduleCommunityMemberBroadcastFrom as jest.Mock).mockReset();
});

const updates = (prisma: any) => prisma.communityJoinRequest.updateMany.mock.calls.map((c: any) => c[0]);
const decisions = (prisma: any, status: string) =>
  updates(prisma).filter((args: any) => args.data.status === status && args.where.id === REQUEST);
const closures = (prisma: any) => updates(prisma).filter((args: any) => args.data.entryVerifiedAt);

describe('une demande rouverte pour un membre actif ne se tranche plus (#19927)', () => {
  it('refuser la demande d\'un membre actif : 404 générique, aucun refus écrit ni annoncé, la demande se clôt', async () => {
    const prisma = makePrisma({ activeMember: true });
    const app = await build(prisma, STEWARD);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });

    expect(res.statusCode).toBe(404);
    expect(decisions(prisma, 'rejected')).toEqual([]);
    expect(scheduleJoinRequestRejectedFrom).not.toHaveBeenCalled();
    expect(closures(prisma)).toEqual([
      expect.objectContaining({ where: expect.objectContaining({ communityId: COMM, userId: { in: [ARRIVANT] }, status: 'pending' }) }),
    ]);
  });

  it('accepter la demande d\'un membre actif : 404, aucune bascule ni seconde entrée, la demande se clôt', async () => {
    const prisma = makePrisma({ activeMember: true });
    const app = await build(prisma, STEWARD);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/accept` });

    expect(res.statusCode).toBe(404);
    expect(decisions(prisma, 'accepted')).toEqual([]);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(closures(prisma)).toHaveLength(1);
  });

  it('témoin : la demande d\'une personne NON membre se refuse toujours', async () => {
    const prisma = makePrisma({ activeMember: false });
    const app = await build(prisma, STEWARD);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });

    expect(res.statusCode).toBe(200);
    expect(decisions(prisma, 'rejected')).toHaveLength(1);
    expect(closures(prisma)).toEqual([]);
  });
});

describe('POST /communities/:id/join — une suite de l\'entrée qui lève ne fait pas un échec (#19927)', () => {
  it('la clôture des demandes lève : 200, le membre servi', async () => {
    const prisma = makePrisma({ requiresJoinApproval: false, closureFails: true });
    const app = await build(prisma, ARRIVANT);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(expect.objectContaining({ userId: ARRIVANT }));
    expect(prisma.communityMember.create).toHaveBeenCalledTimes(1);
  });

  it('l\'engagement et la diffusion lèvent en synchrone : 200, le membre servi', async () => {
    (scheduleCommunityMemberBroadcastFrom as jest.Mock).mockImplementation(() => {
      throw new Error('adapter down');
    });
    const prisma = makePrisma({ requiresJoinApproval: false });
    const engagement = { recordActivity: jest.fn<any>(() => { throw new Error('engagement down'); }) };
    const app = await build(prisma, ARRIVANT, engagement);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: {} });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(expect.objectContaining({ userId: ARRIVANT }));
  });
});
