import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, jest, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { tapTogglesChrome, useCallChrome } from './use-call-chrome';

/**
 * QUEL TOUCHER EFFACE LES COMMANDES (#8550) — un toucher sur la scène, oui ;
 * un toucher sur un bouton, jamais : même quand le bouton a REDESSINÉ son
 * glyphe avant que le toucher n'arrive à l'écran d'appel (« Couper le micro »
 * devient « Activer le micro » et son icône est remplacée : à la remontée,
 * la cible est détachée du document). L'écran décide donc à la DESCENTE du
 * toucher, en phase de capture, comme `useCallChrome`.
 */

describe('tapTogglesChrome', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(async () => releaseHappyDomIfRegistered());

  const scene = () => {
    const root = document.createElement('div');
    const stage = document.createElement('div');
    const button = document.createElement('button');
    const glyph = document.createElement('span');
    button.appendChild(glyph);
    root.append(stage, button);
    document.body.appendChild(root);
    return { root, stage, button, glyph };
  };

  const decisionOn = (root: Element, target: Element): boolean | null => {
    const seen: { value: boolean | null } = { value: null };
    const listener = (event: Event) => {
      seen.value = tapTogglesChrome(event);
    };
    root.addEventListener('click', listener, { capture: true });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root.removeEventListener('click', listener, { capture: true });
    return seen.value;
  };

  test('un toucher sur la scène efface ; sur un bouton, non', () => {
    const view = scene();
    expect(decisionOn(view.root, view.stage)).toBe(true);
    expect(decisionOn(view.root, view.glyph)).toBe(false);
    view.root.remove();
  });

  test('un bouton qui a remplacé son glyphe entre-temps garde son toucher', () => {
    const view = scene();
    view.button.addEventListener('click', () => view.button.replaceChildren(document.createElement('span')));
    expect(decisionOn(view.root, view.glyph)).toBe(false);
    view.root.remove();
  });

  /* Le toucher qui RATE de peu (#8735) : le titre d'une feuille, l'espace
     entre deux boutons d'une rangée, un vide de l'en-tête. Il appartient à ce
     qui est ouvert : effacer l'écran effacerait la feuille avec lui. */
  const nearMiss = (build: (root: HTMLElement) => Element) => {
    const root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    const target = build(root);
    document.body.appendChild(root);
    const decision = decisionOn(root, target);
    root.remove();
    return decision;
  };

  test('un toucher dans une feuille ouverte (son titre, son fond) n’efface rien', () => {
    expect(
      nearMiss((root) => {
        const sheet = document.createElement('div');
        sheet.setAttribute('role', 'dialog');
        const title = document.createElement('h2');
        sheet.appendChild(title);
        root.appendChild(sheet);
        return title;
      }),
    ).toBe(false);
  });

  test('un toucher entre deux boutons d’une rangée, ou dans un vide de l’en-tête, n’efface rien', () => {
    for (const shape of [
      ['role', 'toolbar'],
      ['data-call-header', ''],
    ] as const) {
      expect(
        nearMiss((root) => {
          const holder = document.createElement('div');
          holder.setAttribute(shape[0], shape[1]);
          const gap = document.createElement('span');
          holder.appendChild(gap);
          root.appendChild(holder);
          return gap;
        }),
      ).toBe(false);
    }
  });

  test('l’écran d’appel est lui-même un dialogue : un toucher sur sa scène efface toujours', () => {
    expect(
      nearMiss((root) => {
        const stage = document.createElement('div');
        root.appendChild(stage);
        return stage;
      }),
    ).toBe(true);
  });
});

/**
 * UN TOUCHER RANGE, LE SUIVANT REND — ET RIEN D'AUTRE (#8988, directive
 * porteur du 2026-10-01 : « On cache les contrôleurs quand on touche l'écran
 * et on les remet quand on retouche »). Aucune attente ne range les commandes
 * d'une vidéo ; le clavier les rend toujours, d'où que vienne la touche — un
 * clic sur la scène, qui n'est pas focalisable, emporte le focus HORS de
 * l'écran d'appel, sur le `<dialog>` qui le porte (mesuré dans Chromium).
 */
describe('useCallChrome', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  function Screen({ videoScene }: { readonly videoScene: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    const visibility = useCallChrome({ videoScene, root });
    return (
      <div ref={root} data-visibility={visibility}>
        <div data-stage="" />
        <button type="button" data-micro="">
          Micro
        </button>
      </div>
    );
  }

  const mount = (videoScene = true) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Screen videoScene={videoScene} />));
    const visibility = () => host.querySelector('[data-visibility]')?.getAttribute('data-visibility');
    const tap = (selector: string) => act(() => (host.querySelector(selector) as HTMLElement | null)?.click());
    const done = () => {
      act(() => root.unmount());
      host.remove();
    };
    return { host, visibility, tap, done };
  };

  test('aucune attente ne range les commandes d’une vidéo — ni 4 s, ni une heure (#8988)', () => {
    jest.useFakeTimers();
    try {
      const view = mount();
      act(() => jest.advanceTimersByTime(4_100));
      expect(view.visibility()).toBe('shown');
      act(() => jest.advanceTimersByTime(60 * 60 * 1000));
      expect(view.visibility()).toBe('shown');
      view.done();
    } finally {
      jest.useRealTimers();
    }
  });

  test('un toucher sur la scène range les commandes, le suivant les rend (#8988)', () => {
    const view = mount();
    view.tap('[data-stage]');
    expect(view.visibility()).toBe('dismissed');
    view.tap('[data-stage]');
    expect(view.visibility()).toBe('shown');
    view.done();
  });

  test('un toucher sur un bouton agit sans rien ranger', () => {
    const view = mount();
    view.tap('[data-micro]');
    expect(view.visibility()).toBe('shown');
    view.done();
  });

  test('rangées, une touche les rend — même pressée hors de l’écran d’appel, sur ce qui le porte, où le clic sur la scène a emporté le focus (#8988)', () => {
    const view = mount();
    view.tap('[data-stage]');
    act(() => void view.host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(view.visibility()).toBe('shown');
    view.done();
  });

  test('rangées, le focus qui entre dans l’écran d’appel les rend', () => {
    const view = mount();
    view.tap('[data-stage]');
    act(() => void view.host.querySelector('[data-micro]')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(view.visibility()).toBe('shown');
    view.done();
  });

  test('en audio, un toucher sur la scène ne range rien', () => {
    const view = mount(false);
    view.tap('[data-stage]');
    expect(view.visibility()).toBe('shown');
    view.done();
  });
});
