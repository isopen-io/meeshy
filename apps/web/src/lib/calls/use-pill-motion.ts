import { useLayoutEffect, useRef, type RefObject } from 'react';

import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { PILL_TEXT_EXIT } from './call-pill-text-exit';
import { MORPH_MS, morphKeyframes, type GlassSize, STOW_REDUCED_MS, stowedGlass, stowFadeKeyframes } from './call-pill-motion';

/**
 * **LE BRANCHEMENT DOM DU MOUVEMENT DU VERRE** (#17536, `call-pill-motion.ts`) — il mesure
 * et joue ce que les lois décident ; tout se joue en Web Animations, que la règle générale
 * de « Réduire les animations » (qui coupe les transitions CSS) n'éteint pas : c'est ce qui
 * laisse le fondu court exister.
 */

/** Le liseré intérieur du verre (`p-1.5`) : ce qu'il garde autour de ses sous-titres rangés. */
const PILL_PADDING = 6;

const changed = (from: GlassSize, to: GlassSize): boolean => morphKeyframes(from, to, false) !== null;

const EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** Ce qui se range par le fondu : l'élément lui-même ou ses descendants. */
const STOW_TARGETS = '[data-call-stow], [data-call-chrome-fade], [data-call-pill-rest]';

/**
 * Le verre de la pilule : MORPHISME quand sa taille change (une option, un panneau, les
 * rangées d'un groupe, des sous-titres qui arrivent ou repartent), RESSERRÉ autour des
 * sous-titres quand `stowed`. Le verre est un élément à lui (`skin`), seul mis à l'échelle :
 * le contenu garde ses proportions. Interruptible : un morphisme repris en route part de
 * la taille que le verre avait à cet instant.
 */
export function usePillGlass(box: RefObject<HTMLElement | null>, skin: RefObject<HTMLElement | null>, stowed: boolean): void {
  const last = useRef<{ width: number; height: number } | null>(null);
  const running = useRef<Animation | null>(null);
  const measure = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    measure.current = (): void => {
      const element = box.current;
      const glass = skin.current;
      if (element === null || glass === null) return;
      const to = { width: element.offsetWidth, height: element.offsetHeight };
      const from = last.current;
      last.current = to;
      const kept = element.querySelector<HTMLElement>('[data-call-captions-panel]');
      const stow = stowed && kept !== null ? stowedGlass({ height: to.height, keptTop: kept.offsetTop, keptHeight: kept.offsetHeight, padding: PILL_PADDING }) : null;
      if (stow !== null) {
        element.style.setProperty('--stow-scale', String(stow.scale));
        element.style.setProperty('--stow-shift', `${stow.shift}px`);
      }
      if (from === null || typeof glass.animate !== 'function') return;
      const reduced = prefersReducedMotion();
      const seen = running.current === null ? from : { width: glass.getBoundingClientRect().width, height: glass.getBoundingClientRect().height };
      const frames = morphKeyframes(seen, to, reduced);
      if (frames === null) {
        if (reduced && changed(from, to)) element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: STOW_REDUCED_MS });
        return;
      }
      running.current?.cancel();
      running.current = glass.animate([...frames], { duration: MORPH_MS, easing: EASING });
      running.current.onfinish = () => (running.current = null);
    };
  });

  useLayoutEffect(() => measure.current());

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(() => measure.current());
    watch.observe(element);
    return () => watch.disconnect();
  }, [box]);
}

/**
 * Ranger les commandes ou les rendre, sous « Réduire les animations » : l'en-tête, la
 * pilule et les bandeaux ne se déplacent pas, ils s'effacent (et reviennent) en un fondu
 * court. Hors de ce régime, la feuille (`call-motion.css`) les mène vers leur bord.
 */
export function useStowFade(root: RefObject<HTMLElement | null>, stowed: boolean): void {
  const before = useRef(stowed);
  useLayoutEffect(() => {
    if (before.current === stowed) return;
    before.current = stowed;
    const element = root.current;
    if (element === null || !prefersReducedMotion()) return;
    const targets = [...(element.matches(STOW_TARGETS) ? [element] : []), ...element.querySelectorAll<HTMLElement>(STOW_TARGETS)];
    for (const target of targets) if (typeof target.animate === 'function') target.animate([...stowFadeKeyframes(stowed)], { duration: STOW_REDUCED_MS, easing: 'linear' });
  }, [root, stowed]);
}

/**
 * Ce qui quitte le verre y repart en fondu, depuis sa place : son double, sorti de la
 * mise en page, s'efface par-dessus le verre qui se resserre, puis s'en va. L'original est
 * déjà parti (React le retire) ; le double est inerte, muet pour le lecteur d'écran, et ne
 * porte aucun identifiant.
 */
export function leaveAsGhost(node: HTMLElement, box: HTMLElement): void {
  if (typeof node.animate !== 'function') return;
  const reduced = prefersReducedMotion();
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');
  for (const identified of ghost.querySelectorAll('[id]')) identified.removeAttribute('id');
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
