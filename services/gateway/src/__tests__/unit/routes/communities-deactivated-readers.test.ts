/**
 * Une communauté DÉSACTIVÉE par l'administration disparaît de tous les lecteurs
 * publics (#8876, § 6.5 — « loi 4 côté produit »).
 *
 * `PATCH /admin/communities/:id { isActive: false }` pose `isActive: false` et
 * `deletedAt`. Sans ce lot, aucun lecteur public ne lisait la colonne : le geste
 * aurait été INERTE — un bouton qui écrit une valeur que personne ne regarde.
 *
 * Le double Prisme ci-dessous HONORE `where.isActive` (et `where.id`,
 * `where.identifier`) sur un jeu de communautés dont une est désactivée : une
 * garde qui vit dans un `where` n'est visible d'un témoin que si le faux Prisma
 * applique ce `where` — sinon le témoin atteste un `findFirst` qui renvoie ce
 * qu'on lui a dit de renvoyer.
 *
 * Un témoin par lecteur : la liste, le détail (par id ET par identifiant), la
 * recherche, l'adhésion, « mes communautés ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((text: string) => text) },
}));

import { registerCoreRoutes } from '../../../routes/communities/core';
import { registerMembershipRoutes } from '../../../routes/communities/membership';
import { registerSearchRoutes } from '../../../routes/communities/search';

const USER = '507f1f77bcf86cd799430011';
const ALIVE = '507f1f77bcf86cd799430021';
const DEACTIVATED = '507f1f77bcf86cd799430022';

type Row = Record<string, unknown>;

const community = (id: string, over: Row = {}): Row => ({
  id,
  identifier: `mshy_${id.slice(-4)}`,
  name: id === ALIVE ? 'Active' : 'Désactivée',
  description: null,
  avatar: null,
  isPrivate: false,
  isActive: id === ALIVE,
  createdBy: USER,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  creator: { id: USER, username: 'alice', displayName: 'Alice', avatar: null },
  members: [],
  _count: { members: 1, Conversation: 0 },
  ...over,
});

const CORPUS = [community(ALIVE), community(DEACTIVATED)];

/** Applique les seuls opérateurs que les lecteurs posent : id, identifier, isActive, isPrivate, OR/AND de recherche ignorés. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.identifier !== undefined && row.identifier !== where.identifier) return false;
  if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
  if (where.isPrivate !== undefined && row.isPrivate !== where.isPrivate) return false;
  const clauses = Array.isArray(where.AND) ? (where.AND as Row[]) : [];
  return clauses.every((clause) => matches(row, clause));
}

function makePrisma() {
  return {
    community: {
      findFirst: jest.fn<any>(async (args: { where?: Row }) => CORPUS.find((row) => matches(row, args.where)) ?? null),
      findUnique: jest.fn<any>(async () => null),
      findMany: jest.fn<any>(async (args: { where?: Row }) => CORPUS.filter((row) => matches(row, args.where))),
      count: jest.fn<any>(async (args: { where?: Row }) => CORPUS.filter((row) => matches(row, args.where)).length),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>(async (args: { where?: Row }) => {
        const asked = (args.where?.community as Row | undefined)?.isActive;
        return [ALIVE, DEACTIVATED]
          .filter((id) => asked === undefined || CORPUS.find((row) => row.id === id)?.isActive === asked)
          .map((id) => ({
            id: `m-${id}`,
            role: 'member',
            community: { id, name: id === ALIVE ? 'Active' : 'Désactivée', identifier: 'x', avatar: null, isPrivate: false },
          }));
      }),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function build(register: (app: FastifyInstance) => Promise<void> | void): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: USER,
      hasFullAccess: true,
      registeredUser: { id: USER, username: 'alice', displayName: 'Alice', role: 'USER' },
    };
  });
  app.decorate('prisma', makePrisma());
  await register(app);
  await app.ready();
  return app;
}

describe('GET /communities — la liste', () => {
  it('ne sert pas une communauté désactivée', async () => {
    const app = await build(registerCoreRoutes);
    const res = await app.inject({ method: 'GET', url: '/communities' });
    const names = JSON.parse(res.body).data.map((row: Row) => row.name);

    expect(res.statusCode).toBe(200);
    expect(names).toEqual(['Active']);
    await app.close();
  });

  it('la recherche ne ramène pas non plus la désactivée, et le compte de pagination la tait', async () => {
    const app = await build(registerCoreRoutes);
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities?search=active' })).body);

    expect(body.data.map((row: Row) => row.name)).toEqual(['Active']);
    expect(body.pagination.total).toBe(1);
    await app.close();
  });
});

describe('GET /communities/:id — le détail', () => {
  it('rend 404 pour une communauté désactivée, par son id', async () => {
    const app = await build(registerCoreRoutes);
    const res = await app.inject({ method: 'GET', url: `/communities/${DEACTIVATED}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('rend 404 pour une communauté désactivée, par son identifiant lisible', async () => {
    const app = await build(registerCoreRoutes);
    const res = await app.inject({ method: 'GET', url: `/communities/mshy_${DEACTIVATED.slice(-4)}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('sert toujours une communauté active — le témoin miroir', async () => {
    const app = await build(registerCoreRoutes);
    const res = await app.inject({ method: 'GET', url: `/communities/${ALIVE}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /communities/search — la recherche publique', () => {
  it('ne ramène pas une communauté désactivée', async () => {
    const app = await build(registerSearchRoutes);
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities/search?q=activ' })).body);

    expect(body.data.map((row: Row) => row.name)).toEqual(['Active']);
    await app.close();
  });
});

describe('POST /communities/:id/join — l’adhésion', () => {
  it('est refusée (404) pour une communauté désactivée, sans écrire', async () => {
    const app = await build(registerMembershipRoutes);
    const prisma = (app as any).prisma;
    const res = await app.inject({ method: 'POST', url: `/communities/${DEACTIVATED}/join` });

    expect(res.statusCode).toBe(404);
    expect(prisma.communityMember.create).not.toHaveBeenCalled();
    expect(prisma.communityMember.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('reste ouverte pour une communauté active — le témoin miroir', async () => {
    const app = await build(registerMembershipRoutes);
    const res = await app.inject({ method: 'POST', url: `/communities/${ALIVE}/join` });
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });
});

describe('GET /communities/mine — mes communautés', () => {
  it('ne liste pas une communauté désactivée dont je suis encore membre', async () => {
    const app = await build(registerMembershipRoutes);
    const body = JSON.parse((await app.inject({ method: 'GET', url: '/communities/mine' })).body);

    expect(body.data.map((row: Row) => row.name)).toEqual(['Active']);
    await app.close();
  });
});
