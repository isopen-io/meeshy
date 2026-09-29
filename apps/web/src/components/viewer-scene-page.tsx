import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CanvasScene } from '@/lib/canvas/document';
import { SCENE_RATIO } from '@/lib/canvas/fit';
import { hasTimedObjects, sceneDurationSeconds } from '@/lib/canvas/timeline';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import type { SceneGalleryEntry } from '@/lib/feed/gallery-lot';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { fullStageBox } from '@/lib/view/media-stage';
import {
  OPENED_FRAME,
  SCENE_OPENING_EASING,
  SCENE_OPENING_MS,
  openingFrame,
  type SceneOpening,
} from '@/lib/view/scene-opening';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import {
  initialScenePlayback,
  scenePlaybackEnded,
  scenePlaybackPaused,
  scenePlaybackScrubbed,
  scenePlaybackShowsPlay,
  scenePlaybackToggled,
  scenePlays,
} from '@/lib/view/scene-playback';
import { useElementSize } from '@/lib/view/use-element-size';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';
import type { SceneClockHandle } from './scene-clock';
import { lazyScenePlayer } from './scene-player-lazy';
import { SceneScrubBar, type SceneScrubPainter } from './scene-scrub-bar';

/**
 * `ViewerScenePage` (#6902, § B de la spécification `scenes-plein-ecran`) —
 * LA PAGE « SCÈNE » DE LA VISIONNEUSE PLEIN ÉCRAN : la MÊME scène que la
 * carte du fil (`FeedSceneSurface`), rendue par le MÊME moteur
 * (`ScenePlayer`, chargé À LA DEMANDE, D-79), à l'ÉCHELLE UNIFORME et
 * CENTRÉE dans le viewport ENTIER (`fullStageBox`, ratio 9:16 figé — D-80).
 *
 * **LA BOÎTE SE CALCULE CONTRE LE VIEWPORT, LA PAGE RESTE EN FLUX**
 * (revue-correction #6902) — `fullStageBox` (`lib/view/media-stage.ts`) rend
 * un décalage dans le repère de CETTE page ; la première forme du lot posait
 * `position: fixed`, et le `transform` que le plateau reçoit pendant un
 * glissement de fermeture faisait alors RÉTRÉCIR la scène de 390 × 693 à
 * 371 × 660 au premier pixel de doigt (mesuré). Le viewport est lu sur
 * `window` et REMESURÉ par l'observateur ci-dessous : la page est en `flex-1`,
 * donc toute rotation, tout clavier, toute barre d'URL qui se replie change sa
 * taille et déclenche un nouveau rendu.
 *
 * `mode="story"` (`lib/canvas/config.ts`) : joue une fois, ne boucle pas, ne
 * dessine aucun chrome — l'HÔTE tient donc le muet (`hostMute`) et le
 * transport, et c'est ce que fait cette page : MUETTE à l'ouverture (§ 9 Q3
 * de la spécification — le fil était silencieux, l'ouverture ne surprend
 * personne) avec un bouton pour ouvrir le son, et EN PAUSE quand le plateau a
 * été atteint par un appui long (`presentation.pausedOnEntry`, § 6).
 *
 * **LES DEUX BOUTONS N'EXISTENT QUE S'ILS ONT UN EFFET** (loi 4, miroir
 * `GalleryScenePlayPause`, `ConversationMediaGalleryView+ScenePage.swift:
 * 236-263`) : lecture/pause seulement si la scène BOUGE (`entry.moves`), son
 * seulement si le document PORTE du son à couper (`isDocumentAudible`) — et
 * chaque libellé SUIT l'état, jamais un nom figé.
 *
 * **LE CURSEUR DE LA SCÈNE** (#8598) — une scène qui a une TIMELINE (un objet
 * temporisé, donc une horloge qui mène, et une durée) se parcourt au doigt :
 * `SceneScrubBar`, la MÊME barre que le réel et la story, rendue par un
 * portail dans le couloir de transport (`corridorSlot`) comme la barre d'une
 * vidéo — elle s'efface donc avec le chrome en plein cadre. Le doigt posé
 * suspend la lecture ; relâcher reprend DEPUIS le temps pointé, sans jamais
 * défaire une pause choisie (`scenePlaybackScrubbed`).
 *
 * **L'OUVERTURE DEPUIS LA CARTE** (#8598) — `opening` est ce que la carte du
 * fil a confié au tap (`lib/view/scene-opening.ts`) : son TEMPS, où la
 * lecture reprend, et son CADRE, d'où la boîte grandit (FLIP, Web Animations,
 * jamais sous `prefers-reduced-motion`). Le moteur est le composant paresseux
 * PARTAGÉ avec la carte (`scene-player-lazy.ts`) : déjà chargé, il se rend au
 * premier rendu, et son repli peint le fond de la scène, jamais du vide.
 */
const ScenePlayer = lazyScenePlayer.Component;

function sceneBackgroundColor(scene: CanvasScene | undefined): string {
  const color = scene === undefined ? undefined : backgroundMedia(scene)?.payload.background;
  return typeof color === 'string' && color !== '' ? color : '#000';
}

export type ViewerScenePageProps = {
  readonly entry: SceneGalleryEntry;
  readonly isActive: boolean;
  readonly preferredLanguages: readonly string[];
  /** La hauteur du couloir haut — le haut de cette page dans le repère du
   * viewport (`fullStageBox`). */
  readonly topInset: number;
  /** Le nom de la page pour un lecteur d'écran : sa LÉGENDE, sinon « Scène
   * partagée par … » (miroir `ConversationMediaGalleryView.swift:294-309`). */
  readonly label: string;
  /** `presentation.pausedOnEntry` — un appui long entre en plein cadre EN
   * PAUSE (`stageAfter`, `lib/view/media-stage.ts`). */
  readonly pausedOnEntry: boolean;
  /** Remet à l'hôte le basculement lecture/pause de la page ACTIVE, pour que
   * la barre d'espace l'atteigne comme elle atteint une vidéo
   * (`media-viewer.tsx#onKeyDown`). */
  readonly onToggleRef?: (toggle: (() => void) | null) => void;
  /** Le couloir de transport de la visionneuse — le curseur s'y rend. */
  readonly corridorSlot?: HTMLElement | null;
  /** Ce que la carte du fil a confié au tap, repris UNE fois à l'ouverture. */
  readonly opening?: SceneOpening | null;
};

export function ViewerScenePage({
  entry,
  isActive,
  preferredLanguages,
  topInset,
  label,
  pausedOnEntry,
  onToggleRef,
  corridorSlot = null,
  opening = null,
}: ViewerScenePageProps) {
  // `observe` n'est qu'un DÉCLENCHEUR de remesure (voir plus bas) : la taille
  // qu'il rend n'est pas lue, la boîte se calcule contre le viewport.
  const [observe] = useElementSize();
  const language = currentInterfaceLanguage();
  const [muted, setMuted] = useState(true);
  // La lecture est un ÉTAT DE PAGE, pas une valeur dérivée : un appui long
  // entre en pause, un bouton la reprend. Semée par `pausedOnEntry`, elle
  // suit ensuite les gestes — jamais recalculée sous le doigt du lecteur.
  /**
   * L'ÉTAT DE LECTURE VIT DANS UNE LOI PURE (`lib/view/scene-playback.ts`) —
   * pause, fin et remise à zéro se lisent ENSEMBLE, et leur composition décide
   * si le bouton a un EFFET. Sur une scène TERMINÉE, « dé-pauser » ne rejoue
   * RIEN (`useSceneClock` garde son `elapsed`) : la loi REMONTE le player.
   */
  const [playback, setPlayback] = useState(() => initialScenePlayback(pausedOnEntry));
  useEffect(() => {
    if (pausedOnEntry) setPlayback(scenePlaybackPaused);
  }, [pausedOnEntry]);
  const toggle = useCallback(() => setPlayback(scenePlaybackToggled), []);

  const audible = isDocumentAudible(entry.document);
  const scene = entry.document.scenes[entry.sceneIndex];
  const declaredDuration = scene !== undefined && hasTimedObjects(scene) ? sceneDurationSeconds(scene) : null;
  const duration = entry.moves && declaredDuration !== null && declaredDuration > 0 ? declaredDuration : null;
  const [scrubbing, setScrubbing] = useState(false);
  const playing = scenePlays({ state: playback, isActive, moves: entry.moves }) && !scrubbing;

  const painterRef = useRef<SceneScrubPainter | null>(null);
  const clockRef = useRef<SceneClockHandle | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pendingSeekRef = useRef<number | null>(opening !== null && opening.seconds > 0 ? opening.seconds : null);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const paintNow = useCallback(() => {
    const total = durationRef.current;
    const clock = clockRef.current;
    if (total === null || clock === null) return;
    painterRef.current?.(clock.now() / total);
  }, []);
  // L'horloge arrive à CHAQUE montage du moteur (un « rejouer » le remonte) :
  // le curseur s'y réabonne, et le temps confié par la carte ne se pose
  // qu'une fois, sur la première.
  const onClock = useCallback(
    (clock: SceneClockHandle) => {
      unsubscribeRef.current?.();
      clockRef.current = clock;
      unsubscribeRef.current = clock.subscribe((t) => {
        const total = durationRef.current;
        if (total !== null) painterRef.current?.(t / total);
      });
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (pending !== null) clock.seek(pending);
      paintNow();
    },
    [paintNow],
  );
  useEffect(() => () => unsubscribeRef.current?.(), []);
  const showsScrub = isActive && duration !== null && corridorSlot !== null;
  // Le curseur se monte APRÈS l'horloge (le couloir n'existe qu'au second
  // rendu de la visionneuse) : il se peint au temps courant dès qu'il existe.
  useEffect(() => {
    if (showsScrub) paintNow();
  }, [showsScrub, paintNow]);

  useEffect(() => {
    if (onToggleRef === undefined) return;
    if (!isActive || !entry.moves) {
      onToggleRef(null);
      return;
    }
    onToggleRef(toggle);
    return () => onToggleRef(null);
  }, [onToggleRef, isActive, entry.moves, toggle]);

  // Le viewport ENTIER, remesuré à chaque changement de taille de la page
  // (`observe`) : la boîte se calcule contre `window`, jamais contre une
  // mesure qui vaudrait 0 × 0 au premier rendu — elle est donc à sa place
  // DÈS le premier rendu, ce que l'ouverture depuis la carte exige (#8598).
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const box = fullStageBox({ viewport, ratio: SCENE_RATIO, topInset });
  const placed = box.width > 0 && box.height > 0;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);
  useLayoutEffect(() => {
    if (openedRef.current || !placed) return;
    openedRef.current = true;
    const origin = opening?.origin ?? null;
    const element = boxRef.current;
    if (origin === null || element === null || typeof element.animate !== 'function' || prefersReducedMotion()) return;
    // La place FINALE à l'écran, lue sur la loi et non sur le DOM : la page est
    // posée sous le couloir haut (`topInset`), au bord gauche du viewport.
    const frame = openingFrame({
      origin,
      target: { left: box.left, top: box.top + topInset, width: box.width, height: box.height },
      ...(origin.focusY !== undefined ? { focusY: origin.focusY } : {}),
    });
    if (frame === null) return;
    element.animate(
      [
        { transformOrigin: '0 0', transform: frame.transform, clipPath: frame.clipPath },
        { transformOrigin: '0 0', transform: OPENED_FRAME.transform, clipPath: OPENED_FRAME.clipPath },
      ],
      { duration: SCENE_OPENING_MS, easing: SCENE_OPENING_EASING },
    );
  }, [placed, opening, box.left, box.top, box.width, box.height, topInset]);

  return (
    <div ref={observe} role="group" aria-label={label} data-scene-viewer-page className="relative size-full">
      <div
        ref={boxRef}
        data-scene-viewer-box
        className="absolute overflow-hidden"
        style={placed ? { width: box.width, height: box.height, left: box.left, top: box.top } : { inset: 0 }}
      >
        <Suspense fallback={<span className="absolute inset-0 block" style={{ backgroundColor: sceneBackgroundColor(scene) }} />}>
          <ScenePlayer
            key={playback.run}
            document={entry.document}
            sceneIndex={entry.sceneIndex}
            mode="story"
            playing={playing}
            muted={muted}
            carrier={entry.carrier}
            preferredLanguages={preferredLanguages}
            onEnded={() => setPlayback(scenePlaybackEnded)}
            onClock={onClock}
          />
        </Suspense>
      </div>
      {isActive && (entry.moves || audible) ? (
        <div data-scene-viewer-controls className="absolute end-2 top-2 z-10 flex flex-col gap-2">
          {entry.moves ? (
            <button
              type="button"
              data-scene-viewer-playpause={scenePlaybackShowsPlay(playback) ? 'paused' : 'playing'}
              aria-label={translate(language, scenePlaybackShowsPlay(playback) ? 'scene.fullscreen.play' : 'scene.fullscreen.pause')}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              className="media-viewer-scene-control tap-target-34 grid place-items-center rounded-full text-white"
            >
              {scenePlaybackShowsPlay(playback) ? <Glyph name="fillPlay" size={15} /> : <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={15} />}
            </button>
          ) : null}
          {audible ? (
            <button
              type="button"
              data-scene-viewer-sound={muted ? 'muted' : 'on'}
              aria-label={translate(language, muted ? 'scene.fullscreen.sound.on' : 'scene.fullscreen.sound.off')}
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              className="media-viewer-scene-control tap-target-34 grid place-items-center rounded-full text-white"
            >
              <GlyphSvg glyph={muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
      {showsScrub
        ? createPortal(
            /* Le portail rend la barre DANS LE COULOIR, mais ses événements
               remontent l'arbre des COMPOSANTS jusqu'au plateau : un clic y
               basculerait le plein cadre, un appui y armerait l'appui long, et
               Espace y déclencherait lecture/pause au lieu du curseur — même
               garde que la barre d'une vidéo (`ViewerVideoPage`). */
            <div
              data-scene-viewer-scrub
              className="relative mx-4 h-11"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
              }}
            >
              <SceneScrubBar
                durationSeconds={duration}
                language={language}
                align="center"
                fill="#fff"
                painterRef={painterRef}
                onScrubStart={() => setScrubbing(true)}
                onScrub={(seconds) => clockRef.current?.seek(seconds)}
                onScrubEnd={(seconds) => {
                  clockRef.current?.seek(seconds);
                  setScrubbing(false);
                  setPlayback(scenePlaybackScrubbed);
                }}
                className="inset-x-0 top-0"
              />
            </div>,
            corridorSlot,
          )
        : null}
    </div>
  );
}
