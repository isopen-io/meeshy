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
});
