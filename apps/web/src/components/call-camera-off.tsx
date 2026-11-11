import type { ReactNode } from 'react';

import { Portrait } from '@/components/call-grid';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { cameraOffFadeMs } from '@/lib/calls/call-camera-off';
import { useCameraCrossfade } from '@/lib/calls/use-camera-crossfade';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **LA SCÈNE NOIRE DE LA CAMÉRA COUPÉE** (G4, #17567) — l'avatar de la personne
 * sur fond noir, à SA couleur (celle de ses sous-titres), l'icône caméra à côté
 * du texte, et l'anneau + le halo de cette couleur à la parole seulement, rien
 * au repos. Leur place est réservée : seule leur OPACITÉ change.
 *
 * L'image cède la place à l'avatar (et revient) en fondu : le voile noir monte
 * par-dessus l'image, qui ne part qu'une fois couverte ; `transform` et
 * `opacity` seulement, interruptible, plus court sous « Réduire les animations ».
 */

const INK_2 = 'var(--color-on-media-3)';

/** Le disque de l’avatar ; l’anneau (3) et le halo (12) tiennent dans un seul calque, d’ombres, derrière lui. */
const AVATAR_SIZE = 96;
const RING_WIDTH = 3;
const REACH = 12;

type CameraOffStageProps = {
  readonly videoOn: boolean;
  /** L'image en direct : montée tant que le voile ne l'a pas couverte. */
  readonly video: ReactNode;
  readonly name: string;
  readonly avatar: string | null;
  readonly presenceKey: string | undefined;
  /** La couleur de la personne : son disque, son anneau, son halo. */
  readonly color: string;
  readonly speaking: boolean;
  readonly label: string;
};

export function CameraOffStage({ videoOn, video, name, avatar, presenceKey, color, speaking, label }: CameraOffStageProps) {
  const ms = cameraOffFadeMs(prefersReducedMotion());
  const layers = useCameraCrossfade(videoOn, ms);
  const fade = { transitionDuration: `${ms}ms` } as const;
  const strength = speaking ? 1 : 0;
  return (
    <>
      {layers.video ? <div className="absolute inset-0 overflow-hidden">{video}</div> : null}
      {layers.veil ? (
        <div className="absolute inset-0 grid place-items-center bg-black transition-opacity" style={{ opacity: layers.covered ? 1 : 0, ...fade }} data-call-camera-off="">
          <div className="flex flex-col items-center gap-3">
            <div className="relative grid place-items-center">
              <span aria-hidden className="absolute rounded-full transition-opacity" style={{ inset: REACH, boxShadow: `0 0 0 ${RING_WIDTH}px ${color}, 0 0 ${REACH * 2}px ${REACH / 2}px color-mix(in srgb, ${color} 50%, transparent)`, opacity: strength, ...fade }} data-call-camera-off-speech="" />
              <Portrait name={name} avatar={avatar} size={AVATAR_SIZE} pulse={false} presenceKey={presenceKey} tint={color} />
            </div>
            <span className="flex items-center gap-2 text-body" style={{ color: INK_2 }} data-call-camera-off-label="">
              <GlyphSvg glyph={CALL_SCREEN_GLYPHS.videoCamera} size={16} />
              {label}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
