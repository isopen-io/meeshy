import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { BackgroundTrackAudio } from '@/components/background-track-audio';
import type { ProtectedMediaDeps, ProtectedMediaUnavailableReason } from '@/lib/api/protected-media';
import { objectMediaIdentity, objectMediaSrc } from '@/lib/canvas/carrier';
import { electBackgroundTrack, sceneHasAudibleBackgroundVideo, sceneHasControllableSound } from '@/lib/canvas/background-sound';
import type { CanvasDocument } from '@/lib/canvas/document';
import { backgroundMedia, declaredAspect } from '@/lib/feed/scene-framing';
import { isVideoObject } from '@/lib/feed/scene-motion';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { readerBackdropHash, storyCarrier } from '@/lib/stories/carrier';
import { sceneFootprint, type SceneFootprintParams } from '@/lib/stories/footprint';
import {
  READER_BACKDROP_BLUR,
  READER_BACKDROP_OPACITY,
  READER_BACKDROP_SCALE,
  type ReaderCardFraming,
} from '@/lib/stories/framing';
import { imageOnlyPresentation, sceneOccupants, type Footprint, type ImageOnlyVerdict, type Rect } from '@/lib/stories/image-only';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import { verdictKey } from '@/lib/stories/verdict-cache';

const ScenePlayer = lazy(() => import('@/components/scene-player'));

/**
 * `StorySceneLayer` (#6899) — L'HÔTE qui rend un document canvas v3 dans le
 * lecteur de story par le MÊME moteur que le fil (`ScenePlayer`, D-79), miroir
 * de `currentContentHost(_:)` (`StoryViewerView+Canvas.swift:1061-1130`) et de
 * `+ImageOnly.swift`. Chargé À LA DEMANDE par `story.tsx` (motif D-54) : une
 * story v1 ne paie ni ce module, ni ses lois, ni le moteur.
 *
 * **LA GÉOMÉTRIE** vient du lecteur (`readerCardFraming`) : la scène garde ses
 * bornes intrinsèques 9:16 et la carte n'est qu'une échelle + un décalage.
 * TOUT se calcule dans ces bornes — le verdict, la mesure des textes, les
 * bandes — c'est-à-dire dans le repère où le moteur PEINT. La première forme
 * calculait le verdict dans le viewport pendant que le moteur peignait dans
 * une boîte plus petite : un texte visiblement DANS l'image était jugé sur
 * une bande.
 *
 * **LES DEUX VERDICTS** (`imageOnlyPresentation`, #6636) :
 * - `canvas` — la carte entière, bandes habillées PAR LE MOTEUR
 *   (`ScenePlayer`/`BackgroundLayer`, revue-correction #6901 : le double-peint
 *   d'un `data-scene-letterbox` posé ICI en plus a été retiré) ;
 * - `imageOnly` — la carte RONGÉE au rectangle de l'image, « le canvas garde
 *   sa taille : les objets posés dans l'image restent à leur place »
 *   (`StoryViewerView+ImageOnly.swift:13-21`). Le moteur reste donc monté et
 *   seul son CLIP change — `servesLetterboxFill={false}` lui coupe le sol
 *   (#6636 : rogner un calque qu'on continue de peindre paierait un flou que
 *   personne ne voit). Une story qui n'est QU'une image fixe (aucun
 *   occupant, `sceneOccupants`) monte l'image seule, sans moteur : c'est la
 *   même peinture, sans en charger le code.
 *
 * **LE FOND FLOU PLEIN ÉCRAN** (Layer 1.5, `StoryViewerView+Canvas.swift:1209-1228`)
 * est peint ICI, sous la carte, avec le reste de ce qui ne sert qu'aux scènes :
 * le chunk du lecteur (`story.tsx`) n'embarque ni le porteur, ni l'élection du
 * son, ni la cascade des empreintes.
 *
 * **L'ATTENTE** : un placeholder ThumbHash couvre la carte jusqu'au signal
 * « contenu prêt » du moteur (`StoryCanvasUIView.onContentReady`) ; la
 * diapositive, le son de fond et la vidéo de fond ne partent qu'à ce signal
 * (`pendingBackgroundActivation`, `StoryCanvasUIView.swift:477-487`).
 */
export type StorySceneLayerProps = {
  /** La story — son identité (clé du verdict) et ses médias RÉELS (le porteur). */
  readonly story: Pick<StoryPlaybackStory, 'id' | 'media'>;
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  readonly preferredLanguages: readonly string[];
  readonly framing: ReaderCardFraming;
  /** La pause du LECTEUR (appui, double-tap, onglet caché) — valeur REÇUE. */
  readonly playing: boolean;
  /** Le muet VIEWER — valeur REÇUE, jamais un état local. */
  readonly muted: boolean;
  readonly onReady: () => void;
  readonly onDurationKnown: (durationMs: number) => void;
  readonly onPlaybackBlocked: () => void;
  /** La scène a-t-elle un son à COUPER (`sceneHasControllableSound`) ? Le
   * bouton muet vit dans le chrome du lecteur, qui l'apprend d'ici. */
  readonly onSoundAvailability: (available: boolean) => void;
  /** Le mesureur de PRODUCTION est `sceneFootprint` ; les témoins en injectent
   * un autre pour éprouver la présentation sans vraie mise en page. */
  readonly measure?: (params: SceneFootprintParams) => Footprint | null;
  /** Injectable pour les témoins UNIQUEMENT — la production prend
   * `defaultMediaDeps`, comme `BackgroundTrackAudio` à qui elle est remise
   * telle quelle. Sans elle, « la piste protégée est refusée » ne s'éprouve
   * qu'en laissant partir un vrai `fetch`. */
  readonly mediaDeps?: ProtectedMediaDeps;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** L'aplat quand aucune empreinte n'existe — le voile du chrome du lecteur,
 * jamais la teinte de carte du thème (le lecteur est un canevas sombre forcé). */
const NEUTRAL_PLACEHOLDER = 'rgba(255,255,255,0.08)';

function clipInset(rect: Rect, canvas: { readonly width: number; readonly height: number }, radius: number): string {
  const right = canvas.width - rect.x - rect.width;
  const bottom = canvas.height - rect.y - rect.height;
  return `inset(${rect.y}px ${right}px ${bottom}px ${rect.x}px round ${radius}px)`;
}

export function StorySceneLayer({
  story,
  document,
  sceneIndex,
  preferredLanguages,
  framing,
  playing,
  muted,
  onReady,
  onDurationKnown,
  onPlaybackBlocked,
  onSoundAvailability,
  measure = sceneFootprint,
  mediaDeps,
}: StorySceneLayerProps) {
  const storyId = story.id;
  const carrier = useMemo(() => storyCarrier(story), [story]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const readyRef = useRef(false);
  const durationsRef = useRef<{ video: number; track: number }>({ video: 0, track: 0 });
  const [ready, setReady] = useState(false);
  /**
   * LE SON DE FOND PEUT ÊTRE DÉFINITIVEMENT INDISPONIBLE (revue-correction
   * #7015, défaut 2) — un refus, une absence, une coupure réseau et un rendu
   * sans identité rendaient tous le MÊME silence, indiscernable de « cette
   * story n'a jamais eu de son ». `data-scene-sound-unavailable` DIT la
   * raison sur la scène — le gate `check-story-sound.mjs` § 401 la lit.
   */
  const [soundUnavailable, setSoundUnavailable] = useState<ProtectedMediaUnavailableReason | null>(null);
  const scene = document.scenes[sceneIndex];
  const canvas = { width: framing.canvas.width, height: framing.canvas.height };

  const fond = scene === undefined ? undefined : backgroundMedia(scene);
  const mediaAspect = useMemo(() => {
    if (fond === undefined) return null;
    const identity = objectMediaIdentity(fond);
    const entry = identity === null ? undefined : carrier.media.find((m) => m.id === identity);
    if (entry?.width !== undefined && entry.height !== undefined && entry.height > 0) return entry.width / entry.height;
    return declaredAspect(fond) ?? null;
  }, [fond, carrier]);

  const translationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const object of scene?.objects ?? []) {
      if (object.kind === 'text' && isPlainRecord(object.payload.translations)) counts[object.id] = Object.keys(object.payload.translations).length;
    }
    return counts;
  }, [scene]);

  // Le rapport du média ne fait pas partie de la clé iOS (il y est connu au
  // décodage) ; ici il peut arriver APRÈS (le porteur), donc il la complète.
  const cacheKey = `${verdictKey({ storyId, chain: preferredLanguages, translationCounts, canvasSize: canvas })}|${mediaAspect ?? 'unknown'}`;
  const [verdictEntry, setVerdictEntry] = useState<{ readonly key: string; readonly verdict: ImageOnlyVerdict } | null>(null);

  /* Le verdict se calcule AVANT la peinture, une fois par (story, chaîne du
     Prisme, traductions, bornes) — jamais à chaque image : la barre de
     progression ne passe pas par React (`story.tsx`). L'ancien verdict reste
     affiché le temps du recalcul (un rendu), jamais un trou. */
  useLayoutEffect(() => {
    const host = boxRef.current;
    if (scene === undefined || host === null || canvas.width <= 0 || canvas.height <= 0) return;
    if (verdictEntry?.key === cacheKey) return;
    const verdict = imageOnlyPresentation({
      scene,
      mediaAspect,
      canvasSize: canvas,
      footprint: (object) => measure({ object, canvasSize: canvas, preferredLanguages, host }),
    });
    setVerdictEntry({ key: cacheKey, verdict });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, measure]);

  const markReady = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
    onReady();
  };

  const reportDuration = (source: 'video' | 'track', durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    durationsRef.current = { ...durationsRef.current, [source]: durationMs };
    onDurationKnown(Math.max(durationsRef.current.video, durationsRef.current.track));
  };

  const verdict = verdictEntry?.verdict ?? null;
  const pureImageSrc =
    verdict?.verdict === 'imageOnly' && scene !== undefined && fond !== undefined && !isVideoObject(fond) && sceneOccupants(scene).length === 0
      ? objectMediaSrc(fond, carrier)
      : undefined;
  const pureImage = pureImageSrc !== undefined;
  const declaredSound = useMemo(() => sceneHasControllableSound({ document, sceneIndex, carrier }), [document, sceneIndex, carrier]);
  /**
   * CE QU'IL RESTE À COUPER, une fois le transport CONSULTÉ (#7015, seconde
   * revue). `sceneHasControllableSound` répond d'après le DOCUMENT ; quand la
   * piste élue est définitivement indisponible (`soundUnavailable`), le seul
   * son qui joue encore est la vidéo de fond non coupée. Sans ce repli, le
   * chrome montait son `SoundToggle` (`story.tsx` § `showsSound`) au-dessus
   * d'une scène sans `<audio>` : on tape, et il ne se passe JAMAIS rien.
   */
  const audibleVideo = useMemo(() => sceneHasAudibleBackgroundVideo({ document, sceneIndex }), [document, sceneIndex]);
  const soundAvailable = soundUnavailable === null ? declaredSound : audibleVideo;
  const backdropHash = scene === undefined ? undefined : readerBackdropHash(scene, story);
  const track = electBackgroundTrack({ document, sceneIndex, carrier });

  useEffect(() => {
    onSoundAvailability(soundAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundAvailable]);

  useEffect(() => {
    if (scene === undefined) markReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    const image = imageRef.current;
    if (image !== null && image.complete && image.naturalWidth > 0) markReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pureImageSrc]);

  // Une raison tenue par un tour de boucle PRÉCÉDENT (piste protégée refusée,
  // puis la story avance sur une scène SANS son) ne doit pas survivre —
  // l'attribut resterait posé sur une scène qui n'a plus rien à dégrader.
  useEffect(() => {
    setSoundUnavailable(null);
  }, [storyId, track?.src]);

  if (scene === undefined) return null;

  const live = playing && ready;
  const radius = framing.cornerRadius;
  const imageRect = verdict?.verdict === 'imageOnly' ? verdict.rect : null;
  const placeholderSrc = thumbHashPlaceholder(backdropHash);

  const boxStyle: CSSProperties = {
    position: 'absolute',
    left: framing.canvas.x,
    top: framing.canvas.y,
    width: canvas.width,
    height: canvas.height,
    transform: `translateY(${framing.offsetY}px) scale(${framing.scale})`,
    transformOrigin: 'center',
    transition: 'transform 180ms ease, border-radius 180ms ease',
    borderRadius: imageRect === null ? radius : 0,
    overflow: imageRect === null ? 'hidden' : 'visible',
  };

  const placeholderStyle: CSSProperties = {
    position: 'absolute',
    ...(imageRect === null
      ? { inset: 0 }
      : { left: imageRect.x, top: imageRect.y, width: imageRect.width, height: imageRect.height, borderRadius: radius }),
    opacity: ready ? 0 : 1,
    transition: 'opacity 180ms ease',
    pointerEvents: 'none',
    ...(placeholderSrc === undefined ? { background: NEUTRAL_PLACEHOLDER } : {}),
  };

  const player =
    verdict === null || pureImage ? null : (
      <Suspense fallback={null}>
        <ScenePlayer
          document={document}
          sceneIndex={sceneIndex}
          mode="reader"
          playing={live}
          muted={muted}
          carrier={carrier}
          preferredLanguages={preferredLanguages}
          // Le rectangle `imageOnly` ROGNE la carte au rectangle de l'image —
          // le sol d'un fond ajusté n'y a plus rien à peindre, seulement un
          // flou que personne ne voit (#6636, miroir
          // `StoryViewerView+ImageOnly.swift:19-21`).
          servesLetterboxFill={verdict.verdict !== 'imageOnly'}
          onContentReady={markReady}
          onDurationKnown={(ms) => reportDuration('video', ms)}
          onPlaybackBlocked={onPlaybackBlocked}
        />
      </Suspense>
    );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-story-scene-layer
      {...(soundUnavailable !== null ? { 'data-scene-sound-unavailable': soundUnavailable } : {})}
    >
      {placeholderSrc !== undefined ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          data-story-backdrop
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
          style={{ filter: `blur(${READER_BACKDROP_BLUR}px)`, transform: `scale(${READER_BACKDROP_SCALE})`, opacity: READER_BACKDROP_OPACITY }}
        />
      ) : null}
      <div
        ref={boxRef}
        data-story-scene-box
        data-story-verdict={verdict?.verdict ?? 'pending'}
        {...(ready ? { 'data-story-ready': '' } : {})}
        style={boxStyle}
      >
        {imageRect !== null && pureImageSrc !== undefined ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            ref={imageRef}
            data-story-image-only
            src={pureImageSrc}
            alt=""
            aria-hidden="true"
            className="absolute object-cover"
            style={{ left: imageRect.x, top: imageRect.y, width: imageRect.width, height: imageRect.height, borderRadius: radius }}
            onLoad={markReady}
            onError={markReady}
          />
        ) : imageRect !== null && player !== null ? (
          <div data-story-image-only-clip className="absolute inset-0" style={{ clipPath: clipInset(imageRect, canvas, radius) }}>
            {player}
          </div>
        ) : (
          player
        )}
        {placeholderSrc !== undefined ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img data-story-placeholder src={placeholderSrc} alt="" aria-hidden="true" className="object-cover" style={placeholderStyle} />
        ) : (
          <span data-story-placeholder aria-hidden="true" style={placeholderStyle} />
        )}
      </div>
      {track !== null ? (
        <BackgroundTrackAudio
          key={`${storyId}:${track.src}`}
          track={track}
          playing={live}
          muted={muted}
          onDurationKnown={(ms) => reportDuration('track', ms)}
          onPlaybackBlocked={onPlaybackBlocked}
          onUnavailable={setSoundUnavailable}
          {...(mediaDeps !== undefined ? { mediaDeps } : {})}
        />
      ) : null}
    </div>
  );
}

export default StorySceneLayer;
