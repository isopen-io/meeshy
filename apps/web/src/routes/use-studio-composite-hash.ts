import { useEffect, useMemo, useState } from 'react';

import { studioCompositePlan, type StudioCompositeDeps } from '@/lib/stories/studio-composite-plan';
import type { StudioPage } from '@/lib/stories/studio-page';

/** Anti-rebond : le sol suit la COMPOSITION, jamais le doigt (miroir iOS,
 * `ComposerSceneSurface.sceneLetterbox`, 200 ms). */
const DEBOUNCE_MS = 200;

/**
 * **LE HASH DU COMPOSITE de la page courante** (#8425) — recalculé quand le
 * PLAN de dessin change (média, cadrage, fond d'autour, pose du calque),
 * jamais à la frappe ni à la progression d'une montée. `undefined` tant qu'il
 * n'est pas calculé, ou quand il ne peut pas l'être : le sol retombe alors sur
 * le hash du fond (`studioFloor`).
 *
 * Le RENDU et l'ENCODEUR (`studio-composite.ts`) se chargent à la demande, au
 * premier plan dessinable : une scène sans média ne les télécharge jamais, et
 * le chunk du studio ne les porte pas. `deps` injecté (témoins) ou `null` : le
 * canvas du navigateur.
 */
export function useStudioCompositeHash(page: StudioPage, deps: StudioCompositeDeps | null): string | undefined {
  const plan = useMemo(() => studioCompositePlan(page), [page]);
  const key = plan === null ? null : JSON.stringify(plan);
  const [hash, setHash] = useState<{ readonly key: string; readonly value: string } | null>(null);
  useEffect(() => {
    if (plan === null || key === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void import('@/lib/stories/studio-composite')
        .then(({ renderStudioComposite, browserCompositeDeps }) => renderStudioComposite(plan, deps ?? browserCompositeDeps))
        .catch(() => null)
        .then((value) => {
          if (!cancelled && value !== null) setHash({ key, value });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, deps]);
  // Un hash calculé pour une AUTRE composition ne se sert pas : le repli vaut
  // mieux qu'un sol d'une scène qu'on vient de changer.
  return hash !== null && hash.key === key ? hash.value : undefined;
}
