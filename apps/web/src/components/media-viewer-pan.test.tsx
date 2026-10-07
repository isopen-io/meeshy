import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import MediaViewer from './media-viewer';

/**
 * **UNE PHOTO AGRANDIE SE DÉPLACE AU DOIGT, DANS CHROME COMME DANS LA COQUE
 * ANDROID (#9562).** Depuis #9532 le pincement agrandit la photo, mais la
 * pagination se coupe pendant le zoom et rien ne prenait le doigt à sa place :
 * les bords d'une photo agrandie restaient hors d'atteinte. Comme le
 * `panGesture` d'iOS (`ConversationMediaGalleryView+Pages.swift`), le doigt la
 * déplace depuis où le geste précédent l'a laissée, et elle revient au centre
 * quand elle redescend à la taille réelle.
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

const zoomIn = (img: HTMLImageElement): void => {
  act(() => {
    img.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
};

const drag = (img: HTMLImageElement, from: readonly [number, number], to: readonly [number, number]): void => {
  finger(img, 'pointerdown', 1, from[0], from[1]);
  finger(img, 'pointermove', 1, to[0], to[1]);
  finger(img, 'pointerup', 1, to[0], to[1]);
};

describe('MediaViewer — déplacer une photo agrandie (#9562)', () => {
  test('agrandie, la photo suit le doigt qui la glisse, et la page ne tourne pas', () => {
    const dialog = mount();
    const img = activeImage(dialog);
    zoomIn(img);
    drag(img, [200, 300], [150, 280]);
    expect(img.style.transform).toBe('translate(-50px, -20px) scale(2.5)');
    expect(activeImage(dialog)).toBe(img);
  });

  test('un second glissement repart d’où le premier l’a laissée', () => {
    const img = activeImage(mount());
    zoomIn(img);
    drag(img, [200, 300], [150, 280]);
    drag(img, [100, 100], [130, 100]);
    expect(img.style.transform).toBe('translate(-20px, -20px) scale(2.5)');
  });

  test('à la taille réelle, un doigt ne déplace rien', () => {
    const img = activeImage(mount());
    drag(img, [200, 300], [200, 310]);
    expect(img.style.transform).toBe('scale(1)');
  });

  test('revenue à la taille réelle par le pincement, la photo revient au centre', () => {
    const img = activeImage(mount());
    zoomIn(img);
    drag(img, [200, 300], [150, 280]);
    finger(img, 'pointerdown', 1, 100);
    finger(img, 'pointerdown', 2, 300);
    finger(img, 'pointermove', 2, 101);
    finger(img, 'pointerup', 2, 101);
    finger(img, 'pointerup', 1, 100);
    expect(img.style.transform).toBe('scale(1)');
  });

  test('le double tap qui la ramène à la taille réelle la recentre aussi', () => {
    const img = activeImage(mount());
    zoomIn(img);
    drag(img, [200, 300], [150, 280]);
    zoomIn(img);
    expect(img.style.transform).toBe('scale(1)');
    zoomIn(img);
    expect(img.style.transform).toBe('scale(2.5)');
  });
});
