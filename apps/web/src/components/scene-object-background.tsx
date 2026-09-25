import { useEffect, useRef } from 'react';

import { backgroundCss, type BackgroundFraming } from '@/lib/canvas/background';
import { backgroundMediaTimeline } from '@/lib/canvas/media-seek';
import { objectMediaIdentity, objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';
import { LETTERBOX_FILL_OPACITY } from '@/lib/stories/letterbox';

import type { SceneClockHandle } from './scene-clock';
import { useSceneMediaSync } from './scene-media-seek';

export type SceneCallbacks = {
  readonly onContentReady: (() => void) | undefined;
  readonly onDurationKnown: ((durationMs: number) => void) | undefined;
  readonly onPlaybackBlocked: (() => void) | undefined;
};

function carrierEntryOf(object: CanvasObject, carrier: SceneCarrier) {
  const identity = objectMediaIdentity(object);
  return identity === null ? undefined : carrier.media.find((m) => m.id === identity);
}

/** La vignette du porteur RÉEL (`SceneCarrierMedia.poster`) — jamais dérivée
 * du canvas, qui n'en porte aucune (revue-correction #6898, défaut 4) :
 * sans elle, un `<video preload="none">` non élu peint une boîte
 * transparente, indiscernable de l'absence de scène. */
function posterSrcOf(object: CanvasObject, carrier: SceneCarrier): string | undefined {
  return carrierEntryOf(object, carrier)?.poster;
}

/** `NotAllowedError` — le seul refus de `play()` qui dise « la politique de
 * lecture automatique refuse le SON » ; un `AbortError` (une source remplacée
 * pendant le chargement) n'est pas un refus. */
const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/** Le fond de la scène : une COULEUR (`payload.background`), ou une image /
 * vidéo posée sur toute la scène. */
export function BackgroundLayer({
  object,
  carrier,
  playing,
  muted,
  framing,
  letterboxFillSrc,
  callbacks,
  seekClock,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly framing: BackgroundFraming;
  /** LE SOL d'un fond AJUSTÉ (`framing === 'fit'`) — un placeholder ThumbHash
   * déjà résolu par l'appelant (`SceneCanvas`, SITE UNIQUE de la loi
   * `letterboxIsServed`), ou `undefined` quand aucune bande ne se peint.
   * Peint SOUS le média, en `object-cover` : la bande doit être PLEINE, un
   * `object-contain` y laisserait ses propres bandes (un letterbox dans un
   * letterbox — miroir `StoryBackgroundLayer+LetterboxFill.swift:54-56`). */
  readonly letterboxFillSrc: string | undefined;
  readonly callbacks: { readonly current: SceneCallbacks };
  /** L'horloge du parcours au doigt (#7879) — la vidéo de fond (qui boucle)
   * s'y recale à chaque `seek`. */
  readonly seekClock: SceneClockHandle | null;
}) {
  const { payload } = object;
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : undefined;
  const src = objectMediaSrc(object, carrier);
  const poster = posterSrcOf(object, carrier);
  const background = typeof payload.background === 'string' ? payload.background : undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isVideo = src !== undefined && mediaType?.startsWith('video') === true;
  /**
   * LE MUET DE L'AUTEUR EST DÉFINITIF (revue-correction #6903) — `payload.muted`
   * dit « cette vidéo n'a pas de son POUR LE LECTEUR » : c'est déjà ce que la
   * loi en tire (`sceneHasControllableSound`, `lib/canvas/background-sound.ts`
   * : « un fond VIDÉO NON DÉCLARÉ muet » ; `isDocumentAudible`,
   * `lib/feed/scene-motion.ts`). Le rendu, lui, ne lisait que le muet de
   * l'HÔTE — donc un réel composé dont l'auteur a coupé le fond et qui ne
   * porte AUCUNE piste de fond sonnait à l'ouverture (`soundOn =
   * hasUserActivation()`) SANS bouton pour le couper, puisque la loi venait
   * de dire au rail qu'il n'y avait rien à couper. Un son sans commande est
   * l'inverse exact d'un contrôle inerte, et se corrige du même côté : la
   * loi et le rendu lisent la MÊME déclaration.
   */
  const authorMuted = payload.muted === true;
  const awaitsContent = callbacks.current.onContentReady !== undefined;
  // `aspectFill` par défaut, `aspect` sur « fit » déclaré (`background.ts`).
  const fit = framing === 'fit' ? 'object-contain' : 'object-cover';

  const ready = () => callbacks.current.onContentReady?.();

  // Un média déjà décodé AVANT que l'écouteur n'existe (cache, réhydratation)
  // n'émettrait plus son événement : on le constate au montage. Un fond de
  // couleur n'a rien à attendre.
  useEffect(() => {
    if (src === undefined) {
      ready();
      return;
    }
    const video = videoRef.current;
    if (video !== null) {
      if (video.readyState >= 1 && Number.isFinite(video.duration)) callbacks.current.onDurationKnown?.(video.duration * 1000);
      if (video.readyState >= 2) ready();
      return;
    }
    const image = imageRef.current;
    if (image !== null && image.complete && image.naturalWidth > 0) ready();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // LE FOND SUIT LA TIMELINE DE LA SCÈNE (#7879) : il boucle, donc son temps
  // est le temps de scène modulo sa durée (miroir `loopedScrubTarget`), en
  // lecture comme au seek. `muted` relance la lecture : un refus sonore rend la
  // main à l'hôte, qui repasse en muet — et c'est CE rendu qui relance, muet.
  useSceneMediaSync({
    ref: videoRef,
    clock: seekClock,
    timeline: backgroundMediaTimeline(object),
    playing,
    restartKeys: [muted, src],
    onPlayRefused: (error, el) => {
      if (!el.muted && isAutoplayRefusal(error)) callbacks.current.onPlaybackBlocked?.();
    },
  });

  // Peint AVANT le média (donc dessous, à défaut d'ordre-z explicite) —
  // « une SURFACE de composition, jamais un vide » (directive porteur
  // 2026-08-31) : les bandes qu'un fond AJUSTÉ laisse sur les trois plateformes
  // (revue-correction #6901, `MeeshyScenePlayer.servesLetterboxFill`).
  const letterboxFill =
    letterboxFillSrc !== undefined ? (
      // eslint-disable-next-line jsx-a11y/alt-text
      <img
        data-scene-letterbox
        src={letterboxFillSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        style={{ opacity: LETTERBOX_FILL_OPACITY }}
      />
    ) : null;

  if (isVideo) {
    return (
      <>
        {letterboxFill}
        <video
          ref={videoRef}
          key={src}
          src={src}
          muted={muted || authorMuted}
          loop
          playsInline
          preload={awaitsContent ? 'auto' : 'none'}
          {...(poster !== undefined ? { poster } : {})}
          onLoadedMetadata={(event) => callbacks.current.onDurationKnown?.(event.currentTarget.duration * 1000)}
          onLoadedData={ready}
          onError={ready}
          className={`absolute inset-0 size-full ${fit}`}
        />
      </>
    );
  }
  if (src !== undefined) {
    return (
      <>
        {letterboxFill}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          ref={imageRef}
          src={src}
          alt=""
          aria-hidden="true"
          loading={awaitsContent ? 'eager' : 'lazy'}
          onLoad={ready}
          onError={ready}
          className={`absolute inset-0 size-full ${fit}`}
        />
      </>
    );
  }
  return <span className="absolute inset-0 block" style={{ backgroundColor: backgroundCss(background, 'var(--color-ios-card)') }} />;
}

/** Une scène SANS objet de fond : l'aplat de carte, prêt dès le montage. */
export function BlankBackground({ callbacks }: { readonly callbacks: { readonly current: SceneCallbacks } }) {
  useEffect(() => {
    callbacks.current.onContentReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span className="absolute inset-0 block" style={{ backgroundColor: 'var(--color-ios-card)' }} />;
}
