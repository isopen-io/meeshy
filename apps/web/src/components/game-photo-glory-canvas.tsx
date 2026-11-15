import { useEffect, useRef } from 'react';

import type { PhotoBanner, PhotoSource, PaintContext } from '@/lib/game-photo/compose';
import type { GloryPreviewKit } from '@/lib/game-photo/env';
import type { GloryRecipe, GloryScene } from '@/lib/game-photo/glory/glory-scene';
import { PHOTO_FORMATS } from '@/lib/game-photo/layout';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * L'APERÇU D'UN CADRE DÉCORÉ (#10159, L7, § 5.5) — le MÊME peintre que l'image
 * finale, sur un canvas à la taille d'affichage : l'image vidéo courante en
 * source pendant le direct (rAF), le still ou la photo de galerie ensuite,
 * rien pour la carte seule. Le canvas est en pixels d'image (1080 × 1920)
 * ramenés à sa taille CSS par une échelle : le peintre ne connaît qu'un repère.
 * La surface de travail de la photo (`kit.scratch`, un bassin) est remise à la
 * MÊME échelle : un canevas réutilisé en pixels d'affichage, jamais un canevas
 * neuf en pixels de design à chaque image.
 *
 * Décoratif : le dialogue dit le moment en toutes lettres, et la couche DOM
 * au-dessus garde l'emblème (la frappe) et le carré QR (annoncé).
 */

type Source = { readonly kind: 'video'; readonly element: HTMLVideoElement | null } | { readonly kind: 'photo'; readonly photo: PhotoSource | null } | { readonly kind: 'card' };

export type GloryCanvasProps = {
  readonly scene: GloryScene;
  readonly kit: GloryPreviewKit;
  readonly source: Source;
  readonly banner: PhotoBanner | null;
  readonly recipe: GloryRecipe;
};

/** Au-delà, l'aperçu coûte plus qu'il ne montre : deux pixels par point CSS suffisent à un 9:16 de poche. */
const MAX_DPR = 2;
/** Le direct se repeint à cette cadence au plus ; un still, une fois. */
const LIVE_INTERVAL_MS = 1000 / 30;

const videoSource = (element: HTMLVideoElement): PhotoSource | null => {
  const { videoWidth: width, videoHeight: height } = element;
  return width === 0 || height === 0 ? null : { image: element, width, height, mirror: true };
};

export function GamePhotoGloryCanvas({ scene, kit, source, banner, recipe }: GloryCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = source.kind === 'video' ? source.element : null;
  const still = source.kind === 'photo' ? source.photo : null;
  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const ctx = element.getContext('2d');
    if (ctx === null) return;
    const { width, height } = PHOTO_FORMATS.story;
    const rtl = interfaceDirection(currentInterfaceLanguage()) === 'rtl';
    const language = currentInterfaceLanguage();
    let frame = 0;
    let last = 0;
    const paint = (photo: PhotoSource | null): void => {
      const box = element.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, globalThis.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(box.width * dpr));
      const pixelHeight = Math.max(1, Math.round(box.height * dpr));
      if (element.width !== pixelWidth || element.height !== pixelHeight) {
        element.width = pixelWidth;
        element.height = pixelHeight;
      }
      const scale = pixelWidth / width;
      ctx.setTransform(scale, 0, 0, pixelHeight / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
      scene.paint(ctx as unknown as PaintContext, { photo, art: kit.art, ...(banner === null ? {} : { banner }), recipe, palette: kit.palette, fontFamily: kit.fontFamily, rtl, language, scratch: kit.scratch.at(scale) });
    };
    if (live === null) {
      paint(still);
      return;
    }
    const tick = (now: number): void => {
      if (now - last >= LIVE_INTERVAL_MS) {
        last = now;
        paint(videoSource(live));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, kit, live, still, banner, recipe]);
  return <canvas ref={canvas} data-photo-glory-canvas="" aria-hidden="true" className="absolute inset-0 size-full" />;
}
