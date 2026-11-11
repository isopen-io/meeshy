import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **CE QUI ARRIVE ENTRE EN FONDU** (#17406 : rien n'apparaît d'un coup) — la capsule de la une, qui se monte avec
 * elle. Opacité seule, en Web Animations (la règle générale de « Réduire les animations » coupe les transitions et
 * les animations CSS, pas celles-ci) : plus court sous « Réduire les animations ». La première peinture du
 * conteneur ne la joue pas deux fois : elle part au montage, une fois.
 */
export function Arrives({ className, children, ...rest }: { readonly className: string; readonly children: ReactNode } & Record<`data-${string}`, string>) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => void box.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: prefersReducedMotion() ? 150 : 260, easing: 'ease-out' }), []);
  return (
    <div ref={box} className={className} {...rest}>
      {children}
    </div>
  );
}
