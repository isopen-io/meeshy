/**
 * LES ROUTES DES MOMENTS PHOTO ET DES CADRES (#10162, L10a) — route → service → base : seule la base est
 * un faux. Chaque réponse passe le schéma PARTAGÉ du contrat ; l'utilisateur est toujours celui de
 * l'authentification.
 *
 * - choisir une atmosphère INSTALLE son pack (une ligne `glory-frame.<slug>`), et le rejouer ne change rien ;
 * - registre VIDE ⇒ atmosphère enregistrée, aucune ligne de pack, aucune erreur ;
 * - hors `GLORY_ATMOSPHERES` ⇒ 400 ;
 * - l'accusé est idempotent (deux POST = une ligne, la date de première présentation ne bouge pas) ;
 * - le pack de l'atmosphère choisie ne se retire pas (409 `PACK_NOT_REMOVABLE`), un autre si ;
 * - l'extension `game.photo` sert les réglages et le registre, et un compte sans réglage se lit « défauts ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  GAME_PHOTO_ROUTES,
  frameAtmosphereResponseSchema,
  gamePhotoBlockSchema,
  parseGameBlock,
  photoInvitationsResponseSchema,
  photoMomentsPresentedResponseSchema,
} from '@meeshy/shared/types/game';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { meGameRoutes } from '../../../../routes/me/game';
import { gloryFramePacksRoutes } from '../../../../routes/packs-glory-frame';
import { buildPackIndex, EMPTY_PACK_INDEX, type PackIndex } from '../../../../services/packs/PackIndex';
import { GameBlockService } from '../../../../services/game/GameBlockService';
import { MissionService } from '../../../../services/game/MissionService';
import { GamePhotoService, photoMomentId } from '../../../../services/game/GamePhotoService';
import { PHOTO_MOMENTS_ACCOUNT_MAX, PHOTO_STATIC_STEP_IDS } from '@meeshy/shared/utils/game/photo-step-ids';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }), error: jest.fn() },
}));
jest.mock('../../../../services/preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, {}])),
}));

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });
const entry = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  order: 0,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: ref('a'),
  preview: ref('b'),
  contract: ref('c', 'json'),
  strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 2_400_000, square: 1_800_000 },
  names: { fr: { name: `Pack ${slug}`, description: `Les cadres ${slug}.` } },
  usage: { kind: 'rank', rank: 'ambassadeur', division: 4 },
  atmosphere: slug,
  ...over,
});

const ATMOSPHERE_REGISTRY: PackIndex = buildPackIndex({
  registries: [[entry('afrique', { installedByDefault: true, removable: false }), entry('egypte', { order: 1 }), entry('nord', { order: 2 })]],
  retained: [],
});

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

async function buildApp(db: FakeGameDb, options: { readonly userId?: string | null; readonly packIndex?: PackIndex } = {}) {
  const userId = options.userId === undefined ? USER : options.userId;
  const emitted: Emitted[] = [];
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', db.prisma as never);
  app.decorate('socketIOHandler', { io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) } } as never);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as unknown as Record<string, unknown>).auth = userId ? { userId, isAuthenticated: true } : undefined;
    (req as unknown as Record<string, unknown>).authContext = userId
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role: 'USER' } }
      : undefined;
  });
  await app.register(meGameRoutes, {
    prefix: '/api/v1/me',
    engagement: { creditGamePoints: async () => undefined },
    packIndex: options.packIndex ?? ATMOSPHERE_REGISTRY,
  });
  await app.register(gloryFramePacksRoutes, { prefix: '/api/v1/packs/glory-frame', index: options.packIndex ?? ATMOSPHERE_REGISTRY });
  await app.ready();
  return { app, emitted };
}

const call = (app: FastifyInstance, method: 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url: url.startsWith('/api') ? url : `/api/v1${url}`, ...(payload ? { payload } : {}) });

const profileOf = (db: FakeGameDb, userId = USER) => db.gameProfile.rows.find((row) => row.userId === userId);

describe('authentification', () => {
  it('les trois routes refusent un appel sans compte (401)', async () => {
    const { app } = await buildApp(fakeGameDb(), { userId: null });
    expect((await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'req-00001', atmosphere: 'egypte' })).statusCode).toBe(401);
    expect((await call(app, 'PUT', GAME_PHOTO_ROUTES.photoInvitations, { requestId: 'req-00001', invitations: 'never' })).statusCode).toBe(401);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'req-00001', stepIds: ['start'] })).statusCode).toBe(401);
    await app.close();
  });
});

describe('PUT /me/game/frames/atmosphere', () => {
  it('enregistre l’atmosphère ET installe son pack ; rejouer ne change rien', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app, emitted } = await buildApp(db);

    const first = await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'atmo-00001', atmosphere: 'egypte' });
    expect(first.statusCode).toBe(200);
    expect(frameAtmosphereResponseSchema.parse(first.json().data)).toEqual({ atmosphere: 'egypte', packInstalled: true });
    expect(profileOf(db)?.frameAtmosphere).toBe('egypte');
    expect(db.userStickerPack.rows.map((row) => [row.userId, row.packSlug, row.installedAt instanceof Date])).toEqual([[USER, 'glory-frame.egypte', true]]);
    expect(emitted).toEqual([
      { room: `user:${USER}`, event: 'pack:installation-updated', payload: expect.objectContaining({ domain: 'glory-frame', slug: 'egypte', installed: true }) },
    ]);

    const again = await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'atmo-00002', atmosphere: 'egypte' });
    expect(again.json().data).toEqual({ atmosphere: 'egypte', packInstalled: true });
    expect(db.userStickerPack.rows).toHaveLength(1);
    expect(db.gameProfile.rows).toHaveLength(1);
    await app.close();
  });

  it('registre VIDE : l’atmosphère est enregistrée, aucune ligne de pack, aucune erreur', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app, emitted } = await buildApp(db, { packIndex: EMPTY_PACK_INDEX });
    const res = await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'atmo-00001', atmosphere: 'olympe' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ atmosphere: 'olympe', packInstalled: false });
    expect(profileOf(db)?.frameAtmosphere).toBe('olympe');
    expect(db.userStickerPack.rows).toEqual([]);
    expect(emitted).toEqual([]);
    await app.close();
  });

  it('une atmosphère hors GLORY_ATMOSPHERES ⇒ 400, rien n’est écrit', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    const res = await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'atmo-00001', atmosphere: 'mars' });
    expect(res.statusCode).toBe(400);
    expect(db.gameProfile.rows).toEqual([]);
    expect(db.userStickerPack.rows).toEqual([]);
    await app.close();
  });
});

describe('DELETE /packs/glory-frame/:slug/install — le pack de l’atmosphère choisie (PP7)', () => {
  it('409 PACK_NOT_REMOVABLE sur le pack choisi ; un autre pack d’atmosphère se retire', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    await call(app, 'PUT', '/api/v1/packs/glory-frame/nord/install');
    await call(app, 'PUT', GAME_PHOTO_ROUTES.frameAtmosphere, { requestId: 'atmo-00001', atmosphere: 'egypte' });

    const refused = await call(app, 'DELETE', '/api/v1/packs/glory-frame/egypte/install');
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ success: false, code: 'PACK_NOT_REMOVABLE' });
    expect(db.userStickerPack.rows.find((row) => row.packSlug === 'glory-frame.egypte')?.installedAt).toBeInstanceOf(Date);

    const removed = await call(app, 'DELETE', '/api/v1/packs/glory-frame/nord/install');
    expect(removed.statusCode).toBe(200);
    expect(db.userStickerPack.rows.find((row) => row.packSlug === 'glory-frame.nord')?.installedAt).toBeNull();
    await app.close();
  });

  it('la garde est celle du COMPTE : l’atmosphère d’un autre ne bloque rien', async () => {
    const db = fakeGameDb();
    seedUser(db);
    db.gameProfile.rows.push({ id: 'p-other', userId: OTHER, frameAtmosphere: 'egypte' });
    const { app } = await buildApp(db);
    await call(app, 'PUT', '/api/v1/packs/glory-frame/egypte/install');
    expect((await call(app, 'DELETE', '/api/v1/packs/glory-frame/egypte/install')).statusCode).toBe(200);
    await app.close();
  });
});

describe('PUT /me/game/photo-moments/invitations', () => {
  it('enregistre le réglage ; une valeur inconnue ⇒ 400', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    const res = await call(app, 'PUT', GAME_PHOTO_ROUTES.photoInvitations, { requestId: 'inv-000001', invitations: 'never' });
    expect(res.statusCode).toBe(200);
    expect(photoInvitationsResponseSchema.parse(res.json().data)).toEqual({ invitations: 'never' });
    expect(profileOf(db)?.photoInvitations).toBe('never');
    expect((await call(app, 'PUT', GAME_PHOTO_ROUTES.photoInvitations, { requestId: 'inv-000002', invitations: 'sometimes' })).statusCode).toBe(400);
    expect(profileOf(db)?.photoInvitations).toBe('never');
    await app.close();
  });
});

describe('POST /me/game/photo-moments/presented', () => {
  it('idempotent : deux POST = une ligne par étape, la date de première présentation ne bouge pas', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);

    const first = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ['start', 'meesh:1', 'start'] });
    expect(first.statusCode).toBe(200);
    const presented = photoMomentsPresentedResponseSchema.parse(first.json().data).presented;
    expect(presented.map((p) => p.stepId)).toEqual(['start', 'meesh:1']);
    expect(db.gamePhotoMoment.rows.map((row) => [row.id, row.stepId])).toEqual([
      [photoMomentId(USER, 'start'), 'start'],
      [photoMomentId(USER, 'meesh:1'), 'meesh:1'],
    ]);
    const stamped = db.gamePhotoMoment.rows.map((row) => (row.presentedAt as Date).getTime());

    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00002', stepIds: ['start', 'meesh:1'] });
    expect(again.json().data).toEqual(first.json().data);
    expect(db.gamePhotoMoment.rows).toHaveLength(2);
    expect(db.gamePhotoMoment.rows.map((row) => (row.presentedAt as Date).getTime())).toEqual(stamped);
    await app.close();
  });

  it('une étape déjà DÉTECTÉE (sans présentation) reçoit sa date, sur la même ligne', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const detectedAt = new Date('2026-10-11T08:00:00.000Z');
    db.gamePhotoMoment.rows.push({ id: photoMomentId(USER, 'rank:ambassadeur:4'), userId: USER, stepId: 'rank:ambassadeur:4', detectedAt, updatedAt: detectedAt });
    const { app } = await buildApp(db);
    await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ['rank:ambassadeur:4'] });
    expect(db.gamePhotoMoment.rows).toHaveLength(1);
    expect(db.gamePhotoMoment.rows[0]!.presentedAt).toBeInstanceOf(Date);
    expect(db.gamePhotoMoment.rows[0]!.detectedAt).toEqual(detectedAt);
    await app.close();
  });

  it('au plus 64 étapes, et un identifiant d’étape bien formé ⇒ sinon 400', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    const ids = (n: number) => PHOTO_STATIC_STEP_IDS.slice(0, n);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ids(65) })).statusCode).toBe(400);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00002', stepIds: ['<script>'] })).statusCode).toBe(400);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00003', stepIds: ids(64) })).statusCode).toBe(200);
    expect(db.gamePhotoMoment.rows).toHaveLength(64);
    await app.close();
  });
});

describe('POST /me/game/photo-moments/presented — seules les étapes CONNUES entrent au registre (revue adverse)', () => {
  const dayId = (offset: number) => `day:${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}`;

  it('une identité bien formée mais inventée ⇒ 400 PHOTO_STEP_UNKNOWN, rien n’est écrit, pas même ses voisines connues', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    const res = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ['start', 'invente:1', 'rank:empereur:1'] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'PHOTO_STEP_UNKNOWN' });
    expect(db.gamePhotoMoment.rows).toEqual([]);
    await app.close();
  });

  it('`day:` hors de J-2..J+1 ⇒ 400 ; dans la fenêtre ⇒ accepté', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const { app } = await buildApp(db);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: [dayId(-5)] })).statusCode).toBe(400);
    expect((await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00002', stepIds: [dayId(3)] })).statusCode).toBe(400);
    expect(db.gamePhotoMoment.rows).toEqual([]);
    const ok = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00003', stepIds: [dayId(0)] });
    expect(ok.statusCode).toBe(200);
    expect(db.gamePhotoMoment.rows.map((row) => row.stepId)).toEqual([dayId(0)]);
    await app.close();
  });

  it('plafond atteint ⇒ aucune ligne neuve, la réponse ne rend que les étapes déjà gardées, et leur rejeu reste accepté', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const keptAt = new Date('2026-10-11T08:00:00.000Z');
    db.gamePhotoMoment.rows.push({ id: photoMomentId(USER, 'start'), userId: USER, stepId: 'start', presentedAt: keptAt, updatedAt: keptAt });
    for (let i = 1; i < PHOTO_MOMENTS_ACCOUNT_MAX; i += 1) {
      db.gamePhotoMoment.rows.push({ id: `seed${String(i).padStart(20, '0')}`, userId: USER, stepId: `seed:${i}`, updatedAt: keptAt });
    }
    const { app } = await buildApp(db);

    const res = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ['start', 'meesh:1'] });
    expect(res.statusCode).toBe(200);
    expect(photoMomentsPresentedResponseSchema.parse(res.json().data)).toEqual({ presented: [{ stepId: 'start', presentedAt: keptAt.toISOString() }] });
    expect(db.gamePhotoMoment.rows).toHaveLength(PHOTO_MOMENTS_ACCOUNT_MAX);
    expect(db.gamePhotoMoment.rows.some((row) => row.stepId === 'meesh:1')).toBe(false);

    const replay = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00002', stepIds: ['start'] });
    expect(replay.json().data).toEqual({ presented: [{ stepId: 'start', presentedAt: keptAt.toISOString() }] });
    await app.close();
  });

  it('sous le plafond, les places restantes vont aux premières étapes neuves du lot', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const at = new Date('2026-10-11T08:00:00.000Z');
    for (let i = 0; i < PHOTO_MOMENTS_ACCOUNT_MAX - 1; i += 1) {
      db.gamePhotoMoment.rows.push({ id: `seed${String(i).padStart(20, '0')}`, userId: USER, stepId: `seed:${i}`, updatedAt: at });
    }
    const { app } = await buildApp(db);
    const res = await call(app, 'POST', GAME_PHOTO_ROUTES.photoPresented, { requestId: 'pres-00001', stepIds: ['start', 'meesh:1'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.presented.map((p: { stepId: string }) => p.stepId)).toEqual(['start']);
    expect(db.gamePhotoMoment.rows).toHaveLength(PHOTO_MOMENTS_ACCOUNT_MAX);
    await app.close();
  });
});

describe('l’extension game.photo du bloc game', () => {
  const blockOf = async (db: FakeGameDb) => {
    const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
    const block = await new GameBlockService(db.prisma, { missions }).build({ userId: USER });
    if (block === null) throw new Error('bloc invalide');
    return block;
  };

  it('un compte sans réglage (ancien client, rien d’écrit) se lit « défauts »', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    expect((await blockOf(db)).photo).toEqual({ atmosphere: null, invitations: 'every', baselineAt: null, baseline: null, treasuryPeakTier: null, moments: [] });
  });

  it('sert l’atmosphère, le réglage, la ligne de base et le registre, le plus récent d’abord', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    const baselineAt = new Date('2026-10-10T08:00:00.000Z');
    const baseline = { rank: 'ambassadeur', division: 4, levelRecord: 20, prestige: 0, minted: 0, treasuryTier: null, flameRecord: 3 };
    db.gameProfile.rows.push({ id: 'p', userId: USER, frameAtmosphere: 'nord', photoInvitations: 'major', photoAlertsBaselineAt: baselineAt, photoAlertsBaseline: baseline });
    const photo = new GamePhotoService(db.prisma);
    await photo.markPresented(USER, ['start'], new Date('2026-10-11T08:00:00.000Z'));
    await photo.markPresented(USER, ['meesh:1'], new Date('2026-10-11T09:00:00.000Z'));

    const served = (await blockOf(db)).photo;
    expect(gamePhotoBlockSchema.parse(served)).toEqual({
      atmosphere: 'nord',
      invitations: 'major',
      baselineAt: baselineAt.toISOString(),
      baseline,
      treasuryPeakTier: null,
      moments: [
        { stepId: 'meesh:1', detectedAt: null, presentedAt: '2026-10-11T09:00:00.000Z', notifiedAt: null },
        { stepId: 'start', detectedAt: null, presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null },
      ],
    });
  });

  it('une atmosphère stockée hors liste se lit « pas encore choisie » (fail-closed), le bloc reste valide', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    db.gameProfile.rows.push({ id: 'p', userId: USER, frameAtmosphere: 'mars', photoInvitations: 'parfois' });
    const block = await blockOf(db);
    expect(parseGameBlock(block)).not.toBeNull();
    expect(block.photo).toMatchObject({ atmosphere: null, invitations: 'every' });
  });

  it('une lecture du registre qui tombe fait partir le bloc SANS photo, jamais sans le reste', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 4000, levelRecord: 20 });
    (db.gamePhotoMoment as unknown as { findMany: () => Promise<never> }).findMany = async () => {
      throw new Error('panne');
    };
    const block = await blockOf(db);
    expect(block.photo).toBeUndefined();
    expect(block.league).toBeDefined();
  });
});

describe('le plus haut palier du trésor (D14)', () => {
  it('monte avec le trésor, ne redescend pas quand on dépense, et sert le plus haut du gardé et du courant', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const photo = new GamePhotoService(db.prisma);
    await photo.notePeakTreasury(USER, 120);
    expect(profileOf(db)?.treasuryPeakTier).toBe('coffre');
    await photo.notePeakTreasury(USER, 12);
    expect(profileOf(db)?.treasuryPeakTier).toBe('coffre');
    expect((await photo.block(USER, { balance: 12 })).treasuryPeakTier).toBe('coffre');
    expect((await photo.block(USER, { balance: 600 })).treasuryPeakTier).toBe('tresor');
  });
});
