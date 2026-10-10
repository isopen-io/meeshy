/**
 * Ce que les communautés créditent (#8959) : créer une communauté paie
 * `social.community_created` (cible = la communauté) ; y entrer paie
 * `social.community_joined` une fois par communauté, avec son créateur pour
 * propriétaire de la cible — le créateur qui revient dans la sienne ne se
 * paie pas (le moteur refuse `targetOwnerId === userId`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn().mockImplementation(() => ({ recordEvent: jest.fn(async () => undefined) })),
}));

import { registerCoreRoutes } from '../../../routes/communities/core';
import { registerMembershipRoutes } from '../../../routes/communities/membership';
import type { EngagementService } from '../../../services/engagement/EngagementService';

type RecordActivity = EngagementService['recordActivity'];

const CALLER = '507f1f77bcf86cd799439011';
const CREATOR = '507f1f77bcf86cd799439022';
const COMMUNITY_ID = '507f1f77bcf86cd799439033';

const communityRow = {
  id: COMMUNITY_ID,
  name: 'Cercle',
  identifier: 'mshy_cercle',
  description: null,
  avatar: null,
  isPrivate: false,
  createdBy: CALLER,
  createdAt: new Date('2026-09-30T00:00:00Z'),
  updatedAt: new Date('2026-09-30T00:00:00Z'),
  creator: { id: CALLER, username: 'alice', displayName: 'Alice', avatar: null },
  members: [],
  _count: { members: 1, Conversation: 0 },
};

const memberRow = (userId: string) => ({
  id: 'member-1', communityId: COMMUNITY_ID, userId, role: 'member', isActive: true, joinedAt: new Date(),
  user: { id: userId, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false },
});

type Doubles = {
  existingMember?: { id: string; isActive: boolean } | null;
  communityCreatedBy?: string;
  isPrivate?: boolean;
};

async function buildApp(recordActivity: jest.Mock<RecordActivity>, doubles: Doubles = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    community: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => ({
        id: COMMUNITY_ID,
        isPrivate: doubles.isPrivate ?? false,
        createdBy: doubles.communityCreatedBy ?? CREATOR,
      })),
      create: jest.fn(async () => communityRow),
    },
    communityMember: {
      findFirst: jest.fn(async () => doubles.existingMember ?? null),
      create: jest.fn(async () => memberRow(CALLER)),
      update: jest.fn(async () => memberRow(CALLER)),
    },
  } as never);
  app.decorate('authenticate', async (request: FastifyRequest & { authContext?: unknown }) => {
    request.authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: CALLER,
      registeredUser: { id: CALLER, role: 'USER' },
    };
  });
  const engagement = { recordActivity };
  await registerCoreRoutes(app, { engagement });
  await registerMembershipRoutes(app, { engagement });
  await app.ready();
  return app;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

let recordActivity: jest.Mock<RecordActivity>;

beforeEach(() => {
  recordActivity = jest.fn<RecordActivity>(async () => undefined);
});

describe('POST /communities', () => {
  it('crédite social.community_created avec la communauté pour cible', async () => {
    const app = await buildApp(recordActivity);

    const res = await app.inject({ method: 'POST', url: '/communities', payload: { name: 'Cercle' } });
    await flush();

    expect(res.statusCode).toBe(201);
    expect(recordActivity).toHaveBeenCalledWith(CALLER, 'social.community_created', { targetId: COMMUNITY_ID });
    await app.close();
  });
});

describe('POST /communities/:id/join', () => {
  it('crédite social.community_joined à une adhésion neuve', async () => {
    const app = await buildApp(recordActivity);

    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(recordActivity).toHaveBeenCalledWith(CALLER, 'social.community_joined', {
      targetId: COMMUNITY_ID,
      targetOwnerId: CREATOR,
    });
    await app.close();
  });

  it('crédite aussi une adhésion réactivée', async () => {
    const app = await buildApp(recordActivity, { existingMember: { id: 'member-1', isActive: false } });

    await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    await flush();

    expect(recordActivity).toHaveBeenCalledWith(CALLER, 'social.community_joined', expect.objectContaining({ targetId: COMMUNITY_ID }));
    await app.close();
  });

  it('ne crédite rien pour un membre déjà actif', async () => {
    const app = await buildApp(recordActivity, { existingMember: { id: 'member-1', isActive: true } });

    const res = await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    await flush();

    expect(res.statusCode).toBe(409);
    expect(recordActivity).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne crédite rien pour une communauté privée refusée', async () => {
    const app = await buildApp(recordActivity, { isPrivate: true });

    await app.inject({ method: 'POST', url: `/communities/${COMMUNITY_ID}/join` });
    await flush();

    expect(recordActivity).not.toHaveBeenCalled();
    await app.close();
  });
});
