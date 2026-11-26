import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { pendingAttachmentOf } from '@/lib/send/attachments';

import ComposerTray from './composer-tray';

/**
 * W9 (#11315) — UN HEIC DANS LE PLATEAU DE CHROME. Le navigateur ne décode pas
 * l'aperçu : l'`<img>` lève `error`. La vignette ne reste pas une image cassée,
 * elle montre le glyphe d'image (le nom du fichier reste dessous), et ne propose
 * plus « Éditer », que l'éditeur ne saurait pas ouvrir. La pièce part telle
 * quelle ; la passerelle la convertit (S8).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mountTray(file: File): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ComposerTray
        variant="above"
        pending={[pendingAttachmentOf(file)]}
        onRemove={() => undefined}
        onReplace={() => undefined}
        notice={null}
        place={null}
        onRemovePlace={() => undefined}
      />,
    );
  });
  return container;
}

describe('PreviewTile — un aperçu que le navigateur ne décode pas', () => {
  test('l’image en échec laisse place au glyphe d’image, sans « Éditer »', () => {
    const el = mountTray(new File([new Uint8Array(8)], 'IMG_0042.HEIC', { type: '' }));
    expect(el.querySelector('[data-composer-edit]')).not.toBeNull();
    act(() => {
      el.querySelector('[data-pending-tile] img')!.dispatchEvent(new Event('error'));
    });
    expect(el.querySelector('[data-pending-tile] img')).toBeNull();
    expect(el.querySelector('[data-pending-kind="image"]')).not.toBeNull();
    expect(el.querySelector('[data-composer-edit]')).toBeNull();
    expect(el.textContent).toContain('IMG_0042.HEIC');
  });

  test('la vignette DIT pourquoi « Éditer » n’est pas offert, et que la photo part telle quelle (#12322)', () => {
    const el = mountTray(new File([new Uint8Array(8)], 'IMG_0042.HEIC', { type: '' }));
    const tile = () => el.querySelector<HTMLElement>('[data-pending-tile]')!;
    expect(tile().querySelector('[data-pending-undecodable]')).toBeNull();
    act(() => {
      el.querySelector('[data-pending-tile] img')!.dispatchEvent(new Event('error'));
    });
    const motif = 'Ce navigateur ne sait pas ouvrir cette photo HEIC pour la retoucher : elle part telle quelle.';
    const dit = tile().querySelector<HTMLElement>('[data-pending-undecodable]');
    expect(dit?.getAttribute('title')).toBe(motif);
    expect(dit?.textContent).toContain(motif);
  });

  test('une image NON HEIC que le navigateur ne décode pas ne se dit pas « photo HEIC » (#12322)', () => {
    const el = mountTray(new File([new Uint8Array(8)], 'photo-abimee.jpg', { type: 'image/jpeg' }));
    act(() => {
      el.querySelector('[data-pending-tile] img')!.dispatchEvent(new Event('error'));
    });
    expect(el.querySelector('[data-composer-edit]')).toBeNull();
    expect(el.querySelector('[data-pending-undecodable]')).toBeNull();
    expect(el.textContent).not.toContain('HEIC');
  });
});
