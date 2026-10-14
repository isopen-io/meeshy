import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { loadInstalledWallpaperSlugs } from './packs-wallpaper';

const depsFor = (status: number, body: unknown) => {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { urls, deps: { source: 'gateway', transport: createHttpTransport({ base: '', fetchImpl }) } as const };
};

describe('les packs de fonds installés', () => {
  test('lit /packs/wallpaper/installed et rend les identifiants', async () => {
    const { urls, deps } = depsFor(200, { success: true, data: [{ slug: 'heritages' }, { nope: 1 }, { slug: 'illustrations' }] });
    expect([...((await loadInstalledWallpaperSlugs(deps)) ?? [])]).toEqual(['heritages', 'illustrations']);
    expect(urls).toEqual(['/api/v1/packs/wallpaper/installed']);
  });

  test('un ancien serveur (404) est une boutique vide, pas une erreur', async () => {
    const { deps } = depsFor(404, { success: false, error: 'Not found' });
    expect([...((await loadInstalledWallpaperSlugs(deps)) ?? ['échec'])]).toEqual([]);
  });

  test('une panne rend null : le sélecteur garde ses défauts', async () => {
    const { deps } = depsFor(500, { success: false, error: 'x' });
    expect(await loadInstalledWallpaperSlugs(deps)).toBeNull();
  });
});
