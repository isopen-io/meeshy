/**
 * Le lien d'entrée d'une communauté se met en pause (#19661) : l'animateur ou
 * un modérateur le suspend et le relance, sans toucher ni à la communauté ni à
 * ses membres. Lien en pause ⇒ on n'entre plus PAR LE LIEN ; les autres portes
 * (adhésion directe d'une communauté publique, invitation nominative) restent.
 *
 * Témoins fail-closed sur chaque rang (créateur, admin, modérateur, membre,
 * non-membre, communauté désactivée, lecteur sans compte), sur ce qui part À
 * CÔTÉ de l'état servi, et sur la sérialisation réelle de `communitySchema`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { communitySchema } from '@meeshy/shared/types/api-schemas';

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

import { registerMembershipRoutes } from '../../../../routes/communities/membership';
import { registerJoinLinkRoutes } from '../../../../routes/communities/join-link';

const VIEWER = '507f1f77bcf86cd799430011';
const CREATOR = '507f1f77bcf86cd799430022';
const COMM = '507f1f77bcf86cd799430033';
const ROW = '507f1f77bcf86cd799430066';
const PAUSED_AT = new Date('2026-11-20T08:00:00Z');

type Role = 'admin' | 'moderator' | 'member' | null;

type Fixture = {
  readonly viewerRole?: Role;
  readonly viewerIsCreator?: boolean;
  readonly communityActive?: boolean;
  readonly pausedAt?: Date | null;
  readonly requiresJoinApproval?: boolean;
  readonly isPrivate?: boolean;
};

function makePrisma(fixture: Fixture = {}) {
  const viewerRole = fixture.viewerRole === undefined ? 'moderator' : fixture.viewerRole;
  const members = viewerRole ? [{ userId: VIEWER, role: viewerRole }] : [];
  const row = {
    id: COMM,
    identifier: 'mshy_cuisine',
    createdBy: fixture.viewerIsCreator ? VIEWER : CREATOR,
    isPrivate: fixture.isPrivate ?? false,
    requiresJoinApproval: fixture.requiresJoinApproval ?? false,
    joinLinkPausedAt: fixture.pausedAt ?? null,
    members,
  };
  return {
    community: {
      findFirst: jest.fn<any>(async ({ where }: any) => (fixture.communityActive === false && where.isActive === true ? null : row)),
      update: jest.fn<any>(async ({ data }: any) => ({ ...row, ...data })),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(3),
      create: jest.fn<any>(async ({ data }: any) => ({ id: ROW, joinedAt: new Date(), isActive: true, ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
    },
    communityJoinRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>(async ({ data }: any) => ({ id: ROW, status: 'pending', createdAt: new Date(), ...data })),
      update: jest.fn<any>(async ({ data }: any) => ({ id: ROW, ...data })),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    friendRequest: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userRelation: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const registered = (userId: string) => ({
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'u', displayName: 'U', role: 'USER' },
});
const anonymous = { isAuthenticated: true, userId: VIEWER, hasFullAccess: false, anonymousUser: { id: VIEWER } };

const apps: FastifyInstance[] = [];
const engagement = { recordActivity: jest.fn<any>().mockResolvedValue(undefined) };

async function build(prisma: any, authContext: unknown = registered(VIEWER)): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authContext; });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app, { engagement });
  await registerJoinLinkRoutes(app);
  await app.ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  engagement.recordActivity.mockClear();
});

const pause = (app: FastifyInstance, paused: unknown) =>
  app.inject({ method: 'PUT', url: `/communities/${COMM}/join-link`, payload: { paused } });

describe('PUT /communities/:id/join-link — qui peut suspendre le lien', () => {
  it.each([
    ['un MODÉRATEUR', { viewerRole: 'moderator' as Role }],
    ['un ADMINISTRATEUR', { viewerRole: 'admin' as Role }],
    ['le CRÉATEUR sans ligne active', { viewerRole: null as Role, viewerIsCreator: true }],
  ])('%s met le lien en pause, et seul l\'état part', async (_label, fixture) => {
    const prisma = makePrisma(fixture);
    const app = await build(prisma);
    const res = await pause(app, true);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Object.keys(data)).toEqual(['joinLinkPausedAt']);
    expect(Number.isNaN(Date.parse(data.joinLinkPausedAt))).toBe(false);
    expect(prisma.community.update).toHaveBeenCalledTimes(1);
    const write = prisma.community.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: COMM });
    expect(Object.keys(write.data)).toEqual(['joinLinkPausedAt']);
    expect(write.data.joinLinkPausedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['un MEMBRE simple', { viewerRole: 'member' as Role }],
    ['un non-membre', { viewerRole: null as Role }],
    ['un modérateur d\'une communauté DÉSACTIVÉE', { viewerRole: 'moderator' as Role, communityActive: false }],
  ])('%s reçoit le 404 générique, et rien n\'est écrit', async (_label, fixture) => {
    const prisma = makePrisma(fixture);
    const app = await build(prisma);
    const res = await pause(app, true);
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain('joinLinkPausedAt');
    expect(prisma.community.update).not.toHaveBeenCalled();
  });

  it('ne lit que la communauté ACTIVE, et la ligne ACTIVE du lecteur', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    await pause(app, true);
    const read = prisma.community.findFirst.mock.calls[0][0];
    expect(read.where).toEqual({ id: COMM, isActive: true });
    expect(read.select.members.where).toEqual({ userId: VIEWER, isActive: true });
  });

  it('refuse un lecteur sans compte (401), sans rien lire', async () => {
    const prisma = makePrisma();
    const app = await build(prisma, anonymous);
    const res = await pause(app, true);
    expect(res.statusCode).toBe(401);
    expect(prisma.community.findFirst).not.toHaveBeenCalled();
  });

  it('refuse un corps sans booléen (400), sans rien écrire', async () => {
    const prisma = makePrisma();
    const app = await build(prisma);
    const res = await pause(app, 'oui');
    expect(res.statusCode).toBe(400);
    expect(prisma.community.update).not.toHaveBeenCalled();
  });

  it('une pause déjà posée garde son instant : rejouer ne réécrit rien', async () => {
    const prisma = makePrisma({ pausedAt: PAUSED_AT });
    const app = await build(prisma);
    const res = await pause(app, true);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.joinLinkPausedAt).toBe(PAUSED_AT.toISOString());
    expect(prisma.community.update).not.toHaveBeenCalled();
  });

  it('relancer le lien efface l\'instant', async () => {
    const prisma = makePrisma({ pausedAt: PAUSED_AT });
    const app = await build(prisma);
    const res = await pause(app, false);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.joinLinkPausedAt).toBeNull();
    expect(prisma.community.update.mock.calls[0][0].data).toEqual({ joinLinkPausedAt: null });
  });
});

describe('POST /communities/:id/join — un lien en pause ne fait plus entrer', () => {
  it('refuse l\'entrée PAR LE LIEN (403 COMMUNITY_LINK_PAUSED), sans ligne écrite', async () => {
    const prisma = makePrisma({ viewerRole: null, pausedAt: PAUSED_AT });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { via: 'link' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_LINK_PAUSED');
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
  });

  it('refuse aussi la DEMANDE par le lien d\'une communauté qui valide chaque entrée', async () => {
    const prisma = makePrisma({ viewerRole: null, pausedAt: PAUSED_AT, requiresJoinApproval: true });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { via: 'link', acceptsPending: true } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('COMMUNITY_LINK_PAUSED');
    expect(prisma.communityJoinRequest.create).not.toHaveBeenCalled();
  });

  it('laisse l\'adhésion directe d\'une communauté publique : la pause ne ferme que le lien', async () => {
    const prisma = makePrisma({ viewerRole: null, pausedAt: PAUSED_AT });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join` });
    expect(res.statusCode).toBe(200);
  });

  it('un lien actif fait entrer comme avant', async () => {
    const prisma = makePrisma({ viewerRole: null, pausedAt: null });
    const app = await build(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { via: 'link' } });
    expect(res.statusCode).toBe(200);
  });

  it('lit l\'état de la pause dans la même lecture que la communauté', async () => {
    const prisma = makePrisma({ viewerRole: null });
    const app = await build(prisma);
    await app.inject({ method: 'POST', url: `/communities/${COMM}/join`, payload: { via: 'link' } });
    expect(prisma.community.findFirst.mock.calls[0][0].select.joinLinkPausedAt).toBe(true);
  });
});

describe('communitySchema — l\'état du lien traverse le sérialiseur', () => {
  it('sert joinLinkPausedAt (instant ISO, ou null)', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.get('/c', { schema: { response: { 200: communitySchema } } }, async () => ({ id: COMM, name: 'C', joinLinkPausedAt: PAUSED_AT }));
    app.get('/n', { schema: { response: { 200: communitySchema } } }, async () => ({ id: COMM, name: 'C', joinLinkPausedAt: null }));
    await app.ready();
    apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/c' })).json().joinLinkPausedAt).toBe(PAUSED_AT.toISOString());
    expect((await app.inject({ method: 'GET', url: '/n' })).json().joinLinkPausedAt).toBeNull();
  });
});
