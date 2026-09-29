import type { CanvasDocument } from '@/lib/canvas/document';

import { buildPreviewCanvasDocument } from './story-document';
import type { StudioPage } from './studio-page';

/**
 * **LE DOCUMENT D'APERÇU D'UNE PAGE** — le moteur partagé (`ScenePlayer`)
 * dessine ce que l'auteur publiera, au pixel près (mêmes styles, même largeur
 * `cqw`, même filtre par média) ; seules les ADRESSES diffèrent de la
 * publication (`studio-publish.ts`) : l'aperçu lit les URL locales.
 *
 * Sorti de `story-compose.tsx` au lot 7 (#8474) : l'écran dépassait son
 * budget, et l'aperçu est une LOI pure, pas un morceau d'écran.
 */
export function studioPreviewDocument(page: StudioPage): CanvasDocument | null {
  return buildPreviewCanvasDocument({
    texts: page.texts,
    ...(page.background !== null
      ? {
          background: {
            source: page.background.previewUrl,
            mediaType: page.background.mediaType,
            ...(page.background.aspectRatio !== undefined ? { aspectRatio: page.background.aspectRatio } : {}),
            ...(page.background.frame !== undefined ? { frame: page.background.frame } : {}),
            ...(page.background.filter !== undefined ? { filter: page.background.filter } : {}),
          },
        }
      : {}),
    ...(page.overlay !== null
      ? {
          overlay: {
            source: page.overlay.previewUrl,
            mediaType: page.overlay.mediaType,
            ...(page.overlay.aspectRatio !== undefined ? { aspectRatio: page.overlay.aspectRatio } : {}),
            pose: page.overlay.pose,
            ...(page.overlay.timing !== undefined ? { timing: page.overlay.timing } : {}),
            ...(page.overlay.filter !== undefined ? { filter: page.overlay.filter } : {}),
          },
        }
      : {}),
    ...(page.sound !== null ? { sound: { source: page.sound.previewUrl, plane: page.sound.plane } } : {}),
    ...(page.duration !== undefined ? { duration: page.duration } : {}),
  });
}
