import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { STICKERS_QUERY_KEY } from '@/lib/api/stickers';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { mediaOpenerOf, tapKindOf } from '@/lib/view/double-tap';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StickerArtwork } from './message-body-blocks';

/**
 * **LE TOUCHER D'UN STICKER DANS LE FIL (#10630)** — un toucher ouvre la fiche,
 * un appui long reste celui du menu, le clavier l'ouvre aussi, et le double
 * toucher garde la barre de réaction rapide (#10599) : le sticker est une
 * tuile qu'on ouvre, comme une photo, pas un contrôle qui avale le geste.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realNow = Date.now;
let clock = 1_000_000;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadMessagePiecesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  Date.now = realNow;
});

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const mountSticker = async () => {
  appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
  clock = 1_000_000;
  Date.now = () => clock;
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <div data-row="m-1">
        <StickerArtwork sticker={{ stickerId: 's-1' }} picture={{ fileUrl: 'attachments/s-1.png' }} side={224} />
      </div>
    </QueryClientProvider>,
  );
  const button = host.querySelector<HTMLButtonElement>('[data-sticker-open]');
  if (button === null) throw new Error('sticker sans bouton');
  return { host, button };
};

const pointer = (button: HTMLElement, type: 'pointerdown' | 'pointerup') =>
  act(() => {
    button.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
  });

const press = async (button: HTMLElement, heldMs: number) => {
  await pointer(button, 'pointerdown');
  clock += heldMs;
  await pointer(button, 'pointerup');
};

const sheetOpen = (): boolean => document.querySelector('[data-sticker-sheet]') !== null;

const openFrom = async (button: HTMLElement) => {
  await act(() => {
    button.click();
  });
  for (let turn = 0; turn < 20 && !sheetOpen(); turn += 1) await settle();
};

describe('StickerArtwork — le toucher', () => {
  test('un toucher bref ouvre la fiche', async () => {
    const { button } = await mountSticker();
    await press(button, 80);
    await openFrom(button);
    expect(sheetOpen()).toBe(true);
  });

  test('un appui long (menu du message) n’ouvre PAS la fiche au relâcher', async () => {
    const { button } = await mountSticker();
    await press(button, 600);
    await openFrom(button);
    expect(sheetOpen()).toBe(false);
  });

  test('le CLAVIER ouvre la fiche, même après un appui long plus tôt', async () => {
    const { button } = await mountSticker();
    await press(button, 600);
    await openFrom(button);
    expect(sheetOpen()).toBe(false);
    clock += 5_000;
    await openFrom(button);
    expect(sheetOpen()).toBe(true);
  });

  test('un toucher RETENU par le double toucher puis rendu ouvre encore la fiche', async () => {
    const { button } = await mountSticker();
    await press(button, 300);
    clock += 200;
    await openFrom(button);
    expect(sheetOpen()).toBe(true);
  });

  test('le double toucher traite le sticker comme une tuile qu’on ouvre, jamais comme un contrôle', async () => {
    const { host, button } = await mountSticker();
    const row = host.querySelector('[data-row]');
    if (row === null) throw new Error('rangée absente');
    const inner = button.firstElementChild ?? button;
    expect(tapKindOf(inner, row)).toBe('media');
    expect(mediaOpenerOf(inner)).toBe(button);
  });
});
