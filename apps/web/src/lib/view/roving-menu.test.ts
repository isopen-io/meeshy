import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { findFocusableIndex, useRovingMenu, type RovingMenu, type RovingMenuOptions } from './roving-menu';
import { useBackDismiss } from './use-back-dismiss';

/**
 * LA PARTIE PURE DU MENU ANCRÉ PARTAGÉ (#5559 défaut 4) — la navigation
 * clavier elle-même (roving tabindex, saut des lignes désactivées),
 * extraite de `ReadingModeChip` où elle vivait sous le nom `findFocusable`
 * avant l'extraction : mêmes bornes, même comportement, exactement les cas
 * que `check-reading-mode.mjs` exerce déjà au navigateur.
 */
describe('findFocusableIndex', () => {
  const NONE_DISABLED = () => false;

  test('avance d’UN cran, avec bouclage', () => {
    expect(findFocusableIndex(4, 0, 1, NONE_DISABLED)).toBe(1);
    expect(findFocusableIndex(4, 3, 1, NONE_DISABLED)).toBe(0);
  });

  test('recule d’UN cran, avec bouclage', () => {
    expect(findFocusableIndex(4, 1, -1, NONE_DISABLED)).toBe(0);
    expect(findFocusableIndex(4, 0, -1, NONE_DISABLED)).toBe(3);
  });

  test('« Home » (start = -1, direction 1) rend le premier index', () => {
    expect(findFocusableIndex(4, -1, 1, NONE_DISABLED)).toBe(0);
  });

  test('« End » (start = count, direction -1) rend le dernier index', () => {
    expect(findFocusableIndex(4, 4, -1, NONE_DISABLED)).toBe(3);
  });

  test('saute une ligne DÉSACTIVÉE — jamais ne s’y arrête', () => {
    const isDisabledAt = (index: number) => index === 1;
    expect(findFocusableIndex(4, 0, 1, isDisabledAt)).toBe(2);
    expect(findFocusableIndex(4, 2, -1, isDisabledAt)).toBe(0);
  });

  test('« Home » saute aussi une première ligne désactivée', () => {
    const isDisabledAt = (index: number) => index === 0;
    expect(findFocusableIndex(4, -1, 1, isDisabledAt)).toBe(1);
  });

  test('tout désactivé : rend le point de départ plutôt que boucler indéfiniment', () => {
    expect(findFocusableIndex(3, 0, 1, () => true)).toBe(0);
  });
});

/**
 * LE MENU OUVERT EST LA COUCHE DU DESSUS (#18460). `useRovingMenu` porte dix-sept
 * menus ; il n'écoutait qu'Échap et l'appui extérieur. Le retour matériel
 * Android et Précédent quittaient l'écran (ou fermaient la feuille du dessous),
 * et Échap fermait le menu ET le `<dialog>` qui le portait.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Probe = { current: RovingMenu | null };

function Menu({ probe, options }: { readonly probe: Probe; readonly options: Partial<RovingMenuOptions> }) {
  const roving = useRovingMenu({ itemCount: 1, ...options });
  probe.current = roving;
  return roving.mounted ? createElement('div', { ref: roving.menuRef, role: 'menu', 'data-leaving': roving.leaving ? '' : undefined }) : null;
}

function Below({ onClose }: { readonly onClose: () => void }) {
  useBackDismiss(onClose);
  return null;
}

function Scene({ probe, options, onCloseBelow }: { readonly probe: Probe; readonly options: Partial<RovingMenuOptions>; readonly onCloseBelow?: () => void }) {
  return createElement(Fragment, null, onCloseBelow === undefined ? null : createElement(Below, { onClose: onCloseBelow }), createElement(Menu, { probe, options }));
}

function mountScene(options: Partial<RovingMenuOptions> = {}, onCloseBelow?: () => void): { readonly probe: Probe; readonly root: Root; readonly container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const probe: Probe = { current: null };
  act(() => {
    root.render(createElement(Scene, { probe, options, ...(onCloseBelow === undefined ? {} : { onCloseBelow }) }));
  });
  return { probe, root, container };
}

function unmountScene({ root, container }: { readonly root: Root; readonly container: HTMLElement }): void {
  act(() => root.unmount());
  container.remove();
}

function spyPushState(): { readonly count: () => number; readonly restore: () => void } {
  let pushes = 0;
  const original = window.history.pushState.bind(window.history);
  window.history.pushState = (...args: Parameters<History['pushState']>) => {
    pushes += 1;
    original(...args);
  };
  return { count: () => pushes, restore: () => (window.history.pushState = original) };
}

describe('useRovingMenu — le menu ouvert est la couche du dessus (#18460)', () => {
  test('ouvrir pose une entrée, et le retour ferme le menu seul : la couche du dessous reste ouverte', async () => {
    let belowClosed = 0;
    const scene = mountScene({}, () => {
      belowClosed += 1;
    });
    const spy = spyPushState();
    try {
      act(() => scene.probe.current?.setOpen(true));
      await act(async () => {
        window.history.back();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect({ pushes: spy.count(), open: scene.probe.current?.open, belowClosed }).toEqual({ pushes: 1, open: false, belowClosed: 0 });
    } finally {
      spy.restore();
      unmountScene(scene);
    }
  });

  test('Échap, un <dialog> ouvert dessous : ferme le menu seul et empêche la demande de fermeture du dialogue', () => {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    const scene = mountScene();
    try {
      act(() => scene.probe.current?.setOpen(true));
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => {
        dialog.dispatchEvent(event);
      });
      expect({ open: scene.probe.current?.open, prevented: event.defaultPrevented }).toEqual({ open: false, prevented: true });
    } finally {
      unmountScene(scene);
      dialog.remove();
    }
  });

  test('layer: false ne pose aucune entrée, et Échap ferme comme avant sans rien empêcher', () => {
    const scene = mountScene({ layer: false });
    const spy = spyPushState();
    try {
      act(() => scene.probe.current?.setOpen(true));
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => {
        document.body.dispatchEvent(event);
      });
      expect({ pushes: spy.count(), open: scene.probe.current?.open, prevented: event.defaultPrevented }).toEqual({ pushes: 0, open: false, prevented: false });
    } finally {
      spy.restore();
      unmountScene(scene);
    }
  });
});

describe('useRovingMenu — la présence de sortie (#18460)', () => {
  test('sans exitMs, mounted suit open', () => {
    const scene = mountScene({ layer: false });
    try {
      act(() => scene.probe.current?.setOpen(true));
      act(() => scene.probe.current?.setOpen(false));
      expect({ mounted: scene.probe.current?.mounted, leaving: scene.probe.current?.leaving }).toEqual({ mounted: false, leaving: false });
    } finally {
      unmountScene(scene);
    }
  });

  test('exitMs garde le menu monté et en sortie jusqu’au terme', async () => {
    const scene = mountScene({ layer: false, exitMs: 40 });
    try {
      act(() => scene.probe.current?.setOpen(true));
      act(() => scene.probe.current?.setOpen(false));
      const during = { mounted: scene.probe.current?.mounted, leaving: scene.probe.current?.leaving };
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      const after = { mounted: scene.probe.current?.mounted, leaving: scene.probe.current?.leaving };
      expect({ during, after }).toEqual({ during: { mounted: true, leaving: true }, after: { mounted: false, leaving: false } });
    } finally {
      unmountScene(scene);
    }
  });

  test('une réouverture pendant la sortie l’annule', async () => {
    const scene = mountScene({ layer: false, exitMs: 40 });
    try {
      act(() => scene.probe.current?.setOpen(true));
      act(() => scene.probe.current?.setOpen(false));
      act(() => scene.probe.current?.setOpen(true));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect({ open: scene.probe.current?.open, mounted: scene.probe.current?.mounted, leaving: scene.probe.current?.leaving }).toEqual({
        open: true,
        mounted: true,
        leaving: false,
      });
    } finally {
      unmountScene(scene);
    }
  });

  test('sous Réduire les animations, mounted tombe dans le même rendu', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    const scene = mountScene({ layer: false, exitMs: 40 });
    try {
      act(() => scene.probe.current?.setOpen(true));
      act(() => scene.probe.current?.setOpen(false));
      expect({ mounted: scene.probe.current?.mounted, leaving: scene.probe.current?.leaving }).toEqual({ mounted: false, leaving: false });
    } finally {
      unmountScene(scene);
      window.matchMedia = original;
    }
  });
});
