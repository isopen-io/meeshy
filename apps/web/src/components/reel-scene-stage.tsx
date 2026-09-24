import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { BackgroundTrackAudio } from './background-track-audio';
import { Glyph } from './glyph';
import { RAIL_DISC, ReelPoster } from './reel-poster';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import type { ProtectedMediaDeps, ProtectedMediaUnavailableReason } from '@/lib/api/protected-media';
import { fitScene, SCENE_RATIO } from '@/lib/canvas/fit';
import { sceneDurationSeconds } from '@/lib/canvas/timeline';
import type { FeedCardScene } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { reelSceneDuration, reelSceneProgress, reelScenePlays } from '@/lib/reels/scene';
import type { ReelPageMode } from '@/lib/reels/thread';
import { useElementSize } from '@/lib/view/use-element-size';

/** Le moteur PARTAGÉ (D-79), chargé À LA DEMANDE — même motif que
 * `story-scene-layer.tsx` et `viewer-scene-page.tsx` : chaque hôte de
 * `ScenePlayer` le charge lui-même plutôt que d'hériter du chunk d'un autre. */
const ScenePlayer = lazy(() => import('./scene-player'));

/**
 * `ReelSceneStage` (#6903) — UN RÉEL COMPOSÉ SE REJOUE COMME SA SCÈNE : la
 * scène plein cadre (9:16 figé, D-80), en BOUCLE, AVEC son son de fond.
 * Miroir de `ReelSceneView` (`ReelsPlayerView+Scene.swift:63-104`) : la
 * scène 0 SEULE (§ 9 Q10), toujours par le même moteur que le fil et la
 * story (`ScenePlayer`, mode `reel` — `lib/canvas/config.ts`).
 *
 * **La lecture est une DÉRIVATION PURE** (`reelScenePlays`,
 * `lib/reels/scene.ts`), jamais le coordinateur de médias (§ 9 Q4 de la
 * spécification) : `active ∧ ¬paused ∧ ¬documentHidden`. Un tap met en
 * pause et la reprend ; quitter la page (mode ≠ `active`) OUBLIE la pause
 * (miroir `ReelsPlayerView+Scene.swift:111-115`).
 *
 * **Le son de fond a UN site** (`BackgroundTrackAudio`,
 * `components/background-track-audio.tsx`) : monté seulement en `active`
 * (`near` monte le player en pause, SANS piste — § 9 Q9, ≤ 3 lecteurs
 * comptés par le gate) et REMONTÉ à chaque tour de boucle (`onLoop` ⇒
 * `pass` incrémenté, dans sa `key`) pour repartir de `startOffsetMs`.
 *
 * **La progression est ÉCRITE sur une ref** (`writeProgress`), jamais un
 * `setState` par trame — Zero Unnecessary Re-render, miroir `ReelSceneClock`
 * observé par la SEULE barre. Sans durée connue (`duration === null`),
 * AUCUNE barre : un contrôle qui ne bougerait jamais est un contrôle qui
 * ment (loi 4).
 *
 * **DEUX cadres, et il faut les distinguer** (revue-correction #6903) : la
 * BOÎTE (`[data-reel-scene-stage]`) est la scène ajustée 9:16, qui laisse des
 * bandes noires sur un écran plus long ; le CADRE (`[data-reel-scene]`) est
 * la page. Le moteur et la piste vivent dans la BOÎTE ; le tap de pause et la
 * barre de progression vivent sur le CADRE — comme le réel VIDÉO du même
 * écran (`ReelPlayable`, `reel-page.tsx`) et comme iOS
 * (`ReelsPlayerView.swift:656-664, 891-894`). Les y remettre rendrait une
 * bande noire inerte et pousserait la barre contre la rangée auteur.
 */
export type ReelSceneStageProps = {
  readonly scene: FeedCardScene;
  readonly mode: ReelPageMode;
  readonly soundOn: boolean;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly preferredLanguages: readonly string[];
  readonly poster?: string;
  /** Un `play()` sonore refusé par la politique de lecture automatique — le
   * moteur ET la piste de fond y remontent, l'écran repasse `soundOn=false`. */
  readonly onSoundBlocked: () => void;
  /** LA PISTE ÉLUE NE SERA JAMAIS SERVIE (#7015, seconde revue) — remonté à
   * `ReelPage`, qui décide s'il RESTE un son à couper. Sans ce relais, le
   * rail son reste monté au-dessus d'une scène sans `<audio>` : un contrôle
   * INERTE (loi 4), le défaut même que `playable` prétend écarter. */
  readonly onSoundUnavailable?: (reason: ProtectedMediaUnavailableReason) => void;
  /** Injectable pour les témoins UNIQUEMENT — la production prend les
   * dépendances de `BackgroundTrackAudio`. */
  readonly mediaDeps?: ProtectedMediaDeps;
};

function documentHiddenNow(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

export default function ReelSceneStage({
  scene,
  mode,
  soundOn,
  accent,
  language,
  preferredLanguages,
  poster,
  onSoundBlocked,
  onSoundUnavailable,
  mediaDeps,
}: ReelSceneStageProps) {
  // `far` ne charge ni le moteur ni la piste — même discipline que
  // `reel-page.tsx` avant de monter ce chunk, et défense en profondeur pour
  // un hôte qui ferait transiter cette instance jusqu'à `far` sans démonter.
  const [observeOuter, outer] = useElementSize();
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(documentHiddenNow);
  const [knownMaxMs, setKnownMaxMs] = useState<number | null>(null);
  const [pass, setPass] = useState(0);
  /** LE SON DE FOND PEUT ÊTRE DÉFINITIVEMENT INDISPONIBLE (revue-correction
   * #7015, défaut 2) — même dégradation dessinée que `story-scene-layer.tsx`,
   * pour la MÊME piste résolue par le MÊME `BackgroundTrackAudio`. */
  const [soundUnavailable, setSoundUnavailable] = useState<ProtectedMediaUnavailableReason | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const track = electBackgroundTrack({ document: scene.document, sceneIndex: 0, carrier: scene.carrier });

  // Quitter la page OUBLIE la pause (miroir `ReelsPlayerView+Scene.swift:111-115`) :
  // un retour ultérieur en `active` rejoue SANS tap.
  useEffect(() => {
    if (mode !== 'active') setPaused(false);
  }, [mode]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    setSoundUnavailable(null);
  }, [track?.src]);

  const noteDuration = useCallback((ms: number) => {
    setKnownMaxMs((current) => (current === null || ms > current ? ms : current));
  }, []);

  if (mode === 'far') return <ReelPoster src={poster} />;

  const scene0 = scene.document.scenes[0];
  const declared = scene0 !== undefined ? sceneDurationSeconds(scene0) : null;
  const duration = reelSceneDuration({ declared, knownMs: knownMaxMs === null ? [] : [knownMaxMs] });
  const playing = reelScenePlays({ active: mode === 'active', paused, documentHidden: hidden });
  const muted = !soundOn;

  const box = fitScene({ viewport: outer, ratio: SCENE_RATIO });
  const placed = box.width > 0 && box.height > 0;

  const writeProgress = (t: number) => {
    const el = barRef.current;
    if (el === null || duration === null) return;
    el.style.transform = `scaleX(${reelSceneProgress({ elapsed: t, duration })})`;
  };

  return (
    <div
      ref={observeOuter}
      data-reel-scene
      data-reel-scene-playing={playing ? 'true' : 'false'}
      className="absolute inset-0"
      {...(soundUnavailable !== null ? { 'data-scene-sound-unavailable': soundUnavailable } : {})}
    >
      <div
        data-reel-scene-stage
        className="absolute overflow-hidden bg-black"
        style={placed ? { left: box.offsetX, top: box.offsetY, width: box.width, height: box.height } : { inset: 0 }}
      >
        <Suspense fallback={<ReelPoster src={poster} />}>
          <ScenePlayer
            document={scene.document}
            sceneIndex={0}
            mode="reel"
            playing={playing}
            muted={muted}
            carrier={scene.carrier}
            preferredLanguages={preferredLanguages}
            accentColor={accent}
            {...(duration !== null ? { fallbackDurationSeconds: duration } : {})}
            onDurationKnown={noteDuration}
            onPlaybackBlocked={onSoundBlocked}
            onTime={writeProgress}
            onLoop={() => setPass((p) => p + 1)}
          />
        </Suspense>
        {mode === 'active' && track !== null ? (
          <BackgroundTrackAudio
            key={`${scene.carrier.postId}:${track.src}:${pass}`}
            track={track}
            playing={playing}
            muted={muted}
            onDurationKnown={noteDuration}
            onPlaybackBlocked={onSoundBlocked}
            onUnavailable={(reason) => {
              setSoundUnavailable(reason);
              onSoundUnavailable?.(reason);
            }}
            {...(mediaDeps !== undefined ? { mediaDeps } : {})}
          />
        ) : null}
      </div>
      {/* LE TAP COUVRE LA PAGE, jamais la seule boîte 9:16
          (revue-correction #6903) : une scène 9:16 ajustée dans un écran plus
          long laisse des BANDES (mesuré : 75 px en haut et en bas d'un
          390×844), et un tap y restait sans effet — alors que le réel VIDÉO
          du même écran prend la page entière (`ReelPlayable`,
          `reel-page.tsx`, `inset-0` de l'`<article>`) et qu'iOS met en pause
          au tap de CONTENU (`ReelsPlayerView.swift:891-894`). Même geste,
          même effet, partout sur l'écran. */}
      <button
        type="button"
        data-reel-surface
        aria-label={translate(language, playing ? 'reels.pause' : 'reels.play')}
        onClick={() => setPaused((p) => !p)}
        className="absolute inset-0 grid place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4"
        style={{ outlineColor: 'white', WebkitTapHighlightColor: 'transparent' }}
      >
        {!playing ? (
          <span aria-hidden="true" className="grid size-18 place-items-center rounded-full" style={{ backgroundColor: RAIL_DISC }}>
            <Glyph name="fillPlay" size={34} className="text-white" />
          </span>
        ) : null}
      </button>
      {/* LA BARRE VIT EN BAS DE PAGE, pas en bas de la boîte de scène
          (revue-correction #6903) : iOS la pose à la place de `ReelScrubBar`,
          sous la rangée auteur et le rail (`ReelsPlayerView.swift:656-664`),
          et le réel VIDÉO du web l'y pose déjà (`ReelPlayable`). Dans la
          boîte, elle atterrissait à 76 px du bas, contre la rangée auteur —
          deux réels du même écran, deux places. `z-10` la fait passer
          au-dessus du VOILE BAS, qui l'effaçait (mesuré : `rgb(15,15,36)`
          contre `rgb(12,12,12)`) — même remède que `ReelPlayable`. */}
      {duration !== null ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block h-[3px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
          />
          <span
            aria-hidden="true"
            data-reel-progress
            ref={barRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block h-[3px] origin-left"
            style={{ backgroundColor: accent, transform: 'scaleX(0)' }}
          />
        </>
      ) : null}
    </div>
  );
}
