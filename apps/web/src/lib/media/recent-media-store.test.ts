import { describe, expect, test } from 'bun:test';

import { SW_RECENT_MEDIA_CACHE } from '../sw-caches';
import { RECENT_MEDIA_STORED_AT_HEADER } from './recent-media-policy';
import { rememberRecentMedia, type RecentMediaDeps } from './recent-media-store';

/**
 * #11326 — LA PAGE GARDE LE FICHIER ENTIER D'UN MÉDIA VU, une fois, sur le
 * Wi-Fi, et le seau reste borné. Le worker (`sw-recent-media.js`) ne fait que
 * le RESSERVIR : il n'écrit jamais, donc rien n'y entre sans cette loi.
 */
const SRC = 'https://gate.meeshy.me/api/v1/attachments/file/reel.mp4';
const NOW = Date.parse('2026-10-23T12:00:00Z');
const MB = 1024 * 1024;

function fakeWorld(options: { readonly seeded?: ReadonlyMap<string, Response>; readonly response?: () => Response } = {}) {
  const entries = new Map<string, Response>(options.seeded ?? []);
  const fetched: { readonly url: string; readonly init: RequestInit | undefined }[] = [];
  const opened: string[] = [];
  const cache = {
    match: async (url: string) => entries.get(url)?.clone(),
    put: async (url: string, response: Response) => {
      entries.set(url, response);
    },
    delete: async (url: string) => entries.delete(url),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  };
  const deps: RecentMediaDeps = {
    caches: {
      open: async (name: string) => {
        opened.push(name);
        return cache;
      },
    },
    fetch: async (url: string, init?: RequestInit) => {
      fetched.push({ url, init });
      return (options.response ?? (() => new Response(new Uint8Array(10), { status: 200, headers: { 'Content-Length': '10', 'Content-Type': 'video/mp4' } })))();
    },
    now: () => NOW,
    connection: () => ({ type: 'wifi' }),
  };
  return { deps, entries, fetched, opened };
}

const old = (ageMs: number, bytes: number) =>
  new Response(null, { headers: { 'Content-Length': String(bytes), [RECENT_MEDIA_STORED_AT_HEADER]: String(NOW - ageMs) } });

describe('rememberRecentMedia — le fichier entier, gardé une fois', () => {
  test('un réel vu sur le Wi-Fi est téléchargé ENTIER et rangé, daté', async () => {
    const world = fakeWorld();
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, world.deps)).toBe('stored');
    expect(world.opened).toEqual([SW_RECENT_MEDIA_CACHE]);
    expect(world.fetched).toHaveLength(1);
    expect(new Headers(world.fetched[0]?.init?.headers).get('Range')).toBeNull();
    expect(world.entries.get(SRC)?.headers.get(RECENT_MEDIA_STORED_AT_HEADER)).toBe(String(NOW));
    expect(world.entries.get(SRC)?.headers.get('Content-Type')).toBe('video/mp4');
  });

  test('déjà gardé : aucun second téléchargement', async () => {
    const world = fakeWorld({ seeded: new Map([[SRC, old(1000, 10)]]) });
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, world.deps)).toBe('already');
    expect(world.fetched).toHaveLength(0);
  });

  test('un média protégé ne déclenche AUCUNE requête', async () => {
    const world = fakeWorld();
    expect(await rememberRecentMedia({ src: SRC, protection: 'protected' }, world.deps)).toBe('protected');
    expect(world.fetched).toHaveLength(0);
    expect(world.opened).toHaveLength(0);
  });

  test('la passerelle dit no-store : rien n’est rangé (#9478)', async () => {
    const world = fakeWorld({ response: () => new Response('x', { status: 200, headers: { 'Content-Length': '1', 'Cache-Control': 'private, no-store' } }) });
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, world.deps)).toBe('refused');
    expect(world.entries.has(SRC)).toBe(false);
  });

  test('pour faire place, le plus ancien sort ; l’expiré aussi', async () => {
    const seeded = new Map([
      ['https://g/a.mp4', old(80 * 3_600_000, MB)],
      ['https://g/b.mp4', old(10 * 3_600_000, 499 * MB)],
      ['https://g/c.mp4', old(1 * 3_600_000, 1 * MB)],
    ]);
    const world = fakeWorld({ seeded, response: () => new Response(new Uint8Array(4), { status: 200, headers: { 'Content-Length': String(5 * MB) } }) });
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, world.deps)).toBe('stored');
    expect([...world.entries.keys()].sort()).toEqual(['https://g/c.mp4', SRC].sort());
  });

  test('un réseau qui échoue ne lève rien : le lecteur regarde, la garde est perdue', async () => {
    const world = fakeWorld({
      response: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, world.deps)).toBe('failed');
  });

  test('sans Cache Storage (navigateur ancien, iOS de la coque) : rien, sans exception', async () => {
    expect(await rememberRecentMedia({ src: SRC, protection: 'none' }, { ...fakeWorld().deps, caches: undefined })).toBe('unavailable');
  });
});
