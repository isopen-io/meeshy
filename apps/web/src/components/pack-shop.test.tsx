import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerPackDetail, StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { INSTALLED_PACKS_QUERY_KEY, PACK_CATALOGUE_QUERY_KEY, resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { STICKERS_QUERY_KEY } from '@/lib/api/stickers';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { stickerShopAdapter } from './composer-sticker-shop';
import { ComposerStickerSheet } from './composer-sticker-sheet';
import { PackShop } from './pack-shop';

/**
 * **LA BOUTIQUE GÉNÉRIQUE, CÔTÉ STICKERS** (#10149) — un pack d'un TIERS
 * installé depuis la boutique devient un ONGLET de la feuille de stickers ;
 * un geste en vol par pack ; un refus rétablit tout.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  resetFixturePacksForTests();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 50 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const community: StickerPackSummary = {
  slug: 'exemple-meeshy',
  name: 'Exemple Meeshy',
  description: 'Quatre stickers animés',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  kinds: ['cinematic'],
  coverUrl: null,
  installed: false,
  installCount: 0,
};

type Answer = (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const gatewayDeps = (answer: Answer): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return (await answer(request)) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const mountShop = (deps: ConversationsDeps) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <PackShop adapter={stickerShopAdapter('fr', deps)} language="fr" hint="" />
    </QueryClientProvider>,
  );

const installedSlugs = () => appQueryClient.getQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY)?.map((pack) => pack.slug) ?? [];

describe('PackShop × stickers', () => {
  test('installer un pack d’un tiers dont le détail ne se lit pas GARDE son onglet dans la feuille', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [community]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const { deps } = gatewayDeps((request) =>
      request.method === 'PUT' ? { ok: true, data: { ...community, installed: true } } : { ok: false, status: 503, error: 'indisponible' },
    );
    const shop = await mountShop(deps);
    await mounter.click(shop.querySelector<HTMLElement>('[data-shop-toggle="exemple-meeshy"]'));
    await until(() => shop.querySelector('[data-shop-toggle="exemple-meeshy"]')?.getAttribute('aria-busy') === 'false');
    expect(installedSlugs()).toEqual(['exemple-meeshy']);

    const sheet = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <ComposerStickerSheet onPick={() => {}} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(sheet.querySelector('[data-sticker-tab="exemple-meeshy"]')?.textContent).toBe('Exemple Meeshy');
  });

  test('le détail arrivé remplit l’onglet de ses stickers', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [community]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    const item = { key: 'coucou', title: 'Coucou', emoji: '👋', kind: 'cinematic', mimeType: 'image/webp', fileUrl: 'sticker-packs/x/coucou.webp', width: 512, height: 512, zones: [] };
    const { deps } = gatewayDeps((request) =>
      request.method === 'PUT' ? { ok: true, data: { ...community, installed: true } } : { ok: true, data: { ...community, installed: true, items: [item] } },
    );
    const shop = await mountShop(deps);
    await mounter.click(shop.querySelector<HTMLElement>('[data-shop-toggle="exemple-meeshy"]'));
    await until(() => (appQueryClient.getQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY)?.[0]?.items.length ?? 0) === 1);
  });

  test('un double toucher ne part qu’UNE fois tant que le premier geste vole', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [community]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, calls } = gatewayDeps(async (request) => {
      if (request.method === 'GET') return { ok: false, status: 503, error: 'indisponible' };
      await gate;
      return { ok: true, data: { ...community, installed: true } };
    });
    const shop = await mountShop(deps);
    const button = shop.querySelector<HTMLElement>('[data-shop-toggle="exemple-meeshy"]');
    await mounter.click(button);
    await mounter.click(button);
    expect(calls.filter((call) => call.method !== 'GET').length).toBe(1);
    release();
    await until(() => shop.querySelector('[data-shop-toggle="exemple-meeshy"]')?.getAttribute('aria-busy') === 'false');
  });

  test('un refus rétablit la boutique et les onglets, et le DIT', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [community]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    const { deps } = gatewayDeps(() => ({ ok: false, status: 500, error: 'Boom' }));
    const shop = await mountShop(deps);
    await mounter.click(shop.querySelector<HTMLElement>('[data-shop-toggle="exemple-meeshy"]'));
    await until(() => shop.querySelector('[role="status"]')?.textContent !== '');
    expect(installedSlugs()).toEqual([]);
    expect(shop.querySelector('[data-shop-toggle="exemple-meeshy"]')?.getAttribute('aria-pressed')).toBe('false');
  });
});
