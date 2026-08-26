/**
 * Ce que la PASSERELLE sert vraiment sous `/communities`.
 *
 * `route-registration.ts` importe `'./routes/communities'`. Deux modules
 * répondent à ce spécificateur — le fichier `routes/communities.ts` et le
 * dossier `routes/communities/` — et la résolution CommonJS donne TOUJOURS le
 * fichier. Tant que les deux existaient, le dossier était mort : chaque
 * correctif qui y atterrissait ne servait personne, et ses témoins restaient
 * verts sur du code que la production n'exécute pas.
 *
 * Ce fichier importe par le spécificateur de PRODUCTION, pas par un chemin
 * explicite, et n'assert que des comportements que les deux modules ne
 * partagent pas. C'est ce qui en fait une garde de CÂBLAGE : réintroduire un
 * `routes/communities.ts` porteur d'implémentation le fait tomber.
 *
 * Corollaire, et raison pour laquelle `@meeshy/shared/types/api-schemas` n'est
 * PAS mocké ici : les témoins voisins le remplacent par
 * `{ additionalProperties: true }`, ce qui neutralise fast-json-stringify — donc
 * exactement la couche où deux des défauts vivaient. Un témoin de sérialisation
 * se monte sur les vrais schémas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

const mockResolveForTargets = jest.fn<any>().mockResolvedValue(new Map());
const mockResolveForTarget = jest.fn<any>().mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: mockResolveForTargets,
    resolveForTarget: mockResolveForTarget,
  }),
}));

// ─── Import via le spécificateur de production ────────────────────────────────

import { communityRoutes } from '../../../routes/communities';

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_ID = 'usr-wiring-001';
const OTHER_ID = 'usr-wiring-002';
const COMM_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const creatorProfile = { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null };

// ─── Harnais ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    community: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>().mockResolvedValue({}),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      delete: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  } as any;
}

async function buildApp(prisma = makePrisma()): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = {
      type: 'registered',
      isAuthenticated: true,
      userId: USER_ID,
      hasFullAccess: true,
      registeredUser: { id: USER_ID, username: 'alice' },
    };
  });

  await app.register(communityRoutes);
  await app.ready();
  return { app, prisma };
}

// ─── Les routes que la production doit exposer ────────────────────────────────

describe('surface de routes servie sous /communities', () => {
  it('expose POST /communities/:id/conversations/:conversationId — iOS CommunityService l\'appelle', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMM_ID, createdBy: USER_ID, members: [{ role: 'admin' }],
    });
    prisma.conversation.findFirst = jest.fn<any>().mockResolvedValue({ id: CONV_ID, communityId: null });
    prisma.conversation.update = jest.fn<any>().mockResolvedValue({ id: CONV_ID, communityId: COMM_ID });

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/conversations/${CONV_ID}`,
    });

    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it('expose toujours POST /communities/:id/join', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({ id: COMM_ID, isPrivate: false });
    prisma.communityMember.create = jest.fn<any>().mockResolvedValue({
      id: 'mem-1', communityId: COMM_ID, userId: USER_ID, role: 'member',
      user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true },
    });

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('expose toujours POST /communities/:id/leave', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({ id: COMM_ID, createdBy: OTHER_ID });
    prisma.communityMember.deleteMany = jest.fn<any>().mockResolvedValue({ count: 1 });

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/leave` });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('expose toujours POST /communities/:id/invite', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: USER_ID, members: [{ role: 'admin' }],
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: OTHER_ID });
    prisma.communityMember.create = jest.fn<any>().mockResolvedValue({
      id: 'mem-2', communityId: COMM_ID, userId: OTHER_ID, role: 'member',
      user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
    });

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`, payload: { userId: OTHER_ID },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('expose toujours GET /communities/mine', async () => {
    const prisma = makePrisma();
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      { role: 'admin', community: { id: COMM_ID, name: 'C', identifier: 'mshy_c', avatar: null, isPrivate: false } },
    ]);

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/communities/mine' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].role).toBe('admin');
    await app.close();
  });
});

// ─── Ce que la sérialisation laisse vraiment passer ───────────────────────────

describe('GET /communities/search — la réponse porte ses objets imbriqués', () => {
  it('sert creator avec ses champs, pas un objet vide', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([
      {
        id: COMM_ID, name: 'Test', identifier: 'mshy_test', description: null,
        avatar: null, isPrivate: false, createdAt: new Date('2024-01-01'),
        creator: creatorProfile, members: [], _count: { members: 4, Conversation: 2 },
      },
    ]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].creator).toMatchObject({ id: USER_ID, username: 'alice' });
    await app.close();
  });

  it('sert members[] avec leurs champs, pas des objets vides', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([
      {
        id: COMM_ID, name: 'Test', identifier: 'mshy_test', description: null,
        avatar: null, isPrivate: false, createdAt: new Date('2024-01-01'),
        creator: creatorProfile,
        members: [{
          id: 'mem-1', communityId: COMM_ID, userId: OTHER_ID, role: 'member',
          user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
        }],
        _count: { members: 4, Conversation: 2 },
      },
    ]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].members[0].user).toMatchObject({ id: OTHER_ID, username: 'bob' });
    await app.close();
  });
});

// ─── La présence des tiers passe par le gate ──────────────────────────────────

describe('GET /communities/:id/members — la présence des co-membres est filtrée', () => {
  it('rend isOnline: false quand le membre a coupé showOnlineStatus', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      createdBy: USER_ID, isPrivate: false, members: [{ userId: USER_ID }],
    });
    prisma.communityMember.findMany = jest.fn<any>().mockResolvedValue([
      {
        id: 'mem-1', communityId: COMM_ID, userId: OTHER_ID, role: 'member', joinedAt: new Date(),
        user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true, lastActiveAt: new Date() },
      },
    ]);
    prisma.communityMember.count = jest.fn<any>().mockResolvedValue(1);
    mockResolveForTargets.mockResolvedValue(
      new Map([[OTHER_ID, { showOnline: false, showLastSeenTimestamp: false }]]),
    );

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].user.isOnline).toBe(false);
    await app.close();
  });
});

describe('les écritures qui rendent un TIERS filtrent sa présence', () => {
  it('POST /communities/:id/invite rend isOnline: false quand l\'invité a coupé showOnlineStatus', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: USER_ID, members: [{ role: 'admin' }],
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: OTHER_ID });
    prisma.communityMember.create = jest.fn<any>().mockResolvedValue({
      id: 'mem-2', communityId: COMM_ID, userId: OTHER_ID, role: 'member',
      user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
    });
    mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`, payload: { userId: OTHER_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.isOnline).toBe(false);
    await app.close();
  });

  it('POST /communities/:id/members rend isOnline: false quand l\'ajouté a coupé showOnlineStatus', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      createdBy: USER_ID, members: [{ role: 'admin' }],
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: OTHER_ID });
    prisma.communityMember.findFirst = jest.fn<any>().mockResolvedValue(null);
    prisma.communityMember.create = jest.fn<any>().mockResolvedValue({
      id: 'mem-3', communityId: COMM_ID, userId: OTHER_ID, role: 'member',
      user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
    });
    mockResolveForTarget.mockResolvedValue({ showOnline: false, showLastSeenTimestamp: false });

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/members`, payload: { userId: OTHER_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.isOnline).toBe(false);
    await app.close();
  });

  it('laisse isOnline intact quand le critère strict autorise la présence', async () => {
    const prisma = makePrisma();
    prisma.community.findFirst = jest.fn<any>().mockResolvedValue({
      id: COMM_ID, isPrivate: false, createdBy: USER_ID, members: [{ role: 'admin' }],
    });
    prisma.user.findFirst = jest.fn<any>().mockResolvedValue({ id: OTHER_ID });
    prisma.communityMember.create = jest.fn<any>().mockResolvedValue({
      id: 'mem-4', communityId: COMM_ID, userId: OTHER_ID, role: 'member',
      user: { id: OTHER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true },
    });
    mockResolveForTarget.mockResolvedValue({ showOnline: true, showLastSeenTimestamp: true });

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: `/communities/${COMM_ID}/invite`, payload: { userId: OTHER_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.isOnline).toBe(true);
    await app.close();
  });
});

// ─── L'écriture assainit ──────────────────────────────────────────────────────

describe('POST /communities — le nom persisté est assaini', () => {
  it('ne persiste pas de balise HTML dans le nom', async () => {
    const prisma = makePrisma();
    const create = jest.fn<any>().mockResolvedValue({
      id: COMM_ID, name: 'ok', identifier: 'mshy_x', description: null, avatar: null,
      isPrivate: true, createdBy: USER_ID, createdAt: new Date(), updatedAt: new Date(),
      creator: creatorProfile, members: [], _count: { members: 1, Conversation: 0 },
    });
    prisma.community.create = create;

    const { app } = await buildApp(prisma);
    const res = await app.inject({
      method: 'POST', url: '/communities',
      payload: { name: '<script>alert(1)</script>Salon', isPrivate: true },
    });

    expect(res.statusCode).toBe(201);
    expect(create.mock.calls[0][0].data.name).not.toContain('<script>');
    await app.close();
  });
});

// ─── Ce que le module vivant ne doit PAS perdre au passage ────────────────────

describe('GET /communities — les compteurs restent aplatis', () => {
  it('sert memberCount / conversationCount, que `communitySchema` déclare (et non `_count`)', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([
      {
        id: COMM_ID, name: 'Test', identifier: 'mshy_test', description: null, avatar: null,
        isPrivate: false, createdBy: USER_ID, createdAt: new Date(), updatedAt: new Date(),
        creator: creatorProfile, members: [], _count: { members: 7, Conversation: 3 },
      },
    ]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);

    const { app } = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/communities' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].memberCount).toBe(7);
    expect(res.json().data[0].conversationCount).toBe(3);
    await app.close();
  });
});
