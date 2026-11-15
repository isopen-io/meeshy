/**
 * LA BOUTIQUE UNIFIÉE (#10632, § 4) à travers les VRAIES routes : l'achat en
 * Meeshes (débit unique sous rejeu, solde insuffisant sans effet, possession
 * et installation dans la même transaction, prix lu au registre), la
 * possession qui garde l'installation d'un pack payant, les trois domaines
 * d'apparence et la vitrine qui les agrège.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { avatarRingPacksRoutes, bannerFramePacksRoutes, bannerPacksRoutes, wallpaperPacksRoutes } from '../../../routes/packs-appearance';
import { packsShopRoutes } from '../../../routes/packs-shop';
import { buildPackIndex } from '../../../services/packs/PackIndex';
import { appearancePrisma } from './appearance-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

const sha = (seed: string) => seed.repeat(64).slice(0, 64);
const ref = (seed: string, ext = 'webp') => ({ src: `${sha(seed).slice(0, 16)}.${ext}`, bytes: 1024, sha256: sha(seed) });

const entry = (domain: string, slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  domain,
  origin: 'official',
  version: 3,
  order: 0,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: ref('a'),
  preview: null,
  contract: ref('c', 'json'),
  strings: { fr: ref('d', 'json') },
  downloadBytes: { story: 1000, square: null },
  names: { fr: { name: `Pack ${slug}`, description: `Les ${slug}.` } },
  ...over,
});

const REGISTRY = [
  entry('wallpaper', 'essentiels', { origin: 'builtin', installedByDefault: true, removable: false }),
  entry('wallpaper', 'prestige', { order: 1, price: 50 }),
  entry('wallpaper', 'offert', { order: 2 }),
  entry('banner', 'bannieres', { origin: 'builtin', installedByDefault: true, removable: false }),
  entry('avatar-ring', 'contours', { origin: 'builtin', installedByDefault: true, removable: false, usage: { kind: 'free', surfaces: ['avatar'] } }),
  entry('banner-frame', 'cadres-celte', { origin: 'builtin', usage: { kind: 'free', surfaces: ['banner'] } }),
  entry('banner-frame', 'cadres-prestige', { order: 1, price: 40, usage: { kind: 'free', surfaces: ['banner'] } }),
];

async function shopApp(extra: readonly ReturnType<typeof entry>[] = [], options: { readonly db?: ReturnType<typeof appearancePrisma>; readonly hidden?: readonly string[] } = {}) {
  const db = options.db ?? appearancePrisma();
  const emitted: Emitted[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) };
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', db.prisma as never);
  app.decorate('socketIOHandler', { io } as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const userId = typeof request.headers['x-user'] === 'string' ? request.headers['x-user'] : ALICE;
    (request as unknown as Record<string, unknown>).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role: 'USER' } };
  });
  const hide = (pack: ReturnType<typeof entry>) => (options.hidden?.includes(pack.slug) ? { ...pack, hidden: true } : pack);
  const index = buildPackIndex({ registries: [[...REGISTRY, ...extra].map(hide)], retained: [] });
  await app.register(wallpaperPacksRoutes, { prefix: '/packs/wallpaper', index });
  await app.register(avatarRingPacksRoutes, { prefix: '/packs/avatar-ring', index });
  await app.register(bannerPacksRoutes, { prefix: '/packs/banner', index });
  await app.register(bannerFramePacksRoutes, { prefix: '/packs/banner-frame', index });
  await app.register(packsShopRoutes, { prefix: '/packs/shop', index });
  await app.ready();
  return { app, db, emitted };
}

const purchase = (app: FastifyInstance, slug: string, requestId: string, user = ALICE, body: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: `/packs/wallpaper/${slug}/purchase`, headers: { 'x-user': user }, payload: { requestId, ...body } });

describe('achat en Meeshes', () => {
  it('débite UNE seule fois quand le même requestId est rejoué, et rend le même pack', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 80);

    const first = await purchase(app, 'prestige', 'geste-0001');
    const replay = await purchase(app, 'prestige', 'geste-0001');

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ balance: 30, pack: { slug: 'prestige', owned: true, installed: true, price: 50 } });
    expect(replay.json().data).toMatchObject({ balance: 30, pack: { slug: 'prestige', owned: true } });
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(1);
    expect(db.ownerships).toHaveLength(1);
  });

  it('refuse 409 INSUFFICIENT_MEESHES sans aucun effet', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 10);

    const response = await purchase(app, 'prestige', 'geste-0002');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'INSUFFICIENT_MEESHES', balance: 10 });
    expect(db.ownerships).toHaveLength(0);
    expect(db.choices).toHaveLength(0);
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(0);
  });

  it('écrit la possession ET l’installation dans la même transaction : si l’une échoue, ni dépense ni possession', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 80);
    const original = (db.prisma as unknown as { userStickerPack: { create: unknown } }).userStickerPack.create;
    (db.prisma as unknown as { userStickerPack: { create: unknown } }).userStickerPack.create = async () => {
      throw new Error('panne');
    };

    const response = await purchase(app, 'prestige', 'geste-0003');
    (db.prisma as unknown as { userStickerPack: { create: unknown } }).userStickerPack.create = original;

    expect(response.statusCode).toBe(500);
    expect(db.ownerships).toHaveLength(0);
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(0);
  });

  it('lit le prix au REGISTRE : un prix glissé dans le corps est ignoré', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 80);

    const forged = await purchase(app, 'prestige', 'geste-0004', ALICE, { price: 1 });

    expect(forged.json().data.balance).toBe(30);
    expect(db.ownerships[0]).toMatchObject({ priceMeeshes: 50, packKey: 'wallpaper.prestige' });
    expect(db.ledger.find((line) => line.reason === 'spend')).toMatchObject({ delta: -50 });
  });

  it('refuse un pack gratuit (PACK_IS_FREE), un pack déjà possédé (PACK_ALREADY_OWNED) et un pack inconnu (404)', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 200);

    await purchase(app, 'prestige', 'geste-0005');

    expect((await purchase(app, 'offert', 'geste-0006')).json().code).toBe('PACK_IS_FREE');
    expect((await purchase(app, 'prestige', 'geste-0007')).json().code).toBe('PACK_ALREADY_OWNED');
    expect((await purchase(app, 'inconnu', 'geste-0008')).statusCode).toBe(404);
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(1);
  });

  it('refuse 409 REQUEST_ID_CONFLICT un requestId déjà dépensé pour un AUTRE pack, sans le déclarer possédé', async () => {
    const { app, db } = await shopApp([entry('wallpaper', 'luxe', { order: 3, price: 20 })]);
    db.grant(ALICE, 200);
    await purchase(app, 'prestige', 'geste-0011');

    const reused = await purchase(app, 'luxe', 'geste-0011');
    const shop = (await app.inject({ method: 'GET', url: '/packs/wallpaper' })).json().data;

    expect(reused.statusCode).toBe(409);
    expect(reused.json().code).toBe('REQUEST_ID_CONFLICT');
    expect(shop.find((pack: { slug: string }) => pack.slug === 'luxe')).toMatchObject({ owned: false });
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(1);
  });

  it('refuse 409 REQUEST_ID_CONFLICT un requestId déjà porté par une autre dépense du registre, jamais un 500', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 200);
    db.ledger.push({ id: 'gel', userId: ALICE, delta: -5, reason: 'spend', requestId: 'geste-0012', meta: { kind: 'flame-freeze', price: 5 } });

    const response = await purchase(app, 'prestige', 'geste-0012');

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('REQUEST_ID_CONFLICT');
    expect(db.ownerships).toHaveLength(0);
  });

  it('deux achats concurrents du même pack sous deux requestId : un seul débit, le second répond PACK_ALREADY_OWNED', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 200);
    const ownership = (db.prisma as unknown as { userPackOwnership: { findUnique: (args: unknown) => Promise<unknown> } }).userPackOwnership;
    const read = ownership.findUnique;
    ownership.findUnique = async () => null;

    const [first, second] = await Promise.all([purchase(app, 'prestige', 'geste-0013'), purchase(app, 'prestige', 'geste-0014')]);
    ownership.findUnique = read;

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect([first, second].find((response) => response.statusCode === 409)?.json().code).toBe('PACK_ALREADY_OWNED');
    expect(db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(1);
    expect(db.ownerships).toHaveLength(1);
  });

  it('rejouer le MÊME geste après que le pack a été masqué rend l’achat déjà payé — jamais un 404 qui ferait croire à un échec — et un geste neuf reste refusé', async () => {
    const before = await shopApp();
    before.db.grant(ALICE, 80);
    before.db.grant(BOB, 80);
    expect((await purchase(before.app, 'prestige', 'geste-0015')).statusCode).toBe(200);
    const after = await shopApp([], { db: before.db, hidden: ['prestige'] });

    const replay = await purchase(after.app, 'prestige', 'geste-0015');
    const fresh = await purchase(after.app, 'prestige', 'geste-0016', BOB);

    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toMatchObject({ balance: 30, pack: { slug: 'prestige', owned: true } });
    expect(fresh.statusCode).toBe(404);
    expect(before.db.ledger.filter((line) => line.reason === 'spend')).toHaveLength(1);
  });

  it('diffuse pack:installation-updated sur user:<id> avec owned: true', async () => {
    const { app, db, emitted } = await shopApp();
    db.grant(ALICE, 80);

    await purchase(app, 'prestige', 'geste-0009');

    expect(emitted).toEqual([
      { room: `user:${ALICE}`, event: 'pack:installation-updated', payload: expect.objectContaining({ domain: 'wallpaper', slug: 'prestige', installed: true, owned: true }) },
    ]);
  });
});

describe('possession et installation', () => {
  it('refuse 403 PACK_NOT_OWNED l’installation d’un pack payant non possédé, accepte un gratuit', async () => {
    const { app } = await shopApp();

    const paid = await app.inject({ method: 'PUT', url: '/packs/wallpaper/prestige/install' });
    const free = await app.inject({ method: 'PUT', url: '/packs/wallpaper/offert/install' });

    expect(paid.statusCode).toBe(403);
    expect(paid.json().code).toBe('PACK_NOT_OWNED');
    expect(free.statusCode).toBe(200);
  });

  it('la boutique dit prix et possession par lecteur : un autre compte ne possède pas ce qu’Alice a acheté', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 80);
    await purchase(app, 'prestige', 'geste-0010');

    const alice = (await app.inject({ method: 'GET', url: '/packs/wallpaper', headers: { 'x-user': ALICE } })).json().data;
    const bob = (await app.inject({ method: 'GET', url: '/packs/wallpaper', headers: { 'x-user': BOB } })).json().data;

    const byslug = (packs: readonly { slug: string }[], slug: string) => packs.find((pack) => pack.slug === slug);
    expect(byslug(alice, 'prestige')).toMatchObject({ price: 50, owned: true, installed: true });
    expect(byslug(bob, 'prestige')).toMatchObject({ price: 50, owned: false, installed: false });
    expect(byslug(bob, 'offert')).toMatchObject({ price: null, owned: true });
    expect(alice.map((pack: { slug: string }) => pack.slug)).toEqual(['essentiels', 'prestige', 'offert']);
  });

  it('sert le détail avec son contrat, et les packs installés dont l’intégré par défaut', async () => {
    const { app } = await shopApp();

    const detail = (await app.inject({ method: 'GET', url: '/packs/wallpaper/prestige' })).json().data;
    const installed = (await app.inject({ method: 'GET', url: '/packs/wallpaper/installed' })).json().data;

    expect(detail.contract.src).toBe(ref('c', 'json').src);
    expect(installed.map((pack: { slug: string }) => pack.slug)).toEqual(['essentiels']);
  });

  it('les contours d’avatar annoncent leur usage ; un intégré ne se retire pas (409)', async () => {
    const { app } = await shopApp();

    const rings = (await app.inject({ method: 'GET', url: '/packs/avatar-ring' })).json().data;
    const removal = await app.inject({ method: 'DELETE', url: '/packs/avatar-ring/contours/install' });

    expect(rings[0]).toMatchObject({ domain: 'avatar-ring', usage: { kind: 'free', surfaces: ['avatar'] } });
    expect(removal.statusCode).toBe(409);
  });

  it('les cadres de bannière sont en boutique : usage `banner` annoncé, un payant s’achète en Meeshes puis s’installe (#10936)', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 100);

    const frames = (await app.inject({ method: 'GET', url: '/packs/banner-frame' })).json().data;
    const before = await app.inject({ method: 'PUT', url: '/packs/banner-frame/cadres-prestige/install' });
    const bought = await app.inject({ method: 'POST', url: '/packs/banner-frame/cadres-prestige/purchase', payload: { requestId: 'cadre-achat-1' } });
    const free = await app.inject({ method: 'PUT', url: '/packs/banner-frame/cadres-celte/install' });

    expect(frames.map((pack: { slug: string }) => pack.slug)).toEqual(['cadres-celte', 'cadres-prestige']);
    expect(frames[0]).toMatchObject({ domain: 'banner-frame', usage: { kind: 'free', surfaces: ['banner'] }, price: null, owned: true });
    expect(frames[1]).toMatchObject({ price: 40, owned: false });
    expect(before.statusCode).toBe(403);
    expect(bought.statusCode).toBe(200);
    expect(bought.json().data).toMatchObject({ balance: 60, pack: { slug: 'cadres-prestige', domain: 'banner-frame', owned: true, installed: true } });
    expect(free.statusCode).toBe(200);
  });

  it('un slug d’un autre domaine répond 404', async () => {
    const { app } = await shopApp();
    expect((await app.inject({ method: 'GET', url: '/packs/banner/prestige' })).statusCode).toBe(404);
  });
});

describe('GET /packs/shop', () => {
  it('agrège les domaines servis, dans l’ordre de PACK_DOMAINS, avec le solde', async () => {
    const { app, db } = await shopApp();
    db.grant(ALICE, 80);

    const data = (await app.inject({ method: 'GET', url: '/packs/shop' })).json().data;

    expect(data.balance).toBe(80);
    expect(data.domains.map((entry: { domain: string }) => entry.domain)).toEqual(expect.arrayContaining(['wallpaper', 'avatar-ring', 'banner', 'banner-frame']));
    expect(data.domains.find((entry: { domain: string }) => entry.domain === 'banner-frame').packs[0]).toMatchObject({ domain: 'banner-frame', usage: { kind: 'free', surfaces: ['banner'] } });
    const order = data.domains.map((entry: { domain: string }) => entry.domain);
    expect(order.indexOf('wallpaper')).toBeLessThan(order.indexOf('avatar-ring'));
    expect(order.indexOf('avatar-ring')).toBeLessThan(order.indexOf('banner'));
    expect(data.domains.find((entry: { domain: string }) => entry.domain === 'wallpaper').packs).toHaveLength(3);
  });

  it('filtre par domaine et IGNORE un domaine inconnu (jamais un 400)', async () => {
    const { app } = await shopApp();

    const response = await app.inject({ method: 'GET', url: '/packs/shop?domains=banner,hologramme' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.domains.map((entry: { domain: string }) => entry.domain)).toEqual(['banner']);
  });
});
