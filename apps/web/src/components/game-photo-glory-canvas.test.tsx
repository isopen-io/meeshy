import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PaintSurface } from '@/lib/game-photo/glory/paint-glory-frame';
import type { GloryRecipe, GloryScene, GlorySceneInput } from '@/lib/game-photo/glory/glory-scene';
import { scratchPool } from '@/lib/game-photo/scratch';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GamePhotoGloryCanvas } from './game-photo-glory-canvas';

/**
 * L'APERÇU D'UN CADRE DÉCORÉ (#10159, § 5.5) repeint jusqu'à 30 fois par
 * seconde pendant le direct. Vu rouge d'abord : chaque peinture demandait au
 * peintre une surface de travail NEUVE en pixels de DESIGN (1080 × 1920,
 * 8,3 Mo) pour un canvas de 400 px de large — ~250 Mo/s de canevas jamais
 * réutilisés. La surface doit être la MÊME d'une peinture à l'autre, et à
 * l'échelle de l'affichage.
 */

const { mount, rerender, unmountAll } = createActMounter();
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const BOX = { left: 0, top: 0, width: 400, height: 711, x: 0, y: 0, right: 400, bottom: 711, toJSON: () => undefined };

const fakeContext = () => {
  const props: Record<string, unknown> = { globalCompositeOperation: 'source-over' };
  return {
    setTransform: () => undefined,
    clearRect: () => undefined,
    get globalCompositeOperation() {
      return props.globalCompositeOperation;
    },
    set globalCompositeOperation(value: unknown) {
      props.globalCompositeOperation = value;
    },
  };
};

let getContext: PropertyDescriptor | undefined;
let bounding: PropertyDescriptor | undefined;
beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => fakeContext() });
  bounding = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', { configurable: true, value: () => BOX });
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 1 });
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  if (getContext === undefined) delete (HTMLCanvasElement.prototype as { getContext?: unknown }).getContext;
  else Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext);
  if (bounding === undefined) delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  else Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', bounding);
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const recipeOf = (showFlame: boolean): GloryRecipe => ({ pose: null, message: null, crop: { dx: 0, dy: 0, zoom: 1 }, showFlame, showLink: true });

describe('la surface de travail de l’aperçu', () => {
  test('deux peintures demandent la MÊME surface, en pixels d’affichage (400 × 711), jamais un canevas neuf en pixels de design', async () => {
    const surfaces: (PaintSurface | null)[] = [];
    const scene: GloryScene = {
      frame: { id: 'savane.ambassadeur-2' } as unknown as GloryScene['frame'],
      pack: 'afrique',
      crest: null,
      bannerLayout: () => null,
      paint: (_ctx, input: GlorySceneInput) => void surfaces.push(input.scratch(1080, 1920)),
      close: () => undefined,
    };
    const kit = { art: { emblem: {} as CanvasImageSource, mee: {} as CanvasImageSource, meo: {} as CanvasImageSource, signature: {} as CanvasImageSource }, palette: { top: '#000', bottom: '#000', ink: '#fff', inkSoft: '#ccc', scrim: '#000' }, fontFamily: 'system-ui', scratch: scratchPool(createCanvas) };
    const photo = { image: {} as CanvasImageSource, width: 1080, height: 1920, mirror: false };
    const host = await mount(<GamePhotoGloryCanvas scene={scene} kit={kit} source={{ kind: 'photo', photo }} banner={null} recipe={recipeOf(true)} />);
    await rerender(host, <GamePhotoGloryCanvas scene={scene} kit={kit} source={{ kind: 'photo', photo }} banner={null} recipe={recipeOf(false)} />);
    expect(surfaces).toHaveLength(2);
    const [first, second] = surfaces;
    expect(first).not.toBeNull();
    expect(first?.image).toBe(second?.image);
    const canvas = first?.image as HTMLCanvasElement;
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(711);
  });
});
