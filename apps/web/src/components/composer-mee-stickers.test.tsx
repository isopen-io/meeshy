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
 * LES ONGLETS MEE, MEO ET INSTANTS (#9034) — un choix REMET à l'hôte l'image
 * fixe et le descripteur que le web redessine ; un sticker dynamique écrit ce
 * qu'on a saisi, et seulement ce qu'il déclare.
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

const mount = (tab: 'mee' | 'meo' | 'duo' | 'instants', onPick: (picked: MeePicked) => void) =>
  mounter.mount(<MeeStickerPanel tab={tab} language="fr" onPick={onPick} rasterize={fakeRasterize} now={now} />);

describe('MeeStickerPanel', () => {
  test('l’onglet Meo range Meo seul par intention : un titre, une phrase qui dit quand l’employer, la grille', async () => {
    const host = await mount('meo', () => {});
    const sections = Array.from(host.querySelectorAll('[data-mee-section]'));
    expect(sections.map((s) => s.getAttribute('data-mee-section'))).toEqual([...MEE_INTENTS]);
    expect(host.querySelectorAll('[data-mee-sticker]').length).toBe(meeStickersOfTab('meo').length);
    expect(host.querySelector('[data-mee-sticker^="duo-"]')).toBe(null);

    const hello = host.querySelector('[data-mee-section="bonjour"]');
    expect(hello?.querySelector('h3')?.textContent).toBe('Bonjour, merci');
    expect(hello?.querySelector('[data-mee-hint]')?.textContent).toContain('Pour saluer');
    expect(hello?.querySelector('[data-mee-sticker="meo-salut"] svg')?.innerHTML).toContain('<style>');
  });

  test('l’onglet Mee & Meo réunit les duos, dans les deux sens', async () => {
    const host = await mount('duo', () => {});
    expect(host.querySelector('[data-mee-sticker="duo-mee-bisou"]')).not.toBe(null);
    expect(host.querySelector('[data-mee-sticker="duo-meo-bisou"] svg')?.getAttribute('class')).toContain('mee-s-pick-duo-meo-bisou');
    expect(host.querySelector('[data-mee-sticker="mee-coucou"]')).toBe(null);
    expect(host.querySelectorAll('[data-mee-sticker]').length).toBe(meeStickersOfTab('duo').length);
  });

  test('choisir un sticker remet son image fixe et son gabarit `mee.<id>`', async () => {
    const picked: MeePicked[] = [];
    const host = await mount('mee', (p) => picked.push(p));

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
    const host = mounter.mount(<MeeStickerPanel tab="mee" language="fr" onPick={(p) => picked.push(p)} rasterize={() => Promise.reject(new Error('x'))} />);
    await mounter.click((await host).querySelector('[data-mee-sticker="mee-coucou"]'));
    await act(settle);
    expect(picked).toEqual([]);
    expect((await host).textContent).toContain('n’a pas pu être relu');
  });
});
