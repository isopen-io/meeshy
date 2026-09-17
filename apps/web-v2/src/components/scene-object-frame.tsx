import { useLayoutEffect, useRef, type ReactNode } from 'react';

import type { CanvasObject } from '@/lib/canvas/document';
import { objectPose } from '@/lib/canvas/pose';
import { hasTimeWindow } from '@/lib/feed/scene-motion';

import type { SceneClockHandle } from './scene-clock';

/**
 * `SceneObjectFrame` (#6901, Étape 5) — LE SEUL composant qui pose
 * `data-scene-object={kind}` et écrit `left`/`top`/`transform`/`opacity`/
 * `hidden` depuis `objectPose(object, t)` : les six couches d'objet le
 * montent, jamais chacune sa propre pose (c'est ce qui rend T-E4/E5/E8 vrais
 * pour les six d'un coup).
 *
 * Un objet SANS fenêtre temporelle (`hasTimeWindow` faux) applique sa pose
 * UNE fois, au montage, et ne s'abonne à AUCUNE horloge — la scène statique
 * la plus fréquente ne paie aucun `rAF`.
 */
export type SceneObjectFrameProps = {
  readonly object: CanvasObject;
  readonly kind: string;
  readonly clock: SceneClockHandle | null;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * `'anchored'` (défaut) — position à l'ancre de l'objet, transform
   * (rotation/échelle) et fondu. `'fullBleed'` — le dessin (`.drawing`) :
   * plein cadre, sans position ni transform (seuls l'opacité et le `hidden`
   * de la fenêtre temporelle s'appliquent) — un objet plein cadre positionné
   * par pourcentage d'ancre + `translate(-50%,-50%)` collaborerait mal avec
   * un conteneur sans taille intrinsèque.
   */
  readonly layout?: 'anchored' | 'fullBleed';
};

export function SceneObjectFrame({ object, kind, clock, children, className, layout = 'anchored' }: SceneObjectFrameProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const timed = hasTimeWindow(object);

  const applyPose = (t: number) => {
    const el = ref.current;
    if (el === null) return;
    const pose = objectPose(object, t);
    if (layout === 'anchored') {
      el.style.left = `${pose.x * 100}%`;
      el.style.top = `${pose.y * 100}%`;
      el.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
    }
    el.style.opacity = String(pose.opacity);
    el.hidden = !pose.visible;
  };

  useLayoutEffect(() => {
    applyPose(0);
    if (!timed || clock === null) return;
    return clock.subscribe(applyPose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, timed, clock, layout]);

  const positionClass = layout === 'fullBleed' ? 'absolute inset-0 size-full' : 'absolute';

  return (
    <span ref={ref} data-scene-object={kind} className={`pointer-events-none ${positionClass} ${className ?? ''}`.trim()}>
      {children}
    </span>
  );
}
