import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ViewerActionRail, type ViewerAction } from './viewer-chrome';

/**
 * LES EFFETS DU RAIL DES PLEIN ÉCRANS (directive porteur 2026-10-01) — « remettre
 * dans la lecture des story les effets qu'il y avait sur l'icône son, le cœur
 * […] ainsi que le contour du cœur sur tous les autres éléments lorsqu'on a
 * commenté, partagé ». Le chrome commun (#8879) les avait perdus : un disque
 * neutre, quel que soit l'état.
 *
 *  - HALO (`glow`) : l'action est ALLUMÉE (son ouvert, cœur posé) ;
 *  - CONTOUR (`contour`) : le lecteur a déjà FAIT ce geste (aimé, commenté,
 *    envoyé, republié) — l'anneau du cœur, porté par chaque action ;
 *  - REBOND : l'état change sous le doigt — jamais au montage, qui n'est pas un
 *    geste.
 */
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

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function mount(node: ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

async function rerender(node: ReactElement): Promise<void> {
  await act(async () => root?.render(node));
}

const action = (patch: Partial<ViewerAction> = {}): ViewerAction => ({
  action: 'react',
  label: 'Réagir',
  glyph: <span data-glyph="heart" />,
  onPress: () => undefined,
  ...patch,
});

const rail = (actions: readonly ViewerAction[]) => <ViewerActionRail label="Actions" actions={actions} />;

const disc = (host: HTMLElement, name: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(`[data-viewer-action="${name}"] [data-viewer-disc]`);

describe('le contour de participation', () => {
  test('une action déjà faite porte l’anneau, dans la couleur remise', async () => {
    const view = await mount(rail([action({ action: 'comments', contour: 'rgb(255, 45, 85)' })]));
    const ring = disc(view, 'comments')?.querySelector<HTMLElement>('[data-viewer-contour]');
    expect(ring).not.toBeNull();
    expect(ring?.getAttribute('aria-hidden')).toBe('true');
    expect(ring?.style.boxShadow).toContain('rgb(255, 45, 85)');
  });

  test('une action jamais faite n’a pas d’anneau — l’anneau DIT quelque chose', async () => {
    const view = await mount(rail([action({ action: 'share' })]));
    expect(disc(view, 'share')?.querySelector('[data-viewer-contour]')).toBeNull();
  });

  test('l’anneau ne change pas le nom accessible : l’état se dit par `aria-pressed`, pas par un décor', async () => {
    const view = await mount(rail([action({ action: 'comments', label: 'Commentaires', contour: 'red' })]));
    expect(view.querySelector('[data-viewer-action="comments"]')?.getAttribute('aria-label')).toBe('Commentaires');
  });
});

describe('le halo d’une action allumée', () => {
  test('l’action allumée rayonne de sa couleur ; éteinte, elle ne rayonne pas', async () => {
    const view = await mount(rail([action({ action: 'sound', glow: 'rgb(129, 140, 248)' }), action({ action: 'share' })]));
    expect(disc(view, 'sound')?.getAttribute('data-viewer-glow')).toBe('');
    const halo = disc(view, 'sound')?.querySelector<HTMLElement>('[data-viewer-halo]');
    expect(halo?.getAttribute('aria-hidden')).toBe('true');
    expect(halo?.style.boxShadow).toContain('rgb(129, 140, 248)');
    expect(disc(view, 'share')?.hasAttribute('data-viewer-glow')).toBe(false);
    expect(disc(view, 'share')?.querySelector('[data-viewer-halo]')).toBeNull();
  });
});

describe('le rebond', () => {
  test('rien ne rebondit au montage — ouvrir une story n’est pas un geste', async () => {
    const view = await mount(rail([action({ glow: 'red', contour: 'red' })]));
    expect(view.querySelector('[data-viewer-pop]')).toBeNull();
  });

  test('allumer une action la fait rebondir', async () => {
    const view = await mount(rail([action()]));
    await rerender(rail([action({ glow: 'red', contour: 'red' })]));
    const pop = disc(view, 'react');
    expect(pop?.hasAttribute('data-viewer-pop')).toBe(true);
    expect(pop?.className).toContain('viewer-disc-pop');
  });

  test('l’éteindre rebondit aussi : le son coupé se voit autant que le son rendu', async () => {
    const view = await mount(rail([action({ action: 'sound', glow: 'indigo' })]));
    await rerender(rail([action({ action: 'sound' })]));
    expect(disc(view, 'sound')?.hasAttribute('data-viewer-pop')).toBe(true);
  });

  test('un rendu qui ne change pas l’état ne relance rien', async () => {
    const view = await mount(rail([action({ count: 1 })]));
    await rerender(rail([action({ count: 2 })]));
    expect(view.querySelector('[data-viewer-pop]')).toBeNull();
  });
});
