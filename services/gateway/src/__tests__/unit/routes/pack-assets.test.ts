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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { packAssetsRoutes, PACK_ASSETS_CACHE_CONTROL, PACK_ASSETS_RATE_LIMIT_MAX } from '../../../routes/pack-assets';
import { buildPackIndex, loadPackIndex, packDesignDirCandidates, type PackIndex } from '../../../services/packs/PackIndex';
import { gloryFramePackSpec } from '../../../services/packs/gloryFramePackSpec';
import { stickerPackSpec } from '../../../services/packs/stickerPackSpec';

const REPO = resolve(__dirname, '../../../../../..');
const DESIGN = join(REPO, 'packages/shared/design');
const ASSETS = join(REPO, 'services/gateway/assets/packs');

const sampleIndex = (): PackIndex => loadPackIndex([DESIGN], { PACK_SAMPLES: '1' });
const sampleEntry = () => {
  const entry = sampleIndex().entries('glory-frame').find((candidate) => candidate.slug === 'exemple-savane');
  if (entry === undefined) throw new Error('pack d’exemple absent');
  return entry;
};
const realIndex = (): PackIndex => loadPackIndex([DESIGN], {});

function tempAssets(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'meeshy-pack-assets-'));
  Object.entries(files).forEach(([name, body]) => writeFileSync(join(dir, name), body));
  return dir;
}

async function buildApp(options: { index: PackIndex; assetsDir: string; globalMax?: number; community?: { approvedContract: (src: string) => Promise<string | null> }; lens?: { approvedFile: (src: string) => Promise<{ bytes: Buffer; contentType: string } | null> } }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: true, max: options.globalMax ?? 300, timeWindow: '1 minute' });
  await app.register(packAssetsRoutes, { prefix: '/api/v1/pack-assets', index: options.index, assetsDir: options.assetsDir, community: options.community ?? { approvedContract: async () => null }, lens: options.lens ?? { approvedFile: async () => null } });
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

  it('son seau propre est une PROTECTION, jamais une exemption : la requête au-delà du plafond par IP répond 429', async () => {
    const dir = tempAssets({ [SERVED]: '{}' });
    const app = await buildApp({ index: RETAINED_ONLY, assetsDir: dir, globalMax: 10_000 });
    try {
      const codes: number[] = [];
      for (let i = 0; i <= PACK_ASSETS_RATE_LIMIT_MAX; i += 1) codes.push((await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${SERVED}` })).statusCode);
      expect(codes.slice(0, PACK_ASSETS_RATE_LIMIT_MAX).every((code) => code === 200)).toBe(true);
      expect(codes[PACK_ASSETS_RATE_LIMIT_MAX]).toBe(429);
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

  it('un contrat ALTÉRÉ sur le disque n’ouvre aucune de ses vignettes (seule reste la couverture, que le registre nomme lui-même) ; le contrat intègre les ouvre', () => {
    const design = mkdtempSync(join(tmpdir(), 'meeshy-pack-design-'));
    const honest = mkdtempSync(join(tmpdir(), 'meeshy-pack-honest-'));
    const altered = mkdtempSync(join(tmpdir(), 'meeshy-pack-altered-'));
    try {
      mkdirSync(join(design, 'packs/samples'), { recursive: true });
      copyFileSync(join(DESIGN, 'packs/samples/glory-frame.json'), join(design, 'packs/samples/glory-frame.json'));
      const contractSrc = sampleEntry().contract.src;
      const bytes = readFileSync(join(ASSETS, contractSrc), 'utf8');
      writeFileSync(join(honest, contractSrc), bytes);
      writeFileSync(join(altered, contractSrc), `${bytes} `);
      const thumbs = (JSON.parse(bytes) as { frames: { thumb: { src: string } }[] }).frames.map((frame) => frame.thumb.src);
      const servedBy = (assetsDir: string) => {
        const index = loadPackIndex([design], { PACK_SAMPLES: '1' }, assetsDir);
        return thumbs.map((src) => index.isServedAsset(src));
      };
      expect(servedBy(honest)).toEqual([true, true, true, true]);
      const cover = sampleEntry().cover.src;
      expect(servedBy(altered)).toEqual(thumbs.map((src) => src === cover));
      expect(servedBy(altered).filter(Boolean)).toHaveLength(1);
    } finally {
      [design, honest, altered].forEach((dir) => rmSync(dir, { recursive: true, force: true }));
    }
  });

  it('l’isolation des domaines : le registre des stickers ne voit jamais un cadre', () => {
    const index = sampleIndex();
    expect(index.entries('sticker')).toEqual([]);
    expect(stickerPackSpec({} as never).registry.map((p) => p.slug)).not.toContain('exemple-savane');
    expect(gloryFramePackSpec({ index }).registry.map((p) => p.slug)).toContain('exemple-savane');
    expect(gloryFramePackSpec({ index: realIndex() }).registry.map((p) => p.slug)).not.toContain('exemple-savane');
  });

  it('le dossier de design du dépôt est bien un candidat depuis la passerelle', () => {
    expect(packDesignDirCandidates(join(REPO, 'services/gateway'), {})).toContain(join(REPO, 'services/gateway/../../packages/shared/design'));
  });
});

describe('le registre RÉEL des cadres de gloire (#10154, L3) — servi partout, chaque fichier de chaque contrat ouvert', () => {
  type StoredRef = { readonly src: string; readonly sha256: string };
  type StoredFrame = { readonly thumb: StoredRef; readonly formats?: { readonly story: { readonly window: { readonly mask: StoredRef }; readonly layers: Record<string, unknown> } } };
  const layerRefs = (layers: Record<string, unknown>): readonly StoredRef[] =>
    Object.values(layers).flatMap((value) => {
      if (Array.isArray(value)) return value as StoredRef[];
      if (typeof value === 'object' && value !== null && 'src' in value) return [value as StoredRef];
      return typeof value === 'object' && value !== null ? (Object.values(value) as StoredRef[]) : [];
    });

  it('dix packs, dans l’ordre éditorial, l’Afrique éternelle d’abord, les hauts faits en dernier ; sans exemple hors PACK_SAMPLES=1', () => {
    const index = realIndex();
    expect(index.rejected).toBe(0);
    expect(index.entries('glory-frame').map((entry) => entry.slug)).toEqual(['afrique', 'egypte', 'olympe', 'celeste', 'nord', 'abysses', 'neon', 'moments', 'tresor', 'succes']);
  });

  it('les vignettes, masques, décors, passes, avant-plans et plaques de chaque contrat sont dans la liste blanche', () => {
    const index = realIndex();
    for (const entry of index.entries('glory-frame')) {
      const contract = JSON.parse(readFileSync(join(ASSETS, entry.contract.src), 'utf8')) as { frames: readonly StoredFrame[] };
      const refs = contract.frames.flatMap((frame) => [frame.thumb, ...(frame.formats === undefined ? [] : [frame.formats.story.window.mask, ...layerRefs(frame.formats.story.layers)])]);
      expect(refs.length).toBeGreaterThan(contract.frames.length * 3);
      expect(refs.filter((ref) => !index.isServedAsset(ref.src)).map((ref) => ref.src)).toEqual([]);
      expect(index.itemCount(entry)).toBe(contract.frames.length);
    }
  });

  it('un décor du registre se sert à l’octet, à son empreinte', async () => {
    const index = realIndex();
    const [afrique] = index.entries('glory-frame');
    const contract = JSON.parse(readFileSync(join(ASSETS, afrique.contract.src), 'utf8')) as { frames: readonly StoredFrame[] };
    const decor = contract.frames[0]?.formats?.story.layers.decor as StoredRef;
    const app = await buildApp({ index, assetsDir: ASSETS });
    try {
      const res = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${decor.src}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/webp');
      expect(createHash('sha256').update(res.rawPayload).digest('hex')).toBe(decor.sha256);
    } finally {
      await app.close();
    }
  });
});

describe('les fichiers d’une lens publiée (#11271)', () => {
  it('sert le fichier d’une lens publiée hors liste blanche, immuable, à son type ; 404 sinon, et jamais une autre extension', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const asked: string[] = [];
    const app = await buildApp({
      index: RETAINED_ONLY,
      assetsDir: tempAssets({}),
      lens: { approvedFile: async (src) => { asked.push(src); return src === 'abcdefabcdefabcd.png' ? { bytes: png, contentType: 'image/png' } : null; } },
    });
    try {
      const served = await app.inject({ method: 'GET', url: '/api/v1/pack-assets/abcdefabcdefabcd.png' });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['cache-control']).toBe(PACK_ASSETS_CACHE_CONTROL);
      expect(served.rawPayload.equals(png)).toBe(true);
      expect((await app.inject({ method: 'GET', url: '/api/v1/pack-assets/0000000000000000.png' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/v1/pack-assets/abcdefabcdefabcd.woff2' })).statusCode).toBe(404);
      expect(asked).not.toContain('abcdefabcdefabcd.woff2');
    } finally {
      await app.close();
    }
  });
});

describe('l’atlas de chaque pack de cadres — le pack se montre sans s’installer (#10275)', () => {
  it('l’atlas de chaque pack du registre réel est servi en WebP, immuable, aux octets déclarés', async () => {
    const index = realIndex();
    const app = await buildApp({ index, assetsDir: ASSETS });
    try {
      const entries = index.entries('glory-frame');
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect({ slug: entry.slug, preview: entry.preview === null ? null : 'atlas' }).toEqual({ slug: entry.slug, preview: 'atlas' });
        if (entry.preview === null) continue;
        const res = await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${entry.preview.src}` });
        expect({ slug: entry.slug, status: res.statusCode, type: res.headers['content-type'], cache: res.headers['cache-control'] }).toEqual({
          slug: entry.slug,
          status: 200,
          type: 'image/webp',
          cache: PACK_ASSETS_CACHE_CONTROL,
        });
        expect(createHash('sha256').update(res.rawPayload).digest('hex')).toBe(entry.preview.sha256);
      }
    } finally {
      await app.close();
    }
  });

  it('un aperçu au-delà de la borne n’entre pas dans la liste blanche : 404, même présent sur le disque', async () => {
    const real = realIndex().entries('glory-frame')[0];
    if (real === undefined) throw new Error('registre réel vide');
    const oversized = { src: 'abcdefabcdefabcd.webp', bytes: 262_145, sha256: 'abcdefabcdefabcd'.padEnd(64, '0') };
    const bounded = { src: 'bcdefabcdefabcde.webp', bytes: 262_144, sha256: 'bcdefabcdefabcde'.padEnd(64, '0') };
    const index = buildPackIndex({
      registries: [[{ ...real, slug: 'trop-lourd', preview: oversized }, { ...real, slug: 'a-la-borne', preview: bounded }]],
      retained: [],
    });
    const dir = tempAssets({ [oversized.src]: 'x', [bounded.src]: 'y' });
    const app = await buildApp({ index, assetsDir: dir });
    try {
      expect((await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${oversized.src}` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/api/v1/pack-assets/${bounded.src}` })).statusCode).toBe(200);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
