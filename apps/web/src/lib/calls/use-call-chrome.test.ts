import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { chromeInteractive } from './call-controls';
import { tapTogglesChrome } from './use-call-chrome';

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
 * UN BOUTON VISIBLE RÉPOND (#8735) — effacées par l'attente (`resting`), les
 * commandes restent sous le doigt : le toucher agit ET les rend. Seul ce
 * qu'un toucher sur la scène a rangé (`dismissed`) laisse passer le doigt.
 */
describe('chromeInteractive', () => {
  test('montrées ou effacées par l’attente, elles répondent ; rangées d’un toucher, non', () => {
    expect(chromeInteractive('shown')).toBe(true);
    expect(chromeInteractive('resting')).toBe(true);
    expect(chromeInteractive('dismissed')).toBe(false);
  });
});
