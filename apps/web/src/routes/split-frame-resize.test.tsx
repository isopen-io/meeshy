import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { SPLIT_QUERY } from '@/lib/view/split-query';
import { floatingMenusReady } from '@/test-support/floating-menus-ready';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SplitFrame } from './split-frame';
import { SPLIT_WIDTH_STORAGE_KEY, splitHandleLabel } from './split-handle';

/**
 * LE SÉPARATEUR ENTRE LA LISTE ET LE FIL SE DÉPLACE (#10101) — sur grand écran,
 * la liste va de sa largeur minimale (20rem) jusqu'à ce que le fil n'occupe
 * plus que 60 % du cadre (la liste plafonne à 40 %). Souris et doigt (pointer
 * events), clavier (flèches, Origine, Fin), double-clic = largeur par défaut
 * (24rem) ; la largeur se retient par appareil. Pendant le glisser, la liste
 * suit le pointeur par une variable CSS du cadre : AUCUN rendu React par pixel,
 * ni de la liste ni du fil, et la préférence ne s'écrit qu'au relâchement.
 *
 * Le cadre mesure 1280 px dans ces scénarios : minimum 320 px (25 %), défaut
 * 384 px (30 %), maximum 512 px (40 %).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let originalMatchMedia: typeof window.matchMedia;
let originalInnerWidth: number;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  originalMatchMedia = window.matchMedia;
  originalInnerWidth = window.innerWidth;
  window.matchMedia = ((query: string) => ({
    matches: query === SPLIT_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  await floatingMenusReady();
});

afterAll(async () => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const renders = { list: 0, thread: 0 };

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  window.localStorage.clear();
  document.documentElement.dir = 'ltr';
  renders.list = 0;
  renders.thread = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  document.documentElement.dir = 'ltr';
  window.localStorage.clear();
});

function ListStub() {
  renders.list += 1;
  return <ul data-list-stub />;
}

function ThreadStub() {
  renders.thread += 1;
  return <main data-thread-stub />;
}

const thread = <ThreadStub />;
const screenOf = (key: string) => (key === 'list' ? ListStub : undefined);

function mount(): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<SplitFrame routeKey="thread" screen={thread} screenOf={screenOf} />));
  return container;
}

const handleOf = (el: HTMLElement): HTMLElement => {
  const handle = el.querySelector<HTMLElement>('[role="separator"]');
  if (handle === null) throw new Error('aucun séparateur');
  return handle;
};

const frameOf = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>('[data-split-frame]')!;

const sheet = readFileSync(new URL('../styles/split-frame.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const ruleOf = (selector: string): string => {
  const start = sheet.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sheet.slice(start, sheet.indexOf('}', start));
};

const listWidthOf = (el: HTMLElement): string => frameOf(el).style.getPropertyValue('--split-list-w');

const press = (handle: HTMLElement, key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });

const pointer = (handle: HTMLElement, type: string, clientX: number) =>
  act(() => {
    handle.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX, pointerId: 7, button: 0, isPrimary: true }));
  });

describe('le séparateur se présente (#10101)', () => {
  test('séparateur vertical, nommé dans la langue de l’interface, focalisable, qui pilote la liste', () => {
    const el = mount();
    const handle = handleOf(el);
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-label')).toBe(splitHandleLabel('fr'));
    expect(handle.tabIndex).toBe(0);
    const controlled = handle.getAttribute('aria-controls');
    expect(controlled).not.toBeNull();
    expect(el.querySelector(`#${controlled}`)?.hasAttribute('data-split-list')).toBe(true);
  });

  test('ses bornes : 25 % (20rem), 40 % (le fil garde 60 %), 30 % par défaut', () => {
    const handle = handleOf(mount());
    expect(handle.getAttribute('aria-valuemin')).toBe('25');
    expect(handle.getAttribute('aria-valuemax')).toBe('40');
    expect(handle.getAttribute('aria-valuenow')).toBe('30');
    expect(handle.getAttribute('aria-valuetext')).toContain('30');
  });

  test('le cadre borne la colonne de la liste, sur les cotes qu’il porte : 20rem, 24rem, 40 %', () => {
    const frame = frameOf(mount());
    expect(frame.style.getPropertyValue('--split-list-min')).toBe('20rem');
    expect(frame.style.getPropertyValue('--split-list-default')).toBe('24rem');
    expect(frame.style.getPropertyValue('--split-list-max')).toBe('40%');
    const rule = ruleOf('[data-split-frame]').replace(/\s+/g, ' ');
    expect(rule).toContain('grid-template-columns: clamp(var(--split-list-min), var(--split-list-w, var(--split-list-default)), var(--split-list-max)) 1px minmax(0, 1fr)');
  });

  test('la largeur qui change à chaque image ne s’hérite pas : seul le cadre recalcule son style', () => {
    const rule = ruleOf('@property --split-list-w');
    expect(rule).toContain('inherits: false');
  });

  test('le libellé parle les sept langues', () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
      expect(splitHandleLabel(language).length).toBeGreaterThan(0);
    }
    expect(splitHandleLabel('en')).not.toBe(splitHandleLabel('fr'));
  });
});

describe('au clavier', () => {
  test('les flèches déplacent d’un pas, Origine et Fin vont aux bornes, jamais au-delà', () => {
    const el = mount();
    const handle = handleOf(el);
    press(handle, 'ArrowRight');
    expect(listWidthOf(el)).toBe('400px');
    expect(handle.getAttribute('aria-valuenow')).toBe('31');
    press(handle, 'ArrowLeft');
    press(handle, 'ArrowLeft');
    expect(listWidthOf(el)).toBe('368px');
    press(handle, 'End');
    expect(listWidthOf(el)).toBe('512px');
    expect(handle.getAttribute('aria-valuenow')).toBe('40');
    press(handle, 'ArrowRight');
    expect(listWidthOf(el)).toBe('512px');
    press(handle, 'Home');
    expect(listWidthOf(el)).toBe('320px');
    expect(handle.getAttribute('aria-valuenow')).toBe('25');
    press(handle, 'ArrowLeft');
    expect(listWidthOf(el)).toBe('320px');
  });

  test('Maj + flèche fait un grand pas', () => {
    const el = mount();
    press(handleOf(el), 'ArrowRight', { shiftKey: true });
    expect(listWidthOf(el)).toBe('448px');
  });

  test('en arabe, les flèches suivent le sens de lecture : la liste est à droite, ← l’élargit', () => {
    document.documentElement.dir = 'rtl';
    const el = mount();
    press(handleOf(el), 'ArrowLeft');
    expect(listWidthOf(el)).toBe('400px');
    press(handleOf(el), 'ArrowRight');
    press(handleOf(el), 'ArrowRight');
    expect(listWidthOf(el)).toBe('368px');
  });

  test('une touche sans objet ne fait rien et n’est pas consommée', () => {
    const el = mount();
    const handle = handleOf(el);
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    act(() => {
      handle.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(listWidthOf(el)).toBe('');
  });
});

describe('au glisser, souris ou doigt', () => {
  test('la liste suit le pointeur sans aucun rendu React, la préférence ne s’écrit qu’au relâchement', () => {
    const el = mount();
    const handle = handleOf(el);
    const before = { ...renders };
    pointer(handle, 'pointerdown', 384);
    pointer(handle, 'pointermove', 420);
    pointer(handle, 'pointermove', 484);
    expect(listWidthOf(el)).toBe('484px');
    expect(handle.getAttribute('aria-valuenow')).toBe('38');
    expect(renders).toEqual(before);
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBeNull();
    pointer(handle, 'pointerup', 484);
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('484');
    expect(listWidthOf(el)).toBe('484px');
    /* Le relâchement valide l'état : ni la liste ni le fil ne se re-rendent. */
    expect(renders).toEqual(before);
  });

  test('le glisser est borné : 40 % au plus, 20rem au moins', () => {
    const el = mount();
    const handle = handleOf(el);
    pointer(handle, 'pointerdown', 384);
    pointer(handle, 'pointermove', 1100);
    expect(listWidthOf(el)).toBe('512px');
    pointer(handle, 'pointermove', 0);
    expect(listWidthOf(el)).toBe('320px');
    pointer(handle, 'pointerup', 0);
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('320');
  });

  test('un geste revenu à son point de départ ne crée aucune préférence : la largeur par défaut reste celle par défaut', () => {
    const el = mount();
    const handle = handleOf(el);
    pointer(handle, 'pointerdown', 384);
    pointer(handle, 'pointermove', 450);
    pointer(handle, 'pointermove', 384);
    pointer(handle, 'pointerup', 384);
    expect(listWidthOf(el)).toBe('');
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBeNull();
    expect(handle.getAttribute('aria-valuenow')).toBe('30');
  });

  test('un déplacement sans appui préalable ne déplace rien', () => {
    const el = mount();
    pointer(handleOf(el), 'pointermove', 500);
    expect(listWidthOf(el)).toBe('');
  });

  test('en arabe, tirer vers la gauche élargit la liste', () => {
    document.documentElement.dir = 'rtl';
    const el = mount();
    const handle = handleOf(el);
    pointer(handle, 'pointerdown', 896);
    pointer(handle, 'pointermove', 846);
    expect(listWidthOf(el)).toBe('434px');
    pointer(handle, 'pointerup', 846);
  });

  test('un relâchement interrompu (pointercancel) retient la position atteinte', () => {
    const el = mount();
    const handle = handleOf(el);
    pointer(handle, 'pointerdown', 384);
    pointer(handle, 'pointermove', 430);
    pointer(handle, 'pointercancel', 430);
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('430');
    pointer(handle, 'pointermove', 500);
    expect(listWidthOf(el)).toBe('430px');
  });
});

describe('double-clic et mémoire de l’appareil', () => {
  test('le double-clic rend la largeur par défaut et oublie la préférence', () => {
    const el = mount();
    const handle = handleOf(el);
    press(handle, 'End');
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('512');
    act(() => {
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    expect(listWidthOf(el)).toBe('');
    expect(handle.getAttribute('aria-valuenow')).toBe('30');
    expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBeNull();
  });

  test('un nouveau montage relit la largeur retenue', () => {
    window.localStorage.setItem(SPLIT_WIDTH_STORAGE_KEY, '450');
    const el = mount();
    expect(listWidthOf(el)).toBe('450px');
    expect(handleOf(el).getAttribute('aria-valuenow')).toBe('35');
  });

  test('une préférence illisible est ignorée : la largeur par défaut', () => {
    window.localStorage.setItem(SPLIT_WIDTH_STORAGE_KEY, 'large');
    const el = mount();
    expect(listWidthOf(el)).toBe('');
    expect(handleOf(el).getAttribute('aria-valuenow')).toBe('30');
  });

  test('un stockage refusé (navigation privée, données bloquées) ne casse rien : défaut, clavier, glisser, double-clic', () => {
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('refusé', 'SecurityError');
      },
    });
    try {
      const el = mount();
      const handle = handleOf(el);
      expect(handle.getAttribute('aria-valuenow')).toBe('30');
      press(handle, 'ArrowRight');
      expect(listWidthOf(el)).toBe('400px');
      pointer(handle, 'pointerdown', 400);
      pointer(handle, 'pointermove', 440);
      pointer(handle, 'pointerup', 440);
      expect(listWidthOf(el)).toBe('440px');
      act(() => {
        handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      });
      expect(listWidthOf(el)).toBe('');
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: storage });
    }
  });
});
