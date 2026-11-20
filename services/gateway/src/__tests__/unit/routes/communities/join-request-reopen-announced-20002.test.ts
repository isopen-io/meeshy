/**
 * Une demande rouverte par la réparation s'annonce aux intendants comme une
 * nouvelle demande (#20002).
 *
 * `reopenOrphanedAcceptances` (#19924) rouvrait sans rien dire : quand la
 * réouverture venait du détail lu par le DEMANDEUR, le compteur des intendants
 * connectés restait faux jusqu'à leur prochaine relecture. Et la réouverture
 * efface `decidedBy` : la trace de l'intendant qui avait accepté se perdait.
 *  - une réouverture EFFECTIVE annonce `community:join-requested` (une par demande) ;
 *  - aucune réouverture, ou une demande aussitôt reclose (entrée par une autre
 *    porte pendant la réparation) : aucune annonce ;
 *  - la décision effacée est JOURNALISÉE (requestId, decidedBy d'avant), jamais servie ;
 *  - une annonce qui lève ne fait pas tomber la réparation.
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

const schedule = jest.fn();
jest.mock('../../../../services/community-join-request-broadcast', () => {
  const actual = jest.requireActual('../../../../services/community-join-request-broadcast') as object;
  return { ...actual, scheduleCommunityJoinRequestedFrom: (...args: unknown[]) => schedule(...args) };
});

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

type Row = { userId: string; isActive: boolean; leftAt: Date | null };

const accepted = () => ({ id: REQUEST, userId: ARRIVANT, decidedAt: DECIDED, decidedBy: STEWARD, createdAt: CREATED });

function makePrisma(options: {
  readonly acceptedRequests?: readonly Record<string, unknown>[];
  readonly members?: readonly Row[];
  readonly enteredMeanwhile?: boolean;
} = {}) {
  const acceptedRequests = options.acceptedRequests ?? [accepted()];
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: CREATOR, isPrivate: false, requiresJoinApproval: true,
        members: [{ userId: ADMIN, role: 'admin' }],
      }),
    },
    communityMember: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where.isActive === true) return options.enteredMeanwhile ? [{ userId: ARRIVANT }] : [];
        return options.members ?? [];
      }),
    },
    communityJoinRequest: {
      findMany: jest.fn<any>(async ({ where }: any) => {
        if (where.status === 'accepted') return acceptedRequests;
        if (where.status === undefined && where.userId?.in) {
          return acceptedRequests.map((a) => ({ ...a, status: 'accepted' }));
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

beforeEach(() => {
  warn.mockClear();
  schedule.mockClear();
});

describe('reopenOrphanedAcceptances annonce ce qu\'elle rouvre (#20002)', () => {
  it('une réouverture effective : une annonce, nommant la communauté, la demande et la personne', async () => {
    const announce = jest.fn();

    await reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW, onReopened: announce });

    expect(announce.mock.calls).toEqual([[{ communityId: COMM, requestId: REQUEST, userId: ARRIVANT }]]);
  });

  it('aucune acceptation orpheline : aucune annonce', async () => {
    const announce = jest.fn();

    await reopenOrphanedAcceptances(makePrisma({ acceptedRequests: [] }), { communityId: COMM, now: NOW, onReopened: announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('une ligne active (la personne est entrée) : rien ne rouvre, rien ne s\'annonce', async () => {
    const announce = jest.fn();
    const prisma = makePrisma({ members: [{ userId: ARRIVANT, isActive: true, leftAt: null }] });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW, onReopened: announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('la bascule écrite par personne (count 0, une autre réparation l\'a faite) : aucune annonce en double', async () => {
    const announce = jest.fn();
    const prisma = makePrisma();
    prisma.communityJoinRequest.updateMany.mockResolvedValue({ count: 0 });

    await reopenOrphanedAcceptances(prisma, { communityId: COMM, now: NOW, onReopened: announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('entrée par une autre porte PENDANT la réparation : la demande se reclôt et ne s\'annonce pas', async () => {
    const announce = jest.fn();

    await reopenOrphanedAcceptances(makePrisma({ enteredMeanwhile: true }), { communityId: COMM, now: NOW, onReopened: announce });

    expect(announce).not.toHaveBeenCalled();
  });

  it('une annonce qui lève ne fait pas tomber la réparation', async () => {
    const announce = jest.fn(() => {
      throw new Error('socket down');
    });

    const count = await reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW, onReopened: announce });

    expect(count).toBe(1);
  });

  it('la décision effacée est journalisée : demande et intendant d\'avant', async () => {
    await reopenOrphanedAcceptances(makePrisma(), { communityId: COMM, now: NOW });

    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ communityId: COMM, erased: [{ requestId: REQUEST, decidedBy: STEWARD }] }),
    );
  });
});

describe('les deux portes de la réparation annoncent (#20002)', () => {
  it('le détail lu par le demandeur annonce la réouverture aux intendants', async () => {
    const announce = jest.fn();

    const state = await viewerJoinRequestState(
      makePrisma(),
      { communityId: COMM, viewerId: ARRIVANT, requiresJoinApproval: true, isMember: false, onReopened: announce },
      NOW,
    );

    expect(state).toBeNull();
    expect(announce.mock.calls).toEqual([[{ communityId: COMM, requestId: REQUEST, userId: ARRIVANT }]]);
  });

  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it('la liste ouverte par un intendant programme la diffusion `community:join-requested`', async () => {
    const prisma = makePrisma();
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

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM}/join-requests` });

    expect(res.statusCode).toBe(200);
    expect(schedule).toHaveBeenCalledWith(app, { communityId: COMM, requestId: REQUEST, userId: ARRIVANT });
    expect(JSON.stringify(res.json())).not.toContain(STEWARD);
  });
});
