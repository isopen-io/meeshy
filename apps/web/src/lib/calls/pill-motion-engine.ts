import { prefersReducedMotion } from '@/lib/view/reduced-motion';

import { MORPH_MS, morphKeyframes, type GlassSize, STOW_REDUCED_MS, stowedGlass, stowFadeKeyframes } from './call-pill-motion';

/**
 * **LE MOTEUR DOM DU MOUVEMENT DU VERRE** (#17536, lois dans `call-pill-motion.ts`) — il mesure
 * et joue ce que les lois décident. Son chunk à lui (`budgets.json` › `call_pill_motion_engine`) :
 * l'écran d'appel le charge dès que l'appel vit (`use-pill-motion.ts`), et ne paie pas ses octets
 * dans `call_overlay`. Tout se joue en Web Animations, que la règle générale de « Réduire les
 * animations » (qui coupe les transitions CSS) n'éteint pas : c'est ce qui laisse le fondu court exister.
 */

/** Le liseré intérieur du verre (`p-1.5`) : ce qu'il garde autour de ses sous-titres rangés. */
const PILL_PADDING = 6;

const EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

/** Ce qui se range par le fondu : l'élément lui-même ou ses descendants. */
const STOW_TARGETS = '[data-call-stow], [data-call-chrome-fade], [data-call-pill-rest]';

const changed = (from: GlassSize, to: GlassSize): boolean => morphKeyframes(from, to, false) !== null;

export type PillGlass = { readonly update: (stowed: boolean) => void; readonly dispose: () => void };

/**
 * Le verre de la pilule : MORPHISME quand sa taille change (une option, un panneau, les
 * rangées d'un groupe, des sous-titres qui arrivent ou repartent), RESSERRÉ autour des
 * sous-titres quand `stowed`. Le verre est un élément à lui (`skin`), seul mis à l'échelle :
 * le contenu garde ses proportions. Interruptible : un morphisme repris en route part de
 * la taille que le verre avait à cet instant. `update` est appelé à chaque rendu, et à
 * chaque changement de taille que la pilule n'a pas rendu elle-même (des sous-titres qui arrivent).
 */
export function createPillGlass(element: HTMLElement, glass: HTMLElement): PillGlass {
  let last: GlassSize | null = null;
  let running: Animation | null = null;
  let stowed = false;
  const measure = (): void => {
    const to = { width: element.offsetWidth, height: element.offsetHeight };
    const from = last;
    last = to;
    const kept = element.querySelector<HTMLElement>('[data-call-captions-panel]');
    const stow = stowed && kept !== null ? stowedGlass({ height: to.height, keptTop: kept.offsetTop, keptHeight: kept.offsetHeight, padding: PILL_PADDING }) : null;
    if (stow !== null) {
      element.style.setProperty('--stow-scale', String(stow.scale));
      element.style.setProperty('--stow-shift', `${stow.shift}px`);
    }
    if (from === null || typeof glass.animate !== 'function') return;
    const reduced = prefersReducedMotion();
    const seen = running === null ? from : { width: glass.getBoundingClientRect().width, height: glass.getBoundingClientRect().height };
    const frames = morphKeyframes(seen, to, reduced);
    if (frames === null) {
      if (reduced && changed(from, to)) element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: STOW_REDUCED_MS });
      return;
    }
    running?.cancel();
    running = glass.animate([...frames], { duration: MORPH_MS, easing: EASING });
    running.onfinish = () => (running = null);
  };
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  watch?.observe(element);
  return {
    update: (next) => {
      stowed = next;
      measure();
    },
    dispose: () => watch?.disconnect(),
  };
}

/**
 * Ranger les commandes ou les rendre, sous « Réduire les animations » : l'en-tête, la
 * pilule et les bandeaux ne se déplacent pas, ils s'effacent (et reviennent) en un fondu
 * court. Hors de ce régime, la feuille (`call-motion.css`) les mène vers leur bord.
 */
export function fadeStow(element: HTMLElement, stowed: boolean): void {
  if (!prefersReducedMotion()) return;
  const targets = [...(element.matches(STOW_TARGETS) ? [element] : []), ...element.querySelectorAll<HTMLElement>(STOW_TARGETS)];
  for (const target of targets) if (typeof target.animate === 'function') target.animate([...stowFadeKeyframes(stowed)], { duration: STOW_REDUCED_MS, easing: 'linear' });
}
