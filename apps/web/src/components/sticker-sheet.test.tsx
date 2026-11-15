import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { appQueryClient } from '@/lib/api/query-client';
import { STICKERS_QUERY_KEY, resetFixtureStickersForTests } from '@/lib/api/stickers';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { resetAddedStickersForTests } from '@/lib/stickers/received';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StickerSheet } from './sticker-sheet';

/**
 * **LA FICHE D'UN STICKER (#10630)** — chaque témoin compte un EFFET : le
 * sticker ENTRE dans la bibliothèque, le bouton d'ajout DISPARAÎT quand il y
 * est déjà, « Voir le pack » n'existe que si le gabarit dit son pack.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
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
  resetFixtureStickersForTests();
  resetAddedStickersForTests();
  globalThis.fetch = realFetch;
});

const owned = (id: string): StickerDefinition => ({
  id,
  name: null,
  origin: 'upload',
  mimeType: 'image/png',
  fileUrl: `stickers/u1/${id}.png`,
  width: 512,
  height: 512,
  sizeBytes: 4,
  animated: false,
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-25T10:00:00.000Z',
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (props: Partial<Parameters<typeof StickerSheet>[0]> = {}) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <StickerSheet sticker={{ stickerId: 'recu' }} picture={{ fileUrl: 'attachments/recu.png' }} onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );

const open = async (props?: Parameters<typeof mount>[0]) => {
  const host = await mount(props);
  await act(settle);
  await act(settle);
  return host;
};

describe('StickerSheet', () => {
  test('« Ajouter à mes stickers » fait ENTRER le sticker reçu en bibliothèque, puis dit « Dans mes stickers »', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [owned('a')]);
    globalThis.fetch = (async () => new Response(new Blob([new Uint8Array(4)], { type: 'image/png' }), { status: 200 })) as unknown as typeof fetch;
    const host = await open();

    expect(host.querySelector('[data-sticker-in-library]')).toBeNull();
    await mounter.click(host.querySelector('[data-sticker-add]'));
    await act(settle);
    await act(settle);

    expect(appQueryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)).toHaveLength(2);
    expect(host.querySelector('[data-sticker-add]')).toBeNull();
    expect(host.querySelector('[data-sticker-in-library]')?.textContent).toContain('Dans mes stickers');
  });

  test('un sticker déjà en bibliothèque n’offre PAS l’ajout', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, [owned('recu')]);
    const host = await open();
    expect(host.querySelector('[data-sticker-add]')).toBeNull();
    expect(host.querySelector('[data-sticker-in-library]')).not.toBeNull();
  });

  test('une image qui ne se relit pas n’ajoute rien et le DIT', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const host = await open();
    await mounter.click(host.querySelector('[data-sticker-add]'));
    await act(settle);
    await act(settle);
    expect(appQueryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY)).toEqual([]);
    const notice = host.querySelector('[data-sticker-notice]');
    expect(notice?.textContent).toContain('n’a pas pu être ajouté');
    expect(notice?.classList.contains('sr-only')).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('[data-sticker-add]')?.disabled).toBe(false);
  });

  test('un sticker sans image jointe n’affiche aucun bouton d’ajout mort', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const host = await open({ sticker: { emoji: '🔥' }, picture: undefined });
    expect(host.querySelector('[data-sticker-preview]')).not.toBeNull();
    expect(host.querySelector('[data-sticker-add]')).toBeNull();
    expect(host.querySelector('[data-sticker-in-library]')).toBeNull();
  });

  test('« Voir le pack » n’existe que si le gabarit dit son pack', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    expect((await open()).querySelector('[data-sticker-view-pack]')).toBeNull();
    mounter.unmountAll();
    const host = await open({ sticker: { templateId: 'pack.chats-de-paris.dodo', emoji: '😴' } });
    expect(host.querySelector('[data-sticker-view-pack]')).not.toBeNull();
  });

  test('la fiche nomme l’expéditeur quand la bulle le dit (#10703)', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    expect((await open({ senderName: 'Amina Diallo' })).querySelector('[data-sticker-sender]')?.textContent).toContain('Amina Diallo');
    mounter.unmountAll();
    expect((await open()).querySelector('[data-sticker-sender]')).toBeNull();
  });

  test('« Voir le pack » ouvre CE pack, pas la liste des packs (#10703)', async () => {
    appQueryClient.setQueryData(STICKERS_QUERY_KEY, []);
    const host = await open({ sticker: { templateId: 'pack.chats-de-paris.dodo', emoji: '😴' } });
    await mounter.click(host.querySelector('[data-sticker-view-pack]'));
    const params = new URLSearchParams(location.search);
    expect(params.get('volet')).toBe('packs');
    expect(params.get('pack')).toBe('chats-de-paris');
  });
});
