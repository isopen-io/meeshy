/**
 * Quitter une communauté laisse une trace, et la ré-adhésion réactive la
 * ligne au lieu d'en ouvrir une seconde (#5760).
 *
 * `POST /communities/:id/leave` posait `communityMember.deleteMany` — la
 * ligne DISPARAISSAIT, contrairement à son jumeau `POST
 * /conversations/:id/leave` (`Participant.isActive = false` + `leftAt`).
 * Aligné : la ligne persiste, `GET /communities/mine` et
 * `GET /communities/:id/members` ne la montrent plus, et `POST .../join`,
 * `POST .../invite`, `POST .../members` RÉACTIVENT la ligne existante
 * plutôt que d'en créer une seconde pour la même paire
 * (communityId, userId).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 20,
  })),
}));

jest.mock('../../../routes/communities/types', () => ({
  AddMemberSchema: { parse: (data: any) => data },
  UpdateMemberRoleSchema: { parse: (data: any) => data },
  CommunityRole: { ADMIN: 'admin', MODERATOR: 'moderator', MEMBER: 'member' },
}));

// `@meeshy/shared/types/api-schemas` n'est pas mocké — un double désarmerait
// fast-json-stringify, la couche que ce lot ne touche pas mais que le dépôt
// interdit de masquer (CLAUDE.md § « un témoin s'importe par le chemin de la
// PRODUCTION »).
import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerMemberRoutes } from '../../../routes/communities/members';

const USER_ID = '507f1f77bcf86cd799430011';
const OTHER_USER_ID = '507f1f77bcf86cd799430022';
const COMM_ID = '507f1f77bcf86cd799430033';
const MEMBER_ID = '507f1f77bcf86cd799430044';

const baseAuthContext = {
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', displayName: 'Alice', role: 'USER' },
};

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: COMM_ID, isPrivate: false, createdBy: OTHER_USER_ID }),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: OTHER_USER_ID }),
    },
    ...overrides,
  } as any;
}

async function buildMembershipApp(prisma = makePrisma()): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = baseAuthContext; });
  app.decorate('prisma', prisma);
  await registerMembershipRoutes(app);
  await app.ready();
  return { app, prisma };
}

async function buildMemberRoutesApp(prisma = makePrisma()): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = baseAuthContext; });
  app.decorate('prisma', prisma);
  await registerMemberRoutes(app);
  await app.ready();
  return { app, prisma };
}

// ─── POST /communities/:id/leave ───────────────────────────────────────────

describe('POST /communities/:id/leave — pose isActive:false + leftAt, ne supprime plus', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.communityMember.findFirst.mockResolvedValue({ id: MEMBER_ID, communityId: COMM_ID, userId: USER_ID, isActive: true });
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and updates the row instead of deleting it', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.deleteMany).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: expect.objectContaining({ isActive: false, leftAt: expect.any(Date) }),
    });
  });
});

describe('POST /communities/:id/leave — déjà parti (ligne inactive)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    // Une ligne existe mais est déjà inactive : `findFirst({ isActive: true })`
    // ne la trouve pas — même verdict qu'aucune ligne du tout.
    prisma.communityMember.findFirst.mockResolvedValue(null);
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 without touching the row', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });
    expect(res.statusCode).toBe(404);
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
  });
});

// ─── POST /communities/:id/join — ré-adhésion ──────────────────────────────

describe('POST /communities/:id/join — réactive une ligne laissée par un départ', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({ id: COMM_ID, isPrivate: false });
    prisma.communityMember.findFirst.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: USER_ID, isActive: false, role: 'admin',
    });
    prisma.communityMember.update.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: USER_ID, isActive: true, leftAt: null, role: 'member',
      user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false },
    });
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('reactivates the row instead of creating a second one, and resets the role', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null, role: 'member' }),
      }),
    );
  });
});

describe('POST /communities/:id/join — déjà membre actif', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({ id: COMM_ID, isPrivate: false });
    prisma.communityMember.findFirst.mockResolvedValue({ id: MEMBER_ID, userId: USER_ID, isActive: true });
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('still returns 409, no write happens', async () => {
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    expect(res.statusCode).toBe(409);
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
  });
});

// ─── POST /communities/:id/invite — ré-adhésion ────────────────────────────

describe('POST /communities/:id/invite — réactive une ligne laissée par un départ', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: USER_ID,
      members: [{ role: 'admin' }],
    });
    prisma.user.findFirst.mockResolvedValue({ id: OTHER_USER_ID });
    prisma.communityMember.findFirst.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: OTHER_USER_ID, isActive: false, role: 'moderator',
    });
    prisma.communityMember.update.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: OTHER_USER_ID, isActive: true, leftAt: null, role: 'member',
      user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false },
    });
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('reactivates instead of creating a second row', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`, payload: { userId: OTHER_USER_ID },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null, role: 'member' }),
      }),
    );
  });
});

// ─── POST /communities/:id/members (admin) — ré-adhésion ───────────────────

describe('POST /communities/:id/members — réactive avec le rôle demandé', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      members: [{ role: 'admin' }],
    });
    prisma.user.findFirst.mockResolvedValue({ id: OTHER_USER_ID });
    prisma.communityMember.findFirst.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: OTHER_USER_ID, isActive: false,
    });
    prisma.communityMember.update.mockResolvedValue({
      id: MEMBER_ID, communityId: COMM_ID, userId: OTHER_USER_ID, isActive: true, leftAt: null, role: 'moderator',
      user: { id: OTHER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: false, deactivatedAt: null },
    });
    ({ app } = await buildMemberRoutesApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('reactivates the row with the role the admin asked for', async () => {
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`, payload: { userId: OTHER_USER_ID, role: 'moderator' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null, role: 'moderator' }),
      }),
    );
  });
});

// ─── Les listes ne montrent plus un membre parti ───────────────────────────

describe('GET /communities/mine — un membre parti ne réapparaît plus', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.communityMember.findMany.mockResolvedValue([]);
    ({ app } = await buildMembershipApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('queries only active memberships', async () => {
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID, isActive: true }) }),
    );
  });
});

describe('GET /communities/:id/members — un membre parti ne réapparaît plus', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof makePrisma>;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.community.findFirst.mockResolvedValue({
      createdBy: USER_ID, isPrivate: false, members: [{ userId: USER_ID }],
    });
    prisma.communityMember.findMany.mockResolvedValue([]);
    prisma.communityMember.count.mockResolvedValue(0);
    ({ app } = await buildMemberRoutesApp(prisma));
  });
  afterAll(async () => { await app.close(); });

  it('queries and counts only active members', async () => {
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    expect(res.statusCode).toBe(200);
    expect(prisma.communityMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { communityId: COMM_ID, isActive: true } }),
    );
    expect(prisma.communityMember.count).toHaveBeenCalledWith({ where: { communityId: COMM_ID, isActive: true } });
  });
});
