import { STOW_REDUCED_MS } from './call-pill-motion';
import type { ExitTiming } from './use-rail-presence';

/**
 * **RIEN NE DISPARAÎT D'UN COUP** (#17406, #17479) — les sous-titres que `(…)`
 * range, et les sous-titres seuls quand la pilule revient, restent à leur place
 * le temps d'un fondu vers la rangée de base, l'inverse de leur arrivée
 * (`call-motion.css`, `call-pill-text-out`), touchables (loi 17.11) ; sous « Réduire
 * les animations », le temps de leur fondu court (`--reduced-fade`, loi 17.10).
 * Son module à lui : seul le chunk des sous-titres l'importe
 * (`budgets.json` › `call_overlay.dynamic_only`).
 */
export const PILL_TEXT_EXIT: ExitTiming = { exitMs: 180, reducedExitMs: STOW_REDUCED_MS };

/**
 * Les SOUS-TITRES eux-mêmes ne partent jamais d'un coup, même sous « Réduire les
 * animations » (#17700) : la règle générale de la feuille (`app.css`) y ramène leur
 * fondu CSS à un instant, le moteur (`useRailFade`, Web Animations) le rejoue en
 * fondu court, opacité seule ; ils restent montés le temps de ce fondu.
 */
export const CAPTIONS_EXIT: ExitTiming = { exitMs: PILL_TEXT_EXIT.exitMs, reducedExitMs: STOW_REDUCED_MS };

/**
 * Ce que porte un texte qui repart : ce que porte tout ce qui repart, pris à sa source (`call-pill-motion.ts`,
 * que `use-pill-motion.ts` réexporte) — le journal du fil le lit aussi (`call-unfolded-original.tsx`), et passer
 * par les moteurs de la pilule découperait l'écran d'appel d'un chunk de plus au préchargement (#17878).
 */
export { LEAVING as PILL_TEXT_LEAVING } from './call-pill-motion';
