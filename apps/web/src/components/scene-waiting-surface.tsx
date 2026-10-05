import { useMemo } from 'react';

import { backgroundCss } from '@/lib/canvas/background';
import type { CanvasScene } from '@/lib/canvas/document';
import { sceneWaitingImage } from '@/lib/canvas/scene-placeholder';
import { backgroundMedia } from '@/lib/feed/scene-framing';

/** Ce que la carte peint tant que le moteur n'est pas chargé (#5047) : la
 * couleur du fond, et par-dessus l'empreinte de la scène quand elle en a une. */
export function SceneWaitingSurface({ scene }: { readonly scene: CanvasScene }) {
  const image = useMemo(() => sceneWaitingImage(scene), [scene]);
  return (
    <span data-scene-waiting="" aria-hidden="true" className="absolute inset-0 block" style={{ background: backgroundCss(backgroundMedia(scene)?.payload.background, 'var(--color-ios-card)') }}>
      {image !== undefined ? <img src={image} alt="" className="absolute inset-0 size-full object-cover" /> : null}
    </span>
  );
}
