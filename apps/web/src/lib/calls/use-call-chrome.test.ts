import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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
});
