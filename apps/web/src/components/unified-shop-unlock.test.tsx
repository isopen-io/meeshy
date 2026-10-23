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
 * W18 (#11324) — LA BOUTIQUE MONTRE CE QUI RESTE À DÉBLOQUER. Un pack
 * récompensé ou à fenêtre, non possédé, porte `requirementPreview` (S21) : la
 * rangée dit ce qui manque, et n'offre ni « Installer » ni « Acheter » tant que
 * l'aperçu n'est pas rempli — le serveur le refuserait.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
  await loadStickerPacksCatalog('en');
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

const pack = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: `Pack ${slug}`, installed: false, ...extra });
const shopOf = (packs: readonly unknown[], balance = 50) => ({ ok: true as const, data: { domains: [{ domain: 'wallpaper', packs }], balance } });


const season = (met: boolean) => ({ met, reward: { kind: 'season', number: 3, met }, window: null });

describe('UnifiedShop — ce qui reste à débloquer', () => {
  test('un pack récompensé non possédé : la ligne de déblocage, et aucun geste', async () => {
    const { deps } = gatewayDeps(() => shopOf([pack('w1', { owned: false, requirementPreview: season(false) })]));
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    const row = host.querySelector('[data-shop-pack="wallpaper:w1"]')!;
    expect(row.querySelector('[data-shop-unlock]')?.textContent).toBe('Récompense de la saison 3');
    expect(row.querySelector('[data-shop-locked]')?.textContent).toBe('À débloquer');
    expect(buyButton(host)).toBeNull();
  });

  test('un pack payant à fenêtre ouverte reste achetable, et dit sa fin', async () => {
    const { deps } = gatewayDeps(() =>
      shopOf([pack('w1', { price: 30, owned: false, requirementPreview: { met: true, reward: null, window: { state: 'open', endsAt: '2026-11-30T00:00:00.000Z' } } })]),
    );
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(host.querySelector('[data-shop-unlock]')?.textContent).toBe('Disponible jusqu’au 30 novembre');
    expect(buyButton(host)?.textContent).toContain('Acheter');
  });

  test('un ancien serveur (aucun aperçu, aucun owned) : la rangée d’avant', async () => {
    const { deps } = gatewayDeps(() => shopOf([pack('w1')]));
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(host.querySelector('[data-shop-unlock]')).toBeNull();
    expect(buyButton(host)?.textContent).toBe('Installer');
  });
});
