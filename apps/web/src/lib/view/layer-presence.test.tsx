import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { DIALOG_FADE_MS } from './dialog-exit';
import { LAYER_MOTION_MS, layerMotion, useLayerPresence } from './layer-presence';

/**
 * UNE COUCHE MONTÉE SOUS CONDITION ENTRE ET SORT EN MOUVEMENT (#18327) — menu ancré, bandeau, toast,
 * liste flottante : la valeur qui la montait reste tenue le temps du fondu de sortie, la couche porte
 * `data-leaving` pendant ce temps, puis s'en va. Sous « Réduire les animations », le retrait est immédiat.
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

const mounter = createActMounter();
let originalMatchMedia: typeof window.matchMedia;
beforeAll(() => {
  originalMatchMedia = window.matchMedia;
});
afterEach(() => {
  mounter.unmountAll();
  window.matchMedia = originalMatchMedia;
});

const reduceMotion = (): void => {
  window.matchMedia = ((query: string) => ({ ...originalMatchMedia.call(window, query), matches: query.includes('reduce') })) as typeof window.matchMedia;
};

function Toast({ text }: { readonly text: string | null }) {
  const shown = useLayerPresence(text);
  if (shown.value === null) return null;
  return (
    <p data-toast {...layerMotion(shown.leaving)}>
      {shown.value}
    </p>
  );
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('useLayerPresence', () => {
  test('la couche fermée reste montée, en sortie, avec sa dernière valeur, puis s’en va après le fondu', async () => {
    const host = await mounter.mount(<Toast text="Envoyé à Ana" />);
    expect(host.querySelector('[data-toast]')?.hasAttribute('data-leaving')).toBe(false);

    await mounter.rerender(host, <Toast text={null} />);
    const leaving = host.querySelector('[data-toast]');
    expect(leaving?.textContent).toBe('Envoyé à Ana');
    expect(leaving?.hasAttribute('data-leaving')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);

    await wait(LAYER_MOTION_MS + 30);
    expect(host.querySelector('[data-toast]')).toBeNull();
  });

  test('rouverte pendant sa sortie, la couche reprend sans remonter', async () => {
    const host = await mounter.mount(<Toast text="A" />);
    const first = host.querySelector('[data-toast]');
    await mounter.rerender(host, <Toast text={null} />);
    await mounter.rerender(host, <Toast text="B" />);
    await wait(LAYER_MOTION_MS + 30);
    const again = host.querySelector('[data-toast]');
    expect(again).toBe(first);
    expect(again?.textContent).toBe('B');
    expect(again?.hasAttribute('data-leaving')).toBe(false);
  });

  test('sous « Réduire les animations », le retrait est immédiat', async () => {
    reduceMotion();
    const host = await mounter.mount(<Toast text="A" />);
    await mounter.rerender(host, <Toast text={null} />);
    expect(host.querySelector('[data-toast]')).toBeNull();
  });

  test('la durée est le fondu de K13, posée sur la couche pour la feuille de style', () => {
    expect(LAYER_MOTION_MS).toBe(DIALOG_FADE_MS);
    expect(layerMotion(false).style).toEqual({ '--layer-ms': `${DIALOG_FADE_MS}ms` });
  });

  test('l’entrée et la sortie ne jouent que l’opacité, translate et scale, et rien sous réduction', () => {
    const css = readFileSync(new URL('../../styles/layer-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion).toContain('[data-layer-motion]');
    expect(motion).toMatch(/\[data-layer-motion\]\[data-leaving\]\s*\{\s*animation-name:\s*layer-out/);
    const keyframes = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)].map((match) => match[1] ?? '');
    expect(keyframes.length).toBe(2);
    for (const body of keyframes) {
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);
      expect(properties.every((property) => ['opacity', 'translate', 'scale'].includes(property ?? ''))).toBe(true);
    }
    expect(readFileSync(new URL('./layer-presence.ts', import.meta.url), 'utf8')).toContain("import '@/styles/layer-motion.css'");
  });
});
