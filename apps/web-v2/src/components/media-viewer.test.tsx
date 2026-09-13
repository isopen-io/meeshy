import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import {
  MEDIA_GRID_OVERFLOW_WITNESS_ID,
  MEDIA_GRID_QUAD_WITNESS_ID,
  MEDIA_GRID_TRIPLE_WITNESS_ID,
} from '@/lib/api/fixtures-media-grid';
import type { Attachment } from '@/lib/api/types';

import MediaViewer from './media-viewer';

/**
 * P0 — LA VISIONNEUSE PLEIN ÉCRAN (#6169, #6221) : le POC livrait
 * l'implémentation (commit 018573b22e) sans les témoins de COMPORTEMENT que
 * la spécification exige — ouverture au bon index, pellicule qui marque
 * l'index courant, fermeture Échap/retour matériel, piège à focus, et la
 * pièce MASQUÉE qui reste masquée même une fois DANS la visionneuse (une
 * question distincte de celle tranchée pour `MediaGrid` : ici `items` est le
 * tableau `visual` ENTIER, la pièce masquée occupant sa position — D-41 —
 * et restant atteignable par une flèche/la pellicule depuis une page voisine).
 */

const attachmentsOf = (messageId: string): readonly Attachment[] => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === messageId);
  if (!message) throw new Error(`témoin introuvable : ${messageId}`);
  return message.attachments ?? [];
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // La page VIDÉO ACTIVE déclenche un `toggle()` (donc `element.play()`) DÈS
  // le montage (`ViewerVideoPage`, effet `isActive`) — jamais après un clic,
  // à la différence de `VideoTile`. Impossible de stubber l'ÉLÉMENT après
  // coup (l'effet tourne dans le MÊME `act()` que le premier rendu) : on
  // stubbe le PROTOTYPE, une fois, pour tout ce fichier.
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = function load(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('emptied'));
  };
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
  document.body.removeAttribute('id');
});

/** La page COURANTE (`distance === 0`, `translateX(0%)`) — DISTINCTE des pages voisines préchargées, qui portent aussi `data-full-pixels="true"`. */
function currentPage(body: HTMLElement): HTMLElement {
  const pages = Array.from(body.querySelectorAll<HTMLElement>('[data-viewer-page]'));
  const found = pages.find((p) => p.style.transform === 'translateX(0%)');
  if (found === undefined) throw new Error('page courante introuvable');
  return found;
}

function mount(params: {
  readonly items: readonly Attachment[];
  readonly startIndex: number;
  readonly onClose: () => void;
}): HTMLElement {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <MediaViewer
        items={params.items}
        startIndex={params.startIndex}
        onClose={params.onClose}
        languages={['fr']}
        fallbackLanguage="fr"
      />,
    );
  });
  // `createPortal(..., document.body)` : le dialogue vit HORS `container`.
  return document.body;
}

describe('MediaViewer — ouverture au bon index, la pellicule le marque (critère 1)', () => {
  test('startIndex=2 (media-13, 4 images) ⇒ data-viewer-index="2", filmstrip aria-current sur la 3ᵉ vignette', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 2, onClose: () => {} });

    const dialog = body.querySelector('[data-media-viewer]')!;
    expect(dialog.getAttribute('data-viewer-index')).toBe('2');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems.length).toBe(4);
    expect(filmstripItems[2]!.getAttribute('aria-current')).toBe('true');
    expect(filmstripItems[0]!.getAttribute('aria-current') === null).toBe(true);
  });

  test('clic sur la pellicule à l’index 0 déplace la page ET l’aria-current', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 2, onClose: () => {} });
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));

    act(() => {
      filmstripItems[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('0');
    const after = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(after[0]!.getAttribute('aria-current')).toBe('true');
  });

  test('une seule pièce ⇒ AUCUNE pellicule (`+Geometry.swift:88-102`)', () => {
    const items = [attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID)[0]!];
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    expect(body.querySelector('[data-filmstrip]') === null).toBe(true);
  });
});

describe('MediaViewer — fermeture (critère « Escape/retour ferme »)', () => {
  test('Escape ⇒ onClose()', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => (closed += 1) });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(closed).toBe(1);
  });

  test('popstate (retour matériel) ⇒ onClose() — useBackDismiss', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    mount({ items, startIndex: 0, onClose: () => (closed += 1) });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closed).toBe(1);
  });

  test('ArrowRight/ArrowLeft paginent sans fermer', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 1, onClose: () => (closed += 1) });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('2');

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('1');
    expect(closed).toBe(0);
  });
});

describe('MediaViewer — le piège à focus (`focus-trap.ts`)', () => {
  test('Tab depuis le dernier focalisable revient au premier', () => {
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const dialog = body.querySelector('[data-media-viewer]')!;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled'),
    );
    expect(focusables.length).toBeGreaterThan(1);
    const last = focusables[focusables.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    });
    expect(document.activeElement).toBe(focusables[0]);
  });

  test('#root est INERT pendant l’ouverture, relâché à la fermeture', () => {
    let closed = 0;
    const items = attachmentsOf(MEDIA_GRID_QUAD_WITNESS_ID);
    mount({ items, startIndex: 0, onClose: () => (closed += 1) });
    const rootEl = document.getElementById('root')!;
    expect(rootEl.hasAttribute('inert')).toBe(true);

    act(() => {
      root.unmount();
    });
    expect(rootEl.hasAttribute('inert')).toBe(false);
  });
});

describe('MediaViewer — la vidéo rend un <video> réel avec poster, jamais null', () => {
  test('media-12 : la page active sur l’index vidéo porte un <video poster>', () => {
    const items = attachmentsOf(MEDIA_GRID_TRIPLE_WITNESS_ID); // [image, image, vidéo]
    const videoIndex = items.findIndex((a) => a.mimeType.startsWith('video/'));
    expect(videoIndex).toBeGreaterThanOrEqual(0);
    const body = mount({ items, startIndex: videoIndex, onClose: () => {} });

    const video = body.querySelector('[data-viewer-page] video');
    expect(video !== null).toBe(true);
    expect(video!.getAttribute('poster') !== null).toBe(true);
  });
});

/**
 * LA PIÈCE MASQUÉE, ATTEINTE DEPUIS LA VISIONNEUSE (#6189, cycle 125 —
 * « une protection de contenu se mesure sur tout ce que la charge
 * TRANSPORTE »). `MediaGrid` ne pose aucun bouton sur cette case (témoin
 * `media-grid.test.tsx`), mais `items` porte la pièce à SA position (D-41) :
 * une flèche ou un tap sur la pellicule depuis une page VOISINE l'atteint
 * quand même. Défaut mesuré AVANT ce lot : ni `ViewerImagePage/VideoPage` ni
 * `MediaFilmstrip` ne consultaient `maskedAttachment` — la case active
 * rendait le vrai `<img>` (l'URL en clair), et la vignette de la pellicule
 * aussi.
 */
describe('MediaViewer — la pièce MASQUÉE reste masquée dans la visionneuse (#6189)', () => {
  test('naviguer sur l’index masqué (media-14, index 2) : aucune <img> de la pièce, la marque protégée est posée', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    expect(items[2]!.isBlurred).toBe(true);
    const body = mount({ items, startIndex: 1, onClose: () => {} });
    const dialog = body.querySelector('[data-media-viewer]')!;

    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(body.querySelector('[data-media-viewer]')!.getAttribute('data-viewer-index')).toBe('2');
    const activePage = currentPage(body);
    expect(activePage.querySelector('img') === null).toBe(true);
    expect(activePage.querySelector('[data-protected-attachment="hidden"]') !== null).toBe(true);
  });

  test('la vignette de la pellicule pour cet index NE PORTE AUCUNE <img> (la vignette est une fuite de contenu, cycle 125)', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    const body = mount({ items, startIndex: 0, onClose: () => {} });
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems.length).toBe(items.length);
    const maskedThumb = filmstripItems[2]!;
    expect(maskedThumb.querySelector('img') === null).toBe(true);
    expect(maskedThumb.getAttribute('data-protected-attachment')).toBe('hidden');
  });

  test('CONTRE-ÉPREUVE : une pièce CLAIRE voisine (index 1) rend bien son <img> dans la page ET la pellicule', () => {
    const items = attachmentsOf(MEDIA_GRID_OVERFLOW_WITNESS_ID);
    const body = mount({ items, startIndex: 1, onClose: () => {} });
    const activePage = currentPage(body);
    expect(activePage.querySelector('img') !== null).toBe(true);
    const filmstripItems = Array.from(body.querySelectorAll('[data-filmstrip-item]'));
    expect(filmstripItems[1]!.querySelector('img') !== null).toBe(true);
  });
});
