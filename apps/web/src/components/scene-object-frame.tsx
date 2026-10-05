import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

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
/**
 * **LE FANTÔME** (lot 6, maquette `Main.dc.html` : « objets hors de leur
 * fenêtre en fantôme à l'arrêt, frise ouverte ») — l'opacité qu'un objet hors
 * de sa fenêtre prend au lieu de disparaître. `null` (le défaut, et toute
 * LECTURE) : il disparaît. Posé par `ScenePlayer.ghostOutsideWindow`, lu ici :
 * les six couches en héritent sans qu'aucune ne le reçoive.
 */
export const SceneGhostContext = createContext<number | null>(null);

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
  const ghost = useContext(SceneGhostContext);

  const applyPose = (t: number) => {
    const el = ref.current;
    if (el === null) return;
    const pose = objectPose(object, t);
    if (layout === 'anchored') {
      el.style.left = `${pose.x * 100}%`;
      el.style.top = `${pose.y * 100}%`;
      el.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
    }
    const ghosted = !pose.visible && ghost !== null;
    el.style.opacity = String(ghosted ? ghost : pose.opacity);
    el.hidden = !pose.visible && !ghosted;
    el.toggleAttribute('data-scene-ghost', ghosted);
  };

  useLayoutEffect(() => {
    applyPose(0);
    if (!timed || clock === null) return;
    return clock.subscribe(applyPose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, timed, clock, layout, ghost]);

  const positionClass = layout === 'fullBleed' ? 'absolute inset-0 size-full' : 'absolute';

  return (
    // `data-scene-object-id` NOMME l'objet peint (#6943) : le studio doit
    // pouvoir retrouver LEQUEL des objets de la scène sa sélection désigne,
    // pour aligner sa saisie dessus et y poser ses poignées. Avec un seul
    // objet texte, `[data-scene-object]` suffisait ; avec plusieurs, il
    // désigne le premier venu.
    <span
      ref={ref}
      data-scene-object={kind}
      data-scene-object-id={object.id}
      className={`pointer-events-none ${positionClass} ${className ?? ''}`.trim()}
    >
      {children}
    </span>
  );
}
