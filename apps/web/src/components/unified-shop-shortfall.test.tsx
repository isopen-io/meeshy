import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UnifiedShop } from './unified-shop';

/**
 * #20527 (tranche web de #17378) — UN PACK TROP CHER DIT CE QUI MANQUE ET LE
 * CHEMIN. Avant ce lot, le joueur ne l'apprenait qu'après l'achat refusé
 * (`INSUFFICIENT_MEESHES`), sans savoir où trouver des Meeshes. La rangée et la
 * fiche disent l'écart au solde servi, et mènent à la frappe (l'Héritage).
 * « Acheter » reste offert : le serveur reste juge.
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
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 80 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const gatewayDeps = (answer: (request: HttpRequest) => ApiResult<unknown>): ConversationsDeps => {
  const transport = { request: async <T,>(request: HttpRequest) => answer(request) as ApiResult<T> } as unknown as HttpTransport;
  return { source: 'gateway', transport };
};

const pack = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: `Pack ${slug}`, installed: false, ...extra });
const shopOf = (domain: 'wallpaper' | 'sticker', packs: readonly unknown[], balance: number | null) => ({
  ok: true as const,
  data: { domains: [{ domain, packs }], ...(balance === null ? {} : { balance }) },
});

const mountShop = (deps: ConversationsDeps, initialDomain: 'wallpaper' | 'sticker') =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <UnifiedShop language="fr" deps={deps} initialDomain={initialDomain} />
    </QueryClientProvider>,
  );

const rowOf = (host: HTMLElement, slug: string) => host.querySelector<HTMLElement>(`[data-shop-pack="${slug}"]`);

describe('UnifiedShop — les Meeshes qui manquent', () => {
  test('un pack plus cher que le solde : l’écart, le chemin vers la frappe, et « Acheter » reste', async () => {
    const host = await mountShop(gatewayDeps(() => shopOf('wallpaper', [pack('w1', { price: 5, owned: false })], 2)), 'wallpaper');
    await until(() => rowOf(host, 'wallpaper:w1')?.querySelector('[data-shop-short]') != null);
    const row = rowOf(host, 'wallpaper:w1')!;
    expect(row.querySelector('[data-shop-short]')?.textContent).toBe('Il vous manque 3 Meeshes');
    const earn = row.querySelector<HTMLAnchorElement>('a[data-shop-earn]');
    expect(earn?.textContent).toBe('Frapper des Meeshes');
    expect(earn?.getAttribute('href')).toBe('/me/progression/concept/meesh');
    expect(row.querySelector('[data-shop-buy="wallpaper:w1"]')?.textContent).toContain('Acheter');
  });

  test('une seule Meesh manque : le singulier', async () => {
    const host = await mountShop(gatewayDeps(() => shopOf('wallpaper', [pack('w1', { price: 1, owned: false })], 0)), 'wallpaper');
    await until(() => rowOf(host, 'wallpaper:w1')?.querySelector('[data-shop-short]') != null);
    expect(rowOf(host, 'wallpaper:w1')!.querySelector('[data-shop-short]')?.textContent).toBe('Il vous manque 1 Meesh');
  });

  test('solde suffisant, pack possédé ou gratuit : rien de neuf', async () => {
    const host = await mountShop(
      gatewayDeps(() =>
        shopOf('wallpaper', [pack('w1', { price: 5, owned: false }), pack('w2', { price: 50, owned: true }), pack('w3', { price: null, owned: false })], 5),
      ),
      'wallpaper',
    );
    await until(() => rowOf(host, 'wallpaper:w3') !== null);
    expect(host.querySelector('[data-shop-short]')).toBeNull();
    expect(host.querySelector('[data-shop-earn]')).toBeNull();
  });

  test('solde inconnu (ancien serveur) : rien, le serveur reste juge', async () => {
    const host = await mountShop(gatewayDeps(() => shopOf('wallpaper', [pack('w1', { price: 5, owned: false })], null)), 'wallpaper');
    await until(() => rowOf(host, 'wallpaper:w1') !== null);
    expect(host.querySelector('[data-shop-short]')).toBeNull();
  });

  test('la fiche d’un pack sans éditeur propre dit aussi l’écart et le chemin', async () => {
    const host = await mountShop(gatewayDeps(() => shopOf('sticker', [pack('s1', { price: 10, owned: false })], 4)), 'sticker');
    await until(() => host.querySelector('[data-shop-open="sticker:s1"]') !== null);
    await act(async () => host.querySelector<HTMLElement>('[data-shop-open="sticker:s1"]')!.click());
    await until(() => document.querySelector('[data-pack-details="sticker:s1"]') !== null);
    const sheet = document.querySelector<HTMLElement>('[data-pack-details="sticker:s1"]')!;
    expect(sheet.querySelector('[data-shop-short]')?.textContent).toBe('Il vous manque 6 Meeshes');
    expect(sheet.querySelector('a[data-shop-earn]')?.getAttribute('href')).toBe('/me/progression/concept/meesh');
  });
});
