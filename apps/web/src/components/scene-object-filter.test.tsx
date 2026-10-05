import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import ScenePlayer from './scene-player';

/**
 * LE FILTRE D'UN MÉDIA SE PEINT SUR CE MÉDIA, ET SUR LUI SEUL (lot 7, #8474)
 * — le moteur partagé (composer ET lecteur) relit `payload.filter` de chaque
 * objet `media` : le média posé filtré ne teinte ni le fond ni les autres.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
  return container;
}

function documentOf(objects: readonly unknown[]): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'img', src: 'photo.png' }, { id: 'fond', src: 'fond.png' }] };
const IDENTITY = { scale: 1, rotation: 0, opacity: 1 };
const CENTER = { t: 'free', x: 0.5, y: 0.5 };

const player = (objects: readonly unknown[]) => (
  <ScenePlayer document={documentOf(objects)} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} />
);

const background = (extra: Record<string, unknown> = {}) => ({
  id: 'background',
  kind: 'media',
  anchor: CENTER,
  plane: 'content',
  z: 0,
  transform: IDENTITY,
  payload: { postMediaId: 'fond', mediaType: 'image', isBackground: true, ...extra },
});

const overlay = (extra: Record<string, unknown> = {}) => ({
  id: 'overlay',
  kind: 'media',
  anchor: CENTER,
  plane: 'fg',
  z: 2,
  transform: IDENTITY,
  payload: { postMediaId: 'img', mediaType: 'image', aspectRatio: 1, ...extra },
});

const fondImage = (el: HTMLElement) => [...el.querySelectorAll<HTMLImageElement>('img')].find((img) => img.getAttribute('src') === 'fond.png');

describe('ScenePlayer — le filtre par objet', () => {
  test('un média posé filtré se peint filtré ; le fond, lui, reste net', () => {
    const el = mount(player([background(), overlay({ filter: 'bw' })]));
    expect(el.querySelector<HTMLElement>('[data-scene-object-id="overlay"] > span')?.style.filter).toContain('grayscale(1)');
    expect(fondImage(el)).toBeDefined();
    expect(fondImage(el)?.style.filter ?? '').toBe('');
  });

  test('le filtre de SLIDE vit sur le média de fond, et ne peint que lui', () => {
    const el = mount(player([background({ filter: 'warm' }), overlay()]));
    expect(fondImage(el)?.style.filter).toContain('sepia');
    expect(el.querySelector<HTMLElement>('[data-scene-object-id="overlay"] > span')?.style.filter ?? '').toBe('');
  });
});
