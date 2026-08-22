/**
 * Unit tests for communities search routes (search.ts)
 * Tests GET /communities/search.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { communityRoutes } from '../../../../routes/communities/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'usr-search-test-001';

const mockCommunity = {
  id: 'comm-1', name: 'Test Community', identifier: 'mshy_test',
  description: null, avatar: null, isPrivate: false,
  createdAt: new Date('2024-01-01'),
  creator: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members: [],
  _count: { members: 1, Conversation: 0 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated';
  prisma?: ReturnType<typeof makePrisma>;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'authenticated', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest, reply: any) => {
    if (auth === 'authenticated') {
      (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
    } else {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  await app.register(communityRoutes);
  await app.ready();
  return { app, prisma };
}

// ─── GET /communities/search ──────────────────────────────────────────────────

describe('GET /communities/search — unauthenticated', () => {
  it('returns 401', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /communities/search — empty query', () => {
  it('returns 200 with empty results when no q provided', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities/search' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('returns 200 with empty results when q is blank', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=%20' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /communities/search — with results', () => {
  it('returns 200 with matching communities', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([mockCommunity]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('passes offset and limit to the DB query', async () => {
    const prisma = makePrisma();
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'GET', url: '/communities/search?q=test&offset=10&limit=5',
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.community.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
    await app.close();
  });
});

describe('GET /communities/search — DB error', () => {
  it('returns 500 on DB error', async () => {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockRejectedValue(new Error('db crash'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── L'aperçu de membres sort, et sa présence est GATÉE ──────────────────────
//
// ⚠ CE FICHIER MONTE LE MODULE MASQUÉ. `routes/communities.ts` (fichier) fait
// écran à `routes/communities/` (répertoire) — résolution Node : le fichier
// l'emporte. Rien de ce qui est testé ici ne tourne en production, et le gate
// décrit ci-dessous n'a jamais protégé personne (cycle 86 ; le portage vers le
// module MONTÉ vit dans `routes/communities.test.ts`).
//
// Ce bloc remplace le témoin « ne sert ni isOnline ni profil de membre » posé
// par le cycle 84. Ce témoin gardait une non-fuite ACCIDENTELLE — le schéma
// déclarait `creator` et `members` en `{ type: 'object' }` NU, que
// fast-json-stringify sérialise en `{}` — et il portait sa propre condition de
// péremption :
//
//   « le jour où quelqu'un déclare les propriétés du schéma pour faire vivre
//     l'aperçu, ce témoin doit tomber — et le forcer à poser le gate STRICT en
//     même temps. »
//
// C'est ce jour. Le schéma déclare désormais `userMinimalSchema` /
// `communityMemberSchema` (le `{}` faisait échouer le décodage de TOUTE la
// réponse côté iOS, où `APICommunityUser.id`/`.username` sont non-optionnels),
// et le gate strict est posé dans le même lot. Le témoin change donc de
// propriété — il ne garde plus le silence de la porte, il garde son GATE.

describe('GET /communities/search — l aperçu de membres est gaté', () => {
  function communityWithMember() {
    return {
      ...mockCommunity,
      members: [{
        id: 'cm-1', communityId: 'comm-1', userId: 'usr-member-a', role: 'member',
        joinedAt: new Date('2024-02-01'),
        user: { id: 'usr-member-a', username: 'awa', displayName: 'Awa', avatar: null, isOnline: true },
      }],
    };
  }

  async function search() {
    const prisma = makePrisma();
    prisma.community.findMany = jest.fn<any>().mockResolvedValue([communityWithMember()]);
    prisma.community.count = jest.fn<any>().mockResolvedValue(1);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/communities/search?q=test' });
    await app.close();
    return res.json().data[0];
  }

  it('sert enfin le créateur et le membre — le `{}` cassait le décodage iOS', async () => {
    const community = await search();

    expect(community.creator).toMatchObject({ id: USER_ID, username: 'alice' });
    expect(community.members[0]).toMatchObject({ id: 'cm-1', userId: 'usr-member-a', role: 'member' });
    expect(community.members[0].user).toMatchObject({ id: 'usr-member-a', username: 'awa' });
  });

  // Le harnais construit un authContext sans `type: 'user'` ni rôle :
  // `viewerFromRequest` rend `null`, et un viewer nul MASQUE. C'est la
  // propriété que le cycle 84 voulait voir tenir — une porte de découverte ne
  // dit jamais la présence de quelqu'un dont rien ne prouve le lien.
  it('masque la présence du membre — la recherche est une porte de DÉCOUVERTE', async () => {
    const community = await search();

    expect(community.members[0].user.isOnline).toBe(false);
  });

  it('ne fabrique pas de lastActiveAt — l aperçu ne le charge pas', async () => {
    const community = await search();

    expect(community.members[0].user.lastActiveAt).toBeUndefined();
  });
});
