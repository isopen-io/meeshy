import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SettingsPacksScreen, prepareSettingsPacks } from './settings-packs';

/**
 * **PACKS ET TÉLÉCHARGEMENTS** (#10149) — deux segments, et chacun montre SA
 * boutique : les stickers (packs intégrés de la démonstration), les cadres du
 * jeu (la démonstration n'en fabrique aucun : boutique vide, dite).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await prepareSettingsPacks('fr');
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
  for (let i = 0; i < 80 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const at = (path: string): void => {
  const happyDom: unknown = Reflect.get(window, 'happyDOM');
  const setUrl: unknown = typeof happyDom === 'object' && happyDom !== null ? Reflect.get(happyDom, 'setURL') : undefined;
  if (typeof setUrl === 'function') Reflect.apply(setUrl, happyDom, [`http://localhost${path}`]);
};

describe('SettingsPacksScreen', () => {
  test('« Stickers » montre la Boutique des stickers ; « Cadres du jeu » celle des cadres', async () => {
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <SettingsPacksScreen language="fr" />
      </QueryClientProvider>,
    );
    expect(host.querySelector('h1')?.textContent).toBe('Packs et téléchargements');
    expect(host.querySelector('[data-packs-segment="stickers"]')?.getAttribute('aria-checked')).toBe('true');
    await until(() => host.querySelectorAll('[data-pack-shop="sticker"] [data-shop-pack]').length === 3);

    await mounter.click(host.querySelector<HTMLElement>('[data-packs-segment="frames"]'));
    await until(() => host.querySelector('[data-pack-shop="glory-frame"] [data-pack-shop-empty]') !== null);
    expect(host.querySelector('[data-sticker-shop]')).toBe(null);
  });

  test('?pack=<slug> met CE pack en avant dans la boutique des stickers (#10703)', async () => {
    at('/settings?volet=packs');
    const first = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <SettingsPacksScreen language="fr" />
      </QueryClientProvider>,
    );
    await until(() => first.querySelectorAll('[data-pack-shop="sticker"] [data-shop-pack]').length === 3);
    const slug = first.querySelector('[data-shop-pack]')?.getAttribute('data-shop-pack') ?? '';
    expect(first.querySelector('[data-shop-pack-focused]')).toBeNull();
    mounter.unmountAll();

    at(`/settings?volet=packs&pack=${slug}`);
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <SettingsPacksScreen language="fr" />
      </QueryClientProvider>,
    );
    await until(() => host.querySelector('[data-shop-pack-focused]') !== null);
    expect(host.querySelector('[data-shop-pack-focused]')?.getAttribute('data-shop-pack')).toBe(slug);
    expect(host.querySelectorAll('[data-shop-pack-focused]')).toHaveLength(1);
    expect(host.querySelector('[data-shop-pack-focused]')?.getAttribute('aria-current')).toBe('true');
    at('/');
  });

  test('?domaine=<d> ouvre la vitrine filtrée sur ce domaine ; type=cadres reste lu', async () => {
    at('/settings?volet=packs&domaine=banner');
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <SettingsPacksScreen language="fr" />
      </QueryClientProvider>,
    );
    expect(host.querySelector('[data-packs-segment="shop"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-unified-shop="banner"]')).not.toBe(null);
    mounter.unmountAll();

    at('/settings?volet=packs&type=cadres');
    const frames = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <SettingsPacksScreen language="fr" />
      </QueryClientProvider>,
    );
    expect(frames.querySelector('[data-packs-segment="frames"]')?.getAttribute('aria-checked')).toBe('true');
    at('/');
  });

  test('un domaine inconnu ne casse rien : la page s’ouvre comme avant, sur les stickers', async () => {
    at('/settings?volet=packs&domaine=inconnu');
    try {
      const host = await mounter.mount(
        <QueryClientProvider client={appQueryClient}>
          <SettingsPacksScreen language="fr" />
        </QueryClientProvider>,
      );
      expect(host.querySelector('[data-packs-segment="stickers"]')?.getAttribute('aria-checked')).toBe('true');
      expect(host.querySelector('[data-unified-shop]')).toBe(null);
    } finally {
      at('/');
    }
  });
});
