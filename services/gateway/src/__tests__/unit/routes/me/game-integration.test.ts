/**
 * LES LECTURES D'INTÉGRATION DU JEU (#9481) — route → service → base, seule la
 * base est un faux :
 *  - `GET /me/game/privacy` : les clients relisent l'ÉTAT des réglages, ils ne
 *    gardent plus la dernière réponse `PUT` ;
 *  - `GET /users/:userId/game` : le niveau, le palier, le rang, les étoiles, la
 *    forme de la Flamme et le palier du trésor d'UN AUTRE membre, selon SON
 *    réglage. Un refus rend les mêmes réponses vides qu'un compte inexistant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { GAME_INTEGRATION_ROUTES, gameSettingsResponseSchema, gameUserGamePath, GAME_ROUTES, userGameProfileResponseSchema } from '@meeshy/shared/types/game';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { meGameRoutes } from '../../../../routes/me/game';
import { userGameShowcaseRoutes } from '../../../../routes/users/game-showcase';
import { setSharedNotificationService } from '../../../../services/notifications/notification-service-registry';
import { resetCacheStore } from '../../../../services/CacheStore';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));
const privacy = new Map<string, Record<string, unknown>>();
jest.mock('../../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, privacy.get(id) ?? {}])),
}));

const STRANGER = '68a000000000000000000003';
const UNKNOWN = '68c000000000000000000077';
const TODAY = new Date();

const settingsApp = async (db: FakeGameDb, userId: string | null = USER): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meGameRoutes, { prefix: '/api/v1/me', engagement: { creditGamePoints: async () => undefined } });
  await app.ready();
  return app;
};

const profileApp = async (db: FakeGameDb, viewerId: string, role = 'USER'): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db.prisma as never);
  await app.register(userGameShowcaseRoutes, {
    prefix: '/api/v1/users',
    authenticate: async (req: FastifyRequest) => {
      (req as any).authContext = { type: 'user', userId: viewerId, registeredUser: { role } };
    },
  });
  await app.ready();
  return app;
};

const get = (app: FastifyInstance, route: string) => app.inject({ method: 'GET', url: `/api/v1${route}` });

describe('GET /me/game/privacy', () => {
  it('sert les défauts d’un compte qui n’a rien réglé : amis par défaut, Atlas privé', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const res = await get(await settingsApp(db), GAME_INTEGRATION_ROUTES.settings);
    expect(res.statusCode).toBe(200);
    expect(gameSettingsResponseSchema.parse(res.json().data)).toEqual({
      gameHidden: false,
      friendsLeagueOptOut: false,
      visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' },
    });
  });

  it('relit l’ÉTAT du serveur : ce que `PUT` a posé, y compris les visibilités', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const app = await settingsApp(db);
    await app.inject({ method: 'PUT', url: `/api/v1${GAME_ROUTES.privacy}`, payload: { requestId: 'priv-00001', gameHidden: true, friendsLeagueOptOut: true } });
    await app.inject({ method: 'PUT', url: `/api/v1${GAME_ROUTES.showcaseVisibility}`, payload: { requestId: 'vis-000001', treasury: 'me', rank: 'everyone' } });

    const data = gameSettingsResponseSchema.parse((await get(app, GAME_INTEGRATION_ROUTES.settings)).json().data);

    expect(data).toEqual({
      gameHidden: true,
      friendsLeagueOptOut: true,
      visibility: { showcase: 'friends', rank: 'everyone', treasury: 'me', atlas: 'me' },
    });
  });

  it('ne sert que les réglages DE L’AUTHENTIFIÉ — aucun paramètre ne désigne un autre compte', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    seedUser(db, {}, OTHER);
    db.gameProfile.rows.push({ id: 'gp', userId: OTHER, gameHiddenAt: new Date() });
    const data = (await get(await settingsApp(db), GAME_INTEGRATION_ROUTES.settings)).json().data;
    expect(data.gameHidden).toBe(false);
  });

  it('sans compte : 401', async () => {
    expect((await get(await settingsApp(fakeGameDb(), null), GAME_INTEGRATION_ROUTES.settings)).statusCode).toBe(401);
  });
});

describe('GET /users/:userId/game', () => {
  const veteran = (db: FakeGameDb, id: string, fields: Record<string, unknown> = {}) =>
    seedUser(
      db,
      {
        engagementScore: 12_180,
        levelRecord: 36,
        prestige: 2,
        currentStreakDays: 40,
        lastStreakDate: TODAY,
        ...fields,
      },
      id,
    );
  const befriend = (db: FakeGameDb, a = USER, b = OTHER) =>
    db.friendRequest.rows.push({ id: `f-${a}-${b}`, status: 'accepted', senderId: a, receiverId: b, updatedAt: new Date() });
  const seedWealth = (db: FakeGameDb, userId: string, balance: number, glory: number) => {
    db.meeshLedger.rows.push({ id: `m-${userId}`, userId, delta: balance, reason: 'grant', requestId: `rq-m-${userId}` });
    db.gloryLedger.rows.push({ id: `g-${userId}`, userId, delta: glory, reason: 'mint', requestId: `rq-g-${userId}` });
  };

  it('un AMI lit le niveau, le palier, les étoiles, la forme de la Flamme, le rang, ses points, le nombre de ses trophées et le palier du trésor — jamais la Gloire, les Meeshes ni les jours de série', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, OTHER);
    befriend(db);
    seedWealth(db, USER, 63, 16_000);

    const res = await get(await profileApp(db, OTHER), gameUserGamePath(USER));

    const data = userGameProfileResponseSchema.parse(res.json().data);
    expect(data).toEqual({
      visible: true,
      standing: { level: 11, tier: 'lueur', ladder: { level: 11, tier: 'lueur' }, prestige: 2, flame: 'brasier', rank: 'conteur', division: 3, division5: 5, mythic: null, points: 12_180, trophyCount: 0 },
      treasury: { tier: 'coffret' },
    });
    const raw = JSON.stringify(res.json());
    for (const forbidden of ['"63"', '16000', 'currentStreakDays', 'held', 'glory', 'lastStreakDate', 'lastActive']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('la Flamme, les points et les trophées ne traversent le sérialiseur que pour un AMI : un inconnu sur « tout le monde » lit le rang, rien de plus (#9541)', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, STRANGER);
    seedWealth(db, USER, 63, 16_000);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', showcaseVisibility: 'everyone' });

    const res = await get(await profileApp(db, STRANGER), gameUserGamePath(USER));

    const data = userGameProfileResponseSchema.parse(res.json().data);
    expect(data.visible).toBe(true);
    expect(data.standing).toEqual({ level: 11, tier: 'lueur', ladder: { level: 11, tier: 'lueur' }, prestige: 2, flame: null, rank: 'conteur', division: 3, division5: 5, mythic: null });
    const raw = JSON.stringify(res.json());
    for (const forbidden of ['points', 'trophyCount', '12180', 'brasier']) expect(raw).not.toContain(forbidden);
  });

  it('un inconnu (ni ami, ni admin) ne lit RIEN sur « amis » — la réponse d’un compte inexistant', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, STRANGER);
    seedWealth(db, USER, 63, 16_000);
    const app = await profileApp(db, STRANGER);

    const refused = (await get(app, gameUserGamePath(USER))).json();
    const unknown = (await get(app, gameUserGamePath(UNKNOWN))).json();

    expect(refused).toEqual({ success: true, data: { visible: false, standing: null, treasury: null } });
    expect(unknown).toEqual(refused);
  });

  it('chaque facette suit SON réglage : le rang à tout le monde, le trésor à moi seul', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, STRANGER);
    seedWealth(db, USER, 63, 16_000);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', treasuryVisibility: 'me' });

    const data = userGameProfileResponseSchema.parse((await get(await profileApp(db, STRANGER), gameUserGamePath(USER))).json().data);

    expect(data.visible).toBe(true);
    expect(data.standing).not.toBeNull();
    expect(data.treasury).toBeNull();
  });

  it('un blocage ferme TOUT, même sur « tout le monde »', async () => {
    const db = fakeGameDb();
    veteran(db, USER, { blockedUserIds: [OTHER] });
    veteran(db, OTHER);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', treasuryVisibility: 'everyone' });
    const data = (await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data;
    expect(data).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('« Jeu masqué » plafonne tout à « moi seul », même pour un ami', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, OTHER);
    befriend(db);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', treasuryVisibility: 'everyone', gameHiddenAt: new Date() });
    expect((await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data.visible).toBe(false);
  });

  it('« caché de la recherche » plafonne à « amis » : un inconnu ne lit rien sur « tout le monde »', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, STRANGER);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', treasuryVisibility: 'everyone' });
    privacy.set(USER, { hideProfileFromSearch: true });
    try {
      expect((await get(await profileApp(db, STRANGER), gameUserGamePath(USER))).json().data.visible).toBe(false);
    } finally {
      privacy.clear();
    }
  });

  it('soi lit son propre profil, un administrateur aussi', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, STRANGER);
    expect((await get(await profileApp(db, USER), gameUserGamePath(USER))).json().data.visible).toBe(true);
    expect((await get(await profileApp(db, STRANGER, 'ADMIN'), gameUserGamePath(USER))).json().data.visible).toBe(true);
  });

  it('un administrateur qui lit un compte INCONNU reçoit la réponse vide, pas une erreur', async () => {
    const db = fakeGameDb();
    veteran(db, STRANGER);
    const res = await get(await profileApp(db, STRANGER, 'ADMIN'), gameUserGamePath(UNKNOWN));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('Mythe : la place du compte l’emporte sur la division, avec son numéro, et elle suit la visibilité du RANG (#9636)', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, OTHER);
    befriend(db);
    seedWealth(db, USER, 0, 1_000_000);
    db.mythicSeat.rows.push({ id: '6d7974686500000000000007', number: 7, edition: 131, userId: USER, glory: 1_000_000, grantedAt: new Date() });
    const data = userGameProfileResponseSchema.parse((await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data);
    expect(data.standing).toMatchObject({ rank: 'mythe', division: null, division5: null, mythic: { number: 7, edition: 131 } });
  });

  it('l’ancien drapeau « top 100 du moment » (mythicAt) ne fait plus un Mythe (#9636)', async () => {
    const db = fakeGameDb();
    veteran(db, USER);
    veteran(db, OTHER);
    befriend(db);
    seedWealth(db, USER, 0, 700_000);
    db.gameProfile.rows.push({ id: 'gp', userId: USER, mythicAt: new Date() });
    const data = userGameProfileResponseSchema.parse((await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data);
    expect(data.standing).toMatchObject({ rank: 'legende', division: 3, division5: 4, mythic: null });
  });

  it('une Flamme éteinte ne se montre pas : forme nulle, jamais « éteinte depuis »', async () => {
    const db = fakeGameDb();
    veteran(db, USER, { lastStreakDate: new Date('2026-01-05T00:00:00Z'), flameFreezes: 0 });
    veteran(db, OTHER);
    befriend(db);
    const data = userGameProfileResponseSchema.parse((await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data);
    expect(data.standing?.flame).toBeNull();
  });

  it('la Flamme « à risque » d’hier se montre comme celle d’aujourd’hui : rien ne dit qu’on n’est pas venu', async () => {
    const db = fakeGameDb();
    const yesterday = new Date(TODAY.getTime() - 24 * 3600 * 1000);
    veteran(db, USER, { lastStreakDate: yesterday });
    veteran(db, OTHER);
    befriend(db);
    const data = userGameProfileResponseSchema.parse((await get(await profileApp(db, OTHER), gameUserGamePath(USER))).json().data);
    expect(data.standing?.flame).toBe('brasier');
  });

  it('sans contexte d’authentification : 401', async () => {
    const db = fakeGameDb();
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', db.prisma as never);
    await app.register(userGameShowcaseRoutes, { prefix: '/api/v1/users', authenticate: async () => undefined });
    await app.ready();
    expect((await get(app, gameUserGamePath(USER))).statusCode).toBe(401);
  });
});

describe('les notifications du duo, de la route au service de notification (#9490)', () => {
  const duoWorld = () => {
    const db = fakeGameDb();
    for (const id of [USER, OTHER]) seedUser(db, { isActive: true, deletedAt: null, engagementScore: 4000, levelRecord: 20, systemLanguage: 'fr' }, id);
    db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: USER, receiverId: OTHER, updatedAt: new Date() });
    return db;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('inviter un ami le prévient dans SA langue ; accepter prévient l’invitant — le service vivant est appelé', async () => {
    resetCacheStore();
    const created: Array<{ userId: string; type: string; lang?: string }> = [];
    setSharedNotificationService({ createNotification: async (params: { userId: string; type: string; lang?: string }) => { created.push(params); return { id: 'n' }; } } as never);
    try {
      const db = duoWorld();
      const invite = await settingsApp(db, USER);
      const sent = await invite.inject({ method: 'POST', url: `/api/v1${GAME_ROUTES.duoInvite}`, payload: { requestId: 'duo-invite-1', friendId: OTHER } });
      expect(sent.statusCode).toBe(200);
      await settle();
      expect(created).toEqual([expect.objectContaining({ userId: OTHER, type: 'game_duo_invited', lang: 'fr' })]);

      const accept = await settingsApp(db, OTHER);
      const duoId = sent.json().data.duoId as string;
      await accept.inject({ method: 'POST', url: `/api/v1/me/game/duo/${duoId}/accept`, payload: { requestId: 'duo-accept-1' } });
      await settle();
      expect(created.map((c) => [c.userId, c.type])).toEqual([[OTHER, 'game_duo_invited'], [USER, 'game_duo_accepted']]);
    } finally {
      setSharedNotificationService(undefined);
      resetCacheStore();
    }
  });
});

describe('GET /users/:userId/game — un identifiant qui ne désigne aucun compte vivant (revue adversariale #9481)', () => {
  const HEX24 = /^[0-9a-f]{24}$/i;
  const idsIn = (where: unknown): string[] => {
    if (where === null || typeof where !== 'object') return [];
    return Object.entries(where as Record<string, unknown>).flatMap(([key, value]) =>
      (key === 'id' || key === 'userId') && typeof value === 'string' ? [value] : idsIn(value),
    );
  };
  const asMongo = (db: FakeGameDb): FakeGameDb => {
    for (const model of [db.user, db.gameProfile] as unknown as Array<Record<string, (args: { where?: unknown }) => unknown>>) {
      for (const method of ['findUnique', 'findFirst', 'findMany'] as const) {
        const original = model[method]!.bind(model);
        model[method] = (args: { where?: unknown } = {}) => {
          if (idsIn(args.where).some((id) => !HEX24.test(id))) throw new Error('Malformed ObjectID: provided hex string representation must be exactly 12 bytes');
          return original(args);
        };
      }
    }
    return db;
  };

  it('un identifiant MALFORMÉ rend la réponse vide (200), jamais une erreur 500 — même pour un ADMIN', async () => {
    const db = asMongo(fakeGameDb());
    seedUser(db, { engagementScore: 4000 }, STRANGER);
    for (const role of ['USER', 'ADMIN']) {
      const app = await profileApp(db, STRANGER, role);
      const res = await get(app, gameUserGamePath('pas-un-compte'));
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ visible: false, standing: null, treasury: null });
      const showcase = await get(app, '/users/pas-un-compte/game/showcase');
      expect(showcase.statusCode).toBe(200);
      expect(showcase.json().data).toEqual({ visible: false, items: [], order: [] });
    }
  });

  it('un compte SUPPRIMÉ ou désactivé se lit comme un compte inconnu — même sur « tout le monde », même pour un ADMIN', async () => {
    for (const gone of [{ isActive: false, deletedAt: new Date() }, { isActive: false, deletedAt: null }]) {
      const db = fakeGameDb();
      seedUser(db, { engagementScore: 12_180, currentStreakDays: 40, lastStreakDate: TODAY, ...gone }, USER);
      seedUser(db, {}, STRANGER);
      db.gameProfile.rows.push({ id: 'gp', userId: USER, rankVisibility: 'everyone', treasuryVisibility: 'everyone' });
      for (const role of ['USER', 'ADMIN']) {
        const data = (await get(await profileApp(db, STRANGER, role), gameUserGamePath(USER))).json().data;
        expect(data).toEqual({ visible: false, standing: null, treasury: null });
      }
    }
  });
});
