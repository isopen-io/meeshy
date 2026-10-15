import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { decodeLottie } from './decode';
import { BUILTIN_LOTTIE_SRCS, lottieBytesLoader } from './sources';

/**
 * CE QUE LE MOTEUR RÉEL FAIT DES FICHIERS RÉELS (#10638) — les témoins de
 * `<LottieLayer>` jouent un faux moteur ; ceux-ci prennent `lottie-web` light
 * (le moteur que la production importe) et les fichiers que le produit sert :
 * les trois couches intégrées écrites à la main BOUGENT d'une image à l'autre,
 * et chaque MeeSticker `.lottie` du corpus passe le lecteur et le validateur.
 */
const STICKERS = new URL('../../../../../packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers/', import.meta.url);

type CanvasPrototype = { getContext: (...args: unknown[]) => unknown };
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

type RealAnimation = { goToAndStop: (frame: number, isFrame: boolean) => void; destroy: () => void };
type RealPlayer = { loadAnimation: (args: Record<string, unknown>) => RealAnimation };

describe('le moteur réel sur les fichiers réels', () => {
  test('chaque couche intégrée est dessinée par lottie-web et change d’une image à l’autre', async () => {
    const player = (await import('lottie-web/build/player/lottie_light')).default as unknown as RealPlayer;
    expect(BUILTIN_LOTTIE_SRCS.length).toBeGreaterThanOrEqual(3);
    for (const src of BUILTIN_LOTTIE_SRCS) {
      const bytes = await lottieBytesLoader({ src, bytes: 0, sha256: '' }, { origin: 'https://gate.test' })();
      expect(bytes).not.toBeNull();
      const decoded = await decodeLottie(bytes!);
      if (!decoded.ok) throw new Error(`${src} refusée : ${decoded.reason}`);
      const host = document.createElement('div');
      document.body.appendChild(host);
      const animation = player.loadAnimation({ container: host, renderer: 'svg', loop: true, autoplay: false, animationData: decoded.animation });
      const op = Number(decoded.animation['op']);
      const frames = [0, Math.floor(op / 4), Math.floor(op / 2)].map((frame) => {
        animation.goToAndStop(frame, true);
        return host.innerHTML;
      });
      expect(host.querySelectorAll('path').length).toBeGreaterThan(0);
      expect(new Set(frames).size).toBe(frames.length);
      animation.destroy();
      expect(host.querySelector('svg')).toBeNull();
      host.remove();
    }
  });

  test('chaque MeeSticker du corpus (.lottie) se lit et passe le validateur partagé', async () => {
    const files = readdirSync(STICKERS).filter((name) => name.endsWith('.lottie'));
    expect(files.length).toBeGreaterThan(200);
    const refused: string[] = [];
    for (const name of files) {
      const verdict = await decodeLottie(new Uint8Array(readFileSync(new URL(name, STICKERS))));
      if (!verdict.ok) refused.push(`${name}: ${verdict.reason}`);
    }
    expect(refused).toEqual([]);
  });
});
