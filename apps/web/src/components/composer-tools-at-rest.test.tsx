import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * LA RANGÉE D'OUTILS AU REPOS (épure #18361, règle 6) — éphémère, flou, vue unique et effets ne sont plus alignés
 * en permanence : ils se rangent derrière le « + » du composeur, avec photos, caméra et stickers qui y avaient leur
 * porte et leur doublon. Au repos, la langue d'écriture (Prisme) reste visible ; un outil ARMÉ reste visible, pour
 * qu'on voie ce qui s'appliquera et qu'on puisse le retirer.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Composer onSend={() => undefined} preferred={['fr']} />));
  return container;
};

const TOOLS = ['ephemeral', 'blur', 'view-once', 'effects'] as const;
const DOUBLES = ['sticker', 'library', 'camera'] as const;
const tool = (el: ParentNode, name: string) => el.querySelector<HTMLButtonElement>(`[data-composer-${name}]`);
const plus = (el: ParentNode) => el.querySelector<HTMLButtonElement>('button[aria-label^="Ouvrir le menu des pièces jointes"], button[aria-label="Fermer le menu des pièces jointes"]');

describe('au repos', () => {
  test('aucun des quatre outils n’est à l’écran, ni les doublons photos, caméra, stickers de la rangée', () => {
    const el = mount();
    for (const name of [...TOOLS, ...DOUBLES]) expect({ name, present: tool(el, name) !== null }).toEqual({ name, present: false });
  });

  test('la langue d’écriture reste visible', () => {
    const el = mount();
    expect(el.querySelector('[data-composer-language]')).not.toBeNull();
  });
});

describe('derrière le « + »', () => {
  test('le « + » range les quatre outils, atteignables', () => {
    const el = mount();
    act(() => plus(el)?.click());
    for (const name of TOOLS) expect({ name, present: tool(el, name) !== null }).toEqual({ name, present: true });
  });

  test('les photos, la caméra et les stickers restent atteignables par le MÊME « + » (panneau)', async () => {
    const el = mount();
    act(() => plus(el)?.click());
    for (let tries = 0; tries < 50 && el.querySelector('[data-composer-panel]') === null; tries += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    expect(el.querySelector('[data-composer-panel]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Choisir des photos"]')).not.toBeNull();
  });

  test('un outil armé reste à l’écran panneau refermé, et se retire d’un toucher', () => {
    const el = mount();
    act(() => plus(el)?.click());
    act(() => tool(el, 'blur')?.click());
    act(() => plus(el)?.click());
    expect(el.querySelector('[data-composer-panel]')).toBeNull();
    expect(tool(el, 'blur')?.getAttribute('aria-pressed')).toBe('true');
    expect(tool(el, 'ephemeral')).toBeNull();
    act(() => tool(el, 'blur')?.click());
    expect(tool(el, 'blur')).toBeNull();
  });
});
