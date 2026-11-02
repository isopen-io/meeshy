/**
 * LE MOTEUR DES PACKS À DOMAINES (#10148, LP0) — ce que la généralisation
 * ajoute au moteur des stickers (#9141), à travers les VRAIES routes et le
 * VRAI sérialiseur :
 *
 * - le compteur `installCount` est ATOMIQUE (deux `PUT` concurrents comptent un) ;
 * - l'installation se DIFFUSE : le couple (`pack:installation-updated`, charge)
 *   sur `user:<id>`, asserté par son NOM ;
 * - `/packs/glory-frame` sert le même moteur sur un registre FIXTURE (jamais
 *   des données inventées dans le dépôt), et sur le registre VIDE d'avant L3 ;
 * - les domaines sont ISOLÉS : un slug valide d'un autre domaine rend 404, une
 *   clé `glory-frame.*` ne paraît jamais chez les stickers.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { stickerPacksRoutes } from '../../../routes/sticker-packs';
import { gloryFramePacksRoutes } from '../../../routes/packs-glory-frame';
import { packInstallationBroadcaster } from '../../../routes/pack-routes';
import { StickerPacks } from '../../../services/stickers/StickerPacks';
import { PackCatalog } from '../../../services/packs/PackCatalog';
import { buildPackIndex, EMPTY_PACK_INDEX, loadPackIndex, type PackIndex } from '../../../services/packs/PackIndex';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gloryFramePackSpec } from '../../../services/packs/gloryFramePackSpec';
import { memoryPrisma } from './sticker-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';
const AT = new Date('2026-10-11T09:00:00.000Z');

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

function fakeSocketIO() {
  const emitted: Emitted[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) };
  return { handler: { io }, emitted };
}

async function baseApp(db: ReturnType<typeof memoryPrisma>) {
  const who = ALICE;
  const socket = fakeSocketIO();
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(multipart);
  app.decorate('prisma', db.prisma as never);
  app.decorate('socketIOHandler', socket.handler as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const userId = typeof request.headers['x-user'] === 'string' ? request.headers['x-user'] : who;
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId,
      registeredUser: { id: userId, role: 'USER' },
    };
  });
  return { app, emitted: socket.emitted };
}

function seedCommunityPack(db: ReturnType<typeof memoryPrisma>) {
  db.packs.push({ id: '68b0000000000000000000f1', slug: 'chats-de-paris', name: 'Chats de Paris', description: 'Des chats.', author: 'Studio Minou', submitterId: ALICE, status: 'approved', reviewNote: null, installCount: 0, createdAt: AT });
  db.items.push({ id: 'i1', packId: '68b0000000000000000000f1', key: 'bonjour', title: 'Bonjour', emoji: '👋', kind: 'static', mimeType: 'image/png', filePath: 'sticker-packs/f1/bonjour.png', width: 512, height: 512, zones: null, position: 0 });
}

async function stickerApp() {
  const db = memoryPrisma();
  seedCommunityPack(db);
  const base = await baseApp(db);
  const files = { write: async () => undefined, remove: async () => undefined };
  await base.app.register(stickerPacksRoutes, {
    packs: new StickerPacks({ prisma: db.prisma, files, now: () => AT, broadcast: packInstallationBroadcaster(base.app) }),
  });
  await base.app.ready();
  return { ...base, db };
}

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
  ...over,
});

const FIXTURE_REGISTRY = [
  entry('afrique', { order: 0, installedByDefault: true, removable: false, atmosphere: 'afrique', collections: [{ slug: 'savane' }, { slug: 'royaumes', usage: { kind: 'prestige' } }] }),
  entry('succes', { order: 2, usage: { kind: 'achievement' } }),
  entry('moments', { order: 1, usage: { kind: 'moment', family: 'flame' } }),
  entry('ancien', { order: 3, hidden: true }),
];

async function frameApp(options: { index?: PackIndex; removalGuard?: (userId: string, slug: string) => Promise<boolean> } = {}) {
  const db = memoryPrisma();
  const base = await baseApp(db);
  const index = options.index ?? buildPackIndex({ registries: [FIXTURE_REGISTRY], retained: [] });
  const catalog = new PackCatalog({
    prisma: db.prisma,
    spec: gloryFramePackSpec({ index, removalGuard: options.removalGuard ?? null }),
    now: () => AT,
    broadcast: packInstallationBroadcaster(base.app),
  });
  await base.app.register(gloryFramePacksRoutes, { catalog });
  await base.app.ready();
  return { ...base, db, index };
}

describe('installCount — un compteur ATOMIQUE', () => {
  it('deux PUT concurrents d’un même compte comptent UN, deux DELETE concurrents le ramènent à zéro', async () => {
    const { app, db } = await stickerApp();
    const both = await Promise.all([app.inject({ method: 'PUT', url: '/chats-de-paris/install' }), app.inject({ method: 'PUT', url: '/chats-de-paris/install' })]);
    expect(both.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(db.packs[0].installCount).toBe(1);
    expect(db.choices.filter((c) => c.packSlug === 'chats-de-paris')).toHaveLength(1);

    await Promise.all([app.inject({ method: 'DELETE', url: '/chats-de-paris/install' }), app.inject({ method: 'DELETE', url: '/chats-de-paris/install' })]);
    expect(db.packs[0].installCount).toBe(0);
    await app.close();
  });

  it('deux comptes qui installent en même temps comptent DEUX', async () => {
    const { app, db } = await stickerApp();
    await Promise.all([
      app.inject({ method: 'PUT', url: '/chats-de-paris/install', headers: { 'x-user': ALICE } }),
      app.inject({ method: 'PUT', url: '/chats-de-paris/install', headers: { 'x-user': BOB } }),
    ]);
    expect(db.packs[0].installCount).toBe(2);
    await app.close();
  });
});

describe('pack:installation-updated — diffusée sur la room personnelle', () => {
  it('nomme l’événement et sa charge, sur user:<id>, après l’écriture', async () => {
    const { app, emitted, db } = await stickerApp();
    // Un pack INCLUS (Mee, Meo) ne se retire plus (#10738) : le retrait se joue sur un pack communautaire.
    await app.inject({ method: 'DELETE', url: '/chats-de-paris/install' });
    expect(emitted).toEqual([{ room: `user:${ALICE}`, event: 'pack:installation-updated', payload: { domain: 'sticker', slug: 'chats-de-paris', installed: false, at: AT.toISOString() } }]);
    expect(db.choices.map((c) => [c.packSlug, c.installedAt])).toEqual([['chats-de-paris', null]]);
    await app.close();
  });

  it('ne diffuse rien pour une installation refusée', async () => {
    const { app, emitted } = await stickerApp();
    expect((await app.inject({ method: 'PUT', url: '/inconnu/install' })).statusCode).toBe(404);
    expect(emitted).toEqual([]);
    await app.close();
  });
});

describe('/packs/glory-frame — le registre VIDE d’avant L3', () => {
  it('répond une boutique vide et 404 à toute installation, un slug de sticker compris', async () => {
    const { app, db } = await frameApp({ index: EMPTY_PACK_INDEX });
    const shop = await app.inject({ method: 'GET', url: '/' });
    expect(shop.statusCode).toBe(200);
    expect(shop.json()).toEqual({ success: true, data: [] });
    expect(shop.headers['cache-control']).toBe('private, no-cache');
    const mee = await app.inject({ method: 'PUT', url: '/mee/install' });
    expect(mee.statusCode).toBe(404);
    expect(mee.json()).toMatchObject({ success: false, code: 'PACK_NOT_FOUND' });
    expect((await app.inject({ method: 'PUT', url: '/afrique/install' })).statusCode).toBe(404);
    expect(db.choices).toEqual([]);
    await app.close();
  });

  it('refuse par le schéma une clé à point, comme /sticker-packs', async () => {
    const { app } = await frameApp({ index: EMPTY_PACK_INDEX });
    expect((await app.inject({ method: 'PUT', url: '/sticker.mee/install' })).statusCode).toBe(400);
    await app.close();
  });
});

describe('/packs/glory-frame — un registre FIXTURE', () => {
  it('le registre se lit sans refus', async () => {
    const { index } = await frameApp();
    expect(index.rejected).toBe(0);
    expect(index.entries('glory-frame').map((e) => e.slug)).toEqual(['afrique', 'moments', 'succes', 'ancien']);
    expect(index.isServedAsset(ref('a').src)).toBe(true);
    expect(index.isServedAsset('0000000000000000.webp')).toBe(false);
  });

  it('sert le nombre de cadres que le contrat lu déclare, dans la boutique comme dans le détail (#10221)', async () => {
    const counts: Record<string, number> = { afrique: 38, moments: 16 };
    const index = buildPackIndex({ registries: [FIXTURE_REGISTRY], retained: [], contractItemCount: (e) => counts[e.slug] ?? 0 });
    const { app } = await frameApp({ index });
    const shop = (await app.inject({ method: 'GET', url: '/' })).json().data as Record<string, unknown>[];
    expect(shop.map((p) => [p.slug, p.itemCount])).toEqual([
      ['afrique', 38],
      ['moments', 16],
      ['succes', 0],
    ]);
    const detail = (await app.inject({ method: 'GET', url: '/afrique' })).json().data as Record<string, unknown>;
    expect(detail.itemCount).toBe(38);
  });

  it('sert la boutique dans l’ordre éditorial, sans les packs masqués, avec l’usage de chaque pack', async () => {
    const { app } = await frameApp();
    const data = (await app.inject({ method: 'GET', url: '/' })).json().data as Record<string, unknown>[];
    expect(data.map((p) => [p.slug, p.installed, p.removable])).toEqual([
      ['afrique', true, false],
      ['moments', false, true],
      ['succes', false, true],
    ]);
    expect(data[0]).toEqual({
      slug: 'afrique',
      name: 'Pack afrique',
      description: 'Les cadres afrique.',
      author: 'Meeshy',
      builtin: false,
      status: 'approved',
      itemCount: 0,
      coverUrl: `/api/v1/pack-assets/${ref('a').src}`,
      installed: true,
      installCount: 0,
      domain: 'glory-frame',
      origin: 'official',
      version: 1,
      downloadBytes: { story: 2_400_000, square: 1_800_000 },
      removable: false,
      names: { fr: { name: 'Pack afrique', description: 'Les cadres afrique.' } },
      preview: ref('b'),
      previewUrl: `/api/v1/pack-assets/${ref('b').src}`,
      usage: { kind: 'rank', rank: 'ambassadeur', division: 4 },
    });
    expect(data.map((p) => p.usage)).toEqual([{ kind: 'rank', rank: 'ambassadeur', division: 4 }, { kind: 'moment', family: 'flame' }, { kind: 'achievement' }]);
    await app.close();
  });

  it('montre chaque pack sans l’installer : l’atlas de ses vignettes, à son adresse, et jamais un atlas démesuré (#10275)', async () => {
    const heavy = { ...ref('e'), bytes: 262_145 };
    const index = buildPackIndex({ registries: [[entry('lourd', { preview: heavy }), entry('sans-atlas', { order: 1, preview: null }), entry('leger', { order: 2 })]], retained: [] });
    const { app } = await frameApp({ index });
    const data: readonly { slug: string; preview: unknown; previewUrl: unknown }[] = (await app.inject({ method: 'GET', url: '/' })).json().data;
    expect(data.map(({ slug, preview, previewUrl }) => ({ slug, preview, previewUrl }))).toEqual([
      { slug: 'lourd', preview: null, previewUrl: null },
      { slug: 'sans-atlas', preview: null, previewUrl: null },
      { slug: 'leger', preview: ref('b'), previewUrl: `/api/v1/pack-assets/${ref('b').src}` },
    ]);
    expect((await app.inject({ method: 'GET', url: '/leger' })).json().data).toMatchObject({ preview: ref('b'), previewUrl: `/api/v1/pack-assets/${ref('b').src}` });
    await app.close();
  });

  it('sert le détail d’un pack, son contrat, ses chaînes et l’usage propre à chaque collection', async () => {
    const { app } = await frameApp();
    const detail = (await app.inject({ method: 'GET', url: '/afrique' })).json().data;
    expect(detail).toMatchObject({ contractSchema: 1, contract: ref('c', 'json'), strings: { fr: ref('d', 'json') } });
    expect(detail.collections).toEqual([
      { slug: 'savane', usage: null },
      { slug: 'royaumes', usage: { kind: 'prestige' } },
    ]);
    await app.close();
  });

  it('un pack masqué ne se lit ni ne s’installe par son slug pour qui ne l’a pas (audit de #12293)', async () => {
    const { app } = await frameApp();
    expect((await app.inject({ method: 'GET', url: '/ancien' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/ancien/install' })).statusCode).toBe(404);
    await app.close();
  });

  it('installe sous la clé <domaine>.<slug>, le diffuse, et le liste parmi les installés', async () => {
    const { app, db, emitted } = await frameApp();
    const res = await app.inject({ method: 'PUT', url: '/succes/install' });
    expect(res.json().data).toMatchObject({ slug: 'succes', installed: true, domain: 'glory-frame' });
    expect(db.choices.map((c) => c.packSlug)).toEqual(['glory-frame.succes']);
    expect(emitted).toEqual([{ room: `user:${ALICE}`, event: 'pack:installation-updated', payload: { domain: 'glory-frame', slug: 'succes', installed: true, at: AT.toISOString() } }]);
    const installed = (await app.inject({ method: 'GET', url: '/installed' })).json().data;
    expect(installed.map((p: { slug: string }) => p.slug)).toEqual(['afrique', 'succes']);
    await app.close();
  });

  it('409 PACK_NOT_REMOVABLE sur le retrait d’un pack non retirable, et rien n’est écrit', async () => {
    const { app, db, emitted } = await frameApp();
    const res = await app.inject({ method: 'DELETE', url: '/afrique/install' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'PACK_NOT_REMOVABLE' });
    expect(db.choices).toEqual([]);
    expect(emitted).toEqual([]);
    await app.close();
  });

  it('409 quand la garde du domaine refuse le retrait (le pack de l’atmosphère choisie)', async () => {
    const { app, db } = await frameApp({ removalGuard: async (_userId, slug) => slug !== 'moments' });
    await app.inject({ method: 'PUT', url: '/moments/install' });
    expect((await app.inject({ method: 'DELETE', url: '/moments/install' })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: '/succes/install' })).statusCode).toBe(200);
    expect(db.choices.find((c) => c.packSlug === 'glory-frame.moments')?.installedAt).toEqual(AT);
    await app.close();
  });
});

describe('isolation des domaines', () => {
  it('une installation de cadre ne paraît jamais chez les stickers, et inversement', async () => {
    const db = memoryPrisma();
    seedCommunityPack(db);
    const base = await baseApp(db);
    const files = { write: async () => undefined, remove: async () => undefined };
    await base.app.register(stickerPacksRoutes, { prefix: '/sticker-packs', packs: new StickerPacks({ prisma: db.prisma, files, now: () => AT }) });
    await base.app.register(gloryFramePacksRoutes, {
      prefix: '/packs/glory-frame',
      catalog: new PackCatalog({ prisma: db.prisma, spec: gloryFramePackSpec({ index: buildPackIndex({ registries: [[entry('mee')]], retained: [] }) }), now: () => AT }),
    });
    await base.app.ready();

    await base.app.inject({ method: 'PUT', url: '/packs/glory-frame/mee/install' });
    const refused = await base.app.inject({ method: 'DELETE', url: '/sticker-packs/mee/install' });
    const stickers = (await base.app.inject({ method: 'GET', url: '/sticker-packs/installed' })).json().data;
    const frames = (await base.app.inject({ method: 'GET', url: '/packs/glory-frame/installed' })).json().data;
    // Le sticker Mee est INCLUS (#10738) : son retrait est refusé, et le cadre
    // homonyme installé n'y change rien — ni d'un côté ni de l'autre.
    expect(refused.statusCode).toBe(409);
    expect(stickers.map((p: { slug: string }) => p.slug)).toEqual(['mee', 'meo', 'mee-et-meo']);
    expect(frames.map((p: { slug: string }) => p.slug)).toEqual(['mee']);
    expect(db.choices.map((c) => [c.packSlug, c.installedAt === null])).toEqual([['glory-frame.mee', false]]);
    await base.app.close();
  });
});

describe('PackIndex — les registres lus au démarrage', () => {
  it('sans dossier de design, des registres vides', () => {
    const index = loadPackIndex([join(tmpdir(), 'meeshy-packs-absent-dir')]);
    expect(index.entries('glory-frame')).toEqual([]);
    expect(index.rejected).toBe(0);
  });

  it('lit le registre des cadres, compte une entrée illisible et un fichier illisible, garde les empreintes retenues', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meeshy-packs-'));
    try {
      mkdirSync(join(dir, 'glory-frames'));
      mkdirSync(join(dir, 'packs'));
      mkdirSync(join(dir, 'call-capture-frames'));
      writeFileSync(join(dir, 'glory-frames/packs.json'), JSON.stringify([entry('afrique'), { slug: 'Illisible' }]));
      writeFileSync(join(dir, 'call-capture-frames/packs.json'), '{ pas du json');
      writeFileSync(join(dir, 'packs/retained.json'), JSON.stringify(['0123456789abcdef.webp', '../etc/passwd']));
      const index = loadPackIndex([dir]);
      expect(index.entries('glory-frame').map((e) => e.slug)).toEqual(['afrique']);
      expect(index.rejected).toBe(2);
      expect(index.isServedAsset('0123456789abcdef.webp')).toBe(true);
      expect(index.isServedAsset('../etc/passwd')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
