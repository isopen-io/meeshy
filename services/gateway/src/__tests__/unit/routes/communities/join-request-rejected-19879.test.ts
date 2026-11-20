/**
 * Refuser une demande d'entrée l'annonce au DEMANDEUR (#19879) — et seulement
 * quand le refus a bien été écrit : un membre simple, une demande inconnue ou
 * déjà tranchée n'annoncent rien. Témoins écrits sur un MODÉRATEUR et sur le
 * CRÉATEUR, pas seulement sur un administrateur.
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

const rejections: Array<Record<string, unknown>> = [];
jest.mock('../../../../services/community-join-request-decided', () => {
  const actual = jest.requireActual('../../../../services/community-join-request-decided') as Record<string, unknown>;
  return { ...actual, scheduleJoinRequestRejectedFrom: jest.fn((_f: unknown, change: Record<string, unknown>) => { rejections.push(change); }) };
});

import { registerEntryRoutes } from '../../../../routes/communities/entries';

const VIEWER = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const REQUESTER = '507f1f77bcf86cd799430044';
const REQUEST = '507f1f77bcf86cd799430055';

const USABLE = { isActive: true, deletedAt: null, deactivatedAt: null };
const pending = { id: REQUEST, userId: REQUESTER, via: 'link', country: 'SN', user: { id: REQUESTER, ...USABLE } };

type Role = 'admin' | 'moderator' | 'member' | null;

function makePrisma(options: { viewerRole?: Role; createdBy?: string; request?: unknown; flipped?: number; blocked?: boolean } = {}) {
  const viewerRole = options.viewerRole === undefined ? 'moderator' : options.viewerRole;
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: COMM, createdBy: options.createdBy ?? CREATOR, isPrivate: false, requiresJoinApproval: true,
        members: viewerRole ? [{ userId: VIEWER, role: viewerRole }] : [],
      }),
    },
    communityMember: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    communityJoinRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(options.request === undefined ? pending : options.request),
      updateMany: jest.fn<any>().mockResolvedValue({ count: options.flipped ?? 1 }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue(options.blocked ? { id: VIEWER } : null),
    },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

const apps: FastifyInstance[] = [];
async function reject(prisma: any, userId = VIEWER) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { isAuthenticated: true, userId, hasFullAccess: true, registeredUser: { id: userId, username: 'u', displayName: 'U', role: 'USER' } };
  });
  app.decorate('prisma', prisma);
  await registerEntryRoutes(app, { engagement: { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as any });
  await app.ready();
  apps.push(app);
  return app.inject({ method: 'POST', url: `/communities/${COMM}/join-requests/${REQUEST}/reject` });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  rejections.splice(0);
});

describe('POST /communities/:id/join-requests/:requestId/reject — le demandeur l\'apprend (#19879)', () => {
  it('un MODÉRATEUR refuse : l\'annonce part vers le demandeur, avec l\'instant ÉCRIT', async () => {
    const prisma = makePrisma({ viewerRole: 'moderator' });
    const res = await reject(prisma);
    expect(res.statusCode).toBe(200);
    const written = prisma.communityJoinRequest.updateMany.mock.calls[0][0].data.decidedAt;
    expect(rejections).toEqual([{ communityId: COMM, userId: REQUESTER, decidedBy: VIEWER, decidedAt: written }]);
  });

  it('le CRÉATEUR refuse : même annonce', async () => {
    const res = await reject(makePrisma({ viewerRole: null, createdBy: VIEWER }));
    expect(res.statusCode).toBe(200);
    expect(rejections).toHaveLength(1);
  });

  it('la réponse à l\'intendant ne change pas de forme', async () => {
    const res = await reject(makePrisma());
    expect(res.json().data).toEqual({ id: REQUEST, status: 'rejected' });
  });

  it('un MEMBRE simple reçoit 404 et rien n\'est annoncé', async () => {
    const res = await reject(makePrisma({ viewerRole: 'member' }));
    expect(res.statusCode).toBe(404);
    expect(rejections).toEqual([]);
  });

  it('une demande inconnue ou déjà tranchée n\'annonce rien', async () => {
    expect((await reject(makePrisma({ request: null }))).statusCode).toBe(404);
    expect((await reject(makePrisma({ flipped: 0 }))).statusCode).toBe(404);
    expect(rejections).toEqual([]);
  });

  it('un intendant bloqué avec le demandeur ne peut ni refuser ni rien annoncer', async () => {
    const res = await reject(makePrisma({ blocked: true }));
    expect(res.statusCode).toBe(404);
    expect(rejections).toEqual([]);
  });
});
