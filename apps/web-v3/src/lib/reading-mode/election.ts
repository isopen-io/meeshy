import { electFocus } from '@/lib/lens/law';
import type { Candidate } from '@/lib/lens/law';

import { HIGH_VELOCITY_THRESHOLD, SUSTAINED_SCROLL_MS } from './metrics';

/**
 * LES LOIS DE L'ÉLECTION DU FIL (#5648) — miroir de
 * `Main/Focal/Core/FocalScrollPerspective.swift` et de son voisin
 * `FocalMagnificationLaw`, fonctions PURES, aucune horloge lue en interne
 * (l'horloge est injectée par l'appelant, comme partout ailleurs dans ce
 * chantier — `election.test.ts` §4.1 de la spécification).
 *
 * `electThreadFocus` RÉUTILISE `lens/law.ts::electFocus` — le site UNIQUE
 * d'élection de l'application (spécification #5648 §2, table `lens/law.ts`) —
 * plutôt que d'en recopier la sémantique : même hystérésis, même départage
 * par id croissant.
 */

/**
 * `THREAD_FOCUS_BAND_HYSTERESIS` — DÉRIVÉE de
 * `packages/shared/utils/focus-curve.ts::THREAD_FOCUS_BAND_HYSTERESIS`
 * (:88), littéral et non import : même raison que `lens/law.ts:1-27` et
 * `perspective.ts:33` (`THREAD_FOCUS_BAND_OFFSET`) — ce paquet tire
 * `@prisma/client` et `zod` par ses autres modules, qu'une application de
 * 25 Ko ne peut pas se permettre de charger pour une seule constante.
 * Gardée par `scripts/check-curve.mjs` PARTIE 3.
 */
export const THREAD_FOCUS_BAND_HYSTERESIS = 95;

/**
 * `FocalScrollPerspective.focusY` — l'ordonnée VISUELLE de la ligne de
 * focus : le centre de la région visible, sauf près du bas du fil où elle
 * est au bord bas au repos (`offsetFromBottom === 0`) et remonte
 * linéairement vers le centre sur la première demi-hauteur de défilement.
 * `offsetFromBottom` négatif (rebond élastique) est borné à 0 — la ligne ne
 * sort jamais de l'écran.
 */
export function focusLine({
  visibleTop,
  visibleBottom,
  offsetFromBottom,
}: {
  readonly visibleTop: number;
  readonly visibleBottom: number;
  readonly offsetFromBottom: number;
}): number {
  const center = (visibleTop + visibleBottom) / 2;
  const travel = visibleBottom - center;
  if (travel <= 0) return center;
  const t = Math.min(1, Math.max(0, offsetFromBottom / travel));
  return visibleBottom - travel * t;
}

export type ThreadFocusCandidate = Candidate;

/**
 * `FocalScrollPerspective.focusedId` — élit, parmi les candidats (messages
 * seuls), le plus proche de `focusY` ; le détenteur courant garde la main
 * tant qu'il reste dans la bande d'hystérésis. Miroir DIRECT de
 * `lens/law.ts::electFocus`, paramétré par la bande du FIL.
 */
export function electThreadFocus({
  candidates,
  focusY,
  current,
}: {
  readonly candidates: readonly ThreadFocusCandidate[];
  readonly focusY: number;
  readonly current: string | null;
}): string | null {
  return electFocus({ candidates, focusY, current, hysteresis: THREAD_FOCUS_BAND_HYSTERESIS });
}

/**
 * `FocalMagnificationLaw.isArmed` — deux portes, l'une ou l'autre : la
 * VITESSE (un défilement franc arme dès le premier événement) ou la DURÉE
 * (un défilement soutenu au-delà de `sustainedMs`). Une fois armée, elle le
 * reste (`alreadyArmed`) — désarmer au moindre repos ferait clignoter la
 * carte à chaque pause de lecture (`FocalScrollPerspective.swift:293-329`).
 */
export const armingLaw = {
  isArmed({
    alreadyArmed,
    scrollStartedAt,
    now,
    velocity,
    sustainedMs = SUSTAINED_SCROLL_MS,
    velocityThreshold = HIGH_VELOCITY_THRESHOLD,
  }: {
    readonly alreadyArmed: boolean;
    readonly scrollStartedAt: number | null;
    readonly now: number;
    readonly velocity: number;
    readonly sustainedMs?: number;
    readonly velocityThreshold?: number;
  }): boolean {
    if (alreadyArmed) return true;
    if (Math.abs(velocity) >= velocityThreshold) return true;
    if (scrollStartedAt === null) return false;
    return now - scrollStartedAt >= sustainedMs;
  },
};

/**
 * La vitesse verticale du geste, en px/s, SIGNÉE — l'équivalent honnête de
 * `panGestureRecognizer.velocity` : aucun reconnaisseur de geste n'existe
 * sur le web, `|Δy|/Δt` entre deux `scroll` consécutifs est la seule mesure
 * disponible. `Δt ≤ 0` rend `0`, jamais `Infinity` (deux événements au même
 * instant, ou une horloge qui recule).
 */
export function velocityOf({
  previousY,
  previousAt,
  y,
  at,
}: {
  readonly previousY: number;
  readonly previousAt: number;
  readonly y: number;
  readonly at: number;
}): number {
  const dt = at - previousAt;
  if (dt <= 0) return 0;
  return ((y - previousY) / dt) * 1000;
}
