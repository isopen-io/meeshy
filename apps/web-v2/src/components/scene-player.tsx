import { useEffect, useRef } from 'react';

import { attachmentSrc } from '@/lib/api/media-url';
import { backgroundFraming, type BackgroundFraming } from '@/lib/canvas/background';
import { objectMediaIdentity, type SceneCarrier } from '@/lib/canvas/carrier';
import { playerConfig, type ScenePlayerMode } from '@/lib/canvas/config';
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
};

function carrierEntryOf(object: CanvasObject, carrier: SceneCarrier) {
  const identity = objectMediaIdentity(object);
  return identity === null ? undefined : carrier.media.find((m) => m.id === identity);
}

function mediaSrcOf(object: CanvasObject, carrier: SceneCarrier): string | undefined {
  const { payload } = object;
  const fromCarrier = carrierEntryOf(object, carrier)?.src;
  if (fromCarrier !== undefined) return fromCarrier;
  // `attachmentSrc` (`lib/api/media-url.ts`), le SITE UNIQUE de résolution
  // d'une pièce : un `mediaURL` hérité porte souvent une clé NUE ou un chemin
  // relatif, qui se résoudrait sinon contre l'origine du DOCUMENT — l'image
  // ne charge jamais en PWA déployée ni dans les coques (#5668).
  return typeof payload.mediaURL === 'string' && payload.mediaURL !== '' ? attachmentSrc(payload.mediaURL) : undefined;
}

/** La vignette du porteur RÉEL (`SceneCarrierMedia.poster`) — jamais dérivée
 * du canvas, qui n'en porte aucune (revue-correction #6898, défaut 4) :
 * sans elle, un `<video preload="none">` non élu peint une boîte
 * transparente, indiscernable de l'absence de scène. */
function posterSrcOf(object: CanvasObject, carrier: SceneCarrier): string | undefined {
  return carrierEntryOf(object, carrier)?.poster;
}

/** Le fond de la scène : une COULEUR (`payload.background`), ou une image /
 * vidéo posée sur toute la scène. */
function BackgroundLayer({
  object,
  carrier,
  playing,
  muted,
  framing,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly framing: BackgroundFraming;
}) {
  const { payload } = object;
  const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : undefined;
  const src = mediaSrcOf(object, carrier);
  const poster = posterSrcOf(object, carrier);
  const background = typeof payload.background === 'string' ? payload.background : undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // `aspectFill` par défaut, `aspect` sur « fit » déclaré (`background.ts`).
  const fit = framing === 'fit' ? 'object-contain' : 'object-cover';

  useEffect(() => {
    const el = videoRef.current;
    if (el === null) return;
    if (playing) void el.play().catch(() => {});
    else el.pause();
  }, [playing]);

  if (src !== undefined && mediaType?.startsWith('video') === true) {
    return (
      <video
        ref={videoRef}
        key={src}
        src={src}
        muted={muted}
        loop
        playsInline
        preload="none"
        {...(poster !== undefined ? { poster } : {})}
        className={`absolute inset-0 size-full ${fit}`}
      />
    );
  }
  if (src !== undefined) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={src} alt="" aria-hidden="true" loading="lazy" className={`absolute inset-0 size-full ${fit}`} />;
  }
  return <span className="absolute inset-0 block" style={{ backgroundColor: background ?? 'var(--color-ios-card)' }} />;
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
  const src = mediaSrcOf(object, carrier);
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

function SceneCanvas({
  scene,
  carrier,
  preferredLanguages,
  playing,
  muted,
}: {
  readonly scene: CanvasScene;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly playing: boolean;
  readonly muted: boolean;
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
        <BackgroundLayer object={background} carrier={carrier} playing={playing} muted={muted} framing={backgroundFraming(scene)} />
      ) : (
        <span className="absolute inset-0 block" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      )}
      {foreground.map((object) => {
        if (object.kind === 'text') return <TextLayer key={object.id} object={object} preferredLanguages={preferredLanguages} />;
        if (object.kind === 'media') return <MediaLayer key={object.id} object={object} carrier={carrier} />;
        return null;
      })}
    </span>
  );
}

export default function ScenePlayer({ document, sceneIndex, mode, playing, carrier, preferredLanguages, focus }: ScenePlayerProps) {
  const scene = document.scenes[sceneIndex];
  const config = playerConfig(mode);
  const language = currentInterfaceLanguage();
  const audible = playing && isDocumentAudible(document);

  if (scene === undefined) return null;

  const canvas = <SceneCanvas scene={scene} carrier={carrier} preferredLanguages={preferredLanguages} playing={playing} muted={config.isMuted} />;

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
