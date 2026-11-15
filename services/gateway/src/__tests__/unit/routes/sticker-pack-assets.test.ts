/**
 * #10188 — les fichiers des packs de stickers de TIERS quittent
 * `/attachments/file/*` pour le magasin adressé par contenu
 * (`GET /api/v1/pack-assets/<sha16>.<ext>`).
 *
 * Le parcours est celui de la production : la VRAIE proposition multipart, la
 * VRAIE modération, le VRAI sérialiseur de `/sticker-packs`, puis le VRAI module
 * `/pack-assets` sur un VRAI `@fastify/rate-limit`. Le double Prisma partagé
 * refuse ce que le vrai client refuse (`sticker-packs.harness.ts`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isStickerPackAssetRef } from '@meeshy/shared/types/sticker-pack-asset';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { stickerPacksRoutes } from '../../../routes/sticker-packs';
import { packAssetsRoutes } from '../../../routes/pack-assets';
import { EMPTY_PACK_INDEX } from '../../../services/packs/PackIndex';
import { StickerPacks } from '../../../services/stickers/StickerPacks';
import { StickerPackAssets, diskStickerPackFileReader, type StickerPackFileReader } from '../../../services/packs/stickerPackAssets';
import type { StickerFileStore } from '../../../services/stickers/StickerLibrary';
import type { StickerImageOutcome } from '../../../services/stickers/stickerImage';
import { memoryPrisma } from './sticker-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';
const MODO = '68b0000000000000000000c3';

/** « A » = animé (WebP), « G » = GIF animé, sinon un PNG fixe. */
const fakeNormalize = async (bytes: Buffer): Promise<StickerImageOutcome> => {
  const tag = bytes.subarray(0, 1).toString();
  const mimeType = tag === 'A' ? 'image/webp' : tag === 'G' ? 'image/gif' : 'image/png';
  return { ok: true, image: { bytes, mimeType, width: 512, height: 512, animated: tag === 'A' || tag === 'G' } };
};

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const ASSETS: Record<string, Buffer> = { 'bonjour.png': Buffer.from('S-bonjour'), 'dodo.webp': Buffer.from('A-dodo'), 'danse.gif': Buffer.from('G-danse') };

const manifest = (over: Record<string, unknown> = {}) => ({
  slug: 'chats-de-paris',
  name: 'Chats de Paris',
  description: 'Des chats qui flânent sur les quais.',
  author: 'Studio Minou',
  items: [
    { key: 'bonjour', title: 'Bonjour', emoji: '👋', kind: 'static', asset: 'bonjour.png' },
    { key: 'dodo', title: 'Dodo', emoji: '😴', kind: 'cinematic', asset: 'dodo.webp' },
    { key: 'danse', title: 'Danse', emoji: '💃', kind: 'cinematic', asset: 'danse.gif' },
  ],
  ...over,
});

function submission(m: unknown, assets: Record<string, Buffer> = ASSETS) {
  const boundary = '----meeshy-pack';
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify(m)}\r\n`),
    ...Object.entries(assets).flatMap(([name, bytes]) => [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ];
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function buildApps() {
  const db = memoryPrisma();
  const stored = new Map<string, Buffer>();
  const files: StickerFileStore = { write: async (p, b) => void stored.set(p, b), remove: async (p) => void stored.delete(p) };
  const reads: string[] = [];
  const reader: StickerPackFileReader = {
    read: async (p) => {
      reads.push(p);
      return stored.get(p) ?? null;
    },
  };
  let who = { userId: ALICE, role: 'USER' };

  const packsApp: FastifyInstance = Fastify({ logger: false });
  await packsApp.register(multipart);
  packsApp.decorate('prisma', db.prisma as never);
  packsApp.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: who.userId, registeredUser: { id: who.userId, role: who.role },
    };
  });
  await packsApp.register(stickerPacksRoutes, { packs: new StickerPacks({ prisma: db.prisma, files, normalize: fakeNormalize }) });
  await packsApp.ready();

  const assetsApp: FastifyInstance = Fastify({ logger: false });
  await assetsApp.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await assetsApp.register(packAssetsRoutes, {
    prefix: '/api/v1/pack-assets',
    index: EMPTY_PACK_INDEX,
    assetsDir: tmpdir(),
    community: { approvedContract: async () => null },
    lens: { approvedFile: async () => null },
    stickers: new StickerPackAssets({ prisma: db.prisma, files: reader }),
  });
  await assetsApp.ready();

  const as = (userId: string, role = 'USER') => void (who = { userId, role });
  const close = async () => {
    await packsApp.close();
    await assetsApp.close();
  };
  return { packsApp, assetsApp, db, stored, reads, as, close };
}

type Served = { readonly key: string; readonly fileUrl: string; readonly asset?: { readonly src: string; readonly sha256: string; readonly bytes: number } };

async function publishedPack() {
  const apps = await buildApps();
  await apps.packsApp.inject({ method: 'POST', url: '/submissions', ...submission(manifest()) });
  apps.as(MODO, 'MODERATOR');
  await apps.packsApp.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'approve' } });
  apps.as(BOB);
  const detail = (await apps.packsApp.inject({ method: 'GET', url: '/chats-de-paris' })).json().data as { readonly items: readonly Served[]; readonly cover?: unknown; readonly coverUrl: string };
  return { ...apps, detail };
}

describe('une proposition grave l’empreinte de chaque fichier gardé', () => {
  it('sert, à côté de l’ancien fileUrl, la référence adressée de chaque sticker et de la couverture', async () => {
    const { detail, stored, close } = await publishedPack();
    try {
      expect(detail.items.map((item) => item.asset)).toEqual(
        detail.items.map((item) => {
          const bytes = stored.get(item.fileUrl) as Buffer;
          const ext = item.key === 'bonjour' ? 'png' : item.key === 'dodo' ? 'webp' : 'gif';
          return { src: `${sha256(bytes).slice(0, 16)}.${ext}`, sha256: sha256(bytes), bytes: bytes.length };
        }),
      );
      expect(detail.items.every((item) => stored.has(item.fileUrl))).toBe(true);
      expect(detail.cover).toEqual(detail.items[0].asset);
      expect(detail.coverUrl).toBe(detail.items[0].fileUrl);
      expect(detail.items.every((item) => isStickerPackAssetRef(item.asset))).toBe(true);
    } finally {
      await close();
    }
  });

  it('la boutique et les packs installés portent la même couverture adressée', async () => {
    const { packsApp, detail, close } = await publishedPack();
    try {
      const shop = (await packsApp.inject({ method: 'GET', url: '/' })).json().data as readonly { slug: string; cover?: unknown }[];
      expect(shop.find((pack) => pack.slug === 'chats-de-paris')?.cover).toEqual(detail.items[0].asset);
      await packsApp.inject({ method: 'PUT', url: '/chats-de-paris/install' });
      const mine = (await packsApp.inject({ method: 'GET', url: '/installed' })).json().data as readonly { slug: string; items: readonly Served[] }[];
      expect(mine.find((pack) => pack.slug === 'chats-de-paris')?.items.map((item) => item.asset)).toEqual(detail.items.map((item) => item.asset));
    } finally {
      await close();
    }
  });

  it('un pack EN ATTENTE ou REFUSÉ n’annonce aucune adresse que la porte publique refuserait : seul l’ancien fileUrl', async () => {
    const { packsApp, as, close } = await buildApps();
    type View = { readonly status: string; readonly cover?: unknown; readonly coverUrl: string | null; readonly items?: readonly Served[] };
    const announcesNothing = (pack: View | undefined) => {
      expect(pack).toBeDefined();
      expect(Object.keys(pack as View)).not.toContain('cover');
      expect((pack as View).coverUrl).toMatch(/^sticker-packs\//);
      (pack?.items ?? []).forEach((item) => {
        expect(Object.keys(item)).not.toContain('asset');
        expect(item.fileUrl).toMatch(/^sticker-packs\//);
      });
    };
    const mine = async () => ((await packsApp.inject({ method: 'GET', url: '/submissions' })).json().data as readonly (View & { slug: string })[]).find((pack) => pack.slug === 'chats-de-paris');
    try {
      announcesNothing((await packsApp.inject({ method: 'POST', url: '/submissions', ...submission(manifest()) })).json().data);
      announcesNothing(await mine());
      announcesNothing((await packsApp.inject({ method: 'GET', url: '/chats-de-paris' })).json().data);
      as(MODO, 'MODERATOR');
      announcesNothing(((await packsApp.inject({ method: 'GET', url: '/pending' })).json().data as readonly (View & { slug: string })[]).find((pack) => pack.slug === 'chats-de-paris'));
      await packsApp.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'reject', note: 'Non' } });
      as(ALICE);
      const rejected = await mine();
      expect(rejected?.status).toBe('rejected');
      announcesNothing(rejected);
    } finally {
      await close();
    }
  });

  it('un fichier proposé avant l’empreinte garde exactement sa réponse d’avant : aucune clé asset, aucune cover', async () => {
    const { packsApp, db, as, close } = await buildApps();
    try {
      db.packs.push({ id: '68b0000000000000000000f1', slug: 'ancien', name: 'Ancien', description: 'D’avant.', author: 'X', submitterId: ALICE, status: 'approved', reviewNote: null, installCount: 0, createdAt: new Date() });
      db.items.push({ id: 'i1', packId: '68b0000000000000000000f1', key: 'a', title: 'A', emoji: '🙂', kind: 'static', mimeType: 'image/png', filePath: 'sticker-packs/f1/a.png', width: 512, height: 512, sizeBytes: 3, zones: null, position: 0 });
      as(BOB);
      const data = (await packsApp.inject({ method: 'GET', url: '/ancien' })).json().data;
      expect(Object.keys(data)).not.toContain('cover');
      expect(Object.keys(data.items[0])).not.toContain('asset');
      expect(data.items[0].fileUrl).toBe('sticker-packs/f1/a.png');
    } finally {
      await close();
    }
  });
});

describe('GET /api/v1/pack-assets/<sha16>.<ext> — le fichier d’un pack de tiers PUBLIÉ', () => {
  it('sert les octets du sticker, sans authentification, immuable, ETag fort = empreinte, sous le type de son extension', async () => {
    const { assetsApp, detail, stored, close } = await publishedPack();
    try {
      for (const item of detail.items) {
        const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${item.asset?.src}` });
        expect(res.statusCode).toBe(200);
        expect(res.rawPayload.equals(stored.get(item.fileUrl) as Buffer)).toBe(true);
        expect(res.headers['content-type']).toBe(item.key === 'bonjour' ? 'image/png' : item.key === 'dodo' ? 'image/webp' : 'image/gif');
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        expect(res.headers.etag).toBe(`"${item.asset?.src.slice(0, 16)}"`);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      }
    } finally {
      await close();
    }
  });

  it('répond 304 à une revalidation qui nomme l’empreinte', async () => {
    const { assetsApp, detail, close } = await publishedPack();
    try {
      const src = detail.items[2].asset?.src as string;
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${src}`, headers: { 'if-none-match': `"${src.slice(0, 16)}"` } });
      expect(res.statusCode).toBe(304);
    } finally {
      await close();
    }
  });

  it('une revalidation 304 ne lit ni ne hache aucun fichier du volume', async () => {
    const { assetsApp, detail, reads, close } = await publishedPack();
    try {
      const src = detail.items[0].asset?.src as string;
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${src}`, headers: { 'if-none-match': `"${src.slice(0, 16)}"` } });
      expect(res.statusCode).toBe(304);
      expect(res.headers.etag).toBe(`"${src.slice(0, 16)}"`);
      expect(reads).toEqual([]);
    } finally {
      await close();
    }
  });

  it('une revalidation d’un pack NON publié rend 404, jamais 304', async () => {
    const { packsApp, assetsApp, reads, close } = await buildApps();
    try {
      await packsApp.inject({ method: 'POST', url: '/submissions', ...submission(manifest()) });
      const src = `${sha256(ASSETS['bonjour.png']).slice(0, 16)}.png`;
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${src}`, headers: { 'if-none-match': `"${src.slice(0, 16)}"` } });
      expect(res.statusCode).toBe(404);
      expect(res.headers.etag).toBeUndefined();
      expect(reads).toEqual([]);
    } finally {
      await close();
    }
  });

  it('un pack EN ATTENTE ou REFUSÉ ne sert rien, même à qui connaît ses octets : la porte publique ne précède jamais la modération', async () => {
    const { packsApp, assetsApp, as, close } = await buildApps();
    try {
      await packsApp.inject({ method: 'POST', url: '/submissions', ...submission(manifest()) });
      const src = `${sha256(ASSETS['bonjour.png']).slice(0, 16)}.png`;
      expect((await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${src}` })).statusCode).toBe(404);
      as(MODO, 'MODERATOR');
      await packsApp.inject({ method: 'POST', url: '/chats-de-paris/review', payload: { decision: 'reject', note: 'Non' } });
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${src}` });
      expect(res.statusCode).toBe(404);
      expect(res.headers['cache-control']).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('un fichier altéré sur le volume ne se sert jamais sous l’empreinte qu’il ne porte plus', async () => {
    const { assetsApp, detail, stored, close } = await publishedPack();
    try {
      stored.set(detail.items[0].fileUrl, Buffer.from('S-autre-chose'));
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${detail.items[0].asset?.src}` });
      expect(res.statusCode).toBe(404);
      expect(res.headers.etag).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('une extension qui ne correspond pas au type gardé, ou une empreinte inconnue, rend 404', async () => {
    const { assetsApp, detail, close } = await publishedPack();
    try {
      const png = detail.items[0].asset?.src as string;
      expect((await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${png.replace('.png', '.gif')}` })).statusCode).toBe(404);
      expect((await assetsApp.inject({ method: 'GET', url: '/api/v1/pack-assets/0000000000000000.png' })).statusCode).toBe(404);
      expect((await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${png.toUpperCase()}` })).statusCode).toBe(404);
    } finally {
      await close();
    }
  });

  it('les mêmes octets dans deux packs se servent dès que l’UN est publié', async () => {
    const { packsApp, assetsApp, as, detail, close } = await publishedPack();
    try {
      as(ALICE);
      await packsApp.inject({ method: 'POST', url: '/submissions', ...submission(manifest({ slug: 'copie-en-attente' })) });
      const res = await assetsApp.inject({ method: 'GET', url: `/api/v1/pack-assets/${detail.items[1].asset?.src}` });
      expect(res.statusCode).toBe(200);
    } finally {
      await close();
    }
  });

  it('l’ancien chemin reste la réponse d’un ancien client : le fileUrl servi n’a pas bougé', async () => {
    const { detail, close } = await publishedPack();
    try {
      expect(detail.items.every((item) => /^sticker-packs\/[^/]+\/[a-z0-9-]+\.(png|webp|gif)$/.test(item.fileUrl))).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('diskStickerPackFileReader — le volume des téléversements, confiné à sa racine', () => {
  it('lit un fichier présent, rend null pour un absent, et ne sort jamais de sa racine', async () => {
    const root = mkdtempSync(join(tmpdir(), 'meeshy-sticker-packs-'));
    try {
      mkdirSync(join(root, 'sticker-packs/f1'), { recursive: true });
      writeFileSync(join(root, 'sticker-packs/f1/a.png'), 'S-a');
      writeFileSync(join(tmpdir(), 'meeshy-outside.png'), 'secret');
      const reader = diskStickerPackFileReader(root);
      expect((await reader.read('sticker-packs/f1/a.png'))?.toString()).toBe('S-a');
      expect(await reader.read('sticker-packs/f1/absent.png')).toBeNull();
      expect(await reader.read('../meeshy-outside.png')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
