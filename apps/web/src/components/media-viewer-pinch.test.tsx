import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import MediaViewer from './media-viewer';

/**
 * **PINCER UNE PHOTO L'AGRANDIT, DANS CHROME COMME DANS LA COQUE ANDROID (#9532).**
 * La coque garde le zoom de la WebView coupé (Capacitor) : le pincement de la
 * page est celui de la visionneuse, le même partout, borné par `MAX_SCALE`.
 */
const photo = (id: string): Attachment =>
  ({
    id,
    messageId: `m-${id}`,
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 4096,
    fileUrl: `/uploads/${id}.jpg`,
    width: 800,
    height: 600,
    uploadedBy: 'u',
    isAnonymous: false,
    isViewOnce: false,
    isBlurred: false,
    createdAt: '2026-09-20T10:00:00.000Z',
  }) as unknown as Attachment;

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

function mount(onClose: () => void = () => {}): HTMLElement {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MediaViewer items={[photo('a'), photo('b')]} startIndex={0} onClose={onClose} languages={['fr']} fallbackLanguage="fr" />);
  });
  return document.body.querySelector<HTMLElement>('[data-media-viewer]')!;
}

const activeImage = (dialog: HTMLElement): HTMLImageElement =>
  [...dialog.querySelectorAll<HTMLElement>('[data-viewer-page]')].find((page) => page.style.transform === 'translateX(0%)')!.querySelector('img')!;

const finger = (target: HTMLElement, type: string, pointerId: number, clientX: number, clientY = 300): void => {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, isPrimary: pointerId === 1, pointerType: 'touch', clientX, clientY }));
  });
};

describe('MediaViewer — pincer une photo (#9532)', () => {
  test('écarter deux doigts agrandit la photo à proportion de leur écart', () => {
    const img = activeImage(mount());
    finger(img, 'pointerdown', 1, 100);
    finger(img, 'pointerdown', 2, 200);
    finger(img, 'pointermove', 2, 300);
    finger(img, 'pointerup', 2, 300);
    finger(img, 'pointerup', 1, 100);
    expect(img.style.transform).toBe('scale(2)');
  });

  test('l’agrandissement s’arrête à MAX_SCALE, et resserrer les doigts ramène à la taille réelle', () => {
    const img = activeImage(mount());
    finger(img, 'pointerdown', 1, 100);
    finger(img, 'pointerdown', 2, 110);
    finger(img, 'pointermove', 2, 400);
    expect(img.style.transform).toBe('scale(5)');
    finger(img, 'pointermove', 2, 101);
    finger(img, 'pointerup', 2, 101);
    finger(img, 'pointerup', 1, 100);
    expect(img.style.transform).toBe('scale(1)');
  });

  test('le doigt qui glisse pendant le pincement ne ferme ni ne tourne la page', () => {
    const closed: number[] = [];
    const dialog = mount(() => closed.push(1));
    const img = activeImage(dialog);
    finger(img, 'pointerdown', 1, 200, 300);
    finger(img, 'pointerdown', 2, 220, 300);
    finger(img, 'pointermove', 1, 20, 600);
    finger(img, 'pointerup', 1, 20, 600);
    finger(img, 'pointerup', 2, 220, 300);
    expect(closed).toEqual([]);
    expect(activeImage(dialog)).toBe(img);
  });

  test('la page image garde le doigt pour elle : le navigateur ne zoome pas toute l’app à sa place', () => {
    const img = activeImage(mount());
    expect(img.parentElement!.style.touchAction).toBe('none');
  });
});
