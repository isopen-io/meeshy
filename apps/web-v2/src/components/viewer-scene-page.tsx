import { Suspense, lazy, useEffect, useState } from 'react';

import { SCENE_RATIO } from '@/lib/canvas/fit';
import { isDocumentAudible } from '@/lib/feed/scene-motion';
import type { SceneGalleryEntry } from '@/lib/feed/gallery-lot';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { fullStageBox } from '@/lib/view/media-stage';
import { useElementSize } from '@/lib/view/use-element-size';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MEDIA_TRANSPORT_GLYPHS } from './glyphs-media-transport';

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
 */
const ScenePlayer = lazy(() => import('./scene-player'));

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
};

export function ViewerScenePage({ entry, isActive, preferredLanguages, topInset, label, pausedOnEntry, onToggleRef }: ViewerScenePageProps) {
  const [observe, stage] = useElementSize();
  const language = currentInterfaceLanguage();
  const [muted, setMuted] = useState(true);
  // La lecture est un ÉTAT DE PAGE, pas une valeur dérivée : un appui long
  // entre en pause, un bouton la reprend. Semée par `pausedOnEntry`, elle
  // suit ensuite les gestes — jamais recalculée sous le doigt du lecteur.
  const [paused, setPaused] = useState(pausedOnEntry);
  useEffect(() => {
    if (pausedOnEntry) setPaused(true);
  }, [pausedOnEntry]);

  const audible = isDocumentAudible(entry.document);
  const playing = isActive && entry.moves && !paused;

  useEffect(() => {
    if (onToggleRef === undefined) return;
    if (!isActive || !entry.moves) {
      onToggleRef(null);
      return;
    }
    onToggleRef(() => setPaused((p) => !p));
    return () => onToggleRef(null);
  }, [onToggleRef, isActive, entry.moves]);

  // Le viewport ENTIER — `stage` n'est lu QUE comme déclencheur de remesure
  // (voir le doc-comment) : tant qu'il vaut 0 × 0, rien n'a encore été mesuré
  // et la boîte s'étale, jamais une boîte de 0 px qui clignerait.
  const measured = stage.width > 0 && stage.height > 0;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const box = fullStageBox({ viewport, ratio: SCENE_RATIO, topInset });
  const placed = measured && box.width > 0 && box.height > 0;

  return (
    <div ref={observe} role="group" aria-label={label} data-scene-viewer-page className="relative size-full bg-black">
      <div
        className="absolute overflow-hidden"
        style={placed ? { width: box.width, height: box.height, left: box.left, top: box.top } : { inset: 0 }}
      >
        <Suspense fallback={null}>
          <ScenePlayer
            document={entry.document}
            sceneIndex={entry.sceneIndex}
            mode="story"
            playing={playing}
            muted={muted}
            carrier={entry.carrier}
            preferredLanguages={preferredLanguages}
          />
        </Suspense>
      </div>
      {isActive && (entry.moves || audible) ? (
        <div data-scene-viewer-controls className="absolute end-2 top-2 z-10 flex flex-col gap-2">
          {entry.moves ? (
            <button
              type="button"
              data-scene-viewer-playpause={paused ? 'paused' : 'playing'}
              aria-label={translate(language, paused ? 'scene.fullscreen.play' : 'scene.fullscreen.pause')}
              onClick={(e) => {
                e.stopPropagation();
                setPaused((p) => !p);
              }}
              className="media-viewer-scene-control tap-target-34 grid place-items-center rounded-full text-white"
            >
              {paused ? <Glyph name="fillPlay" size={15} /> : <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={15} />}
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
    </div>
  );
}
