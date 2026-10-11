import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { packAssetUrl, sha256Hex } from '@/lib/packs/pack-asset-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FramePackShop, prepareFramePackShop } from './frame-pack-shop';

/**
 * **LA BOUTIQUE DES CADRES** (#10149, demande porteur 2026-10-11) — installer
 * un pack fait apparaître son ONGLET, le retirer le fait disparaître, chaque
 * cadre dit OÙ il s'utilise, et un ancien serveur rend une boutique vide sans
 * erreur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const ORIGIN = 'https://gate.test';
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
const revoked: string[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
  await prepareFramePackShop('fr');
  let next = 0;
  URL.createObjectURL = () => {
    next += 1;
    return `blob:cadre-${next}`;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

afterAll(async () => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  revoked.length = 0;
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 80 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const encoder = new TextEncoder();
const asset = async (bytes: Uint8Array<ArrayBuffer>, ext: string): Promise<{ ref: PackAssetRef; bytes: Uint8Array<ArrayBuffer> }> => {
  const sha256 = await sha256Hex(bytes.buffer);
  return { ref: { src: `${sha256.slice(0, 16)}.${ext}`, bytes: bytes.byteLength, sha256 }, bytes };
};

const summary = (installed: boolean) => ({
  slug: 'exemple-savane',
  name: 'Savane (exemple)',
  description: 'Quatre cadres Ambassadeur',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  coverUrl: null,
  installed,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  downloadBytes: { story: 48_000, square: null },
  removable: true,
  names: { fr: { name: 'Savane', description: 'Quatre cadres du rang Ambassadeur' } },
  preview: null,
  usage: { kind: 'rank', rank: 'ambassadeur' },
});

type Fixture = { deps: ConversationsDeps; fetcher: typeof fetch; calls: HttpRequest[] };

/** Une passerelle en mémoire : la boutique, les installés, le détail, l'installation — et les fichiers du pack. */
const gateway = async (options: { readonly absent?: boolean; readonly schema?: number; readonly installed?: boolean } = {}): Promise<Fixture> => {
  let installed = options.installed ?? false;
  const thumbs = await Promise.all([4, 3, 2, 1].map((division) => asset(new Uint8Array([division, 7, 7, 7]), 'webp')));
  const frames = [4, 3, 2, 1].map((division, index) => ({
    id: `exemple-savane.ambassadeur-${division}`,
    usage: { kind: 'rank', rank: 'ambassadeur', division },
    thumb: thumbs[index]!.ref,
    i18n: { name: `frame.ambassadeur-${division}` },
  }));
  const contract = await asset(encoder.encode(JSON.stringify({ schema: options.schema ?? 1, frames })), 'json');
  const strings = await asset(encoder.encode(JSON.stringify({ 'frame.ambassadeur-4': 'Ambassadeur IV — Savane' })), 'json');
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    [packAssetUrl(contract.ref.src, ORIGIN), contract.bytes],
    [packAssetUrl(strings.ref.src, ORIGIN), strings.bytes],
    ...thumbs.map((thumb) => [packAssetUrl(thumb.ref.src, ORIGIN), thumb.bytes] as const),
  ]);
  const calls: HttpRequest[] = [];
  const answer = (request: HttpRequest): ApiResult<unknown> => {
    if (options.absent === true) return { ok: false, status: 404, error: 'Not Found' };
    if (request.path === '/api/v1/packs/glory-frame') return { ok: true, data: [summary(installed)] };
    if (request.path === '/api/v1/packs/glory-frame/installed') return { ok: true, data: installed ? [summary(true)] : [] };
    if (request.path === '/api/v1/packs/glory-frame/exemple-savane/install') {
      installed = request.method === 'PUT';
      return { ok: true, data: summary(installed) };
    }
    if (request.path === '/api/v1/packs/glory-frame/exemple-savane') {
      return { ok: true, data: { ...summary(installed), contractSchema: 1, contract: contract.ref, strings: { fr: strings.ref }, collections: [] } };
    }
    return { ok: false, status: 404, error: 'Not Found' };
  };
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const fetcher = (async (url: string) => {
    const body = files.get(url);
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { deps: { source: 'gateway', transport }, fetcher, calls };
};

const mount = (fixture: Fixture) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <FramePackShop language="fr" deps={fixture.deps} assets={{ origin: ORIGIN, fetcher: fixture.fetcher, cacheStorage: null }} />
    </QueryClientProvider>,
  );

const tab = (host: HTMLElement, slug: string) => host.querySelector<HTMLElement>(`[data-frame-pack-tab="${slug}"]`);

describe('FramePackShop', () => {
  test('installer un pack fait apparaître son ONGLET ; le retirer le fait disparaître', async () => {
    const host = await mount(await gateway());
    await until(() => host.querySelector('[data-shop-toggle="exemple-savane"]') !== null);
    expect(tab(host, 'exemple-savane')).toBe(null);
    expect(host.querySelector('[data-shop-pack="exemple-savane"] h3')?.textContent).toBe('Savane');

    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]'));
    await until(() => tab(host, 'exemple-savane') !== null);
    expect(tab(host, 'exemple-savane')?.textContent).toBe('Savane');

    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]'));
    await until(() => tab(host, 'exemple-savane') === null);
  });

  test('hors d’une conversation (réglages, aucun --accent), « Installer » et l’onglet choisi restent peints : l’accent retombe sur la marque', async () => {
    const host = await mount(await gateway());
    await until(() => host.querySelector('[data-shop-toggle="exemple-savane"]') !== null);
    expect(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]')?.style.backgroundColor).toContain('var(--color-ios-brand)');
    expect(host.querySelector<HTMLElement>('[data-frame-shop-tab]')?.style.backgroundColor).toContain('var(--color-ios-brand)');
  });

  test('l’onglet d’un pack montre ses cadres, chacun avec son nom et OÙ il s’utilise', async () => {
    const host = await mount(await gateway({ installed: true }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelectorAll('[data-frame]').length === 4);

    const first = host.querySelector('[data-frame="exemple-savane.ambassadeur-4"]');
    expect(first?.querySelector('[data-frame-name]')?.textContent).toBe('Ambassadeur IV — Savane');
    expect(first?.querySelector('[data-frame-usage]')?.textContent).toBe('Rang Ambassadeur IV uniquement');
    expect(host.querySelector('[data-frame="exemple-savane.ambassadeur-1"] [data-frame-usage]')?.textContent).toBe('Rang Ambassadeur I uniquement');
    await until(() => first?.querySelector('img')?.getAttribute('src')?.startsWith('blob:') === true);
  });

  test('l’URL d’objet d’une vignette est révoquée au démontage', async () => {
    const host = await mount(await gateway({ installed: true }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelectorAll('[data-frame] img[src^="blob:"]').length === 4);
    const shown = Array.from(host.querySelectorAll('[data-frame] img')).map((img) => img.getAttribute('src'));
    mounter.unmountAll();
    expect([...revoked].sort()).toEqual([...shown].sort());
  });

  test('un contrat d’une version inconnue dit « Mettre à jour Meeshy » et ne télécharge aucune vignette', async () => {
    const host = await mount(await gateway({ installed: true, schema: 2 }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelector('[data-frame-pack-update]') !== null);
    expect(host.querySelectorAll('[data-frame]').length).toBe(0);
  });

  test('un ANCIEN serveur (404 sur /packs/…) rend une boutique vide, sans erreur', async () => {
    const host = await mount(await gateway({ absent: true }));
    await until(() => host.querySelector('[data-pack-shop-empty]') !== null);
    expect(host.querySelector('[data-pack-shop] [role="status"]')?.textContent).toBe('');
    expect(host.querySelectorAll('[data-frame-pack-tab]').length).toBe(0);
  });
});
