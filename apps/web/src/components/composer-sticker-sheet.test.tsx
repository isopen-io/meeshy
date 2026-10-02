import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';
import type { StickerPackDetail, StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import { appQueryClient } from '@/lib/api/query-client';
import { INSTALLED_PACKS_QUERY_KEY, PACK_CATALOGUE_QUERY_KEY, resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { STICKER_FAVORITES_KEY } from '@/lib/stickers/favorites';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ComposerStickerSheet } from './composer-sticker-sheet';
import type { PickedSticker } from './composer-sticker-sheet';

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
  resetFixturePacksForTests();
  globalThis.localStorage.removeItem(STICKER_FAVORITES_KEY);
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

type Picked = PickedSticker;

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

    expect(picked.map((p) => p.sticker.stickerId)).toEqual(['b']);
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

  const settleLazy = (module: Promise<unknown>) =>
    act(async () => {
      await module;
      await settle();
      await settle();
    });

  test('UN onglet par pack installé — Mee, Meo, Mee & Meo — entre « Favoris » et « Personnalisés », puis « Boutique »', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const host = await mount();
    await act(settle);
    const tabs = Array.from(host.querySelectorAll('[role="tab"]')).map((tab) => [tab.getAttribute('data-sticker-tab'), tab.textContent]);
    expect(tabs).toEqual([
      ['favorites', 'Favoris'],
      ['mee', 'Mee'],
      ['meo', 'Meo'],
      ['mee-et-meo', 'Mee & Meo'],
      ['mine', 'Personnalisés'],
      ['shop', 'Boutique'],
    ]);
    expect(host.querySelector('[data-sticker-tab="mine"]')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-sticker-library]')).not.toBe(null);
    expect(host.querySelector('[data-mee-sticker]')).toBe(null);

    await mounter.click(host.querySelector('[data-sticker-tab="mee"]'));
    await settleLazy(import('./composer-mee-stickers'));
    expect(host.querySelector('[data-sticker-library]')).toBe(null);
    expect(host.querySelector('[data-mee-sticker="mee-coucou"]')).not.toBe(null);
    expect(host.querySelector('[data-mee-instants] [data-mee-sticker="instant-plage"]')).not.toBe(null);
    expect(host.querySelector('[data-mee-sticker="meo-salut"]')).toBe(null);

    await mounter.click(host.querySelector('[data-sticker-tab="mee-et-meo"]'));
    await act(settle);
    expect(host.querySelector('[data-mee-sticker="duo-mee-bisou"]')).not.toBe(null);
    expect(host.querySelector('[data-mee-sticker="mee-coucou"]')).toBe(null);
  });

  test('retirer un pack dans la Boutique le retire des onglets AU GESTE ; le réinstaller le rend', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const host = await mount();
    await mounter.click(host.querySelector('[data-sticker-tab="shop"]'));
    await settleLazy(import('./composer-sticker-shop'));

    const rows = Array.from(host.querySelectorAll('[data-shop-pack]')).map((row) => row.getAttribute('data-shop-pack'));
    expect(rows).toEqual(['mee', 'meo', 'mee-et-meo']);
    expect(host.querySelector('[data-shop-toggle="meo"]')?.getAttribute('aria-pressed')).toBe('true');

    await mounter.click(host.querySelector('[data-shop-toggle="meo"]'));
    await act(settle);
    expect(host.querySelector('[data-sticker-tab="meo"]')).toBe(null);
    expect(host.querySelector('[data-shop-toggle="meo"]')?.textContent).toBe('Installer');
    const installed = appQueryClient.getQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY)?.map((pack) => pack.slug);
    expect(installed).toEqual(['mee', 'mee-et-meo']);

    await mounter.click(host.querySelector('[data-shop-toggle="meo"]'));
    await act(settle);
    expect(host.querySelector('[data-sticker-tab="meo"]')).not.toBe(null);
    const catalogue = appQueryClient.getQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY);
    expect(catalogue?.find((pack) => pack.slug === 'meo')?.installed).toBe(true);
  });

  test('un pack d’un tiers a son onglet ; un Instant s’ouvre, écrit ce qu’on saisit et part avec ses valeurs', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const third: StickerPackDetail = {
      slug: 'chats-de-paris',
      name: 'Chats de Paris',
      description: 'Des chats',
      author: 'Studio Minou',
      builtin: false,
      status: 'approved',
      itemCount: 2,
      kinds: ['static', 'instant'],
      coverUrl: null,
      installed: true,
      installCount: 4,
      items: [
        { key: 'dodo', title: 'Dodo', emoji: '😴', kind: 'static', mimeType: 'image/png', fileUrl: 'sticker-packs/x/dodo.png', width: 512, height: 512, zones: [] },
        {
          key: 'bravo',
          title: 'Bravo',
          emoji: '👏',
          kind: 'instant',
          mimeType: 'image/png',
          fileUrl: 'sticker-packs/x/bravo.png',
          width: 512,
          height: 512,
          zones: [
            {
              slot: 'texte',
              label: 'Prénom',
              box: { x: 40, y: 392, width: 432, height: 96 },
              defaultText: 'Bravo',
              maxLength: 12,
              maxLines: 1,
              minFontSize: 14,
              maxFontSize: 64,
              color: '#1c1941',
              weight: 'black',
              align: 'center',
            },
          ],
        },
      ],
    };
    appQueryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, [third]);
    globalThis.fetch = (async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })) as unknown as typeof fetch;
    const picked: Picked[] = [];
    const host = await mount((p) => picked.push(p));
    expect(host.querySelector('[data-sticker-tab="chats-de-paris"]')?.textContent).toBe('Chats de Paris');
    expect(host.querySelector('[data-sticker-tab="mee"]')).toBe(null);

    await mounter.click(host.querySelector('[data-sticker-tab="chats-de-paris"]'));
    await settleLazy(import('./composer-pack-stickers'));
    await mounter.click(host.querySelector('[data-pack-sticker="dodo"]'));
    await act(settle);
    expect(picked.map((p) => p.sticker)).toEqual([{ templateId: 'pack.chats-de-paris.dodo', emoji: '😴' }]);
    expect(picked[0]?.file.type).toBe('image/png');

    await mounter.click(host.querySelector('[data-pack-sticker="bravo"]'));
    const field = host.querySelector<HTMLInputElement>('[data-pack-field="texte"]');
    expect(field?.maxLength).toBe(12);
    await act(async () => {
      if (field === null) return;
      field.value = 'Léa';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('[data-pack-instant="bravo"]')?.innerHTML).toContain('Léa');
  });

  /**
   * LES FAVORIS (#9070) — la question du porteur : « comment mettre un sticker
   * en favoris ? ». Le geste d'iOS : un appui long — ici l'évènement
   * `contextmenu`, que le navigateur lève au clic droit, à l'appui long tactile
   * et à la touche Menu (ou Maj+F10) du clavier.
   */
  const openTab = async (host: HTMLElement, tab: string) => {
    await mounter.click(host.querySelector(`[data-sticker-tab="${tab}"]`));
    await act(async () => {
      await import('./composer-mee-stickers');
      await settle();
      await settle();
    });
  };
  const longPress = async (target: Element | null) => {
    await act(async () => {
      target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
  };

  test('Favoris vide dit comment l’alimenter', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [sticker('s1')]);
    const host = await mount();
    await openTab(host, 'favorites');
    expect(host.querySelector('[data-sticker-favorites-empty]')?.textContent).toContain('clic droit');
  });

  test('un appui long épingle un sticker de « Mes stickers » ; Favoris le montre ; un second appui long le retire', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [sticker('s1'), sticker('s2')]);
    const host = await mount();
    await act(settle);
    const cell = host.querySelector('[data-sticker-library] [data-sticker="s2"]');
    await longPress(cell);
    expect(host.querySelector('[data-sticker-library] [data-sticker="s2"]')?.getAttribute('data-favorite')).toBe('true');
    expect(host.textContent).toContain('Épinglé aux favoris');

    await openTab(host, 'favorites');
    const pinned = Array.from(host.querySelectorAll('[data-sticker-favorites] [data-sticker]')).map((b) => b.getAttribute('data-sticker'));
    expect(pinned).toEqual(['s2']);

    await longPress(host.querySelector('[data-sticker-favorites] [data-sticker="s2"]'));
    expect(host.querySelector('[data-sticker-favorites] [data-sticker="s2"]')).toBe(null);
    expect(host.querySelector('[data-sticker-favorites-empty]')).not.toBe(null);
  });

  test('un appui long épingle un Mee ; Favoris le rejoue, dessiné', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const picked: Picked[] = [];
    const host = await mount((p) => picked.push(p));
    await openTab(host, 'mee');
    await longPress(host.querySelector('[data-mee-sticker="mee-coucou"]'));
    expect(host.querySelector('[data-mee-sticker="mee-coucou"]')?.getAttribute('data-favorite')).toBe('true');

    await openTab(host, 'favorites');
    const mee = host.querySelector('[data-sticker-favorites] [data-mee-sticker="mee-coucou"]');
    expect(mee).not.toBe(null);
    expect(mee?.querySelector('svg')).not.toBe(null);
  });
});
