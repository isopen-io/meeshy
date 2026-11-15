import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { EntityImageEditProps } from '@/components/entity-image-retouch';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { EntityImageFormat } from './entity-image-format';
import { useEntityImageEdit } from './use-entity-image-edit';

/**
 * CHOISIR UNE IMAGE D'IDENTITÉ PASSE PAR LA RETOUCHE (#17256) — le site que
 * « Montre-toi », le profil, la communauté et le groupe partagent : seule
 * l'image retouchée part, Annuler ne rend rien, la retouche s'ouvre DANS la
 * feuille qui l'appelle, et un HEIC illisible ici part tel quel.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

type Opened = { readonly format: EntityImageFormat; readonly name: string; readonly container: Element | null | undefined };

function bench({ undecodable = async () => false, inDialog = false }: { readonly undecodable?: (file: File) => Promise<boolean>; readonly inDialog?: boolean } = {}) {
  const delivered: { readonly format: EntityImageFormat; readonly name: string }[] = [];
  const opened: Opened[] = [];
  function Editor({ file, format, container, onDone, onCancel }: EntityImageEditProps) {
    opened.push({ format, name: file.name, container });
    return (
      <div data-editor={format}>
        <button type="button" data-done onClick={() => onDone(new File(['jpeg'], `${format}-retouche.jpg`, { type: 'image/jpeg' }))} />
        <button type="button" data-cancel onClick={onCancel} />
      </div>
    );
  }
  function Host() {
    const { pick, layer } = useEntityImageEdit<EntityImageFormat>({ deliver: (format, file) => delivered.push({ format, name: file.name }), editor: Editor, undecodable });
    const inputs = (['avatar', 'banner'] as const).map((format) => <input key={format} type="file" data-input={format} onChange={(event) => pick(format, event)} />);
    return (
      <>
        {inDialog ? <dialog open>{inputs}</dialog> : inputs}
        {layer}
      </>
    );
  }
  return { delivered, opened, element: <Host /> };
}

async function choose(host: ParentNode, format: EntityImageFormat, name = `${format}.jpg`) {
  const input = host.querySelector<HTMLInputElement>(`[data-input="${format}"]`);
  if (input === null) throw new Error('champ absent');
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/jpeg' })], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

describe('useEntityImageEdit', () => {
  test('le fichier choisi ouvre la retouche à SON format ; rien ne part avant « Terminé »', async () => {
    const { element, opened, delivered } = bench();
    const host = await mount(element);
    await choose(host, 'banner');
    expect(opened.at(-1)).toMatchObject({ format: 'banner', name: 'banner.jpg' });
    expect(delivered).toEqual([]);
    await click(host.querySelector('[data-done]'));
    expect(delivered).toEqual([{ format: 'banner', name: 'banner-retouche.jpg' }]);
    expect(host.querySelector('[data-editor]')).toBeNull();
  });

  test('Annuler referme sans rien rendre', async () => {
    const { element, delivered } = bench();
    const host = await mount(element);
    await choose(host, 'avatar');
    await click(host.querySelector('[data-cancel]'));
    expect(delivered).toEqual([]);
    expect(host.querySelector('[data-editor]')).toBeNull();
  });

  test('le même fichier se choisit à nouveau après une annulation', async () => {
    const { element, opened } = bench();
    const host = await mount(element);
    await choose(host, 'avatar');
    expect(host.querySelector<HTMLInputElement>('[data-input="avatar"]')?.value).toBe('');
    await click(host.querySelector('[data-cancel]'));
    await choose(host, 'avatar');
    expect(host.querySelector('[data-editor="avatar"]')).not.toBeNull();
    expect(opened.length).toBeGreaterThan(0);
  });

  test('ouverte depuis une feuille, la retouche se pose DANS la feuille', async () => {
    const { element, opened } = bench({ inDialog: true });
    const host = await mount(element);
    await choose(host, 'avatar');
    expect(opened.at(-1)?.container).toBe(host.querySelector('dialog'));
  });

  test('un HEIC que ce navigateur ne décode pas part tel quel, sans retouche', async () => {
    const { element, delivered } = bench({ undecodable: async () => true });
    const host = await mount(element);
    await choose(host, 'avatar', 'photo.heic');
    expect(host.querySelector('[data-editor]')).toBeNull();
    expect(delivered).toEqual([{ format: 'avatar', name: 'photo.heic' }]);
  });
});
