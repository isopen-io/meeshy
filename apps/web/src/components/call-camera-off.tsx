import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Portrait } from '@/components/call-grid';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { cameraOffFadeMs } from '@/lib/calls/call-camera-off';
import { useOpacityFade } from '@/lib/calls/use-pill-motion';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **LA SCÈNE NOIRE DE LA CAMÉRA COUPÉE** (G4, #17567) — l'avatar de la personne
 * sur fond noir, à SA couleur (celle de ses sous-titres), l'icône caméra à côté
 * du texte, et l'anneau + le halo de cette couleur à la parole seulement, rien
 * au repos : un seul calque d'ombres (`call-motion.css`), dont seule l'OPACITÉ change.
 *
 * L'image cède la place à l'avatar (et revient) en fondu : la scène noire monte
 * par-dessus l'image, qui ne part qu'une fois couverte ; revenue, l'image se monte
 * dessous et la scène s'efface, puis se range (`invisible` : ni vue, ni lecteur
 * d'écran). Opacité seule, interruptible, plus courte sous « Réduire les animations »
 * (`useOpacityFade`) ; rien n'est calculé par image.
 */

/**
 * **L'ANNEAU ET LE HALO DE PAROLE** (G4.2, P9.6) — un seul calque d'ombres à la couleur de la personne,
 * posé sur son disque : la scène noire de la caméra coupée ET le portrait du duo audio le montent,
 * jamais une seconde copie. Seule son OPACITÉ change, en fondu (`useOpacityFade`, Web Animations).
 */
export function SpeechRing({ color, speaking, ms }: { readonly color: string; readonly speaking: boolean; readonly ms: number }) {
  const ring = useRef<HTMLSpanElement>(null);
  useOpacityFade(ring, speaking, ms);
  return <span ref={ring} className="absolute inset-3 rounded-full" style={{ '--call-tint': color } as CSSProperties} data-call-camera-off-speech="" />;
}

type CameraOffStageProps = {
  readonly videoOn: boolean;
  /** L'image en direct : montée tant que la scène noire ne l'a pas couverte. */
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
  const [settledOn, settle] = useState(videoOn);
  const veil = useRef<HTMLDivElement>(null);
  useOpacityFade(veil, !videoOn, ms, () => settle(videoOn));
  return (
    <>
      {videoOn || settledOn ? <div className="absolute inset-0 overflow-hidden">{video}</div> : null}
      <div ref={veil} className={`absolute inset-0 grid place-items-center bg-media-backdrop ${videoOn && settledOn ? 'invisible' : ''}`} style={{ '--call-tint': color } as CSSProperties} data-call-camera-off="">
        <div className="flex flex-col items-center gap-3">
          <Portrait name={name} avatar={avatar} size={96} pulse={false} presenceKey={presenceKey} tint={color}>
            <SpeechRing color={color} speaking={speaking} ms={ms} />
          </Portrait>
          <span className="flex items-center gap-2 text-body text-on-media-3">
            <GlyphSvg glyph={CALL_SCREEN_GLYPHS.videoCamera} size={16} />
            {label}
          </span>
        </div>
      </div>
    </>
  );
}
