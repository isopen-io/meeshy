/**
 * `routes/communities.ts` — la présence des membres passe-t-elle par un gate ?
 *
 * Ce fichier monte le VRAI module de routes servi en production et les VRAIS
 * schémas de réponse (`api-schemas` n'est PAS mocké) : ce qu'il observe est ce
 * que fast-json-stringify laisse réellement sortir. C'est la leçon du cycle 84 —
 * « entre la requête et le fil il y a un sérialiseur, et il faut l'avoir
 * traversé pour parler » — appliquée d'emblée plutôt qu'après coup.
 *
 * Pourquoi CE module et pas `routes/communities/members.ts`, où le gate existe
 * depuis des cycles : `route-registration.ts` importe `'./routes/communities'`,
 * et Node résout LOAD_AS_FILE avant LOAD_AS_DIRECTORY. C'est donc
 * `routes/communities.ts` qui sert, et le répertoire voisin est injoignable.
 * `module-shadowing.test.ts` garde ce fait.
 *
 * Deux régimes coexistent ici, et le second n'est PAS un détail :
 *  - lecteur co-membre ⇒ contexte d'accès garanti des deux côtés ⇒ prefs-only ;
 *  - lecteur NON-membre d'une communauté PUBLIQUE (le contrôle d'accès ne
 *    referme que les privées) ⇒ c'est une porte de DÉCOUVERTE ⇒ critère STRICT.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockResolvePrefsOnly = jest.fn<any>();
const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolvePrefsOnly: (...args: any[]) => mockResolvePrefsOnly(...args),
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
}));

import { communityRoutes } from '../../../routes/communities';

const VIEWER_ID = 'usr-viewer';
const SHY_ID = 'usr-shy';
const OPEN_ID = 'usr-open';
const COMM_ID = '507f1f77bcf86cd799439011';

const VISIBLE = { showOnline: true, showLastSeenTimestamp: true };
const HIDDEN = { showOnline: false, showLastSeenTimestamp: false };

// La forme RÉELLE que pose `middleware/auth.ts` (`type: 'user'`), et non le
// `type: 'registered'` qu'emploient les suites voisines : le viewer du critère
// strict se lit sur ce champ, un libellé approximatif le rendrait `null` et
// masquerait tout — ce qui ferait passer un test pour la mauvaise raison.
const authContextFor = (userId: string) => ({
  type: 'user' as const,
  isAuthenticated: true,
  userId,
  hasFullAccess: true,
  registeredUser: { id: userId, username: 'viewer', displayName: 'Viewer', role: 'USER' },
});

const memberRow = (userId: string, isOnline: boolean) => ({
  id: `mem-${userId}`,
  communityId: COMM_ID,
  userId,
  role: 'member',
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isActive: true,
  user: {
    id: userId,
    username: userId,
    displayName: userId,
    avatar: null,
    isOnline,
    lastActiveAt: new Date('2026-08-22T10:00:00.000Z'),
  },
});

type AppOpts = {
  readonly viewerId?: string;
  readonly community?: Record<string, unknown>;
  readonly members?: ReadonlyArray<ReturnType<typeof memberRow>>;
  readonly createdMember?: Record<string, unknown>;
};

async function buildApp(opts: AppOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const viewerId = opts.viewerId ?? VIEWER_ID;

  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContextFor(viewerId);
  });

  app.decorate('prisma', {
    community: {
      findFirst: jest.fn<any>().mockResolvedValue(
        opts.community ?? {
          id: COMM_ID,
          createdBy: VIEWER_ID,
          isPrivate: false,
          members: [{ userId: VIEWER_ID, role: 'admin' }],
        },
      ),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue(opts.members ?? [memberRow(SHY_ID, true)]),
      count: jest.fn<any>().mockResolvedValue((opts.members ?? [1]).length),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue(opts.createdMember ?? memberRow(SHY_ID, true)),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: SHY_ID }),
    },
  } as any);

  await communityRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  mockResolvePrefsOnly.mockReset();
  mockResolveForTargets.mockReset();
  mockResolvePrefsOnly.mockResolvedValue(new Map());
  mockResolveForTargets.mockResolvedValue(new Map());
});

describe('GET /communities/:id/members — lecteur co-membre (prefs-only)', () => {
  it('sert HORS LIGNE le membre qui a coupé sa présence', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({ members: [memberRow(SHY_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data[0].user.isOnline).toBe(false);
  });

  it('conserve la présence du membre qui l’autorise', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(OPEN_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(true);
  });

  it('résout sur les `User.id` des membres, une seule fois', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SHY_ID, VISIBLE], [OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(SHY_ID, false), memberRow(OPEN_ID, true)] });

    await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    await app.close();

    expect(mockResolvePrefsOnly).toHaveBeenCalledTimes(1);
    expect(mockResolvePrefsOnly).toHaveBeenCalledWith([SHY_ID, OPEN_ID]);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  // `lastActiveAt` n'est pas déclaré par `userMinimalSchema`. Il ne sort donc
  // d'aucune de ces portes — et ce témoin garde CETTE porte-là : le jour où
  // quelqu'un déclare le champ pour le faire vivre, il tombe, et l'oblige à
  // constater que le gate le couvre déjà.
  it('ne laisse sortir aucun `lastActiveAt`, même autorisé', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const app = await buildApp({ members: [memberRow(OPEN_ID, true)] });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.lastActiveAt).toBeUndefined();
  });
});

describe('GET /communities/:id/members — non-membre d’une communauté publique (strict)', () => {
  const publicCommunity = {
    id: COMM_ID,
    createdBy: 'usr-someone-else',
    isPrivate: false,
    members: [],
  };

  it('bascule sur le critère STRICT plutôt que sur les préférences seules', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({
      viewerId: 'usr-outsider',
      community: publicCommunity,
      members: [memberRow(SHY_ID, true)],
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(mockResolvePrefsOnly).not.toHaveBeenCalled();
    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    expect(body.data[0].user.isOnline).toBe(false);
  });

  // Le défaut d'entrée absente s'INVERSE entre les deux régimes (cycle 84 §2).
  // Ici, un id que le résolveur strict n'a pas rendu n'est pas un id autorisé.
  it('masque un membre que le résolveur strict n’a pas rendu', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const app = await buildApp({
      viewerId: 'usr-outsider',
      community: publicCommunity,
      members: [memberRow(SHY_ID, true)],
    });

    const res = await app.inject({ method: 'GET', url: `/communities/${COMM_ID}/members` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data[0].user.isOnline).toBe(false);
  });
});

describe('POST /communities/:id/members — l’adhérent ajouté', () => {
  it('sert HORS LIGNE l’adhérent qui a coupé sa présence', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({ createdMember: memberRow(SHY_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/members`,
      payload: { userId: SHY_ID, role: 'member' },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(false);
  });

  it('conserve la présence de l’adhérent qui l’autorise', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const app = await buildApp({ createdMember: memberRow(OPEN_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/members`,
      payload: { userId: OPEN_ID, role: 'member' },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data.user.isOnline).toBe(true);
  });
});

describe('POST /communities/:id/invite — l’invité', () => {
  it('sert HORS LIGNE l’invité qui a coupé sa présence', async () => {
    mockResolvePrefsOnly.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const app = await buildApp({ createdMember: memberRow(SHY_ID, true) });

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${COMM_ID}/invite`,
      payload: { userId: SHY_ID },
    });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(false);
  });
});

// La borne du lot : `POST /join` sert le MÊME schéma et le même `include`, mais
// la cible y est le lecteur lui-même. Sa présence n'a pas à être filtrée, et ce
// témoin fige qu'on ne l'a pas filtrée « par symétrie ».
describe('POST /communities/:id/join — la cible est le lecteur', () => {
  it('ne consulte aucun gate et sert la présence telle quelle', async () => {
    const app = await buildApp({ createdMember: memberRow(VIEWER_ID, true) });

    const res = await app.inject({ method: 'POST', url: `/communities/${COMM_ID}/join` });
    const body = JSON.parse(res.body);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(body.data.user.isOnline).toBe(true);
    expect(mockResolvePrefsOnly).not.toHaveBeenCalled();
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /communities/search — le correctif du cycle 84 bis, sur la route SERVIE
//
// Le cycle 84 bis a corrigé `routes/communities/search.ts` : schéma déclaré
// (`{ type: 'object' }` nu sérialisait `creator` et `members[i]` en `{}`, ce qui
// faisait échouer le décodage iOS de TOUTE la réponse), gate de présence à deux
// régimes, et `isActive: true` sur l'aperçu des membres.
//
// Ce fichier-là est le module OMBRÉ : `route-registration.ts` importe
// `'./routes/communities'`, Node résout LOAD_AS_FILE avant LOAD_AS_DIRECTORY, et
// c'est `routes/communities.ts` qui sert. **Le correctif n'a donc jamais atteint
// la production** — un correctif sans effet, exactement ce que le cycle 85-bis
// décrit. Ces témoins montent le module RÉELLEMENT enregistré.
// ─────────────────────────────────────────────────────────────────────────────

const searchCommunity = (id: string, members: ReadonlyArray<ReturnType<typeof memberRow>>) => ({
  id,
  name: 'Tech',
  identifier: 'mshy_tech',
  description: null,
  avatar: null,
  isPrivate: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  creator: { id: VIEWER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  members,
  _count: { members: members.length, Conversation: 0 },
});

async function buildSearchApp(opts: {
  communities: ReadonlyArray<ReturnType<typeof searchCommunity>>;
  viewerCommunityIds?: ReadonlyArray<string>;
}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = authContextFor(VIEWER_ID); });
  const communityFindMany = jest.fn<any>().mockResolvedValue(opts.communities);
  app.decorate('prisma', {
    community: {
      findMany: communityFindMany,
      count: jest.fn<any>().mockResolvedValue(opts.communities.length),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    communityMember: {
      findMany: jest.fn<any>().mockResolvedValue(
        (opts.viewerCommunityIds ?? []).map(communityId => ({ communityId })),
      ),
    },
  } as any);
  await communityRoutes(app);
  await app.ready();
  return { app, communityFindMany };
}

async function search(opts: Parameters<typeof buildSearchApp>[0]) {
  const { app, communityFindMany } = await buildSearchApp(opts);
  const res = await app.inject({ method: 'GET', url: '/communities/search?q=tech' });
  await app.close();
  return { body: res.json(), communityFindMany };
}

describe('GET /communities/search — la charge utile atteint le fil', () => {
  it('sert le créateur avec ses champs d’identité', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));
    const { body } = await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    expect(body.data[0].creator).toMatchObject({ id: VIEWER_ID, username: 'alice', displayName: 'Alice' });
  });

  it('sert chaque membre avec ses champs d’appartenance et son user', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, VISIBLE]]));
    const { body } = await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    const member = body.data[0].members[0];
    expect(member).toMatchObject({ id: `mem-${SHY_ID}`, communityId: COMM_ID, userId: SHY_ID, role: 'member' });
    expect(member.user).toMatchObject({ id: SHY_ID, username: SHY_ID });
  });

  it('n’aperçoit que les appartenances ACTIVES', async () => {
    const { communityFindMany } = await search({
      communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])],
    });

    expect(communityFindMany.mock.calls[0][0].include.members.where).toEqual({ isActive: true });
  });
});

describe('GET /communities/search — régime tranché par LIGNE', () => {
  it('masque la présence d’un membre vu en pure DÉCOUVERTE', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SHY_ID, HIDDEN]]));
    const { body } = await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });

  it('conserve la présence que le résolveur strict autorise', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[OPEN_ID, VISIBLE]]));
    const { body } = await search({ communities: [searchCommunity(COMM_ID, [memberRow(OPEN_ID, true)])] });

    expect(body.data[0].members[0].user.isOnline).toBe(true);
  });

  it('route une communauté NON partagée vers le critère strict', async () => {
    await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    expect(mockResolveForTargets).toHaveBeenCalledWith(
      { userId: VIEWER_ID, role: 'USER' },
      [SHY_ID],
    );
    expect(mockResolvePrefsOnly).not.toHaveBeenCalled();
  });

  it('route une communauté PARTAGÉE vers le contexte acquis', async () => {
    await search({
      communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])],
      viewerCommunityIds: [COMM_ID],
    });

    expect(mockResolvePrefsOnly).toHaveBeenCalledWith([SHY_ID]);
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });

  it('un membre qui prouve le lien par UNE communauté le prouve pour toute la page', async () => {
    await search({
      communities: [
        searchCommunity(COMM_ID, [memberRow(SHY_ID, true)]),
        searchCommunity('comm-2', [memberRow(SHY_ID, true), memberRow(OPEN_ID, true)]),
      ],
      viewerCommunityIds: [COMM_ID],
    });

    expect(mockResolvePrefsOnly).toHaveBeenCalledWith([SHY_ID]);
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: VIEWER_ID, role: 'USER' }, [OPEN_ID]);
  });

  it('masque un membre que le résolveur n’a pas rendu', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const { body } = await search({ communities: [searchCommunity(COMM_ID, [memberRow(SHY_ID, true)])] });

    expect(body.data[0].members[0].user.isOnline).toBe(false);
  });

  it('n’ouvre aucune résolution sur une page sans membre', async () => {
    await search({ communities: [searchCommunity(COMM_ID, [])] });

    expect(mockResolvePrefsOnly).not.toHaveBeenCalled();
    expect(mockResolveForTargets).not.toHaveBeenCalled();
  });
});
