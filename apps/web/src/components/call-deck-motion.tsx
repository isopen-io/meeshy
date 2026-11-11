import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

import { PILL_TEXT_EXIT } from '@/lib/calls/call-pill-text-exit';
import { STOW_REDUCED_MS } from '@/lib/calls/call-pill-motion';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';

/**
 * **CE QUE LE VERRE OUVRE QUITTE LE VERRE EN FONDU, DEPUIS SA PLACE** (G3.4, #17490, #17536) —
 * les rangées d'un groupe ou le panneau ouvert, au-dessus de la rangée de base de la pilule.
 * Quand ils partent (refermer, ‹ Retour, Fermer), React les retire aussitôt : leur double,
 * sorti de la mise en page, s'efface par-dessus le verre qui se resserre (le morphisme de
 * `use-pill-motion.ts`), puis s'en va. Seuls l'opacité et la transformation se jouent ; sous
 * « Réduire les animations », un fondu court. Son chunk à lui : seul un verre qui grandit le paie
 * (`budgets.json` › `call_deck_motion`), la première peinture et l'écran d'appel ne le paient pas.
 */
function leaveAsGhost(node: HTMLElement, box: HTMLElement): void {
  if (typeof node.animate !== 'function') return;
  const reduced = prefersReducedMotion();
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  for (const identified of ghost.querySelectorAll('[id]')) identified.removeAttribute('id');
  /* Le double ne rejoue pas l'arrivée du contenu : ni animation CSS, ni identifiant, ni focus, ni lecteur d'écran. */
  ghost.style.animation = 'none';
  for (const inner of ghost.querySelectorAll<HTMLElement>('*')) inner.style.animation = 'none';
  ghost.setAttribute('inert', '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('data-call-pill-ghost', '');
  Object.assign(ghost.style, { position: 'absolute', left: `${node.offsetLeft}px`, width: `${node.offsetWidth}px`, bottom: `${box.offsetHeight - node.offsetTop - node.offsetHeight}px`, pointerEvents: 'none' });
  box.appendChild(ghost);
  const frames = reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(0.5rem)' }];
  const leaving = ghost.animate(frames, { duration: reduced ? STOW_REDUCED_MS : PILL_TEXT_EXIT.exitMs, easing: 'ease-in', fill: 'forwards' });
  leaving.onfinish = () => ghost.remove();
}

export function DeckContent({ kind, box, children }: { readonly kind: 'rows' | 'panel'; readonly box: RefObject<HTMLElement | null>; readonly children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () => () => {
      if (node.current !== null && box.current !== null) leaveAsGhost(node.current, box.current);
    },
    [box],
  );
  return (
    <div ref={node} className="flex flex-col gap-2" data-call-deck-content={kind}>
      {children}
    </div>
  );
}
