import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { meeStickersOfTab } from '@/lib/mee/catalog';
import { MEE_INTENTS } from '@/lib/mee/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MeeStickerPanel } from './composer-mee-stickers';
import type { MeePicked } from './composer-mee-stickers';

/**
 * MEE & MEO ET LES INSTANTS (#9034, #9068, #9069) — un choix REMET à l'hôte
 * l'image fixe et le descripteur que le web redessine ; un sticker dynamique
 * écrit ce qu'on a saisi, et seulement ce qu'il déclare.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

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
afterEach(() => mounter.unmountAll());

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const rasterized: string[] = [];
const fakeRasterize = async (svg: string) => {
  rasterized.push(svg);
  return new Blob([new Uint8Array(4)], { type: 'image/png' });
};
const now = () => new Date('2026-10-01T08:05:00');

const mount = (mode: 'characters' | 'instants', onPick: (picked: MeePicked) => void) =>
  mounter.mount(<MeeStickerPanel mode={mode} language="fr" onPick={onPick} rasterize={fakeRasterize} now={now} />);

describe('MeeStickerPanel', () => {
  test('Mee & Meo range TOUS les personnages par intention — Mee, puis Meo, puis les duos (directive porteur 2026-10-02)', async () => {
    const host = await mount('characters', () => {});
    const sections = Array.from(host.querySelectorAll('[data-mee-section]'));
    expect(sections.map((s) => s.getAttribute('data-mee-section'))).toEqual([...MEE_INTENTS]);
    const total = meeStickersOfTab('mee').length + meeStickersOfTab('meo').length + meeStickersOfTab('duo').length;
    expect(host.querySelectorAll('[data-mee-sticker]').length).toBe(total);
    expect(host.querySelector('[data-mee-sticker^="instant-"]')).toBe(null);

    const hello = host.querySelector('[data-mee-section="bonjour"]');
    expect(hello?.querySelector('h3')?.textContent).toBe('Bonjour, merci');
    expect(hello?.querySelector('[data-mee-hint]')?.textContent).toContain('Pour saluer');
    expect(hello?.querySelector('[data-mee-sticker="meo-salut"] svg')?.innerHTML).toContain('<style>');

    const rang = (id: string | null) => (id?.startsWith('duo-') ? 2 : id?.startsWith('meo-') ? 1 : 0);
    sections.forEach((section) => {
      const rangs = Array.from(section.querySelectorAll('[data-mee-sticker]')).map((b) => rang(b.getAttribute('data-mee-sticker')));
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    });
  });

  test('choisir un sticker remet son image fixe et son gabarit `mee.<id>`', async () => {
    const picked: MeePicked[] = [];
    const host = await mount('characters', (p) => picked.push(p));

    await mounter.click(host.querySelector('[data-mee-sticker="mee-bisou-vole"]'));
    await act(settle);

    expect(picked.map((p) => p.sticker)).toEqual([{ templateId: 'mee.mee-bisou-vole', emoji: '😘' }]);
    expect(picked[0]?.file.type).toBe('image/png');
    expect(rasterized.at(-1)).not.toContain('<style>');
  });

  test('un instant écrit ce qu’on saisit — et l’heure de l’instant par défaut', async () => {
    const picked: MeePicked[] = [];
    const host = await mount('instants', (p) => picked.push(p));
    const place = host.querySelector<HTMLInputElement>('[data-mee-field="place"]');
    expect(host.querySelector<HTMLInputElement>('[data-mee-field="time"]')?.value).toBe('08:05');

    await act(async () => {
      if (place === null) return;
      place.value = 'Biarritz';
      place.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('[data-mee-sticker="instant-plage"]')?.innerHTML).toContain('Biarritz');

    await mounter.click(host.querySelector('[data-mee-sticker="instant-plage"]'));
    await act(settle);
    expect(picked[0]?.sticker).toEqual({ templateId: 'mee.instant-plage', emoji: '🏝️', slots: { place: 'Biarritz' } });

    await mounter.click(host.querySelector('[data-mee-sticker="instant-bonjour"]'));
    await act(settle);
    expect(picked[1]?.sticker.slots).toEqual({ time: '08:05' });
  });

  test('une image qui ne se rend pas est DITE, et rien ne part', async () => {
    const picked: MeePicked[] = [];
    const host = mounter.mount(<MeeStickerPanel mode="characters" language="fr" onPick={(p) => picked.push(p)} rasterize={() => Promise.reject(new Error('x'))} />);
    await mounter.click((await host).querySelector('[data-mee-sticker="mee-coucou"]'));
    await act(settle);
    expect(picked).toEqual([]);
    expect((await host).textContent).toContain('n’a pas pu être relu');
  });
});
