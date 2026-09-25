import { useEffect, useRef } from 'react';

import { hostMute, playerConfig, type ScenePlayerMode } from '@/lib/canvas/config';
import type { CanvasDocument, CanvasScene } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { backgroundFraming } from '@/lib/canvas/background';
import { sceneRatio } from '@/lib/canvas/fit';
import { hasTimedObjects, sceneDurationSeconds } from '@/lib/canvas/timeline';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { letterboxHashes, letterboxIsServed } from '@/lib/stories/letterbox';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { useSceneClock, type SceneClockHandle } from './scene-clock';
import { BackgroundLayer, BlankBackground, type SceneCallbacks } from './scene-object-background';
import { SceneObjectAudio } from './scene-object-audio';
import { SceneObjectDrawing } from './scene-object-drawing';
import { SceneObjectMedia } from './scene-object-media';
import { SceneObjectPlace } from './scene-object-place';
import { SceneObjectSticker } from './scene-object-sticker';
import { SceneObjectText } from './scene-object-text';

/**
 * LE MOTEUR DE SCÈNE (#6898, #6901, D-79) — `ScenePlayer` rend UNE scène d'un
 * document canvas v3, chargé À LA DEMANDE par son hôte (`lazy(() =>
 * import('./scene-player'))`, motif D-54).
 *
 * `mode` (`config.ts`) gouverne UNIQUEMENT le son, la boucle et le chrome —
 * jamais la géométrie, qui vient exclusivement de `focus` et du rapport
 * naturel de la scène (9:16, `lib/canvas/fit.ts#sceneRatio`).
 *
 * SIX couches d'objet, dispatchées par `kind` — `SceneCanvas` est le SEUL
 * `switch` du moteur ; chaque couche délègue sa POSE à `SceneObjectFrame`
 * (`scene-object-frame.tsx`), qui applique `objectPose` au montage et à
 * chaque tick de l'horloge (`scene-clock.ts`) SANS re-rendre React (Zero
 * Unnecessary Re-render).
 *
 * **LE SOL D'UN FOND AJUSTÉ** (`framing === 'fit'`, revue-correction #6901) se
 * peint ICI, dans le moteur — `BackgroundLayer` reçoit le placeholder ThumbHash
 * déjà résolu par `SceneCanvas` (`letterboxHashes` + `letterboxIsServed`,
 * `lib/stories/letterbox.ts`), la MÊME cascade que le lecteur de story, qui ne
 * la pose plus lui-même (double-peint évité). `servesLetterboxFill` (par
 * défaut `true`, miroir `MeeshyScenePlayer.servesLetterboxFill`) est la SEULE
 * dérogation — le lecteur de story la coupe en verdict `imageOnly` (#6636).
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
  /** `requestedMute ?? config.isMuted`, verrouillé par `locksMute`
   * (`hostMute`, D5) — le lecteur de story y relaie le muet VIEWER. */
  readonly muted?: boolean;
  readonly onContentReady?: () => void;
  /** La durée du fond VIDÉO, en millisecondes, dès `loadedmetadata`. */
  readonly onDurationKnown?: (durationMs: number) => void;
  /** Un `play()` SONORE refusé par la politique de lecture automatique. */
  readonly onPlaybackBlocked?: () => void;
  /** L'HORLOGE de la scène, en secondes, throttlée à ≤ 10 Hz — un transport
   * (barre, seek) la consomme sans rouvrir le moteur (§ 9, Q10 : hors
   * tranche, #6906). N'est JAMAIS émis pour une scène sans objet temporisé
   * NI durée connue par un mode à CHROME (`fallbackDurationSeconds`
   * ci-dessous, #6903). AJOUTÉ, jamais un renommage (D-11 : on ne renomme
   * pas `onContentReady`). */
  readonly onTime?: (t: number) => void;
  /** Émis UNE fois quand une scène SANS boucle atteint sa durée. */
  readonly onEnded?: () => void;
  /** LA DURÉE QUE L'HÔTE CONNAÎT quand le document ne déclare rien (#6903,
   * miroir `computedTotalDuration()` `ReelsPlayerView+Scene.swift:91`) — un
   * réel composé par le studio (fond vidéo + texte, sans `timing` ni
   * `timelineDuration`) n'a pas d'objet TEMPORISÉ : sans ce repli, son
   * horloge ne démarrerait jamais et sa piste de fond ne boucle jamais.
   * IGNORÉE dès que `sceneDurationSeconds` rend une valeur (la durée
   * DÉCLARÉE reste autoritaire), et ignorée hors d'un mode à CHROME
   * (`showsChrome`) : une CARTE ne paie jamais cette horloge (T-E5). */
  readonly fallbackDurationSeconds?: number;
  /** Émis à CHAQUE tour d'un mode qui boucle (`loops`, miroir `loopPass`,
   * #6903) — jamais pour un mode sans boucle. L'hôte y REMONTE sa piste de
   * son de fond (`key` changée) pour la repartir depuis `startOffsetMs`,
   * sans jamais remonter LE PLAYER (Zero Unnecessary Re-render). */
  readonly onLoop?: () => void;
  /** Le remplissage des bandes d'un fond AJUSTÉ (`fit`) — PEINT par défaut,
   * miroir `MeeshyScenePlayer.servesLetterboxFill = true`
   * (`MeeshyScenePlayer.swift:79`). Le lecteur de story le coupe en verdict
   * `imageOnly` (#6636) : rogner un calque qu'on continue de peindre
   * paierait un flou que personne ne voit. */
  readonly servesLetterboxFill?: boolean;
  /** LA POIGNÉE DE L'HORLOGE (#7879) — remise UNE fois (elle vit autant que
   * le player) à l'hôte qui porte une barre qu'on parcourt au doigt : `seek`
   * redessine la scène au temps pointé et recale ses médias, sans rouvrir le
   * moteur. AJOUTÉ, jamais un renommage (D-11). */
  readonly onClock?: (clock: SceneClockHandle) => void;
};

/** Le rappel le plus RÉCENT d'un hôte, sans en faire une dépendance d'effet :
 * un hôte qui passe une lambda en ligne relancerait sinon chaque effet à
 * chaque rendu. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function SceneCanvas({
  scene,
  carrier,
  preferredLanguages,
  playing,
  muted,
  servesLetterboxFill,
  callbacks,
  clock,
  seekClock,
}: {
  readonly scene: CanvasScene;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly playing: boolean;
  readonly muted: boolean;
  readonly servesLetterboxFill: boolean;
  readonly callbacks: { readonly current: SceneCallbacks };
  readonly clock: SceneClockHandle | null;
  /** L'horloge que les MÉDIAS écoutent pour se recaler (`useMediaSeek`) —
   * toujours fournie, même sans objet temporisé : une vidéo de fond se
   * parcourt aussi. */
  readonly seekClock: SceneClockHandle;
}) {
  // `SceneFraming.backgroundMedia` — le premier fond qui PORTE une image,
  // sinon le premier fond : la MÊME élection que la loi de cadrage, jamais
  // une seconde.
  const background = backgroundMedia(scene);
  const framing = backgroundFraming(scene);
  // LE SOL D'UN FOND AJUSTÉ (revue-correction #6901) — la cascade des
  // ThumbHash (`letterboxHashes`, déjà écrite pour l'hôte de story) devient le
  // SITE UNIQUE, dans le MOTEUR : `servesLetterboxFill` (miroir
  // `MeeshyScenePlayer.servesLetterboxFill`, `false` en verdict `imageOnly`
  // côté story) est la SEULE dérogation, jamais une seconde loi de cadrage.
  // Aucun repli quand aucun hash n'existe (`Source.none` côté iOS non plus :
  // ce cas reste un écart de PARITÉ assumé, pas une régression de ce lot).
  const letterboxCandidate = servesLetterboxFill && background !== undefined ? thumbHashPlaceholder(letterboxHashes(scene)[0]) : undefined;
  const letterboxFillSrc = letterboxIsServed({ fitMode: framing, hasSource: letterboxCandidate !== undefined }) ? letterboxCandidate : undefined;
  // Le fond VISUEL (`backgroundMedia`) et le fond SONORE (`electBackgroundTrack`,
  // `lib/canvas/background-sound.ts`) sont DEUX fonds, et l'un comme l'autre
  // est servi HORS des couches d'objet : le premier par `BackgroundLayer`
  // ci-dessous, le second par l'hôte (`story-scene-layer.tsx`,
  // `story-compose.tsx`). Rendre une couche pour l'objet `audio` qui porte
  // `isBackground` jouait la MÊME piste deux fois, en écho (T-E12).
  const foreground = scene.objects
    .filter((o) => o.id !== background?.id && !(o.kind === 'audio' && o.payload.isBackground === true))
    .sort((a, b) => a.z - b.z);
  return (
    <span className="absolute inset-0 block" style={{ containerType: 'inline-size' }}>
      {background !== undefined ? (
        <BackgroundLayer
          key={`${scene.id}:${background.id}`}
          object={background}
          carrier={carrier}
          playing={playing}
          muted={muted}
          framing={framing}
          letterboxFillSrc={letterboxFillSrc}
          callbacks={callbacks}
          seekClock={seekClock}
        />
      ) : (
        <BlankBackground key={scene.id} callbacks={callbacks} />
      )}
      {foreground.map((object) => {
        // LE SEUL `switch` du moteur (Étape 5) — une couche par `kind`.
        switch (object.kind) {
          case 'text':
            return <SceneObjectText key={object.id} object={object} preferredLanguages={preferredLanguages} clock={clock} />;
          case 'media':
            return <SceneObjectMedia key={object.id} object={object} carrier={carrier} playing={playing} muted={muted} clock={clock} seekClock={seekClock} />;
          case 'sticker':
            return <SceneObjectSticker key={object.id} object={object} carrier={carrier} clock={clock} />;
          case 'place':
            return <SceneObjectPlace key={object.id} object={object} clock={clock} />;
          case 'drawing':
            return <SceneObjectDrawing key={object.id} object={object} clock={clock} />;
          case 'audio':
            return (
              <SceneObjectAudio
                key={object.id}
                object={object}
                carrier={carrier}
                playing={playing}
                muted={muted}
                clock={clock}
                seekClock={seekClock}
                onPlaybackBlocked={callbacks.current.onPlaybackBlocked}
              />
            );
          default:
            return null; // `mention` (métadonnée, jamais peinte) et tout kind inconnu
        }
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
  onTime,
  onEnded,
  fallbackDurationSeconds,
  onLoop,
  servesLetterboxFill = true,
  onClock,
}: ScenePlayerProps) {
  const scene = document.scenes[sceneIndex];
  const config = playerConfig(mode);
  const language = currentInterfaceLanguage();
  const audible = playing && isDocumentAudible(document);
  const callbacks = useLatest<SceneCallbacks>({ onContentReady, onDurationKnown, onPlaybackBlocked });
  const isMuted = hostMute({ config, requestedMute: muted });
  const timed = scene !== undefined && hasTimedObjects(scene);
  const declaredDurationSeconds = scene !== undefined ? sceneDurationSeconds(scene) : null;
  // Le repli de l'HÔTE (#6903) n'a d'effet que dans un mode à CHROME : une
  // CARTE (`showsChrome: false`) ne paie jamais cette horloge (T-E5, garde
  // de la première peinture du fil), même si son hôte lui passe une durée.
  const durationSeconds =
    declaredDurationSeconds ?? (config.showsChrome && fallbackDurationSeconds !== undefined ? fallbackDurationSeconds : null);
  const enabled = timed || (config.showsChrome && durationSeconds !== null);
  const clock = useSceneClock({ enabled, playing, loops: config.loops, durationSeconds, onTime, onEnded, onLoop });
  const clockReceiver = useLatest(onClock);
  useEffect(() => {
    clockReceiver.current?.(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  if (scene === undefined) return null;

  const canvas = (
    <SceneCanvas
      scene={scene}
      carrier={carrier}
      preferredLanguages={preferredLanguages}
      playing={playing}
      muted={isMuted}
      servesLetterboxFill={servesLetterboxFill}
      callbacks={callbacks}
      clock={timed ? clock : null}
      seekClock={clock}
    />
  );

  return (
    <span data-scene-player className="relative block size-full overflow-hidden">
      {focus === undefined ? (
        canvas
      ) : (
        // La fenêtre de cadrage a TOUJOURS `x: 0, width: 1` (`scene-framing.ts`
        // impose la largeur pleine) : seule une translation VERTICALE, en
        // pourcentage de la hauteur du canvas lui-même, reproduit
        // `SceneFraming.placement` sans aucune mesure de pixels.
        <span
          className="absolute top-0 left-0 block w-full"
          // `sceneRatio(scene)` (`lib/canvas/fit.ts`) — la loi D-80 (9:16
          // FIGÉ, `carrierAspect` lu par personne au rendu) appliquée à son
          // SEUL site de peinture, jamais un « 9 / 16 » réécrit ici
          // (revue-correction #6901 : le lot posait la loi et laissait le
          // littéral à côté — une loi sans consommateur n'est pas livrée).
          style={{ aspectRatio: `${sceneRatio(scene)}`, transform: `translateY(${-focus.y * 100}%)` }}
        >
          {canvas}
        </span>
      )}
      {/* `isMuted` — le muet RÉSOLU (`hostMute`), pas celui que le mode
          PROPOSE : un lecteur de story qui tient son muet viewant
          (`muted: true` sur un mode sonore) coupait bien le son et
          n'affichait AUCUNE pastille pour le dire (revue-correction #6901).
          `config.showsMuteBadge` (revue-correction #6903) retire la pastille
          là où l'hôte dit DÉJÀ le muet — le rail des Réels. */}
      {audible && isMuted && config.showsMuteBadge ? (
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
