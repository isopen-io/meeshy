import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { appQueryClient } from '@/lib/api/query-client';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ComposerStickerSheet } from './composer-sticker-sheet';

/**
 * **« MES STICKERS » (#7938)** — chaque témoin compte un EFFET (loi 4) : un
 * sticker qui ENTRE dans la bibliothèque, un choix qui REMET son image à
 * l'hôte. Jamais la seule présence d'un bouton.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  resetFixtureStickersForTests();
  globalThis.fetch = realFetch;
});

const sticker = (id: string): StickerDefinition => ({
  id,
  name: null,
  origin: 'paste',
  mimeType: 'image/png',
  fileUrl: `stickers/u1/${id}.png`,
  width: 512,
  height: 512,
  sizeBytes: 4,
  animated: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-25T10:00:00.000Z',
});

type Picked = { readonly stickerId: string; readonly file: File };

const mount = (onPick: (picked: Picked) => void = () => {}) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ComposerStickerSheet onPick={onPick} onClose={() => {}} />
    </QueryClientProvider>,
  );

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ComposerStickerSheet', () => {
  test('choisir un sticker REMET son image et son identifiant, et le remonte en tête', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [sticker('a'), sticker('b')]);
    globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })) as unknown as typeof fetch;
    const picked: Picked[] = [];
    const host = await mount((p) => picked.push(p));

    await mounter.click(host.querySelector('[data-sticker="b"]'));
    await act(settle);

    expect(picked.map((p) => p.stickerId)).toEqual(['b']);
    expect(picked[0]?.file.type).toBe('image/png');
    const order = appQueryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)?.map((s) => s.id);
    expect(order).toEqual(['b', 'a']);
  });

  test('une image qui ne se relit pas est DITE, et rien ne part', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [sticker('a')]);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const picked: Picked[] = [];
    const host = await mount((p) => picked.push(p));

    await mounter.click(host.querySelector('[data-sticker="a"]'));
    await act(settle);

    expect(picked).toEqual([]);
    expect(host.textContent).toContain('n’a pas pu être relu');
  });

  test('« Coller » fait ENTRER l’image du presse-papier dans la bibliothèque', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const png = new Blob([new Uint8Array(8)], { type: 'image/png' });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { read: async () => [{ types: ['image/png'], getType: async () => png }] },
    });
    const host = await mount();
    expect(host.querySelector('[data-sticker-empty]')).not.toBe(null);

    await mounter.click(host.querySelector('[data-sticker-paste]'));
    await act(async () => {
      await settle();
      await settle();
    });

    const library = appQueryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY) ?? [];
    expect(library.map((s) => s.origin)).toEqual(['paste']);
    expect(host.querySelectorAll('[data-sticker]').length).toBe(1);
  });

  test('un presse-papier sans image le DIT au lieu de ne rien faire', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => [] } });
    const host = await mount();

    await mounter.click(host.querySelector('[data-sticker-paste]'));
    await act(settle);

    expect(host.textContent).toContain('Aucune image dans le presse-papier');
  });
});
