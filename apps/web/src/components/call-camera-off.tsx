import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Portrait } from '@/components/call-portrait';
import { GlyphSvg } from '@/components/glyph';
import { CALL_SCREEN_GLYPHS } from '@/components/glyphs-call-screen';
import { cameraOffFadeMs } from '@/lib/calls/call-camera-off';
import { usePeerSpeaking } from '@/lib/calls/peer-audio-level';
import { useOpacityFade } from '@/lib/calls/use-pill-motion';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **LA SCÈNE NOIRE DE LA CAMÉRA COUPÉE** (G4, #17567) — l'avatar de la personne
 * sur fond noir, à SA couleur (celle de ses sous-titres), l'icône caméra à côté
 * du texte, et l'anneau + le halo de cette couleur à la parole seulement, rien
 * au repos : un seul calque d'ombres (`call-motion.css`), dont seule l'OPACITÉ change.
 * La parole se lit au niveau audio reçu, comme au duo audio (`PeerSpeechRing`, #17637).
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
export function SpeechRing({ color, speaking, shape = 'disc' }: { readonly color: string; readonly speaking: boolean; readonly shape?: 'disc' | 'tile' }) {
  const ring = useRef<HTMLSpanElement>(null);
  useOpacityFade(ring, speaking, cameraOffFadeMs(prefersReducedMotion()));
  return <span ref={ring} className={shape === 'tile' ? 'pointer-events-none absolute inset-0 rounded-card' : 'absolute inset-3 rounded-full'} style={{ '--call-tint': color } as CSSProperties} data-call-camera-off-speech="" data-call-speech-shape={shape} />;
}

/** L'anneau du duo audio, ou le halo d'une vignette de groupe (`shape="tile"`, P11.5), allumé au niveau reçu du flux de la personne (`usePeerSpeaking`, le mien compris) : un basculement ne rend que l'anneau, jamais l'écran d'appel ni la grille. */
export function PeerSpeechRing({ color, stream, shape }: { readonly color: string; readonly stream: MediaStream | null; readonly shape?: 'disc' | 'tile' }) {
  return <SpeechRing color={color} speaking={usePeerSpeaking(stream)} {...(shape === undefined ? {} : { shape })} />;
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
  /**
   * Le flux dont le NIVEAU AUDIO dit la parole (G4.2, P9.6, #17637 : la loi à hystérésis du duo audio, jamais les
   * sous-titres) — `null` : personne à mesurer (mon image en grand, la vignette du coin). Il ne se mesure que tant que la
   * scène noire se montre.
   */
  readonly speech: MediaStream | null;
  /** La phrase sous l'avatar — `null` : la vignette du coin, qui n'a que l'avatar (loi 17.12). */
  readonly label: string | null;
  /** Le diamètre de l'avatar : 96 sur la scène, la moitié de la vignette dans le coin. */
  readonly size?: number;
  /**
   * Une vignette de GRILLE (loi 17.12) : son fond de case, et pas d'anneau sur le disque — le halo de la parole y est
   * celui de la case entière (`SpeechRing` `shape="tile"`), posé par la grille.
   */
  readonly tile?: boolean;
};

/**
 * La scène noire de la caméra coupée, sur la scène du duo ET dans la vignette du coin quand elle montre l'autre (loi
 * 17.12) : l'image et l'avatar passent l'un à l'autre en fondu, jamais d'un coup.
 */
export function CameraOffStage({ videoOn, video, name, avatar, presenceKey, color, speech, label, size = 96, tile = false }: CameraOffStageProps) {
  const ms = cameraOffFadeMs(prefersReducedMotion());
  const [settledOn, settle] = useState(videoOn);
  const veil = useRef<HTMLDivElement>(null);
  useOpacityFade(veil, !videoOn, ms, () => settle(videoOn));
  const veilHidden = videoOn && settledOn;
  return (
    <>
      {videoOn || settledOn ? <div className="absolute inset-0 overflow-hidden">{video}</div> : null}
      <div ref={veil} className={`absolute inset-0 grid place-items-center ${tile ? 'bg-media-fill' : 'bg-media-backdrop'} ${veilHidden ? 'invisible' : ''}`} style={{ '--call-tint': color } as CSSProperties} data-call-camera-off="">
        <div className="flex flex-col items-center gap-3">
          <Portrait name={name} avatar={avatar} size={size} pulse={false} presenceKey={presenceKey} tint={color}>
            {tile ? null : <PeerSpeechRing color={color} stream={veilHidden ? null : speech} />}
          </Portrait>
          {label === null ? null : (
            <span className="flex items-center gap-2 text-body text-on-media-3">
              <GlyphSvg glyph={CALL_SCREEN_GLYPHS.videoCamera} size={16} />
              {label}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
