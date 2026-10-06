import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { centeredMediaCrop } from '@meeshy/shared/utils/media-crop';

import type { SceneCarrier } from '@/lib/canvas/carrier';
import { placedMediaDesignSize } from '@/lib/canvas/media-size';
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

const overlayMedia = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-scene-object-id="overlay"] > span > img, [data-scene-object-id="overlay"] > span > video');
const overlayLayers = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-scene-object-id="overlay"] [data-media-adjustment-layer]')];

const fondImage = (el: HTMLElement) => [...el.querySelectorAll<HTMLImageElement>('img')].find((img) => img.getAttribute('src') === 'fond.png');

describe('ScenePlayer — le filtre par objet', () => {
  test('un média posé filtré se peint filtré ; le fond, lui, reste net', () => {
    const el = mount(player([background(), overlay({ filter: 'bw' })]));
    expect(overlayMedia(el)?.style.filter).toContain('grayscale(1)');
    expect(fondImage(el)).toBeDefined();
    expect(fondImage(el)?.style.filter ?? '').toBe('');
  });

  test('le filtre de SLIDE vit sur le média de fond, et ne peint que lui', () => {
    const el = mount(player([background({ filter: 'warm' }), overlay()]));
    expect(fondImage(el)?.style.filter).toContain('sepia');
    expect(overlayMedia(el)?.style.filter ?? '').toBe('');
  });
});

/**
 * LES RÉGLAGES D'UN MÉDIA POSÉ (#9497) — `payload.adjustments`, posé sur iOS
 * (#9175 / #9169), se peint sur le web : filtres CSS sur le média, teinte et
 * vignette en calques au-dessus de lui seul.
 */
describe('ScenePlayer — les réglages par objet', () => {
  test('une image réglée se peint réglée, après son filtre, comme la chaîne iOS', () => {
    const el = mount(player([background(), overlay({ filter: 'bw', adjustments: { contrast: 1.3, saturation: 0 } })]));
    expect(overlayMedia(el)?.style.filter).toBe('grayscale(1) contrast(1.1) contrast(1.3) saturate(0)');
    expect(fondImage(el)?.style.filter ?? '').toBe('');
  });

  test('la température et la vignette posent leurs calques sur le média, et sur lui seul', () => {
    const el = mount(player([background(), overlay({ mediaType: 'video', adjustments: { temperature: 1, vignette: 1 } })]));
    const layers = overlayLayers(el);
    expect(layers.map((layer) => layer.getAttribute('data-media-adjustment-layer'))).toEqual(['0', '1']);
    expect(layers[0]?.style.mixBlendMode).toBe('soft-light');
    expect(layers[1]?.style.background).toContain('radial-gradient');
    expect(el.querySelectorAll('[data-media-adjustment-layer]').length).toBe(2);
  });

  test('un média qui ne se charge pas ne laisse aucun calque peint sur le vide', () => {
    const el = mount(player([overlay({ adjustments: { temperature: 1, vignette: 1 } })]));
    expect(overlayMedia(el)?.hidden).toBe(true);
    expect(overlayLayers(el)).toEqual([]);
  });

  test('le flou suit la largeur de la source portée : 16 px d’une source de 2160 sur une boîte de 540', () => {
    const wide: SceneCarrier = { postId: 'p1', media: [{ id: 'img', src: 'photo.png', width: 2160, height: 2160 }, { id: 'fond', src: 'fond.png' }] };
    const doc = documentOf([overlay({ adjustments: { blur: 1 }, scale: 1 })]);
    const el = mount(<ScenePlayer document={doc} sceneIndex={0} mode="reader" playing={false} carrier={wide} preferredLanguages={['fr']} />);
    expect(overlayMedia(el)?.style.filter).toBe('blur(0.3704cqw)');
  });

  test('une vidéo réglée ne reçoit ni netteté ni flou', () => {
    const el = mount(player([overlay({ mediaType: 'video', adjustments: { blur: 1, sharpness: 1, saturation: 0 } })]));
    expect(overlayMedia(el)?.tagName).toBe('VIDEO');
    expect(overlayMedia(el)?.style.filter).toBe('saturate(0)');
  });

  test('une charge sans réglages, ou aux valeurs illisibles, ne peint rien et ne casse rien', () => {
    const el = mount(player([overlay({ adjustments: { exposure: 'fort', grain: 3 } })]));
    expect(overlayMedia(el)?.style.filter ?? '').toBe('');
    expect(overlayLayers(el)).toEqual([]);
  });
});

/**
 * LE RECADRAGE D'UNE IMAGE POSÉE (#9499) — posé sur iOS aux proportions de
 * `MEDIA_CROP_RATIOS`, il se lit ici par `readMediaCrop` : le CADRE de l'objet
 * prend le rapport recadré (`StoryMediaLayer.renderedPose`), l'image montre la
 * part gardée, et les réglages se peignent sur cette part, dans ce cadre.
 */
describe('ScenePlayer — le recadrage d’une image posée', () => {
  const overlayBox = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-scene-object-id="overlay"] > span');

  test('une photo 4:3 recadrée en 3:4 pose un cadre 3:4, et garde ses réglages sur la part gardée', () => {
    const crop = centeredMediaCrop(3 / 4, 4 / 3);
    const el = mount(
      player([
        overlay({
          aspectRatio: 4 / 3,
          cropX: crop.x,
          cropY: crop.y,
          cropW: crop.width,
          cropH: crop.height,
          adjustments: { contrast: 1.3 },
        }),
      ]),
    );
    expect(overlayBox(el)?.style.overflow).toBe('hidden');
    expect(overlayMedia(el)?.style.width).toBe(`${100 / crop.width}%`);
    expect(overlayMedia(el)?.style.left).toBe(`${(-crop.x / crop.width) * 100}%`);
    expect(overlayMedia(el)?.style.filter).toBe('contrast(1.3)');
  });

  test('sans recadrage, l’image remplit son cadre sans décalage', () => {
    const el = mount(player([overlay({ aspectRatio: 4 / 3 })]));
    expect(overlayMedia(el)?.style.left ?? '').toBe('');
    expect(overlayMedia(el)?.style.position ?? '').toBe('');
  });

  test('le cadre prend le rapport recadré — 3:4 dans une photo 4:3 (la taille se lit par la loi pure, happy-dom refusant `cqw`)', () => {
    const crop = centeredMediaCrop(3 / 4, 4 / 3);
    const size = placedMediaDesignSize({ aspectRatio: 4 / 3, crop });
    expect(size.width / size.height).toBeCloseTo(3 / 4, 6);
    expect(size.height).toBeCloseTo(702, 6);
  });
});
