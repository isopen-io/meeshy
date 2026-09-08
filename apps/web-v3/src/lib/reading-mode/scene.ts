import { useEffect } from 'react';

import { THREAD_FOCUS_BAND_OFFSET, threadPerspective } from './perspective';

/**
 * LA PERSPECTIVE DU FIL — même dispositif que `src/lib/lens/scene.ts` pour la
 * Lentille, appliquée à `[data-row]` au lieu de rangées de liste.
 *
 * TROIS RÈGLES, identiques à la scène sœur :
 * 1. Une seule lecture de géométrie par image (`requestAnimationFrame`
 *    coalesce le flot d'événements `scroll`).
 * 2. On n'écrit QUE `transform`/`opacity`, jamais par l'état React — une
 *    rangée qui traverserait React à chaque image diffuserait l'arbre entier
 *    soixante fois par seconde (§ Instant App Principles, « Zero Unnecessary
 *    Re-render »).
 * 3. `prefers-reduced-motion` coupe la perspective — aucune transform n'est
 *    jamais posée, ce que `scripts/check-reading-mode.mjs` §5 garde.
 *
 * PAS D'ÉLECTION ICI (contrairement à `lens/scene.ts`) : ce lot répare le
 * défaut mesuré (Focal ≠ Script au pixel) sans reproduire la carte de focus
 * dédiée d'iOS — voir le doc-comment de `perspective.ts`.
 */
const REDUCED_MOTION = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useThreadPerspective(frame: { current: HTMLElement | null }, enabled: boolean): void {
  useEffect(() => {
    const element = frame.current;
    if (element === null || !enabled || REDUCED_MOTION()) return;

    let request = 0;
    const pass = () => {
      request = 0;
      const box = element.getBoundingClientRect();
      const bandY = box.bottom - THREAD_FOCUS_BAND_OFFSET;
      for (const row of element.querySelectorAll<HTMLElement>('[data-row]')) {
        const r = row.getBoundingClientRect();
        const midY = r.top + r.height / 2;
        const { alpha, scale } = threadPerspective(bandY - midY);
        const visual = row.firstElementChild;
        if (visual instanceof HTMLElement) {
          visual.style.opacity = String(alpha);
          visual.style.transform = `scale(${scale})`;
        }
      }
    };

    const onScroll = () => {
      if (request === 0) request = requestAnimationFrame(pass);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    // Une passe initiale : sans elle, rien n'est mis en perspective tant
    // qu'on n'a pas défilé.
    request = requestAnimationFrame(pass);

    return () => {
      element.removeEventListener('scroll', onScroll);
      if (request !== 0) cancelAnimationFrame(request);
      // Une rangée RECYCLÉE par le virtualiseur ne doit jamais rester figée à
      // mi-échelle après un démontage (changement de mode, navigation).
      for (const row of element.querySelectorAll<HTMLElement>('[data-row]')) {
        const visual = row.firstElementChild;
        if (visual instanceof HTMLElement) {
          visual.style.opacity = '';
          visual.style.transform = '';
        }
      }
    };
  }, [frame, enabled]);
}
