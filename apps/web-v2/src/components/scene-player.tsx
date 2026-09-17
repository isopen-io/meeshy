import { useEffect, useRef } from 'react';

import { backgroundCss, backgroundFraming, type BackgroundFraming } from '@/lib/canvas/background';
import { objectMediaIdentity, objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import { hostMute, playerConfig, type ScenePlayerMode } from '@/lib/canvas/config';
import type { CanvasDocument, CanvasObject, CanvasScene } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';

/**
 * LE MOTEUR DE SCÈNE (#6898, D-79) — `ScenePlayer` rend UNE scène d'un
 * document canvas v3, chargé À LA DEMANDE par son hôte (`lazy(() =>
 * import('./scene-player'))`, motif D-54) : la première peinture du fil ne
 * grossit pas tant qu'aucune carte à scène n'est visible.
 *
 * Ce module reste AGNOSTIQUE de la disposition du fil — la fenêtre de
 * cadrage (`focus`, dérivée de `SceneFraming.cardFocus`) est calculée par
 * l'hôte (`feed-scene-surface.tsx`) ; ce composant se contente de la
 * TRANSPOSER en une transformation CSS pure (translation verticale
 * uniquement — le cadre issu de `scene-framing.ts` a TOUJOURS `x: 0, width:
 * 1`, la largeur pleine du fil ne se resserre jamais).
 *
 * `mode` (`config.ts`) gouverne UNIQUEMENT le son, la boucle et le chrome —
 * jamais la géométrie, qui vient exclusivement de `focus` et du rapport
 * naturel de la scène (SCENE_ASPECT = 9:16, la composition d'origine).
 */
export type ScenePlayerFocus = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type ScenePlayerProps = {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  readonly mode: ScenePlayerMode;
  readonly playing: boolean;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly accentColor?: string;
  readonly focus?: ScenePlayerFocus;
  /**
   * LE CONTRAT D'UN HÔTE QUI ATTEND SA SCÈNE (#6899) — miroir de
   * `MeeshyScenePlayer.init(isMuted:onContentReady:…)`
   * (`MeeshyScenePlayer.swift:76-99`). Le fil n'en passe AUCUNE option : son
   * rendu est inchangé.
   *
   * `muted` — la demande de l'hôte gouverne le muet du mode
   * (`requestedMute ?? config.isMuted`, `MeeshyScenePlayer.swift:158`) : le
   * lecteur de story y relaie le muet VIEWER.
   */
  readonly muted?: boolean;
  /** Le fond est peint (`StoryCanvasUIView.onContentReady`) : couleur au
   * montage, image à `load`, vidéo à `loadeddata` — un ÉCHEC compte aussi,
   * une diapositive ne se bloque jamais sur un média perdu. Un hôte qui
   * l'attend obtient une vidéo de fond PRÉCHARGÉE : `preload="none"` ne
   * chargerait rien tant que la lecture n'est pas demandée, et la lecture
   * attend précisément ce signal. */
  readonly onContentReady?: () => void;
  /** La durée du fond VIDÉO, en millisecondes, dès `loadedmetadata`. */
  readonly onDurationKnown?: (durationMs: number) => void;
  /** Un `play()` SONORE refusé par la politique de lecture automatique : l'hôte
   * passe en muet, et le contrôle dit enfin la vérité. */
  readonly onPlaybackBlocked?: () => void;
};

/** Le rappel le plus RÉCENT d'un hôte, sans en faire une dépendance d'effet :
 * un hôte qui passe une lambda en ligne relancerait sinon chaque effet à
 * chaque rendu. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

type SceneCallbacks = {
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
function BackgroundLayer({
  object,
  carrier,
  playing,
  muted,
  framing,
  callbacks,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly framing: BackgroundFraming;
  readonly callbacks: { readonly current: SceneCallbacks };
}) {
  const { payload } = object;
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : undefined;
  const src = objectMediaSrc(object, carrier);
  const poster = posterSrcOf(object, carrier);
  const background = typeof payload.background === 'string' ? payload.background : undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const isVideo = src !== undefined && mediaType?.startsWith('video') === true;
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

  useEffect(() => {
    const el = videoRef.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    // `muted` est une dépendance : un refus sonore rend la main à l'hôte, qui
    // repasse en muet — et c'est CE rendu qui relance la lecture, muette.
    void el.play().catch((error: unknown) => {
      if (!el.muted && isAutoplayRefusal(error)) callbacks.current.onPlaybackBlocked?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, muted, src]);

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        key={src}
        src={src}
        muted={muted}
        loop
        playsInline
        preload={awaitsContent ? 'auto' : 'none'}
        {...(poster !== undefined ? { poster } : {})}
        onLoadedMetadata={(event) => callbacks.current.onDurationKnown?.(event.currentTarget.duration * 1000)}
        onLoadedData={ready}
        onError={ready}
        className={`absolute inset-0 size-full ${fit}`}
      />
    );
  }
  if (src !== undefined) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text
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
    );
  }
  return <span className="absolute inset-0 block" style={{ backgroundColor: backgroundCss(background, 'var(--color-ios-card)') }} />;
}

/** Un objet TEXTE, positionné à son ancre — Prisme au rang de l'objet
 * (`resolveSceneText`, `lib/canvas/text.ts`, jamais `translations.first`). */
function TextLayer({ object, preferredLanguages }: { readonly object: CanvasObject; readonly preferredLanguages: readonly string[] }) {
  const resolved = resolveSceneText({ object, preferredLanguages });
  if (resolved.text === '') return null;
  const [x, y] = anchorFraction(object);
  return (
    <span
      data-scene-text
      {...(resolved.language !== '' ? { lang: resolved.language } : {})}
      className="absolute block max-w-[85%] whitespace-pre-wrap text-center font-semibold"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        color: resolved.color,
        // Un texte se dimensionne sur la LARGEUR de la scène rendue
        // (`CanvasGeometry.scaleFactor`), en unités de conteneur — le canvas
        // est déclaré `container-type: inline-size`. La première forme posait
        // 16 px partout : trop gros dans une tuile, où la scène est RÉDUITE,
        // plus petit que la cible sur une carte (revue-correction #6898).
        fontSize: `${resolved.widthFraction * 100}cqw`,
        lineHeight: 1.2,
      }}
    >
      {resolved.text}
    </span>
  );
}

function anchorFraction(object: CanvasObject): readonly [number, number] {
  return object.anchor.t === 'free' ? [object.anchor.x, object.anchor.y] : [0.5, object.anchor.edge === 'top' ? 0.12 : 0.88];
}

/** Un média `content`/`fg` — au-dessus du fond, jamais son remplaçant. */
function MediaLayer({ object, carrier }: { readonly object: CanvasObject; readonly carrier: SceneCarrier }) {
  const src = objectMediaSrc(object, carrier);
  if (src === undefined) return null;
  const poster = posterSrcOf(object, carrier);
  const [x, y] = anchorFraction(object);
  const mediaType = typeof object.payload.mediaType === 'string' ? object.payload.mediaType : undefined;
  const style = { left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)', width: '60%' } as const;
  if (mediaType?.startsWith('video') === true) {
    return (
      <video
        src={src}
        muted
        loop
        playsInline
        preload="none"
        {...(poster !== undefined ? { poster } : {})}
        className="absolute"
        style={style}
      />
    );
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={src} alt="" aria-hidden="true" loading="lazy" className="absolute" style={style} />;
}

/** Une scène SANS objet de fond : l'aplat de carte, prêt dès le montage. */
function BlankBackground({ callbacks }: { readonly callbacks: { readonly current: SceneCallbacks } }) {
  useEffect(() => {
    callbacks.current.onContentReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span className="absolute inset-0 block" style={{ backgroundColor: 'var(--color-ios-card)' }} />;
}

function SceneCanvas({
  scene,
  carrier,
  preferredLanguages,
  playing,
  muted,
  callbacks,
}: {
  readonly scene: CanvasScene;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly playing: boolean;
  readonly muted: boolean;
  readonly callbacks: { readonly current: SceneCallbacks };
}) {
  // `SceneFraming.backgroundMedia` — le premier fond qui PORTE une image,
  // sinon le premier fond : la MÊME élection que la loi de cadrage, jamais
  // une seconde (la première forme prenait le premier fond venu, et cadrait
  // donc sur une image qu'elle ne peignait pas).
  const background = backgroundMedia(scene);
  const foreground = scene.objects.filter((o) => o.id !== background?.id).sort((a, b) => a.z - b.z);
  return (
    <span className="absolute inset-0 block" style={{ containerType: 'inline-size' }}>
      {background !== undefined ? (
        <BackgroundLayer
          key={`${scene.id}:${background.id}`}
          object={background}
          carrier={carrier}
          playing={playing}
          muted={muted}
          framing={backgroundFraming(scene)}
          callbacks={callbacks}
        />
      ) : (
        <BlankBackground key={scene.id} callbacks={callbacks} />
      )}
      {foreground.map((object) => {
        if (object.kind === 'text') return <TextLayer key={object.id} object={object} preferredLanguages={preferredLanguages} />;
        if (object.kind === 'media') return <MediaLayer key={object.id} object={object} carrier={carrier} />;
        return null;
      })}
    </span>
  );
}

export default function ScenePlayer({
  document,
  sceneIndex,
  mode,
  playing,
  carrier,
  preferredLanguages,
  focus,
  muted,
  onContentReady,
  onDurationKnown,
  onPlaybackBlocked,
}: ScenePlayerProps) {
  const scene = document.scenes[sceneIndex];
  const config = playerConfig(mode);
  const language = currentInterfaceLanguage();
  const audible = playing && isDocumentAudible(document);
  const callbacks = useLatest<SceneCallbacks>({ onContentReady, onDurationKnown, onPlaybackBlocked });
  const isMuted = hostMute({ config, requestedMute: muted });

  if (scene === undefined) return null;

  const canvas = (
    <SceneCanvas scene={scene} carrier={carrier} preferredLanguages={preferredLanguages} playing={playing} muted={isMuted} callbacks={callbacks} />
  );

  return (
    <span data-scene-player className="relative block size-full overflow-hidden">
      {focus === undefined ? (
        canvas
      ) : (
        // La fenêtre de cadrage a TOUJOURS `x: 0, width: 1` (`scene-framing.ts`
        // impose la largeur pleine) : seule une translation VERTICALE, en
        // pourcentage de la hauteur du canvas lui-même (`translateY`,
        // relative à l'élément), reproduit `SceneFraming.placement` sans
        // aucune mesure de pixels — le canvas est déjà dimensionné à son
        // rapport naturel (9:16) par la largeur à 100 % de son conteneur.
        <span
          className="absolute top-0 left-0 block w-full"
          style={{ aspectRatio: '9 / 16', transform: `translateY(${-focus.y * 100}%)` }}
        >
          {canvas}
        </span>
      )}
      {audible && config.isMuted ? (
        <span
          data-scene-sound="muted"
          className="pointer-events-none absolute end-2.5 bottom-2.5 grid place-items-center rounded-full"
          style={{ width: 26, height: 26, backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <GlyphSvg glyph={FEED_GLYPHS.speakerSlash} size={14} title={translate(language, 'feed.scene.sound.muted')} style={{ color: 'white' }} />
        </span>
      ) : null}
    </span>
  );
}
