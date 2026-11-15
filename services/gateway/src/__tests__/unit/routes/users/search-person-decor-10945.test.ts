/**
 * #10945 — un RÉSULTAT DE RECHERCHE de personne porte son contour équipé :
 * `GET /users/search` (iOS) et `GET /directory/people` (web) servent
 * `profileDecor.avatarRing`, lu dans le `select` de la recherche (aucune
 * lecture de plus), DÉCLARÉ au schéma de réponse (sinon fast-json-stringify
 * l'efface), et jamais la colonne brute.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

import { searchUsers } from '../../../../routes/users/preferences';
import { directoryPeopleRoutes } from '../../../../routes/directory/people';

const MOI = '507f1f77bcf86cd799439011';
const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const row = (id: string, equippedAvatarRing: string | null) => ({
  id, username: id, firstName: 'A', lastName: 'B', displayName: id, avatar: null, isOnline: false, lastActiveAt: null, systemLanguage: 'fr', equippedAvatarRing,
});
const ROWS = [row('ana', 'contours-essentiels/filet'), row('bob', null), row('eve', 'disparu/rien')];

function prismaWith(rows: unknown[]) {
  const findMany = jest.fn<any>(async (args: any) => (args?.where?.blockedUserIds ? [] : rows));
  return {
    findMany,
    prisma: {
      user: { findMany, count: jest.fn<any>(async () => rows.length), findUnique: jest.fn<any>(async () => ({ blockedUserIds: [] })) },
      userPreferences: { findMany: jest.fn<any>(async () => []) },
      userPreference: { findMany: jest.fn<any>(async () => []) },
    },
  };
}

async function mount(register: (app: FastifyInstance) => Promise<void>, prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: MOI };
    req.authContext = { isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI, role: 'USER' } };
  });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', undefined as never);
  await register(app);
  await app.ready();
  return app;
}

const ROUTES = [
  ['GET /users/search', (app: FastifyInstance) => app.register(searchUsers) as unknown as Promise<void>, '/users/search?q=ana'],
  ['GET /directory/people', (app: FastifyInstance) => app.register(directoryPeopleRoutes, { prefix: '/directory' }) as unknown as Promise<void>, '/directory/people?q=ana'],
] as const;

describe.each(ROUTES)('#10945 — %s sert le contour des résultats', (_name, register, url) => {
  it('profileDecor résolu au registre, aucune clé sans contour, jamais la colonne', async () => {
    const { prisma } = prismaWith(ROWS);
    const app = await mount(register, prisma);
    const res = await app.inject({ method: 'GET', url });
    await app.close();
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    const byId = new Map(data.map((u) => [u.id, u]));
    expect(byId.get('ana')?.profileDecor).toEqual({ avatarRing: RING });
    expect(byId.get('bob')).not.toHaveProperty('profileDecor');
    expect(byId.get('eve')).not.toHaveProperty('profileDecor');
    expect(res.body).not.toContain('equippedAvatarRing');
  });

  it('la colonne vient du select de la recherche : aucune lecture de plus', async () => {
    const bare = prismaWith(ROWS.map((r) => ({ ...r, equippedAvatarRing: null })));
    const app1 = await mount(register, bare.prisma);
    await app1.inject({ method: 'GET', url });
    await app1.close();
    const ringed = prismaWith(ROWS);
    const app2 = await mount(register, ringed.prisma);
    await app2.inject({ method: 'GET', url });
    await app2.close();
    expect(ringed.findMany.mock.calls.length).toBe(bare.findMany.mock.calls.length);
    const search = (ringed.findMany.mock.calls as any[]).filter((c) => !c[0]?.where?.blockedUserIds).at(-1)![0];
    expect(search.select).toMatchObject({ equippedAvatarRing: true });
  });
});
