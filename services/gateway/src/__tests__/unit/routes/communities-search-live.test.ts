/**
 * `GET /communities/search` — ce que la route SERVIE laisse passer.
 *
 * Le cycle 84-bis a diagnostiqué juste et corrigé au mauvais endroit : son
 * correctif vit dans `routes/communities/search.ts`, que `route-registration.ts`
 * n'atteint jamais (Node résout LOAD_AS_FILE avant LOAD_AS_DIRECTORY, cf.
 * `module-shadowing.test.ts`). Ses deux suites importent elles aussi le module
 * mort : vertes, cohérentes, et sans effet sur la production.
 *
 * Ce fichier monte le module RÉELLEMENT servi — `routes/communities.ts` — avec
 * les VRAIS schémas, et traverse la sérialisation réelle.
 *
 * Ce qui était cassé : `creator: { type: 'object' }` et
 * `members: { items: { type: 'object' } }`, sans `properties`. Ce n'est pas un
 * objet libre — fast-json-stringify applique `additionalProperties: false` par
 * défaut et sérialise ces formes en `{}`. Or `APICommunityUser.id` et
 * `.username` sont NON optionnels côté iOS, et une propriété Swift optionnelle
 * ne tolère que la clé ABSENTE ou `null`, jamais un objet malformé : le `{}`
 * faisait échouer le décodage de TOUTE la réponse, pas seulement du champ.
 *
 * Présence des membres de l'aperçu : critère STRICT sans condition (directive
 * produit 2026-08-25) — être membre de la communauté qu'on parcourt, ou de
 * n'importe quelle autre, ne vaut plus aucun accès à la présence d'un tiers.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

import { communityRoutes } from '../../../routes/communities';

const VIEWER_ID = 'usr-viewer';
const MEMBER_ID = 'usr-member';
const COMM_ID = '507f1f77bcf86cd799439011';

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

const communityRow = (members: ReadonlyArray<Record<string, unknown>>) => ({
  id: COMM_ID,
  name: 'Meeshy Global',
  identifier: 'mshy_global',
  description: 'Une communauté publique',
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  creator: {
    id: 'usr-creator',
    username: 'alice',
    displayName: 'Alice',
    avatar: null,
  },
  members,
  _count: { members: 42, Conversation: 7 },
});

const memberRow = (userId: string, isOnline: boolean) => ({
  id: `mem-${userId}`,
  communityId: COMM_ID,
  userId,
  role: 'member',
  joinedAt: new Date('2026-02-01T00:00:00.000Z'),
  isActive: true,
  user: { id: userId, username: userId, displayName: userId, avatar: null, isOnline },
});

async function buildApp(
  members: ReadonlyArray<Record<string, unknown>>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      type: 'user',
      isAuthenticated: true,
      userId: VIEWER_ID,
      hasFullAccess: true,
      registeredUser: { id: VIEWER_ID, username: 'viewer', displayName: 'Viewer', role: 'USER' },
    };
  });

  app.decorate('prisma', {
    community: {
      findMany: jest.fn<any>().mockResolvedValue([communityRow(members)]),
      count: jest.fn<any>().mockResolvedValue(1),
    },
  } as any);

  await communityRoutes(app);
  await app.ready();
  return app;
}

const search = async (app: FastifyInstance) => {
  const res = await app.inject({ method: 'GET', url: '/communities/search?q=meeshy' });
  return JSON.parse(res.body);
};

beforeEach(() => {
  mockResolveForTargets.mockReset();
  mockResolveForTargets.mockResolvedValue(new Map());
});

describe('GET /communities/search — la charge utile atteint-elle le fil ?', () => {
  it('sert un `creator` porteur de ses champs, jamais `{}`', async () => {
    const app = await buildApp([memberRow(MEMBER_ID, false)]);
    const body = await search(app);
    await app.close();

    expect(body.data[0].creator).toMatchObject({ id: 'usr-creator', username: 'alice' });
  });

  it('sert des `members[]` porteurs de leur profil, jamais `[{}]`', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[MEMBER_ID, VISIBLE]]));
    const app = await buildApp([memberRow(MEMBER_ID, true)]);
    const body = await search(app);
    await app.close();

    expect(body.data[0].members[0]).toMatchObject({
      id: `mem-${MEMBER_ID}`,
      communityId: COMM_ID,
      userId: MEMBER_ID,
      role: 'member',
    });
    expect(body.data[0].members[0].user).toMatchObject({ id: MEMBER_ID, username: MEMBER_ID });
  });

  // La raison d'être du lot, exprimée comme le client la vit : les deux champs
  // qu'iOS type NON optionnels doivent être présents, sans quoi le décodage de
  // la réponse ENTIÈRE échoue — pas seulement celui du champ.
  it('porte `id` et `username` sur chaque profil servi', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[MEMBER_ID, VISIBLE]]));
    const app = await buildApp([memberRow(MEMBER_ID, true)]);
    const body = await search(app);
    await app.close();

    for (const profile of [body.data[0].creator, body.data[0].members[0].user]) {
      expect(typeof profile.id).toBe('string');
      expect(typeof profile.username).toBe('string');
    }
  });

  it('conserve les compteurs plats que le client lit', async () => {
    const app = await buildApp([]);
    const body = await search(app);
    await app.close();

    expect(body.data[0].memberCount).toBe(42);
    expect(body.data[0].conversationCount).toBe(7);
  });
});

describe('GET /communities/search — présence des membres de l’aperçu', () => {
  // La recherche sert `isPrivate: false` SANS condition d'appartenance : c'est
  // une surface de DÉCOUVERTE, donc critère strict par défaut.
  it('masque la présence d’un membre que le critère strict n’autorise pas', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[MEMBER_ID, HIDDEN]]));
    const app = await buildApp([memberRow(MEMBER_ID, true)]);
    const body = await search(app);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });

  it('masque aussi un membre que le résolveur strict n’a pas rendu', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const app = await buildApp([memberRow(MEMBER_ID, true)]);
    const body = await search(app);
    await app.close();

    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });

  // Avant la directive produit du 2026-08-25, une communauté dont le lecteur
  // était LUI-MÊME membre bifurquait vers un régime préférences-seules — la
  // co-appartenance valait alors un accès. Ce régime a disparu : ce témoin
  // prouve qu'il ne revient pas, même quand le lecteur est membre de la
  // communauté qu'il consulte.
  it('reste sur le critère strict même quand le lecteur est membre de la communauté', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[MEMBER_ID, VISIBLE]]));
    const app = await buildApp([memberRow(MEMBER_ID, true), memberRow(VIEWER_ID, true)]);
    const body = await search(app);
    await app.close();

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(body.data[0].members[0].user.isOnline).toBe(true);
  });
});

describe('GET /communities/search — composition de l’aperçu', () => {
  // Invisible tant que le schéma vidait `members[]` en `{}` ; servi dès que la
  // réponse porte vraiment ses champs.
  it('ne présente pas comme membre quelqu’un qui a quitté la communauté', async () => {
    const app = await buildApp([memberRow(MEMBER_ID, false)]);
    await search(app);
    const findManyArgs = ((app as any).prisma.community.findMany as jest.Mock).mock.calls[0][0] as any;
    await app.close();

    expect(findManyArgs.include.members.where).toEqual({ isActive: true });
  });
});
