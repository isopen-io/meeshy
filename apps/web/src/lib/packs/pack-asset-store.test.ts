import { describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import { SW_PACK_ASSETS_CACHE, isAppOwnedCache } from '@/lib/sw-caches';

import { PACK_ASSETS_CACHE, packAssetUrl, readPackAssetBlob, readPackAssetJson, sha256Hex } from './pack-asset-store';

const ORIGIN = 'https://gate.test';

const refOf = async (bytes: Uint8Array<ArrayBuffer>, ext: string): Promise<PackAssetRef> => {
  const sha256 = await sha256Hex(bytes.buffer);
  return { src: `${sha256.slice(0, 16)}.${ext}`, bytes: bytes.byteLength, sha256 };
};

/** Un Cache Storage en mémoire — assez pour `open`, `match`, `put`, `delete`. */
const memoryCaches = () => {
  const buckets = new Map<string, Map<string, Response>>();
  const storage = {
    open: async (name: string) => {
      const bucket = buckets.get(name) ?? new Map<string, Response>();
      buckets.set(name, bucket);
      return {
        match: async (url: string) => bucket.get(url)?.clone(),
        put: async (url: string, response: Response) => {
          bucket.set(url, response);
        },
        delete: async (url: string) => bucket.delete(url),
      };
    },
  } as unknown as CacheStorage;
  return { storage, buckets };
};

const fetcherServing = (served: ReadonlyMap<string, Uint8Array<ArrayBuffer>>) => {
  const calls: { url: string; mode: RequestMode | undefined }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, mode: init?.mode });
    const body = served.get(url);
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
};

describe('le magasin des fichiers de packs', () => {
  test('l’adresse d’un fichier est /api/v1/pack-assets/<src> sur l’ORIGINE de la passerelle', () => {
    expect(packAssetUrl('0123456789abcdef.webp', 'https://gate.test/')).toBe('https://gate.test/api/v1/pack-assets/0123456789abcdef.webp');
  });

  test('un fichier lu en CORS, vérifié, est rangé dans son seau et relu sans réseau', async () => {
    const bytes = new TextEncoder().encode('{"schema":1}');
    const ref = await refOf(bytes, 'json');
    const url = packAssetUrl(ref.src, ORIGIN);
    const { fetcher, calls } = fetcherServing(new Map([[url, bytes]]));
    const { storage, buckets } = memoryCaches();
    const deps = { origin: ORIGIN, fetcher, cacheStorage: storage };

    expect(await readPackAssetJson(ref, deps)).toEqual({ schema: 1 });
    expect(calls).toEqual([{ url, mode: 'cors' }]);
    expect(buckets.get(PACK_ASSETS_CACHE)?.has(url)).toBe(true);

    expect(await readPackAssetJson(ref, deps)).toEqual({ schema: 1 });
    expect(calls.length).toBe(1);
  });

  test('des octets dont l’empreinte ne correspond pas ne se montrent PAS et ne se rangent pas', async () => {
    const ref = await refOf(new TextEncoder().encode('vrai'), 'webp');
    const url = packAssetUrl(ref.src, ORIGIN);
    const { fetcher } = fetcherServing(new Map([[url, new TextEncoder().encode('faux')]]));
    const { storage, buckets } = memoryCaches();
    expect(await readPackAssetBlob(ref, { origin: ORIGIN, fetcher, cacheStorage: storage })).toBe(null);
    expect(buckets.get(PACK_ASSETS_CACHE)?.has(url) ?? false).toBe(false);
  });

  test('une vignette rend un Blob typé, même sans Cache Storage', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await refOf(bytes, 'webp');
    const { fetcher } = fetcherServing(new Map([[packAssetUrl(ref.src, ORIGIN), bytes]]));
    const blob = await readPackAssetBlob(ref, { origin: ORIGIN, fetcher, cacheStorage: null });
    expect(blob?.type).toBe('image/webp');
    expect(blob?.size).toBe(4);
  });

  test('un fichier absent du serveur rend null, sans lever', async () => {
    const ref = await refOf(new Uint8Array([9]), 'webp');
    const { fetcher } = fetcherServing(new Map());
    expect(await readPackAssetBlob(ref, { origin: ORIGIN, fetcher, cacheStorage: null })).toBe(null);
  });

  test('le seau n’appartient pas aux purges de compte ni de mise à jour', () => {
    expect(PACK_ASSETS_CACHE).toBe('meeshy-pack-assets');
    expect(PACK_ASSETS_CACHE).toBe(SW_PACK_ASSETS_CACHE);
    expect(isAppOwnedCache(PACK_ASSETS_CACHE)).toBe(false);
  });
});

describe('le magasin sans réseau et la demande (#10159)', () => {
  test('bucketOnly ne touche jamais le réseau : un fichier absent du seau rend null, sans requête', async () => {
    const { bucketOnly, readPackAssetBlob: read } = await import('./pack-asset-store');
    const bytes = new TextEncoder().encode('couche') as Uint8Array<ArrayBuffer>;
    const ref = await refOf(bytes, 'webp');
    const net = fetcherServing(new Map([[packAssetUrl(ref.src, ORIGIN), bytes]]));
    const { storage } = memoryCaches();
    expect(await read(ref, bucketOnly({ origin: ORIGIN, fetcher: net.fetcher, cacheStorage: storage }))).toBeNull();
    expect(net.calls).toEqual([]);
  });

  test('warmPackAssets range les fichiers dans le seau, un à la fois, et la lecture sans réseau les retrouve', async () => {
    const { bucketOnly, warmPackAssets, readPackAssetBlob: read } = await import('./pack-asset-store');
    const a = new TextEncoder().encode('a') as Uint8Array<ArrayBuffer>;
    const b = new TextEncoder().encode('bb') as Uint8Array<ArrayBuffer>;
    const [refA, refB] = [await refOf(a, 'webp'), await refOf(b, 'webp')];
    const net = fetcherServing(new Map([[packAssetUrl(refA.src, ORIGIN), a], [packAssetUrl(refB.src, ORIGIN), b]]));
    const { storage } = memoryCaches();
    const deps = { origin: ORIGIN, fetcher: net.fetcher, cacheStorage: storage };
    await warmPackAssets([refA, refB, refA], deps);
    expect(net.calls.map((call) => call.url)).toEqual([packAssetUrl(refA.src, ORIGIN), packAssetUrl(refB.src, ORIGIN)]);
    expect(await (await read(refA, bucketOnly(deps)))?.text()).toBe('a');
    expect(await (await read(refB, bucketOnly(deps)))?.text()).toBe('bb');
  });

  test('un fichier qui ne se vérifie pas n’entre pas dans le seau, et la demande ne lève pas', async () => {
    const { bucketOnly, warmPackAssets, readPackAssetBlob: read } = await import('./pack-asset-store');
    const bytes = new TextEncoder().encode('vrai') as Uint8Array<ArrayBuffer>;
    const ref = await refOf(bytes, 'webp');
    const net = fetcherServing(new Map([[packAssetUrl(ref.src, ORIGIN), new TextEncoder().encode('faux') as Uint8Array<ArrayBuffer>]]));
    const { storage } = memoryCaches();
    const deps = { origin: ORIGIN, fetcher: net.fetcher, cacheStorage: storage };
    await warmPackAssets([ref], deps);
    expect(await read(ref, bucketOnly(deps))).toBeNull();
  });
});
