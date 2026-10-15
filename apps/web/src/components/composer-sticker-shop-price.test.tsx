import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { INSTALLED_PACKS_QUERY_KEY, PACK_CATALOGUE_QUERY_KEY, decodePackSummary, resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { stickerShopAdapter } from './composer-sticker-shop';
import { PackShop } from './pack-shop';

/** **LE PRIX ET LA POSSESSION D'UN PACK DE STICKERS** (#10660) — mêmes règles que la vitrine unique. */

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

const pack = (slug: string, extra: Partial<StickerPackSummary> = {}): StickerPackSummary => ({
  slug,
  name: slug,
  description: 'desc',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  kinds: ['static'],
  coverUrl: null,
  installed: false,
  installCount: 0,
  ...extra,
});

const deps = (answer: (request: HttpRequest) => ApiResult<unknown>): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const mountShop = (shopDeps: ConversationsDeps) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <PackShop adapter={stickerShopAdapter('fr', shopDeps)} language="fr" hint="" />
    </QueryClientProvider>,
  );

describe('boutique des stickers × prix et possession', () => {
  test('le décodeur lit price et owned, et reste compatible sans eux', () => {
    const wire = { ...pack('payant'), price: 120, owned: false };
    expect(decodePackSummary(wire)).toMatchObject({ price: 120, owned: false });
    expect(decodePackSummary(pack('gratuit'))?.price).toBeUndefined();
  });

  test('un pack payant non possédé propose « Acheter » avec son prix', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [pack('payant', { price: 120, owned: false })]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    const shop = await mountShop(deps(() => ({ ok: false, status: 503, error: 'x' })).deps);
    expect(shop.querySelector('[data-shop-buy="payant"]')?.textContent).toContain('120');
  });

  test('un pack payant possédé dit « Possédé » et s’installe sans achat', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [pack('paye', { price: 120, owned: true })]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    const shop = await mountShop(deps(() => ({ ok: false, status: 503, error: 'x' })).deps);
    expect(shop.querySelector('[data-shop-buy]')).toBeNull();
    expect(shop.querySelector('[data-shop-pack="paye"]')?.textContent).toContain('Possédé');
  });

  test('un pack gratuit garde son affichage', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [pack('gratuit')]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    const shop = await mountShop(deps(() => ({ ok: false, status: 503, error: 'x' })).deps);
    expect(shop.querySelector('[data-shop-buy]')).toBeNull();
    expect(shop.querySelector('[data-shop-pack="gratuit"]')?.textContent).not.toContain('Possédé');
  });

  /** Au GESTE, le pack passe possédé sans attendre le réseau (optimiste) ; un refus le rend à « Acheter ». */
  test('acheter : « Possédé » au geste, et retour à « Acheter » si le serveur refuse', async () => {
    appQueryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, [pack('payant', { price: 120, owned: false })]);
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, []);
    let answer: (value: ApiResult<unknown>) => void = () => undefined;
    const pending = new Promise<ApiResult<unknown>>((resolve) => {
      answer = resolve;
    });
    const transport = { request: async () => pending } as unknown as HttpTransport;
    const shop = await mountShop({ source: 'gateway', transport });
    await act(async () => {
      shop.querySelector<HTMLButtonElement>('[data-shop-buy="payant"]')?.click();
    });
    expect(appQueryClient.getQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY)?.[0]?.owned).toBe(true);
    expect(shop.querySelector('[data-shop-buy="payant"]')).toBeNull();
    await act(async () => {
      answer({ ok: false, status: 409, error: 'x', code: 'INSUFFICIENT_MEESHES' });
      await pending;
    });
    expect(appQueryClient.getQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY)?.[0]?.owned).toBe(false);
    expect(shop.querySelector('[data-shop-buy="payant"]')).not.toBeNull();
  });
});
