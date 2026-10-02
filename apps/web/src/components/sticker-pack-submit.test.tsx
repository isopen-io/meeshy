import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { StickerPackDetail } from '@meeshy/shared/types/sticker-pack';

import { resetFixturePacksForTests } from '@/lib/api/sticker-packs';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PackSubmitEditor } from './sticker-pack-submit';

/**
 * PROPOSER UN PACK (#9141) — le chemin nominal tient en un nom, une
 * signature et des images ; ce que la passerelle refuserait, l'éditeur le dit
 * AVANT d'envoyer, sur le sticker en cause.
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
afterEach(() => {
  mounter.unmountAll();
  resetFixturePacksForTests();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const png = (name: string) => new File([PNG], name, { type: 'image/png' });

const type = async (host: HTMLElement, selector: string, value: string) =>
  act(async () => {
    const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (input === null) throw new Error(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

const drop = async (host: HTMLElement, files: readonly File[]) =>
  act(async () => {
    const input = host.querySelector<HTMLInputElement>('[data-pack-files]');
    if (input === null) throw new Error('files');
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await settle();
  });

describe('PackSubmitEditor', () => {
  test('un nom, une signature et trois images suffisent : le pack part, en attente de relecture', async () => {
    const submitted: StickerPackDetail[] = [];
    const host = await mounter.mount(<PackSubmitEditor language="fr" onClose={() => {}} onSubmitted={(pack) => submitted.push(pack)} />);
    const send = () => host.querySelector<HTMLButtonElement>('[data-pack-submit-send]');
    expect(send()?.disabled).toBe(true);

    await type(host, '[data-pack-name]', 'Chats de Paris');
    await type(host, '[data-pack-description]', 'Des chats sur les quais');
    await type(host, '[data-pack-author]', 'Studio Minou');
    await drop(host, [png('dodo.png'), png('miaou.png'), png('ronron.png')]);

    expect(Array.from(host.querySelectorAll('[data-draft-item]')).map((row) => row.getAttribute('data-draft-item'))).toEqual(['dodo', 'miaou', 'ronron']);
    expect(host.querySelector('[data-pack-problems]')).toBe(null);
    expect(send()?.disabled).toBe(false);

    await mounter.click(send());
    await act(settle);
    expect(submitted.map((pack) => [pack.slug, pack.status, pack.itemCount])).toEqual([['chats-de-paris', 'pending', 3]]);
  });

  test('un Instant dont le texte le plus long déborderait est signalé sur SON sticker, et rien ne part', async () => {
    const host = await mounter.mount(<PackSubmitEditor language="fr" onClose={() => {}} onSubmitted={() => {}} />);
    await type(host, '[data-pack-name]', 'Pack');
    await type(host, '[data-pack-description]', 'D');
    await type(host, '[data-pack-author]', 'A');
    await drop(host, [png('a.png'), png('b.png'), png('c.png')]);

    const row = host.querySelectorAll('[data-draft-item]')[2];
    await mounter.click(row?.querySelector('[data-draft-instant]') ?? null);
    expect(row?.querySelector('[data-zone-canvas]')).not.toBe(null);
    expect(host.querySelector<HTMLButtonElement>('[data-pack-submit-send]')?.disabled).toBe(false);

    await type(host, '[data-draft-item="c"] [data-zone-length]', '60');
    expect(host.querySelector('[data-draft-item="c"] [data-pack-problems]')?.textContent).toContain('déborderait');
    expect(host.querySelector<HTMLButtonElement>('[data-pack-submit-send]')?.disabled).toBe(true);
  });

  test('un pack de moins de trois stickers le dit', async () => {
    const host = await mounter.mount(<PackSubmitEditor language="fr" onClose={() => {}} onSubmitted={() => {}} />);
    await type(host, '[data-pack-name]', 'Pack');
    await type(host, '[data-pack-description]', 'D');
    await type(host, '[data-pack-author]', 'A');
    await drop(host, [png('a.png')]);
    expect(host.querySelector('[data-pack-problems]')?.textContent).toContain('entre 3 et 120');
  });
});
