/**
 * #10157 (L5) — `GET /api/v1/pack-assets/:file` : le magasin adressé par contenu
 * des packs OFFICIELS, public, immuable, liste blanche calculée au démarrage
 * par `PackIndex`, aucune lecture de base. Et le pack de cadres d'EXEMPLE du
 * staging, servi sous `PACK_SAMPLES=1` SEULEMENT.
 *
 * Le VRAI module de route est monté sur un VRAI `@fastify/rate-limit` global :
 * le seau propre se prouve par le comportement, pas par la configuration.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { packAssetsRoutes, PACK_ASSETS_CACHE_CONTROL } from '../../../routes/pack-assets';
import { buildPackIndex, loadPackIndex, packDesignDirCandidates, type PackIndex } from '../../../services/packs/PackIndex';
import { gloryFramePackSpec } from '../../../services/packs/gloryFramePackSpec';
import { stickerPackSpec } from '../../../services/packs/stickerPackSpec';

const REPO = resolve(__dirname, '../../../../../..');
const DESIGN = join(REPO, 'packages/shared/design');
const ASSETS = join(REPO, 'services/gateway/assets/packs');

const sampleIndex = (): PackIndex => loadPackIndex([DESIGN], { PACK_SAMPLES: '1' });
const sampleEntry = () => sampleIndex().entries('glory-frame')[0];

function tempAssets(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'meeshy-pack-assets-'));
  Object.entries(files).forEach(([name, body]) => writeFileSync(join(dir, name), body));
  return dir;
}

async function buildApp(options: { index: PackIndex; assetsDir: string; globalMax?: number }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: true, max: options.globalMax ?? 300, timeWindow: '1 minute' });
  await app.register(packAssetsRoutes, { prefix: '/api/v1/pack-assets', index: options.index, assetsDir: options.assetsDir });
  app.get('/api/v1/autre', async () => ({ ok: true }));
  await app.ready();
  return app;
}

const SERVED = '0123456789abcdef.json';
const RETAINED_ONLY = buildPackIndex({ registries: [], retained: [SERVED, 'fedcba9876543210.webp'] });

describe('GET /api/v1/pack-assets/:file — le magasin adressé par contenu', () => {
  it('sert un fichier de la liste blanche, sans authentification, immuable, ETag fort = empreinte, nosniff, CORP cross-origin', async () => {
    const dir = tempAssets({ [SERVED]: '{"schema":1}' });
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir });
    try {
      const res = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${SERVED}` });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('{"schema":1}');
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(PACK_ASSETS_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
      expect(res.headers.etag).toBe('"0123456789abcdef"');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.headers['access-control-allow-origin']).toBe('*');
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('répond 304 à une revalidation qui nomme l’empreinte, forte ou faible', async () => {
    const dir = tempAssets({ [SERVED]: '{}' });
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir });
    try {
      for (const tag of ['"0123456789abcdef"', 'W/"0123456789abcdef"']) {
        const res = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${SERVED}`, headers: { 'if-none-match': tag } });
        expect(res.statusCode).toBe(304);
        expect(res.body).toBe('');
      }
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('404 hors liste blanche — empreinte inconnue, traversée, majuscules, autre extension — même si le fichier est sur le disque', async () => {
    const dir = tempAssets({ [SERVED]: '{}', 'aaaaaaaaaaaaaaaa.json': '{"secret":true}', '0123456789ABCDEF.json': '{}' });
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir });
    try {
      for (const file of ['aaaaaaaaaaaaaaaa.json', '0123456789ABCDEF.json', '0123456789abcdef.svg', '..%2F..%2Fetc%2Fpasswd', '0123456789abcdef.json.bak']) {
        const res = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${file}` });
        expect([file, res.statusCode]).toEqual([file, 404]);
        expect(res.body).not.toContain('secret');
      }
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('404, jamais 500, quand une empreinte de la liste blanche manque sur le disque', async () => {
    const dir = tempAssets({});
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/pack-assets/fedcba9876543210.webp' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a son PROPRE seau de débit : le plafond global épuisé ne le touche pas', async () => {
    const dir = tempAssets({ [SERVED]: '{}' });
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir, globalMax: 2 });
    try {
      const sequence = async (url: string, count: number) => {
        const codes: number[] = [];
        for (let i = 0; i < count; i += 1) codes.push((await app.inject({ method: 'GET', url })).statusCode);
        return codes;
      };
      expect(await sequence('/api/v1/autre', 3)).toEqual([200, 200, 429]);
      expect(await sequence(`/api/v1/pack-assets/${SERVED}`, 5)).toEqual([200, 200, 200, 200, 200]);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('le pack de cadres d’EXEMPLE — servi sous PACK_SAMPLES=1 seulement (fail-closed)', () => {
  it('absent sans la variable, ou avec toute autre valeur que « 1 »', () => {
    for (const env of [{}, { PACK_SAMPLES: '' }, { PACK_SAMPLES: 'true' }, { PACK_SAMPLES: '0' }]) {
      const index = loadPackIndex([DESIGN], env);
      expect(index.entries('glory-frame').map((e) => e.slug)).not.toContain('exemple-savane');
      expect(index.isServedAsset(sampleEntry().contract.src)).toBe(false);
    }
  });

  it('présent avec PACK_SAMPLES=1 : l’entrée, sa couverture, son contrat et ses chaînes sont servis', async () => {
    const index = sampleIndex();
    const entry = sampleEntry();
    expect(index.rejected).toBe(0);
    expect(entry.slug).toBe('exemple-savane');
    const app = await buildApp({ index, assetsDir: ASSETS });
    try {
      const cover = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${entry.cover.src}` });
      expect(cover.statusCode).toBe(200);
      expect(cover.headers['content-type']).toBe('image/webp');
      expect(cover.rawPayload.length).toBe(entry.cover.bytes);
      const contract = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${entry.contract.src}` });
      expect(contract.statusCode).toBe(200);
      const frames = (JSON.parse(contract.body) as { frames: { thumb: { src: string } }[] }).frames;
      const thumbs = await Promise.all(frames.map((f) => app.inject({ method: 'GET', url: `/api/v1/pack-assets/${f.thumb.src}` })));
      expect(thumbs.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    } finally {
      await app.close();
    }
  });

  it('les vignettes d’un contrat entrent dans la liste blanche, et chaque fichier servi correspond à son empreinte', () => {
    const index = sampleIndex();
    const entry = sampleEntry();
    const contract = JSON.parse(readFileSync(join(ASSETS, entry.contract.src), 'utf8')) as { frames: { thumb: { src: string; sha256: string } }[] };
    for (const { thumb } of contract.frames) {
      expect(index.isServedAsset(thumb.src)).toBe(true);
      expect(thumb.src.startsWith(thumb.sha256.slice(0, 16))).toBe(true);
    }
  });

  it('l’isolation des domaines : le registre des stickers ne voit jamais un cadre', () => {
    const index = sampleIndex();
    expect(index.entries('sticker')).toEqual([]);
    expect(stickerPackSpec({} as never).registry.map((p) => p.slug)).not.toContain('exemple-savane');
    expect(gloryFramePackSpec({ index }).registry.map((p) => p.slug)).toEqual(['exemple-savane']);
  });

  it('le dossier de design du dépôt est bien un candidat depuis la passerelle', () => {
    expect(packDesignDirCandidates(join(REPO, 'services/gateway'), {})).toContain(join(REPO, 'services/gateway/../../packages/shared/design'));
  });
});
