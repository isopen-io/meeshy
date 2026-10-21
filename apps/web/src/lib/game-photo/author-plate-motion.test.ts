import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { validateLottie } from '@meeshy/shared/utils/lottie-validate';

import { decodeLottie } from '@/lib/lottie/decode';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { PlateFinish } from './author-plate';
import { PLATE_BOX, PLATE_MOTION_FRAMES, plateMotion, plateMotionBytes } from './author-plate-motion';

/**
 * L'animation de la plaque est une DONNÉE générée depuis son fini (#10816) :
 * elle doit passer le validateur partagé que le moteur applique à toute
 * couche Lottie, tenir dans la boîte de la plaque, et se taire en 1,2 s.
 */
const FINISHES: readonly PlateFinish[] = ['engrave', 'emboss', 'scratch'];

type Layer = { readonly nm: string; readonly ip: number; readonly op: number };

for (const finish of FINISHES) describe(`le fini ${finish}`, () => {
  const motion = plateMotion(finish);

  test('passe le validateur partagé et le décodeur du moteur', async () => {
    expect(validateLottie(motion).ok).toBe(true);
    const decoded = await decodeLottie(plateMotionBytes(finish));
    expect(decoded.ok).toBe(true);
  });

  test('se pose sur la boîte de la plaque et ne dure qu’un temps', () => {
    expect(motion).toMatchObject({ w: PLATE_BOX.width, h: PLATE_BOX.height, ip: 0, op: PLATE_MOTION_FRAMES });
    expect(PLATE_MOTION_FRAMES / (motion['fr'] as number)).toBeCloseTo(1.2, 5);
    for (const layer of motion['layers'] as readonly Layer[]) expect(layer.op).toBeLessThanOrEqual(PLATE_MOTION_FRAMES);
  });

  test('le lustre traverse toute plaque', () => {
    expect((motion['layers'] as readonly Layer[]).map((layer) => layer.nm)).toContain('lustre');
  });
});

describe('chaque fini dit son geste', () => {
  const names = (finish: PlateFinish) => (plateMotion(finish)['layers'] as readonly Layer[]).map((layer) => layer.nm);

  test('la gravure a son burin, le grattage sa pièce et ses paillettes, l’estampage ses éclats', () => {
    expect(names('engrave')).toContain('burin');
    expect(names('scratch')).toContain('pièce');
    expect(names('scratch').filter((name) => name.startsWith('paillette')).length).toBeGreaterThan(0);
    expect(names('emboss').filter((name) => name.startsWith('éclat')).length).toBeGreaterThan(0);
  });

  test('les indices de calque sont uniques (lottie-web les adresse par `ind`)', () => {
    for (const finish of FINISHES) {
      const indices = (plateMotion(finish)['layers'] as readonly { readonly ind: number }[]).map((layer) => layer.ind);
      expect(new Set(indices).size).toBe(indices.length);
    }
  });
});

type CanvasPrototype = { getContext: (...args: unknown[]) => unknown };
type RealAnimation = { goToAndStop: (frame: number, isFrame: boolean) => void; destroy: () => void };
type RealPlayer = { loadAnimation: (args: Record<string, unknown>) => RealAnimation };

describe('le moteur réel (lottie-web light, celui de la production)', () => {
  let nativeGetContext: CanvasPrototype['getContext'] | undefined;
  beforeAll(() => {
    ensureHappyDomRegistered();
    const prototype = HTMLCanvasElement.prototype as unknown as CanvasPrototype;
    nativeGetContext = prototype.getContext;
    prototype.getContext = () => ({ fillRect: () => undefined, fillStyle: '' });
  });
  afterAll(async () => {
    if (nativeGetContext !== undefined) (HTMLCanvasElement.prototype as unknown as CanvasPrototype).getContext = nativeGetContext;
    await releaseHappyDomIfRegistered();
  });

  test('dessine chaque fini et le fait BOUGER d’une image à l’autre', async () => {
    const player = (await import('lottie-web/build/player/lottie_light')).default as unknown as RealPlayer;
    for (const finish of FINISHES) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const animation = player.loadAnimation({ container: host, renderer: 'svg', loop: false, autoplay: false, animationData: plateMotion(finish) });
      const frames = [2, 20, 50].map((frame) => {
        animation.goToAndStop(frame, true);
        return host.innerHTML;
      });
      expect(host.querySelectorAll('path').length).toBeGreaterThan(0);
      expect(new Set(frames).size).toBe(frames.length);
      animation.destroy();
      host.remove();
    }
  });
});
