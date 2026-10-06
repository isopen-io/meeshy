import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { effectiveMediaRatio, mediaCropStyle, readMediaCrop, type MediaCropRect } from '@meeshy/shared/utils/media-crop';

import { backgroundCss, type BackgroundFraming } from '@/lib/canvas/background';
import { mediaFilterCss } from '@/lib/canvas/media-filter';
import { mediaAdjustmentsPaint } from '@/lib/canvas/media-adjustments';
import { backgroundMediaTimeline } from '@/lib/canvas/media-seek';
import { objectMediaIdentity, objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';
import { mediaHasArrived, noteMediaArrived } from '@/lib/canvas/scene-placeholder';
import { thumbHashImage } from '@/lib/media/thumbhash-image';
import { LETTERBOX_FILL_OPACITY, type LetterboxFill } from '@/lib/stories/letterbox';

import type { SceneClockHandle } from './scene-clock';
import { MediaGlowFilter, glowFilterRef, useGlowFilterId } from './scene-media-glow';
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

const ARRIVAL_FADE_MS = 180;

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
  letterbox,
  placeholderHash,
  callbacks,
  seekClock,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly framing: BackgroundFraming;
  /** LE SOL d'un fond AJUSTÉ (`framing === 'fit'`) — le fond choisi au Cadre
   * (#8414), déjà résolu par l'appelant (`SceneCanvas`, SITE UNIQUE de la loi
   * `letterboxFill`), ou `undefined` quand aucune bande ne se peint. Peint
   * SOUS le média, en `object-cover` : la bande doit être PLEINE, un
   * `object-contain` y laisserait ses propres bandes (un letterbox dans un
   * letterbox — miroir `StoryBackgroundLayer+LetterboxFill.swift:54-56`). */
  readonly letterbox: LetterboxFill | undefined;
  /** L'empreinte peinte SOUS le média tant que ses pixels n'ont pas paru
   * (#5047, `backgroundPlaceholderHash`). */
  readonly placeholderHash: string | undefined;
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
  const glowId = useGlowFilterId();
  const isVideo = src !== undefined && mediaType?.startsWith('video') === true;
  const crop = readMediaCrop(payload);
  const ratio = typeof payload.aspectRatio === 'number' && payload.aspectRatio > 0 ? payload.aspectRatio : undefined;
  // LE FILTRE DE SLIDE (lot 7) PUIS LES RÉGLAGES DU FOND (#9496) — portés par
  // le média de fond, ils ne peignent que lui : ni la bande d'autour, ni les
  // objets posés. Même peinture que le média posé (`SceneObjectMedia`, D-175),
  // dans l'ordre d'iOS (`StoryBackgroundLook` : filtre, puis réglages).
  const adjustments = mediaAdjustmentsPaint(payload, {
    target: isVideo ? 'video' : 'image',
    ...backgroundBlurScale(carrierEntryOf(object, carrier), crop, framing),
  });
  // LE BLOOM DU FOND (#9498) clôt la chaîne, comme `StoryBackgroundLook`.
  const filter = [mediaFilterCss(payload), adjustments.filter, glowFilterRef(glowId, adjustments.glow)]
    .filter((step) => step !== undefined)
    .join(' ');
  const mediaStyle = filter !== '' ? { filter } : undefined;
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
  // La teinte et la vignette se posent DANS la boîte du média — iOS les cuit
  // dans son bitmap, puis le pose ajusté ou rempli. Un rapport connu donne
  // cette boîte même sans recadrage ; sans lui, les calques couvrent la scène.
  const overlays = adjustments.overlays.map((layer, index) => (
    <span
      key={index}
      data-media-adjustment-layer={index}
      aria-hidden="true"
      className="absolute inset-0"
      style={{ background: layer.background, ...(layer.mixBlendMode !== undefined ? { mixBlendMode: layer.mixBlendMode } : {}) }}
    />
  ));
  const boxCrop = crop ?? (overlays.length > 0 ? FULL_MEDIA : null);
  // Le halo se compte en fraction de la boîte de l'ÉLÉMENT : le média entier
  // dans sa boîte de recadrage, la scène 9:16 sinon.
  const glowFilter = (
    <MediaGlowFilter id={glowId} glow={adjustments.glow} aspect={boxCrop !== null && ratio !== undefined ? ratio : CARD_RATIO} />
  );
  const cropped = (media: (style: Record<string, string> | undefined, className: string) => ReactNode): ReactNode =>
    boxCrop !== null && ratio !== undefined ? (
      <CroppedBox crop={boxCrop} ratio={ratio} fill={framing !== 'fit'}>
        {(cropStyle) => (
          <>
            {media(cropStyle, 'block max-w-none object-fill')}
            {overlays}
          </>
        )}
      </CroppedBox>
    ) : (
      <>
        {media(undefined, `absolute inset-0 size-full ${fit}`)}
        {overlays}
      </>
    );

  const ready = () => callbacks.current.onContentReady?.();

  const placeholderSrc = useMemo(() => thumbHashImage(placeholderHash), [placeholderHash]);
  const [arrivedAtMount] = useState(() => src !== undefined && mediaHasArrived(src));
  const [arrivedSrc, setArrivedSrc] = useState<string | undefined>(arrivedAtMount ? src : undefined);
  const arrived = src !== undefined && arrivedSrc === src;
  const waits = placeholderSrc !== undefined && !arrivedAtMount;
  const arrive = () => {
    if (src !== undefined) {
      noteMediaArrived(src);
      setArrivedSrc(src);
    }
    ready();
  };
  // Un média déjà décodé (cache HTTP) se constate AVANT la première peinture :
  // ni voile ni fondu ne s'y voient.
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (src === undefined || image === null || !image.complete || image.naturalWidth === 0) return;
    noteMediaArrived(src);
    setArrivedSrc(src);
  }, [src]);
  const fadeIn = waits ? { opacity: arrived ? 1 : 0, transition: `opacity ${ARRIVAL_FADE_MS}ms ease` } : undefined;
  const placeholder = waits ? (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      data-scene-placeholder
      src={placeholderSrc}
      alt=""
      aria-hidden="true"
      className={`absolute inset-0 size-full ${fit}`}
      style={{ opacity: arrived ? 0 : 1, transition: `opacity ${ARRIVAL_FADE_MS}ms ease ${ARRIVAL_FADE_MS}ms` }}
    />
  ) : null;

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
      if (video.readyState >= 2) arrive();
      return;
    }
    const image = imageRef.current;
    if (image !== null && image.complete && image.naturalWidth > 0) arrive();
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
    letterbox === undefined ? null : letterbox.kind === 'tint' ? (
      <span
        data-scene-letterbox
        data-scene-backdrop={letterbox.backdrop}
        aria-hidden="true"
        className="absolute inset-0 block"
        style={{ backgroundColor: letterbox.color }}
      />
    ) : (
      // Le FLOU déborde de sa boîte : la bande se rogne à la scène, jamais
      // au-delà. Il se pose sur un fond NOIR (le canvas d'iOS), jamais sur
      // l'aplat de carte : à `LETTERBOX_FILL_OPACITY`, ce qui transparaît ne
      // doit pas changer avec le schéma.
      <span aria-hidden="true" className="absolute inset-0 block overflow-hidden" style={{ backgroundColor: 'var(--color-media-backdrop)' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          data-scene-letterbox
          data-scene-backdrop="blur"
          src={letterbox.src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
          style={{ opacity: LETTERBOX_FILL_OPACITY, filter: 'blur(20px)', transform: 'scale(1.35)' }}
        />
      </span>
    );

  if (isVideo) {
    return (
      <>
        {letterboxFill}
        {placeholder}
        {cropped((cropStyle, className) => (
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
            onLoadedData={arrive}
            onError={ready}
            className={className}
            style={{ ...mediaStyle, ...cropStyle }}
          />
        ))}
      </>
    );
  }
  if (src !== undefined) {
    return (
      <>
        {letterboxFill}
        {placeholder}
        {glowFilter}
        {cropped((cropStyle, className) => (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            ref={imageRef}
            src={src}
            alt=""
            aria-hidden="true"
            loading={awaitsContent ? 'eager' : 'lazy'}
            onLoad={arrive}
            onError={ready}
            className={className}
            style={{ ...mediaStyle, ...cropStyle, ...fadeIn }}
          />
        ))}
      </>
    );
  }
  return <span className="absolute inset-0 block" style={{ backgroundColor: backgroundCss(background, 'var(--color-ios-card)') }} />;
}

const CARD_RATIO = 9 / 16;
const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = DESIGN_WIDTH / CARD_RATIO;
const FULL_MEDIA: MediaCropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Pixels du repère design par pixel de la SOURCE pour un fond posé ajusté ou
 * rempli dans la scène 9:16 — le rayon du flou CoreImage se compte en pixels
 * de l'image (D-175). Rien quand la source n'est pas mesurée. */
function backgroundBlurScale(
  entry: { readonly width?: number; readonly height?: number } | undefined,
  crop: MediaCropRect | null,
  framing: BackgroundFraming,
): { readonly designPixelsPerSourcePixel?: number } {
  const width = (entry?.width ?? 0) * (crop?.width ?? 1);
  const height = (entry?.height ?? 0) * (crop?.height ?? 1);
  if (!(width > 0) || !(height > 0)) return {};
  const pick = framing === 'fit' ? Math.min : Math.max;
  return { designPixelsPerSourcePixel: pick(DESIGN_WIDTH / width, DESIGN_HEIGHT / height) };
}

/** **Un fond RECADRÉ** (#9136) — la boîte prend le rapport du recadrage, posée
 * ajustée (ou remplie) dans la carte 9:16 comme le média entier l'aurait été ;
 * le média s'y agrandit et s'y décale (`mediaCropStyle`), sans ré-encodage. */
function CroppedBox({ crop, ratio, fill, children }: { readonly crop: MediaCropRect; readonly ratio: number; readonly fill: boolean; readonly children: (style: Record<string, string>) => ReactNode }) {
  const shown = effectiveMediaRatio(ratio, crop);
  const wider = shown > CARD_RATIO;
  const [width, height] = wider === fill ? [(shown / CARD_RATIO) * 100, 100] : [100, (CARD_RATIO / shown) * 100];
  return (
    <span
      data-scene-background-crop
      className="absolute block overflow-hidden"
      style={{ width: `${width}%`, height: `${height}%`, left: `${(100 - width) / 2}%`, top: `${(100 - height) / 2}%` }}
    >
      {children({ ...mediaCropStyle(crop), position: 'absolute' })}
    </span>
  );
}

/** Une scène SANS objet de fond : l'aplat de carte, prêt dès le montage. */
export function BlankBackground({ callbacks }: { readonly callbacks: { readonly current: SceneCallbacks } }) {
  useEffect(() => {
    callbacks.current.onContentReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span className="absolute inset-0 block" style={{ backgroundColor: 'var(--color-ios-card)' }} />;
}
