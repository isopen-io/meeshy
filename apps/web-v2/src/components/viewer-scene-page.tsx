import { Suspense, lazy } from 'react';

import { fitScene, SCENE_RATIO } from '@/lib/canvas/fit';
import type { SceneGalleryEntry } from '@/lib/feed/gallery-lot';
import { useElementSize } from '@/lib/view/use-element-size';

/**
 * `ViewerScenePage` (#6902, § B de la spécification `scenes-plein-ecran`) —
 * LA PAGE « SCÈNE » DE LA VISIONNEUSE PLEIN ÉCRAN : la MÊME scène que la
 * carte du fil (`FeedSceneSurface`), rendue par le MÊME moteur
 * (`ScenePlayer`, chargé À LA DEMANDE, D-79), à l'ÉCHELLE UNIFORME et
 * CENTRÉE dans le viewport ENTIER (`fitScene`, ratio 9:16 figé — D-80).
 *
 * `mode="story"` (config du cadrage) : joue une fois, son à la DEMANDE —
 * PAS `mode="reader"` (iOS joue avec son) : le cadrage de ce tour choisit un
 * démarrage MUET, cohérent avec `hostMute`/`config.ts` (§ 1.4, § 9 Q3 de la
 * spécification, écart ASSUMÉ avec iOS faute de bouton muet dans ce lot).
 *
 * Le conteneur qui porte `ref={observe}` REMPLIT le CADRE de la visionneuse
 * (`.media-viewer-page.absolute.inset-0`, lui-même le viewport ENTIER
 * depuis #6902 — les couloirs sont des OVERLAYS, § E de la spécification) :
 * `fitScene` y calcule donc une boîte centrée sur le VIEWPORT, exactement le
 * critère du gate (`check-feed-scenes.mjs`, centre ±1 px).
 */
const ScenePlayer = lazy(() => import('./scene-player'));

export type ViewerScenePageProps = {
  readonly entry: SceneGalleryEntry;
  readonly isActive: boolean;
  readonly preferredLanguages: readonly string[];
};

export function ViewerScenePage({ entry, isActive, preferredLanguages }: ViewerScenePageProps) {
  const [observe, viewport] = useElementSize();
  const box = fitScene({ viewport, ratio: SCENE_RATIO });
  const hasBox = box.width > 0 && box.height > 0;

  return (
    <div ref={observe} data-scene-viewer-page className="relative flex size-full items-center justify-center bg-black">
      <div className="relative overflow-hidden" style={hasBox ? { width: box.width, height: box.height } : { width: '100%', height: '100%' }}>
        <Suspense fallback={null}>
          <ScenePlayer
            document={entry.document}
            sceneIndex={entry.sceneIndex}
            mode="story"
            playing={isActive && entry.moves}
            carrier={entry.carrier}
            preferredLanguages={preferredLanguages}
          />
        </Suspense>
      </div>
    </div>
  );
}
