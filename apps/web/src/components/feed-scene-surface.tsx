import { lazy, Suspense } from 'react';

import { fitScene } from '@/lib/canvas/fit';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument, CanvasScene } from '@/lib/canvas/document';
import { SCENE_ASPECT, backgroundMedia, cardFocus, pageAspect } from '@/lib/feed/scene-framing';
import { isSceneCinematic, isVideoObject } from '@/lib/feed/scene-motion';
import { resolveSceneCaption } from '@/lib/feed/scene-caption';
import { FEED_TEXT_TRUNCATION_LIMIT, truncateWords } from '@/lib/feed/text';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useElementSize } from '@/lib/view/use-element-size';

import { Glyph } from './glyph';

/**
 * `FeedSceneSurface` — LA VIGNETTE D'UNE SCÈNE, `page` ou `tile` (#6898, §
 * 1.2 et § 5.4 de la spécification, miroir `PostSceneCard`/`vignette` de
 * `FeedSceneAutoplay.swift` et `PostSceneMosaic.swift`).
 *
 * **LA LECTURE EST UNE VALEUR REÇUE, JAMAIS UN ÉTAT LOCAL** (`active`,
 * miroir `PostSceneCard.isActive`) : ce composant ne décide RIEN de
 * l'élection, il la REND — `playing = active && isSceneCinematic(scene)`
 * (une scène FIXE ne joue jamais, même élue). `frame="tile"` ne joue JAMAIS
 * (« une tuile est une scène ARRÊTÉE, pas une vignette », `PostSceneMosaic.
 * swift:29-40`) : seul le carrousel (`frame="page"`) élit une lecture.
 *
 * Le moteur (`ScenePlayer`) est chargé À LA DEMANDE (`lazy`, motif D-54) —
 * la première peinture du fil ne grossit pas tant qu'aucune carte à scène
 * n'est visible ; en attendant, la boîte se peint de la couleur du FOND de la
 * scène, jamais d'un aplat neutre qui clignerait vers elle (§ 6).
 */
const ScenePlayer = lazy(() => import('./scene-player'));

export type FeedSceneSurfaceFrame = 'page' | 'tile';

export type FeedSceneSurfaceProps = {
  readonly document: CanvasDocument;
  readonly sceneIndex: number;
  readonly carrier: SceneCarrier;
  readonly preferredLanguages: readonly string[];
  readonly active: boolean;
  readonly frame: FeedSceneSurfaceFrame;
  readonly authorName?: string;
  readonly onOpen?: (sceneIndex: number) => void;
  /** `MosaicLayout.tileCarriesCaption` (#6898 § 5.2) — la PLACE décide, pas
   * la scène : une mosaïque `wave`/`sine` ne porte de légende sur AUCUNE
   * tuile, `hero` seulement sur la première. Défaut `true` (page de
   * carrousel, carte mono-scène). */
  readonly showCaption?: boolean;
  /** `MosaicLayout.captionWordLimit` pour une tuile ; 20 mots ailleurs
   * (`FeedCaptionOverlay.swift:35-50`). */
  readonly captionWordLimit?: number;
  /** Le report « +N » que la mosaïque pose sur SA dernière tuile — la tuile
   * l'ANNONCE dans son nom (`vignette`, `PostSceneMosaic.swift:392-478`). */
  readonly overflow?: number;
};

const sceneBackgroundColor = (scene: CanvasScene): string => {
  const color = backgroundMedia(scene)?.payload.background;
  return typeof color === 'string' && color !== '' ? color : 'var(--color-ios-card)';
};

/** « Scène N », « Scène N, et M de plus », « Scène N, vidéo » pour une
 * tuile ; « Scène partagée par … » pour une page ou une carte mono-scène. */
function surfaceLabel(params: {
  readonly language: InterfaceLanguage;
  readonly document: CanvasDocument;
  readonly scene: CanvasScene;
  readonly sceneIndex: number;
  readonly frame: FeedSceneSurfaceFrame;
  readonly authorName: string;
  readonly overflow: number;
}): string {
  const { language, document, scene, sceneIndex, frame, authorName, overflow } = params;
  if (frame === 'page' || document.scenes.length <= 1) return translate(language, 'feed.scene.shared_by', { author: authorName });
  const index = String(sceneIndex + 1);
  if (overflow > 0) return translate(language, 'feed.scene.mosaic.more', { index, count: String(overflow) });
  if (scene.objects.some(isVideoObject)) return translate(language, 'feed.scene.mosaic.video', { index });
  return translate(language, 'feed.scene.mosaic.tile', { index });
}

export function FeedSceneSurface({
  document,
  sceneIndex,
  carrier,
  preferredLanguages,
  active,
  frame,
  authorName,
  onOpen,
  showCaption = true,
  captionWordLimit = FEED_TEXT_TRUNCATION_LIMIT,
  overflow = 0,
}: FeedSceneSurfaceProps) {
  const scene = document.scenes[sceneIndex];
  const language = currentInterfaceLanguage();
  // La boîte de contenu est mesurée (`ResizeObserver`), jamais dérivée d'une
  // astuce CSS `aspect-ratio` + flex : un enfant flex SANS largeur/hauteur
  // explicite et sans taille de contenu propre s'y résout en 0×0 dans
  // Chromium — mesuré au gate (§ 5.7). Appelé AVANT tout retour anticipé
  // (règle des Hooks).
  const [observeOuter, outer] = useElementSize();
  if (scene === undefined) return null;

  const cinematic = isSceneCinematic(scene);
  // `frame="tile"` ne joue JAMAIS — seule une PAGE de carrousel, élue, lit.
  const playing = frame === 'page' && active && cinematic;
  const focus = frame === 'page' ? (cardFocus(scene) ?? undefined) : undefined;
  const ratio = frame === 'page' ? (pageAspect(scene) ?? SCENE_ASPECT) : SCENE_ASPECT;
  const caption = showCaption ? resolveSceneCaption({ sceneIndex, document, carrier }) : undefined;
  const content = fitScene({ viewport: outer, ratio });
  const label = surfaceLabel({ language, document, scene, sceneIndex, frame, authorName: authorName ?? '', overflow });

  const body = (
    <span ref={observeOuter} className="relative flex size-full items-center justify-center overflow-hidden">
      <span
        className="relative block"
        style={content.width > 0 && content.height > 0 ? { width: content.width, height: content.height } : { width: '100%', height: '100%' }}
      >
        <Suspense fallback={<span className="absolute inset-0 block" style={{ backgroundColor: sceneBackgroundColor(scene) }} />}>
          <ScenePlayer
            document={document}
            sceneIndex={sceneIndex}
            mode="card"
            playing={playing}
            carrier={carrier}
            preferredLanguages={preferredLanguages}
            {...(focus !== undefined ? { focus } : {})}
          />
        </Suspense>
        {/* Le glyphe de lecture EST un indicateur, sur une scène ARRÊTÉE
            qui BOUGE — jamais un bouton (le tap ouvre la scène, pas la lecture). */}
        {!active && cinematic ? (
          <span
            data-feed-scene-paused-glyph=""
            className="pointer-events-none absolute end-2.5 bottom-2.5 grid place-items-center rounded-full"
            style={{ width: 26, height: 26, backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            <Glyph name="fillPlay" size={13} style={{ color: 'white' }} />
          </span>
        ) : null}
        {caption !== undefined ? (
          <span
            data-feed-scene-caption
            className="pointer-events-none absolute inset-x-0 bottom-0 block px-2 py-1.5 text-start text-check text-white"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
            {...(caption.language !== undefined ? { lang: caption.language } : {})}
          >
            {truncateWords(caption.text, captionWordLimit).text}
          </span>
        ) : null}
      </span>
    </span>
  );

  return (
    <div data-feed-scene="" data-feed-scene-index={sceneIndex} className="relative size-full">
      {onOpen !== undefined ? (
        <button
          type="button"
          onClick={() => onOpen(sceneIndex)}
          aria-label={label}
          className="relative block size-full focus-visible:outline-2 focus-visible:-outline-offset-4"
          style={{ outlineColor: 'white' }}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}
