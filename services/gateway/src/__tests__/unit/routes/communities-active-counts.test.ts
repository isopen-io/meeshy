/**
 * #16603 — « membre » veut dire ligne ACTIVE, et le compteur compte les seuls
 * actifs, sur les routes VOISINES de `core.ts` aussi.
 *
 * La recherche publique, la mise à jour des réglages et le tableau de bord
 * (`GET /users/me/dashboard-stats`) comptaient les partis, trouvaient une
 * communauté par le nom d'un ANCIEN membre, et le tableau de bord rendait à un
 * ancien membre le nom, la description et l'avatar d'une communauté PRIVÉE
 * quittée, avec cinq de ses membres.
 *
 * Ces gardes vivent dans le `where` remis à Prisma : le témoin lit ce `where`
 * (un double qui l'ignorerait attesterait un résultat qu'on lui a dicté).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((text: string) => text) },
}));

import { registerSearchRoutes } from '../../../routes/communities/search';
import { registerSettingsRoutes } from '../../../routes/communities/settings';
import { getDashboardStats } from '../../../routes/users/preferences';
import { COMMUNITY_ACTIVE_COUNTS } from '../../../routes/communities/serialization';

const USER = '507f1f77bcf86cd799430011';
const COMMUNITY = '507f1f77bcf86cd799430021';

type Row = Record<string, unknown>;

const communityRow = (): Row => ({
  id: COMMUNITY,
  identifier: 'mshy_c',
  name: 'C',
  description: null,
  avatar: null,
  isPrivate: false,
  isActive: true,
  createdBy: USER,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  creator: { id: USER, username: 'u', displayName: 'U', avatar: null },
  members: [],
  _count: { members: 1, Conversation: 0 },
});

function makePrisma() {
  return {
    community: {
      findMany: jest.fn<any>().mockResolvedValue([communityRow()]),
      count: jest.fn<any>().mockResolvedValue(1),
      findFirst: jest.fn<any>().mockResolvedValue({ createdBy: USER, identifier: 'mshy_c' }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockResolvedValue(communityRow()),
    },
    communityMember: { count: jest.fn<any>().mockResolvedValue(0) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { count: jest.fn<any>().mockResolvedValue(0), findFirst: jest.fn<any>().mockResolvedValue(null) },
    participant: { count: jest.fn<any>().mockResolvedValue(0), findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: {
      count: jest.fn<any>().mockResolvedValue(0),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

async function build(register: (app: FastifyInstance) => Promise<void> | void) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = makePrisma();
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      userId: USER,
      hasFullAccess: true,
      registeredUser: { id: USER, username: 'u', displayName: 'U', role: 'USER' },
    };
  });
  app.decorate('prisma', prisma);
  await register(app);
  await app.ready();
  return { app, prisma };
}

const firstArg = (fn: jest.Mock<any>): Row => (fn.mock.calls[0] as Row[])[0];

describe('GET /communities/search', () => {
  it('compte les seuls membres actifs', async () => {
    const { app, prisma } = await build(registerSearchRoutes);
    await app.inject({ method: 'GET', url: '/communities/search?q=abc' });

    expect((firstArg(prisma.community.findMany).include as Row)._count).toEqual({ select: COMMUNITY_ACTIVE_COUNTS });
    await app.close();
  });

  it('ne trouve plus une communauté par le nom d’un ANCIEN membre', async () => {
    const { app, prisma } = await build(registerSearchRoutes);
    await app.inject({ method: 'GET', url: '/communities/search?q=abc' });

    const clauses = (firstArg(prisma.community.findMany).where as Row).OR as Row[];
    const parMembre = clauses.find((clause) => clause.members !== undefined) as { members: { some: Row } };
    expect(parMembre.members.some.isActive).toBe(true);
    await app.close();
  });
});

describe('PUT /communities/:id', () => {
  it('rend un compteur des seuls membres actifs', async () => {
    const { app, prisma } = await build(registerSettingsRoutes);
    await app.inject({ method: 'PUT', url: `/communities/${COMMUNITY}`, payload: { name: 'Nouveau nom' } });

    expect((firstArg(prisma.community.update).include as Row)._count).toEqual({ select: COMMUNITY_ACTIVE_COUNTS });
    await app.close();
  });
});

describe('GET /users/me/dashboard-stats', () => {
  it('ne rend plus une communauté quittée, ni ses membres partis, et compte les actifs', async () => {
    const { app, prisma } = await build(getDashboardStats);
    await app.inject({ method: 'GET', url: '/users/me/dashboard-stats' });

    const args = firstArg(prisma.community.findMany);
    expect((args.where as { members: { some: Row } }).members.some).toEqual({ userId: USER, isActive: true });
    expect(((args.select as Row).members as Row).where).toEqual({ isActive: true });
    expect((args.select as Row)._count).toEqual({ select: COMMUNITY_ACTIVE_COUNTS });
    expect(firstArg(prisma.communityMember.count).where).toEqual({ userId: USER, isActive: true });
    await app.close();
  });
});
