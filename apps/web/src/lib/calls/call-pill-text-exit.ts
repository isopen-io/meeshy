import type { ExitTiming } from './use-rail-presence';

/**
 * **RIEN NE DISPARAÎT D'UN COUP** (#17406, #17479) — les sous-titres que `(…)`
 * range, et les sous-titres seuls quand la pilule revient, restent à leur place
 * le temps d'un fondu vers la rangée de base, l'inverse de leur arrivée
 * (`glass.css`, `call-pill-text-out`), inertes ; sous « Réduire les animations »,
 * ils partent tout de suite. Son module à lui : seul le chunk des sous-titres
 * l'importe (`budgets.json` › `call_overlay.dynamic_only`).
 */
export const PILL_TEXT_EXIT: ExitTiming = { exitMs: 180, reducedExitMs: 0 };

/** Ce que porte un texte qui repart : ce que porte tout ce qui repart (`use-pill-motion.ts`). */
export { LEAVING as PILL_TEXT_LEAVING } from './use-pill-motion';
