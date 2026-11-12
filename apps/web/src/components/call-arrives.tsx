import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { LEAVING } from '@/lib/calls/use-pill-motion';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **CE QUI ARRIVE ENTRE EN FONDU, ET REPART DE MÊME** (#17406 : rien n'apparaît ni ne disparaît d'un coup) — la
 * capsule de la une, qui se monte avec elle et que la grille retient le temps de son départ (`leaving`, U1.12) :
 * marquée {@link LEAVING} (ni focus ni clic, cachée au lecteur d'écran), elle se démonte quand son fondu est FINI.
 * Opacité seule, en Web Animations (la règle générale de « Réduire les animations » coupe les transitions et les
 * animations CSS, pas celles-ci) : plus court sous « Réduire les animations ». La première peinture du conteneur
 * ne la joue pas deux fois : elle part au montage, une fois. Sans API d'animation, elle arrive et repart d'un coup.
 */
export function Arrives({ className, children, leaving = false, ...rest }: { readonly className: string; readonly children: ReactNode; readonly leaving?: boolean } & Record<`data-${string}`, string>) {
  const box = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  useLayoutEffect(() => {
    const frames = leaving ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
    const played = box.current?.animate?.(frames, { duration: prefersReducedMotion() ? 150 : 260, easing: 'ease-out', fill: leaving ? 'forwards' : 'none' });
    if (!leaving) return;
    if (played === undefined) setGone(true);
    else void played.finished.then(() => setGone(true), () => undefined);
  }, []);
  return gone ? null : (
    <div ref={box} className={className} {...(leaving ? LEAVING : {})} {...rest}>
      {children}
    </div>
  );
}
