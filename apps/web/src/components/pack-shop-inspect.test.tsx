import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PackShop, type PackInspection, type PackShopAdapter } from './pack-shop';

/**
 * **OUVRIR UN PACK DEPUIS LA BOUTIQUE** (#16267) — toucher la rangée ouvre la
 * fiche du pack ; toucher sa couverture ouvre DIRECTEMENT le plein écran. Les
 * deux reçoivent le geste Installer / Retirer de la boutique, optimiste.
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
  for (let i = 0; i < 50 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

type Pack = { readonly slug: string; readonly installed: boolean; readonly openable: boolean };

const seen: { current: PackInspection<Pack> | null } = { current: null };

const adapterOf = (answer: () => Promise<ApiResult<unknown>>): PackShopAdapter<Pack> => ({
  domain: 'test',
  catalogueKey: ['test', 'catalogue'],
  installedKey: ['test', 'installed'],
  loadCatalogue: async () => ({ ok: true, data: [] }),
  setInstalled: answer,
  applyInstalled: () => undefined,
  title: (pack) => `Pack ${pack.slug}`,
  description: () => '',
  meta: () => [],
  cover: () => <span data-cover />,
  inspectable: (pack) => pack.openable,
  inspector: (inspection) => {
    seen.current = inspection;
    return (
      <div data-inspector={inspection.sheet?.slug ?? ''} data-inspector-preview={inspection.preview === null ? '' : `${inspection.preview.pack.slug}#${inspection.preview.index}`}>
        <button type="button" data-close-sheet onClick={inspection.closeSheet} />
        <button type="button" data-close-preview onClick={inspection.closePreview} />
      </div>
    );
  },
});

const mount = (adapter: PackShopAdapter<Pack>, packs: readonly Pack[]) => {
  appQueryClient.setQueryData(['test', 'catalogue'], packs);
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <PackShop adapter={adapter} language="fr" />
    </QueryClientProvider>,
  );
};

describe('PackShop — fiche et plein écran', () => {
  test('toucher la rangée ouvre la fiche, toucher la couverture ouvre le plein écran du premier élément', async () => {
    const shop = await mount(adapterOf(async () => ({ ok: true, data: null })), [{ slug: 'a', installed: false, openable: true }]);
    expect(shop.querySelector('[data-inspector]')).toBeNull();
    const open = shop.querySelector<HTMLElement>('[data-shop-open="a"]');
    expect(open?.getAttribute('aria-label')).toBe('Voir la fiche du pack Pack a');
    await mounter.click(open);
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('a');
    await mounter.click(shop.querySelector<HTMLElement>('[data-close-sheet]'));
    expect(shop.querySelector('[data-inspector]')).toBeNull();

    const preview = shop.querySelector<HTMLElement>('[data-shop-preview="a"]');
    expect(preview?.getAttribute('aria-label')).toBe('Voir Pack a en plein écran');
    await mounter.click(preview);
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector-preview')).toBe('a#0');
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('');
  });

  test('fermer le plein écran ouvert depuis la fiche rend la fiche', async () => {
    const shop = await mount(adapterOf(async () => ({ ok: true, data: null })), [{ slug: 'a', installed: false, openable: true }]);
    await mounter.click(shop.querySelector<HTMLElement>('[data-shop-open="a"]'));
    await act(async () => seen.current?.openPreview(seen.current.packs[0] as Pack, 2));
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector-preview')).toBe('a#2');
    await mounter.click(shop.querySelector<HTMLElement>('[data-close-preview]'));
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector')).toBe('a');
    expect(shop.querySelector('[data-inspector]')?.getAttribute('data-inspector-preview')).toBe('');
  });

  test('un pack que l’adaptateur n’ouvre pas garde sa rangée d’avant', async () => {
    const shop = await mount(adapterOf(async () => ({ ok: true, data: null })), [{ slug: 'b', installed: false, openable: false }]);
    expect(shop.querySelector('[data-shop-open="b"]')).toBeNull();
    expect(shop.querySelector('[data-shop-preview="b"]')).toBeNull();
  });

  test('Installer depuis la fiche est optimiste, dit son action, et rend false sur un refus (retour arrière)', async () => {
    const answers: Array<(value: ApiResult<unknown>) => void> = [];
    const adapter = adapterOf(() => new Promise((resolve) => answers.push(resolve)));
    const shop = await mount(adapter, [{ slug: 'a', installed: false, openable: true }]);
    await mounter.click(shop.querySelector<HTMLElement>('[data-shop-open="a"]'));
    const pack = seen.current?.sheet as Pack;
    expect(seen.current?.actionOf(pack)).toEqual({ kind: 'toggle', label: 'Installer' });
    let outcome: Promise<boolean> | undefined;
    await act(async () => {
      outcome = seen.current?.toggle(pack);
    });
    expect(seen.current?.sheet?.installed).toBe(true);
    expect(seen.current?.busy(seen.current.sheet as Pack)).toBe(true);
    await act(async () => answers[0]?.({ ok: false, status: 500, error: 'x' }));
    expect(await outcome).toBe(false);
    await until(() => seen.current?.sheet?.installed === false);
    expect(seen.current?.notice).toBe('Le pack n’a pas pu être modifié — réessayez');
  });
});
