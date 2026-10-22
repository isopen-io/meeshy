import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { RECENT_MEDIA_POLICY, RECENT_MEDIA_STORED_AT_HEADER } from './lib/media/recent-media-policy';
import { SW_RECENT_MEDIA_CACHE } from './lib/sw-caches';

/**
 * #11326 — LE SEAU « RÉCENTS » SERT LES PLAGES DEPUIS LE CACHE. Un `<video>`
 * demande d'emblée un `Range` ; le worker le découpe dans le fichier ENTIER
 * gardé, hors ligne compris. Le script est CLASSIQUE (importé par le worker
 * du web, inscrit seul dans la coque) : le témoin l'évalue tel quel.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(join(APP, 'public/sw-recent-media.js'), 'utf8');
const SRC = 'https://gate.meeshy.me/api/v1/attachments/file/reel.mp4';
const NOW = Date.parse('2026-10-23T12:00:00Z');
const BYTES = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

type FetchEvent = { readonly request: Request; respondWith(response: Promise<Response>): void };

function stored(options: { readonly ageMs?: number; readonly cacheControl?: string } = {}): Response {
  return new Response(BYTES, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(BYTES.length),
      'Cache-Control': options.cacheControl ?? 'private, max-age=31536000',
      [RECENT_MEDIA_STORED_AT_HEADER]: String(NOW - (options.ageMs ?? 0)),
    },
  });
}

function load(entries: ReadonlyMap<string, Response>) {
  const listeners: ((event: FetchEvent) => void)[] = [];
  const network: string[] = [];
  const deleted: string[] = [];
  const opened: string[] = [];
  const cache = {
    match: async (url: string) => entries.get(url)?.clone(),
    delete: async (url: string) => {
      deleted.push(url);
      return true;
    },
  };
  const self = { addEventListener: (type: string, listener: (event: FetchEvent) => void) => type === 'fetch' && listeners.push(listener) };
  const caches = {
    open: async (name: string) => {
      opened.push(name);
      return cache;
    },
  };
  const fetch = async (request: Request) => {
    network.push(request.headers.get('Range') ?? 'entier');
    return new Response('réseau', { status: 206 });
  };
  new Function('self', 'caches', 'fetch', 'Date', SCRIPT)(self, caches, fetch, { now: () => NOW });
  const dispatch = async (request: Request): Promise<Response | undefined> => {
    let answer: Promise<Response> | undefined;
    for (const listener of listeners) listener({ request, respondWith: (response) => (answer = response) });
    return answer;
  };
  return { dispatch, network, deleted, opened };
}

const media = (destination: 'video' | 'audio' | 'image', range?: string): Request => {
  const request = new Request(SRC, { headers: range === undefined ? {} : { Range: range } });
  Object.defineProperty(request, 'destination', { value: destination });
  return request;
};

describe('sw-recent-media.js — les plages servies depuis le seau « récents »', () => {
  test('le nom du seau et la durée de vie sont ceux de la page (jumeaux)', () => {
    expect(SCRIPT).toContain(`'${SW_RECENT_MEDIA_CACHE}'`);
    expect(SCRIPT).toContain(`'${RECENT_MEDIA_STORED_AT_HEADER}'`);
    expect(SCRIPT).toContain(String(RECENT_MEDIA_POLICY.maxAgeMs));
  });

  test('une plage demandée est découpée dans le fichier gardé : 206, Content-Range, les bons octets', async () => {
    const worker = load(new Map([[SRC, stored()]]));
    const response = await worker.dispatch(media('video', 'bytes=10-19'));
    expect(response?.status).toBe(206);
    expect(response?.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(response?.headers.get('Content-Length')).toBe('10');
    expect([...new Uint8Array(await response!.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(worker.network).toEqual([]);
    expect(worker.opened).toEqual([SW_RECENT_MEDIA_CACHE]);
  });

  test('une plage ouverte (bytes=90-) va jusqu’à la fin', async () => {
    const worker = load(new Map([[SRC, stored()]]));
    const response = await worker.dispatch(media('audio', 'bytes=90-'));
    expect(response?.headers.get('Content-Range')).toBe('bytes 90-99/100');
    expect(new Uint8Array(await response!.arrayBuffer()).length).toBe(10);
  });

  test('sans plage, le fichier entier, 200', async () => {
    const worker = load(new Map([[SRC, stored()]]));
    const response = await worker.dispatch(media('video'));
    expect(response?.status).toBe(200);
    expect(new Uint8Array(await response!.arrayBuffer()).length).toBe(100);
  });

  test('une plage hors du fichier rend 416', async () => {
    const worker = load(new Map([[SRC, stored()]]));
    const response = await worker.dispatch(media('video', 'bytes=200-300'));
    expect(response?.status).toBe(416);
    expect(response?.headers.get('Content-Range')).toBe('bytes */100');
  });

  test('absent du seau : la requête part au réseau, telle quelle', async () => {
    const worker = load(new Map());
    const response = await worker.dispatch(media('video', 'bytes=0-'));
    expect(response?.status).toBe(206);
    expect(worker.network).toEqual(['bytes=0-']);
  });

  test('plus vieux que trois jours : retiré, et la requête part au réseau', async () => {
    const worker = load(new Map([[SRC, stored({ ageMs: RECENT_MEDIA_POLICY.maxAgeMs + 1 })]]));
    await worker.dispatch(media('video', 'bytes=0-'));
    expect(worker.deleted).toEqual([SRC]);
    expect(worker.network).toEqual(['bytes=0-']);
  });

  test('une entrée no-store / no-cache n’est jamais resservie (#9478)', async () => {
    const worker = load(new Map([[SRC, stored({ cacheControl: 'private, no-store' })]]));
    await worker.dispatch(media('video'));
    expect(worker.network).toEqual(['entier']);
  });

  test('une image n’est pas l’affaire de ce seau : le worker ne répond pas', async () => {
    const worker = load(new Map([[SRC, stored()]]));
    expect(await worker.dispatch(media('image'))).toBeUndefined();
  });
});
