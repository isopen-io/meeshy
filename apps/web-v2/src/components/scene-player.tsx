import { useRef } from 'react';

import { hostMute, playerConfig, type ScenePlayerMode } from '@/lib/canvas/config';
import type { CanvasDocument, CanvasScene } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { backgroundFraming } from '@/lib/canvas/background';
import { hasTimedObjects, sceneDurationSeconds } from '@/lib/canvas/timeline';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

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
   * (D-5). AJOUTÉ, jamais un renommage (D-11 : on ne renomme pas
   * `onContentReady`). */
  readonly onTime?: (t: number) => void;
  /** Émis UNE fois quand une scène SANS boucle atteint sa durée. */
  readonly onEnded?: () => void;
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
  callbacks,
  clock,
}: {
  readonly scene: CanvasScene;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly playing: boolean;
  readonly muted: boolean;
  readonly callbacks: { readonly current: SceneCallbacks };
  readonly clock: SceneClockHandle | null;
}) {
  // `SceneFraming.backgroundMedia` — le premier fond qui PORTE une image,
  // sinon le premier fond : la MÊME élection que la loi de cadrage, jamais
  // une seconde.
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
        // LE SEUL `switch` du moteur (Étape 5) — une couche par `kind`.
        switch (object.kind) {
          case 'text':
            return <SceneObjectText key={object.id} object={object} preferredLanguages={preferredLanguages} clock={clock} />;
          case 'media':
            return <SceneObjectMedia key={object.id} object={object} carrier={carrier} playing={playing} muted={muted} clock={clock} />;
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
}: ScenePlayerProps) {
  const scene = document.scenes[sceneIndex];
  const config = playerConfig(mode);
  const language = currentInterfaceLanguage();
  const audible = playing && isDocumentAudible(document);
  const callbacks = useLatest<SceneCallbacks>({ onContentReady, onDurationKnown, onPlaybackBlocked });
  const isMuted = hostMute({ config, requestedMute: muted });
  const timed = scene !== undefined && hasTimedObjects(scene);
  const durationSeconds = scene !== undefined ? sceneDurationSeconds(scene) : null;
  const clock = useSceneClock({ enabled: timed, playing, loops: config.loops, durationSeconds, onTime, onEnded });

  if (scene === undefined) return null;

  const canvas = (
    <SceneCanvas
      scene={scene}
      carrier={carrier}
      preferredLanguages={preferredLanguages}
      playing={playing}
      muted={isMuted}
      callbacks={callbacks}
      clock={timed ? clock : null}
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
