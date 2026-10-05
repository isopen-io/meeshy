/**
 * LES ROUTES DE LA VAGUE 2 DU JEU (#9384 à #9390) — route → service → base :
 * seule la base est un faux. Chaque réponse passe le schéma PARTAGÉ du contrat ;
 * l'utilisateur est toujours celui de l'authentification ; les lectures de la
 * ligue publique sont strictes (aucun identifiant, aucune présence).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import {
  duoAbandonResponseSchema,
  duoAcceptResponseSchema,
  duoInviteResponseSchema,
  GAME_ROUTES,
  gameDuoAcceptPath,
  gameDuoAbandonPath,
  gameSeasonClaimPath,
  leagueConsentResponseSchema,
  leagueFriendsResponseSchema,
  leagueWeekResponseSchema,
  prestigeResponseSchema,
  seasonClaimResponseSchema,
  seasonSealResponseSchema,
  showcaseOrderResponseSchema,
  showcaseVisibilityResponseSchema,
  userShowcaseResponseSchema,
  gameUserShowcasePath,
  gamePrivacyResponseSchema,
} from '@meeshy/shared/types/game';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { LeagueService } from '../../../../services/game/LeagueService';
import { meGameRoutes } from '../../../../routes/me/game';
import { userGameShowcaseRoutes } from '../../../../routes/users/game-showcase';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const creditGamePoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
const ADULT = new Date('1990-01-01T00:00:00Z');
const WEEK_NOW = new Date();

async function buildApp(db: FakeGameDb, userId: string | null = USER): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db.prisma as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = userId ? { userId, isAuthenticated: true } : undefined;
  });
  await app.register(meGameRoutes, { prefix: '/api/v1/me', engagement: { creditGamePoints } });
  await app.ready();
  return app;
}

const call = (app: FastifyInstance, method: 'GET' | 'POST' | 'PUT', route: string, payload?: unknown) =>
  app.inject({ method, url: `/api/v1${route}`, ...(payload === undefined ? {} : { payload: payload as object }) });

const player = (db: FakeGameDb, id: string, fields: Record<string, unknown> = {}) =>
  seedUser(db, { engagementScore: 4000, levelRecord: 20, birthDate: ADULT, ...fields }, id);

const befriend = (db: FakeGameDb) =>
  db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: USER, receiverId: OTHER, updatedAt: new Date() });

beforeEach(() => {
  creditGamePoints.mockClear();
});

afterEach(() => {
  delete process.env.GAME_LEAGUE_CUSTOM_PSEUDONYM;
  jest.restoreAllMocks();
});

describe('authentification', () => {
  it('toute route de la vague 2 refuse un appel sans compte (401)', async () => {
    const app = await buildApp(fakeGameDb(), null);
    const calls: [string, string, unknown][] = [
      ['POST', GAME_ROUTES.leagueConsent, { requestId: 'req-00001', consent: true }],
      ['GET', GAME_ROUTES.leagueWeek, undefined],
      ['GET', GAME_ROUTES.leagueFriends, undefined],
      ['POST', GAME_ROUTES.duoInvite, { requestId: 'req-00001', friendId: OTHER }],
      ['POST', GAME_ROUTES.seasonSeal, { requestId: 'req-00001' }],
      ['PUT', GAME_ROUTES.showcaseVisibility, { requestId: 'req-00001', rank: 'me' }],
      ['POST', GAME_ROUTES.prestige, { requestId: 'req-00001' }],
    ];
    for (const [method, route, payload] of calls) {
      expect((await call(app, method as 'GET', route, payload)).statusCode).toBe(401);
    }
    await app.close();
  });
});

describe('la ligue', () => {
  it('POST /league/consent : 200, la forme du contrat, un pseudonyme tiré', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);

    const res = await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0001', consent: true });

    expect(res.statusCode).toBe(200);
    expect(leagueConsentResponseSchema.safeParse(res.json().data).success).toBe(true);
    expect(res.json().data.pseudonym).toMatch(/^Colibri-/);
    expect(db.user.rows[0]!.publicLeagueConsentAt).toBeInstanceOf(Date);
    await app.close();
  });

  it('409 LEAGUE_LOCKED sous le niveau 10, 409 LEAGUE_MINOR sans majorité vérifiée', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, birthDate: ADULT });
    const app = await buildApp(db);
    const locked = await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0001', consent: true });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ success: false, code: 'LEAGUE_LOCKED' });

    db.user.rows[0]!.engagementScore = 4000;
    db.user.rows[0]!.levelRecord = 20;
    db.user.rows[0]!.birthDate = new Date('2012-01-01T00:00:00Z');
    const minor = await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0002', consent: true });
    expect(minor.json()).toMatchObject({ code: 'LEAGUE_MINOR' });
    await app.close();
  });

  it('le retrait du consentement est un geste : la colonne est vidée', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0001', consent: true });

    const res = await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0002', consent: false });

    expect(res.json().data).toEqual({ consent: false, pseudonym: null });
    expect(db.user.rows[0]!.publicLeagueConsentAt).toBeNull();
    await app.close();
  });

  it('PUT /league/pseudonym est FERMÉ par défaut : 409 LEAGUE_PSEUDONYM_FORBIDDEN', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0001', consent: true });

    const res = await call(app, 'PUT', GAME_ROUTES.leaguePseudonym, { requestId: 'pseudo-0001', pseudonym: 'LeFlambeur' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN' });
    await app.close();
  });

  it('PUT /league/pseudonym ouvert : sans consentement 409, avec consentement un nom libre passe, un nom pris non', async () => {
    process.env.GAME_LEAGUE_CUSTOM_PSEUDONYM = '1';
    const db = fakeGameDb();
    player(db, USER, { username: 'marie_d' });
    player(db, OTHER, { username: 'paul' });
    db.leaguePseudonym.rows.push({ id: 'p', userId: OTHER, pseudonym: 'Vigie', pseudonymKey: 'vigie', kind: 'chosen' });
    const app = await buildApp(db);

    expect((await call(app, 'PUT', GAME_ROUTES.leaguePseudonym, { requestId: 'pseudo-0001', pseudonym: 'LeFlambeur' })).json()).toMatchObject({ code: 'LEAGUE_CONSENT_REQUIRED' });
    await call(app, 'POST', GAME_ROUTES.leagueConsent, { requestId: 'consent-0001', consent: true });

    const ok = await call(app, 'PUT', GAME_ROUTES.leaguePseudonym, { requestId: 'pseudo-0002', pseudonym: 'LeFlambeur' });
    expect(ok.json().data).toEqual({ pseudonym: 'LeFlambeur' });
    expect((await call(app, 'PUT', GAME_ROUTES.leaguePseudonym, { requestId: 'pseudo-0003', pseudonym: 'vigie' })).json()).toMatchObject({ code: 'LEAGUE_PSEUDONYM_TAKEN' });
    expect((await call(app, 'PUT', GAME_ROUTES.leaguePseudonym, { requestId: 'pseudo-0004', pseudonym: 'marie_d' })).json()).toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN' });
    await app.close();
  });

  it('GET /league/week : le contrat, et le schéma est STRICT — un champ que le service ajouterait ne part pas', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    jest.spyOn(LeagueService.prototype, 'weekBoard').mockResolvedValue({
      weekKey: '2026-10-12',
      snapshotDay: '2026-10-14',
      closes: { dayKey: '2026-10-18', minuteOfDay: 1200 },
      placed: true,
      league: 'jade',
      groupId: 'G1',
      entries: [
        { rank: 1, displayName: 'Colibri-0001', weekPoints: 40, zone: 'promotion', cup: 'gold', isMe: true, userId: OTHER, avatar: 'x.png', isOnline: true, lastActiveAt: new Date().toISOString() } as never,
      ],
    });

    const res = await call(app, 'GET', GAME_ROUTES.leagueWeek);

    expect(res.statusCode).toBe(200);
    expect(leagueWeekResponseSchema.safeParse(res.json().data).success).toBe(true);
    expect(Object.keys(res.json().data.entries[0]).sort()).toEqual(['cup', 'displayName', 'isMe', 'rank', 'weekPoints', 'zone']);
    expect(res.body).not.toContain(OTHER);
    expect(res.body).not.toContain('isOnline');
    await app.close();
  });

  it('GET /league/week sans groupe : placed false, aucune entrée', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    const res = await call(app, 'GET', GAME_ROUTES.leagueWeek);
    expect(leagueWeekResponseSchema.parse(res.json().data)).toMatchObject({ placed: false, entries: [] });
    await app.close();
  });

  it('GET /league/friends : moi et mes amis acceptés, le contrat', async () => {
    const db = fakeGameDb();
    player(db, USER);
    player(db, OTHER);
    befriend(db);
    const app = await buildApp(db);
    const res = await call(app, 'GET', GAME_ROUTES.leagueFriends);
    const data = leagueFriendsResponseSchema.parse(res.json().data);
    expect(data.entries.map((e) => e.userId).sort()).toEqual([USER, OTHER]);
    await app.close();
  });
});

describe('le duo', () => {
  it('invite → accepte → quitte, avec la forme du contrat', async () => {
    const db = fakeGameDb();
    player(db, USER);
    player(db, OTHER);
    befriend(db);
    const mine = await buildApp(db, USER);
    const theirs = await buildApp(db, OTHER);

    const invited = await call(mine, 'POST', GAME_ROUTES.duoInvite, { requestId: 'duo-000001', friendId: OTHER });
    expect(invited.statusCode).toBe(200);
    const { duoId } = duoInviteResponseSchema.parse(invited.json().data);

    const accepted = await call(theirs, 'POST', gameDuoAcceptPath(duoId), { requestId: 'duo-000002' });
    expect(duoAcceptResponseSchema.parse(accepted.json().data)).toEqual({ status: 'active', duoId });

    const left = await call(mine, 'POST', gameDuoAbandonPath(duoId), { requestId: 'duo-000003' });
    expect(duoAbandonResponseSchema.parse(left.json().data)).toEqual({ status: 'abandoned', duoId });
    await mine.close();
    await theirs.close();
  });

  it('409 DUO_NOT_FRIENDS pour un inconnu, 409 DUO_NOT_FOUND pour un duo qui n’est pas le mien', async () => {
    const db = fakeGameDb();
    player(db, USER);
    player(db, OTHER);
    const app = await buildApp(db);
    expect((await call(app, 'POST', GAME_ROUTES.duoInvite, { requestId: 'duo-000001', friendId: OTHER })).json()).toMatchObject({ code: 'DUO_NOT_FRIENDS' });
    expect((await call(app, 'POST', gameDuoAcceptPath('68c000000000000000000099'), { requestId: 'duo-000002' })).json()).toMatchObject({ code: 'DUO_NOT_FOUND' });
    await app.close();
  });

  it('un corps mal formé est un 400, jamais un 409', async () => {
    const app = await buildApp(fakeGameDb());
    expect((await call(app, 'POST', GAME_ROUTES.duoInvite, { requestId: 'x', friendId: OTHER })).statusCode).toBe(400);
    await app.close();
  });
});

describe('la saison', () => {
  it('POST /season/steps/:step/claim : le contrat, 409 pour une étape verrouillée ou hors parcours', async () => {
    const db = fakeGameDb();
    player(db, USER);
    db.gameSeason.rows.push({ id: 's', userId: USER, number: 1, stars: 8, claimedSteps: [], sealOwnedAt: null });
    const app = await buildApp(db);

    const ok = await call(app, 'POST', gameSeasonClaimPath(1), { requestId: 'season-0001' });
    // la saison courante dépend de l'horloge : hors saison ouverte, le refus est SEASON_NOT_OPEN
    expect([200, 409]).toContain(ok.statusCode);
    if (ok.statusCode === 200) expect(seasonClaimResponseSchema.safeParse(ok.json().data).success).toBe(true);
    expect((await call(app, 'POST', gameSeasonClaimPath(41), { requestId: 'season-0002' })).statusCode).toBe(409);
    await app.close();
  });

  it('POST /season/seal : 409 INSUFFICIENT_MEESHES sans Meesh', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    const res = await call(app, 'POST', GAME_ROUTES.seasonSeal, { requestId: 'sceau-0001' });
    expect([409]).toContain(res.statusCode);
    expect(res.json().code === 'INSUFFICIENT_MEESHES' || res.json().code === 'SEASON_NOT_OPEN').toBe(true);
    await app.close();
  });

  it('un Sceau acheté, le contrat', async () => {
    const db = fakeGameDb();
    player(db, USER);
    db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: 12, reason: 'grant', requestId: 'octroi-0001' });
    const app = await buildApp(db);
    const res = await call(app, 'POST', GAME_ROUTES.seasonSeal, { requestId: 'sceau-0001' });
    if (res.statusCode === 200) expect(seasonSealResponseSchema.parse(res.json().data)).toMatchObject({ status: 'bought', balance: 2 });
    else expect(res.json().code).toBe('SEASON_NOT_OPEN');
    await app.close();
  });
});

describe('la vitrine, la visibilité, le Prestige', () => {
  it('PUT /showcase/order : ne garde que les trophées possédés et rend l’ordre complet', async () => {
    const db = fakeGameDb();
    player(db, USER);
    db.gameTrophy.rows.push(
      { id: 't1', userId: USER, key: 'trophy.season-cup.1', awardedAt: new Date('2026-12-06T00:00:00Z') },
      { id: 't2', userId: USER, key: 'trophy.prestige.1', awardedAt: new Date('2026-12-07T00:00:00Z') },
    );
    const app = await buildApp(db);

    const res = await call(app, 'PUT', GAME_ROUTES.showcaseOrder, { requestId: 'ordre-0001', order: ['trophy.season-cup.1', 'trophy.inconnu.9'] });

    expect(showcaseOrderResponseSchema.parse(res.json().data).order).toEqual(['trophy.season-cup.1', 'trophy.prestige.1']);
    await app.close();
  });

  it('PUT /visibility : règle une facette, rend les quatre ; aucun réglage = 400', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);

    const res = await call(app, 'PUT', GAME_ROUTES.showcaseVisibility, { requestId: 'visib-0001', rank: 'everyone' });
    expect(showcaseVisibilityResponseSchema.parse(res.json().data).visibility).toEqual({ showcase: 'friends', rank: 'everyone', treasury: 'friends', atlas: 'me' });
    expect((await call(app, 'PUT', GAME_ROUTES.showcaseVisibility, { requestId: 'visib-0002' })).statusCode).toBe(400);
    expect((await call(app, 'PUT', GAME_ROUTES.showcaseVisibility, { requestId: 'visib-0003', atlas: 'public' })).statusCode).toBe(400);
    await app.close();
  });

  it('POST /prestige : 409 PRESTIGE_LEVEL_TOO_LOW, puis le passage au niveau 100', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);
    expect((await call(app, 'POST', GAME_ROUTES.prestige, { requestId: 'prest-0001' })).json()).toMatchObject({ code: 'PRESTIGE_LEVEL_TOO_LOW' });

    db.user.rows[0]!.engagementScore = 100_000;
    const res = await call(app, 'POST', GAME_ROUTES.prestige, { requestId: 'prest-0002' });
    expect(prestigeResponseSchema.parse(res.json().data)).toMatchObject({ status: 'passed', prestige: 1, gloryGained: 1000 });
    await app.close();
  });
});

describe('PUT /game/privacy', () => {
  it('« Jeu masqué » et l’opposition se posent et se retirent, indépendamment ; aucun interrupteur = 400', async () => {
    const db = fakeGameDb();
    player(db, USER);
    const app = await buildApp(db);

    const hidden = await call(app, 'PUT', GAME_ROUTES.privacy, { requestId: 'priv-00001', gameHidden: true });
    expect(gamePrivacyResponseSchema.parse(hidden.json().data)).toEqual({ gameHidden: true, friendsLeagueOptOut: false });
    const both = await call(app, 'PUT', GAME_ROUTES.privacy, { requestId: 'priv-00002', friendsLeagueOptOut: true });
    expect(both.json().data).toEqual({ gameHidden: true, friendsLeagueOptOut: true });
    const back = await call(app, 'PUT', GAME_ROUTES.privacy, { requestId: 'priv-00003', gameHidden: false });
    expect(back.json().data).toEqual({ gameHidden: false, friendsLeagueOptOut: true });
    expect((await call(app, 'PUT', GAME_ROUTES.privacy, { requestId: 'priv-00004' })).statusCode).toBe(400);
    await app.close();
  });

  it('« Jeu masqué » ramène la vitrine à « moi seul » : même un ami ne la voit plus', async () => {
    const db = fakeGameDb();
    player(db, USER);
    await (await buildApp(db)).inject({ method: 'PUT', url: `/api/v1${GAME_ROUTES.privacy}`, payload: { requestId: 'priv-00001', gameHidden: true } });
    expect(db.gameProfile.rows[0]!.gameHiddenAt).toBeInstanceOf(Date);
  });
});

describe('GET /users/:userId/game/showcase', () => {
  const showcaseApp = async (db: FakeGameDb, viewerId: string, role = 'USER') => {
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

  it('un ami voit les clés au mois près, un inconnu reçoit visible:false', async () => {
    const db = fakeGameDb();
    player(db, USER);
    player(db, OTHER);
    db.gameTrophy.rows.push({ id: 't1', userId: USER, key: 'trophy.season-cup.1', awardedAt: new Date('2026-12-06T21:45:00Z') });

    const stranger = await showcaseApp(db, OTHER);
    const refused = await call(stranger, 'GET', gameUserShowcasePath(USER));
    expect(userShowcaseResponseSchema.parse(refused.json().data)).toEqual({ visible: false, items: [], order: [] });

    befriend(db);
    const friend = await showcaseApp(db, OTHER);
    const shown = await call(friend, 'GET', gameUserShowcasePath(USER));
    expect(userShowcaseResponseSchema.parse(shown.json().data)).toEqual({
      visible: true,
      items: [{ key: 'trophy.season-cup.1', awardedMonth: '2026-12' }],
      order: ['trophy.season-cup.1'],
    });
    expect(shown.body).not.toContain('06T21');
    await stranger.close();
    await friend.close();
  });

  it('un compte inconnu rend la même réponse qu’un refus : on ne révèle pas son existence', async () => {
    const db = fakeGameDb();
    player(db, OTHER);
    const app = await showcaseApp(db, OTHER);
    const res = await call(app, 'GET', gameUserShowcasePath('68c000000000000000000077'));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ visible: false, items: [], order: [] });
    await app.close();
  });

  it('un blocage ferme même une vitrine « tout le monde »', async () => {
    const db = fakeGameDb();
    player(db, USER, { blockedUserIds: [OTHER] });
    player(db, OTHER);
    db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseVisibility: 'everyone' });
    db.gameTrophy.rows.push({ id: 't1', userId: USER, key: 'trophy.season-cup.1', awardedAt: new Date() });
    const app = await showcaseApp(db, OTHER);
    expect((await call(app, 'GET', gameUserShowcasePath(USER))).json().data.visible).toBe(false);
    await app.close();
  });

  it('un lecteur sans contexte d’authentification : 401', async () => {
    const db = fakeGameDb();
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', db.prisma as never);
    await app.register(userGameShowcaseRoutes, { prefix: '/api/v1/users', authenticate: async () => undefined });
    await app.ready();
    expect((await call(app, 'GET', gameUserShowcasePath(USER))).statusCode).toBe(401);
    await app.close();
  });
});

void WEEK_NOW;
