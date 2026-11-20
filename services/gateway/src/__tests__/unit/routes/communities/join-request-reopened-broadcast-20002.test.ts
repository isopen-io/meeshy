/**
 * Une demande d'entrée ROUVERTE par la réparation (#19924) prévient les
 * intendants comme une nouvelle demande (#20002).
 *
 * `reopenOrphanedAcceptances` remet en attente une acceptation restée sans
 * entrée. Quand la réouverture vient du détail lu par le DEMANDEUR, les
 * intendants connectés ne relisent rien : sans annonce, leur compteur reste
 * faux. Une réouverture EFFECTIVE annonce donc `community:join-requested`
 * (une fois par demande rouverte, jamais pour une demande reclose aussitôt
 * parce que la personne est entrée par une autre porte) ; et la trace de la
 * décision effacée (`decidedBy`) est journalisée, jamais servie.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const warn = jest.fn();
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn, error: jest.fn() })),
  },
}));

const scheduled: unknown[] = [];
jest.mock('../../../../services/community-join-request-broadcast', () => ({
  ...jest.requireActual<object>('../../../../services/community-join-request-broadcast'),
  scheduleCommunityJoinRequestedFrom: jest.fn((_fastify: unknown, change: unknown) => {
    scheduled.push(change);
  }),
}));

import { registerEntryRoutes } from '../../../../routes/communities/entries';
import { viewerJoinRequestState } from '../../../../routes/communities/join-request-state';
import {
  ORPHAN_ACCEPTANCE_GRACE_MS,
  reopenOrphanedAcceptances,
} from '../../../../services/community-join-request-lifecycle';

const ADMIN = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ARRIVANT = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';
const STEWARD = '507f1f77bcf86cd799430066';
const NOW = new Date('2026-11-20T08:00:00Z');
const DECIDED = new Date(NOW.getTime() - ORPHAN_ACCEPTANCE_GRACE_MS - 60_000);
const CREATED = new Date(DECIDED.getTime() - 3_600_000);

const accepted = () => ({ id: REQUEST, userId: ARRIVANT, decidedAt: DECIDED, createdAt: CREATED, decidedBy: STEWARD });

function makePrisma(options: {
  readonly memberRead?: (args: any) => Promise<unknown>;
  readonly reopenedCount?: number;
} = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
        members: [{ userId: ADMIN, role: 'admin' }],
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(options.memberRead ?? (async () => [])),
    },
    communityJoinRequest: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where.status === 'accepted') return [accepted()];
        if (where.status === undefined && where.userId?.in) return [{ ...accepted(), status: 'accepted' }];
        return [];
      }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(0),
      updateMany: jest.fn<any>(async ({ data }: any) => ({ count: data.status === 'pending' ? options.reopenedCount ?? 1 : 1 })),
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

beforeEach(() => {
  warn.mockClear();
  scheduled.splice(0);
});

describe('reopenOrphanedAcceptances annonce ce qu\'elle rouvre (#20002)', () => {
  it('une réouverture effective : une annonce, qui nomme la demande et la personne', async () => {
    const announce = jest.fn();

    await reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW, announce });

    expect(announce.mock.calls).toEqual([[{ communityId: COMM, requestId: REQUEST, userId: ARRIVANT }]]);
  });

  it('aucune réouverture (la personne est entrée) : aucune annonce', async () => {
    const announce = jest.fn();
    const prisma = makePrisma({ memberRead: async () => [{ userId: ARRIVANT, isActive: true, leftAt: null }] });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW, announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('l\'écriture conditionnelle ne rouvre rien (tranchée entre-temps) : aucune annonce', async () => {
    const announce = jest.fn();

    await reopenOrphanedAcceptances(makePrisma({ reopenedCount: 0 }), { communityId: COMM, now: NOW, announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('rouverte puis reclose (entrée par une autre porte pendant la réparation) : aucune annonce', async () => {
    const announce = jest.fn();
    let reads = 0;
    const prisma = makePrisma({
      memberRead: async () => {
        reads += 1;
        return reads === 1 ? [] : [{ userId: ARRIVANT }];
      },
    });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW, announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('une annonce qui lève ne défait pas la réparation et ne lève pas', async () => {
    const announce = jest.fn(() => { throw new Error('socket down'); });

    await expect(reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW, announce })).resolves.toBe(1);
  });

  it('la trace effacée est journalisée : la demande et l\'intendant qui l\'avait acceptée', async () => {
    await reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW });

    const traces = warn.mock.calls.filter((c: any[]) => Array.isArray(c[1]?.erasedDecisions));
    expect(traces).toEqual([
      [expect.any(String), expect.objectContaining({ communityId: COMM, erasedDecisions: [{ requestId: REQUEST, decidedBy: STEWARD }] })],
    ]);
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

describe('les deux portes de la réparation annoncent (#20002)', () => {
  it('la liste des demandes d\'un intendant : la demande rouverte est annoncée aux intendants', async () => {
    const app = await build(makePrisma());

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });

    expect(res.statusCode).toBe(200);
    expect(scheduled).toEqual([{ communityId: COMM, requestId: REQUEST, userId: ARRIVANT }]);
    expect(res.body).not.toContain(STEWARD);
  });

  it('le détail lu par le demandeur : la demande rouverte est annoncée par le relais qu\'on lui remet', async () => {
    const announce = jest.fn();
    const prisma = makePrisma();
    prisma.communityJoinRequest.findFirst.mockResolvedValue({ id: REQUEST });

    const state = await viewerJoinRequestState(prisma, {
      communityId: COMM, viewerId: ARRIVANT, requiresJoinApproval: true, isMember: false, announce,
    }, NOW);

    expect(state).toBe('pending');
    expect(announce.mock.calls).toEqual([[{ communityId: COMM, requestId: REQUEST, userId: ARRIVANT }]]);
  });
});
